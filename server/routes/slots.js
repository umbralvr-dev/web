const express = require('express');
const db = require('../db');
const cfg = require('../config');
const { generateDaySlots, isDateValid, getChileNow } = require('../utils/slots');
const { releaseExpiredBookings } = require('../utils/cleanup');

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
  releaseExpiredBookings();

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
  // "Ahora" siempre en hora de Chile — el servidor puede correr en UTC
  // (como Railway) y eso NO debe afectar qué horarios se ven como pasados.
  const { dateStr: todayChile, minutes: nowMinutesChile } = getChileNow();
  const isToday = date === todayChile;

  const slots = allSlots.map((time) => {
    const [h, m] = time.split(':').map(Number);
    const isPast = isToday && h * 60 + m <= nowMinutesChile;
    return {
      time,
      available: !taken.has(time) && !isPast
    };
  });

  res.json({ date, sessionMinutes: cfg.SESSION_MINUTES, slots });
});

module.exports = router;
