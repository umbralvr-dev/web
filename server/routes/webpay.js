const express = require('express');
const { body, validationResult } = require('express-validator');

const db = require('../db');
const cfg = require('../config');
const webpay = require('../webpay');
const { sendBookingConfirmation } = require('../email');

const router = express.Router();

function logEvent(bookingId, event, payload) {
  db.prepare(
    `INSERT INTO payment_events (booking_id, event, raw_payload) VALUES (?, ?, ?)`
  ).run(bookingId, event, JSON.stringify(payload || {}));
}

// POST /api/webpay/create { bookingId }
// Crea la transacción en Transbank y devuelve la URL a la que el
// frontend debe redirigir al usuario (con un <form> POST, ver frontend).
router.post(
  '/create',
  [body('bookingId').isUUID()],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Solicitud inválida' });

    try {
      const { bookingId } = req.body;
      const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);

      if (!booking) return res.status(404).json({ error: 'Reserva no encontrada' });
      if (booking.status !== 'pending_payment') {
        return res.status(409).json({ error: 'Esta reserva ya no está disponible para pago.' });
      }

      // buy_order y session_id únicos y acotados en longitud (requisito Transbank).
      const buyOrder = `UVR-${booking.id.slice(0, 12)}`;
      const sessionId = booking.id;
      const returnUrl = `${cfg.BACKEND_PUBLIC_URL}/api/webpay/return`;

      const { token, url } = await webpay.createTransaction({
        buyOrder,
        sessionId,
        amount: booking.price_clp, // el monto SIEMPRE sale de nuestra BD, nunca del cliente
        returnUrl
      });

      db.prepare(
        `UPDATE bookings SET tbk_token = ?, tbk_order_id = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(token, buyOrder, booking.id);

      logEvent(booking.id, 'created', { token, buyOrder });

      res.json({ url, token });
    } catch (err) {
      next(err);
    }
  }
);

// Transbank redirige de vuelta a esta URL de dos formas distintas según
// el caso — por eso registramos el mismo manejador para GET y POST:
//
//   • Pago intentado (aprobado o rechazado) → POST con "token_ws" en el body.
//   • Usuario cancela ("Anular compra") o la transacción expira dentro
//     de Webpay → GET con "TBK_TOKEN" como query param en la URL.
//
// Confirmamos ("commit") la transacción, validamos el monto contra
// nuestra base de datos y solo ahí marcamos la reserva como pagada.
// Nunca confiamos en datos que vengan del navegador.
async function handleWebpayReturn(req, res) {
  const token = req.body.token_ws || req.query.token_ws;
  const abortedToken = req.body.TBK_TOKEN || req.query.TBK_TOKEN;

  if (!token && abortedToken) {
    const booking = db.prepare('SELECT * FROM bookings WHERE tbk_token = ?').get(abortedToken);

    if (booking && booking.status === 'pending_payment') {
      db.prepare(
        `UPDATE bookings SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`
      ).run(booking.id);
      logEvent(booking.id, 'cancelled_by_user', { TBK_TOKEN: abortedToken });
    }

    return res.redirect(`${cfg.FRONTEND_URL}/confirmacion.html?status=cancelled`);
  }

  if (!token) {
    return res.redirect(`${cfg.FRONTEND_URL}/confirmacion.html?status=error`);
  }

  const booking = db.prepare('SELECT * FROM bookings WHERE tbk_token = ?').get(token);
  if (!booking) {
    return res.redirect(`${cfg.FRONTEND_URL}/confirmacion.html?status=error`);
  }

  try {
    const result = await webpay.commitTransaction(token);
    logEvent(booking.id, 'commit_response', result);

    const paidOk =
      result.status === 'AUTHORIZED' &&
      result.response_code === 0 &&
      Number(result.amount) === Number(booking.price_clp); // verificación de monto — evita manipulación

    if (paidOk) {
      db.prepare(
        `UPDATE bookings SET status = 'paid', tbk_auth_code = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(result.authorization_code, booking.id);

      const game = db.prepare('SELECT * FROM games WHERE id = ?').get(booking.game_id);
      try {
        await sendBookingConfirmation({ ...booking, status: 'paid' }, game);
        db.prepare(`UPDATE bookings SET confirmation_email_sent = 1 WHERE id = ?`).run(booking.id);
      } catch (mailErr) {
        console.error('[email] error enviando confirmación:', mailErr);
        // No hacemos fallar el pago por un error de correo — la reserva ya está paga.
      }

      return res.redirect(`${cfg.FRONTEND_URL}/confirmacion.html?status=ok&booking=${booking.id}`);
    }

    db.prepare(
      `UPDATE bookings SET status = 'failed', updated_at = datetime('now') WHERE id = ?`
    ).run(booking.id);
    logEvent(booking.id, 'commit_failed', result);

    return res.redirect(`${cfg.FRONTEND_URL}/confirmacion.html?status=failed&booking=${booking.id}`);
  } catch (err) {
    console.error('[webpay] error al confirmar transacción:', err);
    logEvent(booking.id, 'error', { message: err.message });
    db.prepare(
      `UPDATE bookings SET status = 'failed', updated_at = datetime('now') WHERE id = ?`
    ).run(booking.id);
    return res.redirect(`${cfg.FRONTEND_URL}/confirmacion.html?status=error&booking=${booking.id}`);
  }
}

router.post('/return', handleWebpayReturn);
router.get('/return', handleWebpayReturn);

module.exports = router;