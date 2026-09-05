const db = require('../db');
const cfg = require('../config');

/**
 * Libera (marca como 'expired') cualquier reserva en estado
 * 'pending_payment' cuyo tiempo de espera ya venció — sin importar la
 * fecha/hora de la sesión que reservaron. Se usa tanto de forma
 * reactiva (cuando alguien consulta horarios o crea una reserva) como
 * de forma proactiva (con un temporizador en server.js), para que un
 * cupo no quede "fantasma" tomado solo porque nadie volvió a mirar esa
 * fecha en particular.
 */
function releaseExpiredBookings() {
  const result = db
    .prepare(
      `UPDATE bookings SET status = 'expired', updated_at = datetime('now')
       WHERE status = 'pending_payment'
         AND datetime(created_at, '+' || ? || ' minutes') < datetime('now')`
    )
    .run(cfg.PENDING_HOLD_MINUTES);

  if (result.changes > 0) {
    console.log(`[cleanup] ${result.changes} reserva(s) pendiente(s) liberada(s) por tiempo.`);
  }
  return result.changes;
}

module.exports = { releaseExpiredBookings };
