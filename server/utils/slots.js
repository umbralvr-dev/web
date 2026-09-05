const cfg = require('../config');

// Genera todos los bloques posibles del día, ej: 10:00, 10:40, 11:20 ...
// hasta que el bloque completo (inicio + duración) quepa antes del cierre.
function generateDaySlots() {
  const [openH, openM] = cfg.ARENA_OPEN_TIME.split(':').map(Number);
  const [closeH, closeM] = cfg.ARENA_CLOSE_TIME.split(':').map(Number);

  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  const slots = [];
  for (let t = openMinutes; t + cfg.SESSION_MINUTES <= closeMinutes; t += cfg.SESSION_MINUTES) {
    const h = String(Math.floor(t / 60)).padStart(2, '0');
    const m = String(t % 60).padStart(2, '0');
    slots.push(`${h}:${m}`);
  }
  return slots;
}

// true si la fecha (YYYY-MM-DD) es hoy o futura, en huso horario del server.
function isDateValid(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return d.getTime() >= today.getTime();
}

module.exports = { generateDaySlots, isDateValid };
