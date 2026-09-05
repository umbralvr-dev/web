const express = require('express');
const db = require('../db');
const cfg = require('../config');
const { generateDaySlots, isDateValid } = require('../utils/slots');

const router = express.Router();

// GET /api/slots?date=YYYY-MM-DD
// Devuelve los bloques del día y cuáles están disponibles u ocupados.
router.get('/', (req, res) => {
  const { date } = req.query;

  if (!date || !isDateValid(date)) {
    return res.status(400).json({ error: 'Fecha inválida. Usa una fecha de hoy en adelante.' });
  }

  // Libera automáticamente reservas "pending_payment" que ya expiraron
  // (el usuario abrió el pago pero nunca lo terminó).
  db.prepare(
    `UPDATE bookings SET status = 'expired', updated_at = datetime('now')
     WHERE status = 'pending_payment'
       AND datetime(created_at, '+' || ? || ' minutes') < datetime('now')`
  ).run(cfg.PENDING_HOLD_MINUTES);

  const taken = new Set(
    db
      .prepare(
        `SELECT start_time FROM bookings
         WHERE booking_date = ? AND status IN ('pending_payment', 'paid')`
      )
      .all(date)
      .map((r) => r.start_time)
  );

  const allSlots = generateDaySlots();
  const now = new Date();
  const isToday = date === now.toISOString().slice(0, 10);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const slots = allSlots.map((time) => {
    const [h, m] = time.split(':').map(Number);
    const isPast = isToday && h * 60 + m <= nowMinutes;
    return {
      time,
      available: !taken.has(time) && !isPast
    };
  });

  res.json({ date, sessionMinutes: cfg.SESSION_MINUTES, slots });
});

module.exports = router;
