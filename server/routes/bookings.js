const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');

const db = require('../db');
const cfg = require('../config');
const { generateDaySlots, isDateValid } = require('../utils/slots');
const { releaseExpiredBookings } = require('../utils/cleanup');

const router = express.Router();

const validate = [
  body('gameId').isString().trim().notEmpty().isLength({ max: 50 }),
  body('date').custom((v) => isDateValid(v)).withMessage('Fecha inválida'),
  body('time').isString().custom((v) => generateDaySlots().includes(v)).withMessage('Horario inválido'),
  body('players').isInt({ min: 1, max: cfg.MAX_PLAYERS }).toInt(),
  body('fullName').isString().trim().isLength({ min: 2, max: 100 }).escape(),
  body('email').isEmail().normalizeEmail(),
  body('phone').isString().trim().isLength({ min: 7, max: 20 }).matches(/^[0-9+\s()-]+$/)
];

// POST /api/bookings
// Crea una reserva en estado "pending_payment". El slot queda tomado
// de inmediato gracias al índice único en la base de datos, así que
// dos personas no pueden reservar el mismo horario aunque lleguen al
// mismo tiempo (la segunda escritura falla y se responde 409).
router.post('/', validate, (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
  }

  const { gameId, date, time, players, fullName, email, phone } = req.body;

  const game = db.prepare('SELECT * FROM games WHERE id = ? AND active = 1').get(gameId);
  if (!game) return res.status(404).json({ error: 'Juego no encontrado' });

  // Libera reservas pendientes vencidas antes de intentar tomar el slot.
  releaseExpiredBookings();

  const id = uuidv4();
  const priceClp = players * cfg.PRICE_PER_PLAYER_CLP;

  try {
    db.prepare(
      `INSERT INTO bookings
        (id, game_id, booking_date, start_time, players, full_name, email, phone, price_clp, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment')`
    ).run(id, gameId, date, time, players, fullName, email, phone, priceClp);
  } catch (err) {
    // Violación del índice único = el horario ya fue tomado por otra persona.
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ese horario ya fue reservado. Elige otro.' });
    }
    return next(err);
  }

  res.status(201).json({
    bookingId: id,
    priceClp,
    expiresInMinutes: cfg.PENDING_HOLD_MINUTES,
    game: { id: game.id, title: game.title, coverUrl: game.cover_url }
  });
});

// GET /api/bookings/:id — estado de una reserva (para la pantalla de confirmación).
router.get('/:id', (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Reserva no encontrada' });

  const game = db.prepare('SELECT title, cover_url FROM games WHERE id = ?').get(booking.game_id);

  res.json({
    id: booking.id,
    status: booking.status,
    date: booking.booking_date,
    time: booking.start_time,
    players: booking.players,
    priceClp: booking.price_clp,
    fullName: booking.full_name,
    email: booking.email,
    game
  });
});

module.exports = router;
