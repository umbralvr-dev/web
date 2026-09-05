const cfg = require('../config');

// El servidor puede correr en cualquier huso horario (Railway usa UTC
// por defecto), pero la arena está en Chile. Por eso NUNCA usamos
// new Date().getHours()/getDate() directamente para "qué hora es
// ahora" — eso reflejaría la hora del servidor, no la de Chile.
// Esta función siempre devuelve la fecha/hora real en Santiago,
// sin importar dónde esté desplegado el backend.
function getChileNow() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  const parts = fmt.formatToParts(new Date());
  const map = {};
  for (const p of parts) map[p.type] = p.value;

  return {
    dateStr: `${map.year}-${map.month}-${map.day}`, // 'YYYY-MM-DD' en Chile
    minutes: Number(map.hour) * 60 + Number(map.minute) // minutos desde medianoche, en Chile
  };
}

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

// true si la fecha (YYYY-MM-DD) es hoy o futura, según el calendario de Chile.
function isDateValid(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const { dateStr: todayChile } = getChileNow();
  return dateStr >= todayChile; // comparación de strings 'YYYY-MM-DD' funciona directo
}

module.exports = { generateDaySlots, isDateValid, getChileNow };
