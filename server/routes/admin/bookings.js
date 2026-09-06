const express = require('express');
const { body, param, query, validationResult } = require('express-validator');

const db = require('../../db');
const cfg = require('../../config');
const { generateDaySlots, isDateValid } = require('../../utils/slots');
const { logAudit } = require('../../auth');
const { requireCsrf } = require('../../middleware/adminAuth');

const router = express.Router();

const VALID_STATUSES = ['pending_payment', 'paid', 'expired', 'failed', 'cancelled', 'cancelled_by_admin'];

// GET /api/admin/bookings?status=&from=&to=&gameId=&q=
// Lista reservas con filtros opcionales. Sin filtros, trae las más
// recientes primero (limitado a 200 para no traer la tabla entera).
router.get('/', (req, res) => {
  const { status, from, to, gameId, q } = req.query;

  let sql = `
    SELECT b.*, g.title AS game_title
    FROM bookings b
    JOIN games g ON g.id = b.game_id
    WHERE 1=1
  `;
  const params = [];

  if (status && VALID_STATUSES.includes(status)) {
    sql += ' AND b.status = ?';
    params.push(status);
  }
  if (from && isDateValid(from)) {
    sql += ' AND b.booking_date >= ?';
    params.push(from);
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    sql += ' AND b.booking_date <= ?';
    params.push(to);
  }
  if (gameId) {
    sql += ' AND b.game_id = ?';
    params.push(gameId);
  }
  if (q) {
    sql += ' AND (b.full_name LIKE ? OR b.email LIKE ? OR b.phone LIKE ? OR b.id LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  sql += ' ORDER BY b.booking_date DESC, b.start_time DESC LIMIT 200';

  const bookings = db.prepare(sql).all(...params);
  res.json({ bookings });
});

const bookingFieldsValidation = [
  body('gameId').isString().trim().notEmpty().isLength({ max: 50 }),
  body('date').custom((v) => isDateValid(v)).withMessage('Fecha inválida'),
  body('time').isString().custom((v) => generateDaySlots().includes(v)).withMessage('Horario inválido'),
  body('players').isInt({ min: 1, max: cfg.MAX_PLAYERS }).toInt(),
  body('fullName').isString().trim().isLength({ min: 2, max: 100 }).escape(),
  body('email').isEmail().normalizeEmail(),
  body('phone').isString().trim().isLength({ min: 7, max: 20 }).matches(/^[0-9+\s()-]+$/),
  body('status').optional().isIn(VALID_STATUSES)
];

// POST /api/admin/bookings — crear una reserva manual (ej: alguien
// reservó por teléfono o WhatsApp). Requiere token CSRF.
router.post('/', requireCsrf, bookingFieldsValidation, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
  }

  const { gameId, date, time, players, fullName, email, phone } = req.body;
  const status = req.body.status || 'paid'; // una reserva manual del admin normalmente ya está "acordada"

  const game = db.prepare('SELECT * FROM games WHERE id = ? AND active = 1').get(gameId);
  if (!game) return res.status(404).json({ error: 'Juego no encontrado' });

  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  const priceClp = players * cfg.PRICE_PER_PLAYER_CLP;

  try {
    db.prepare(
      `INSERT INTO bookings
        (id, game_id, booking_date, start_time, players, full_name, email, phone, price_clp, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, gameId, date, time, players, fullName, email, phone, priceClp, status);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ese horario ya está ocupado por otra reserva.' });
    }
    throw err;
  }

  logAudit({
    adminId: req.admin.id,
    adminUsername: req.admin.username,
    action: 'create_booking',
    bookingId: id,
    details: { gameId, date, time, players, fullName, status },
    ip: req.ip
  });

  res.status(201).json({ id, priceClp });
});

// PUT /api/admin/bookings/:id — editar una reserva existente.
router.put(
  '/:id',
  requireCsrf,
  [param('id').isUUID(), ...bookingFieldsValidation],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
    }

    const { id } = req.params;
    const before = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    if (!before) return res.status(404).json({ error: 'Reserva no encontrada' });

    const { gameId, date, time, players, fullName, email, phone } = req.body;
    const status = req.body.status || before.status;
    const priceClp = players * cfg.PRICE_PER_PLAYER_CLP;

    try {
      db.prepare(
        `UPDATE bookings SET
           game_id = ?, booking_date = ?, start_time = ?, players = ?,
           full_name = ?, email = ?, phone = ?, price_clp = ?, status = ?,
           updated_at = datetime('now')
         WHERE id = ?`
      ).run(gameId, date, time, players, fullName, email, phone, priceClp, status, id);
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        return res.status(409).json({ error: 'Ese horario ya está ocupado por otra reserva.' });
      }
      throw err;
    }

    logAudit({
      adminId: req.admin.id,
      adminUsername: req.admin.username,
      action: 'update_booking',
      bookingId: id,
      details: { before, after: { gameId, date, time, players, fullName, status } },
      ip: req.ip
    });

    res.json({ ok: true });
  }
);

// DELETE /api/admin/bookings/:id — cancela la reserva. Es un borrado
// LÓGICO (cambia el estado a 'cancelled_by_admin'), no se elimina la
// fila de la base de datos: así se conserva el historial para
// contabilidad/auditoría/eventuales reclamos de clientes.
router.delete('/:id', requireCsrf, [param('id').isUUID()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'ID inválido' });

  const { id } = req.params;
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  if (!booking) return res.status(404).json({ error: 'Reserva no encontrada' });

  db.prepare(
    `UPDATE bookings SET status = 'cancelled_by_admin', updated_at = datetime('now') WHERE id = ?`
  ).run(id);

  logAudit({
    adminId: req.admin.id,
    adminUsername: req.admin.username,
    action: 'cancel_booking',
    bookingId: id,
    details: { before: booking },
    ip: req.ip
  });

  res.json({ ok: true });
});

module.exports = router;
