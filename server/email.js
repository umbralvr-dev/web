const nodemailer = require('nodemailer');
const cfg = require('./config');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!cfg.SMTP_HOST || !cfg.SMTP_USER || !cfg.SMTP_PASS) {
    console.warn(
      '[email] SMTP no configurado (revisa .env). Los correos de ' +
      'confirmación se registrarán en consola en vez de enviarse.'
    );
    return null;
  }

  transporter = nodemailer.createTransport({
    host: cfg.SMTP_HOST,
    port: cfg.SMTP_PORT,
    secure: cfg.SMTP_PORT === 465,
    auth: { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS }
  });
  return transporter;
}

function formatCLP(n) {
  return '$' + Number(n).toLocaleString('es-CL');
}

function buildConfirmationHtml(booking, game) {
  return `
  <div style="background:#07060d;padding:32px;font-family:Arial,sans-serif;color:#eae6f7;">
    <div style="max-width:520px;margin:0 auto;background:#120e22;border:1px solid rgba(0,229,255,0.25);border-radius:8px;overflow:hidden;">
      <div style="background:linear-gradient(90deg,#6c2bd9,#00e5ff);padding:22px 28px;">
        <span style="font-family:Arial,sans-serif;font-weight:900;font-size:20px;letter-spacing:1px;color:#07060d;">UMBRAL VR</span>
      </div>
      <div style="padding:28px;">
        <h1 style="font-size:20px;margin:0 0 6px;color:#eae6f7;">¡Tu reserva está confirmada!</h1>
        <p style="color:#8b85a8;margin:0 0 24px;font-size:14px;">Cruza el umbral. Te esperamos en la arena.</p>

        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 0;color:#8b85a8;">Experiencia</td><td style="padding:8px 0;text-align:right;font-weight:bold;">${game.title}</td></tr>
          <tr style="border-top:1px solid rgba(255,255,255,0.08);"><td style="padding:8px 0;color:#8b85a8;">Fecha</td><td style="padding:8px 0;text-align:right;font-weight:bold;">${booking.booking_date}</td></tr>
          <tr style="border-top:1px solid rgba(255,255,255,0.08);"><td style="padding:8px 0;color:#8b85a8;">Hora</td><td style="padding:8px 0;text-align:right;font-weight:bold;">${booking.start_time} hrs</td></tr>
          <tr style="border-top:1px solid rgba(255,255,255,0.08);"><td style="padding:8px 0;color:#8b85a8;">Jugadores</td><td style="padding:8px 0;text-align:right;font-weight:bold;">${booking.players}</td></tr>
          <tr style="border-top:1px solid rgba(255,255,255,0.08);"><td style="padding:8px 0;color:#8b85a8;">Código de reserva</td><td style="padding:8px 0;text-align:right;font-weight:bold;">${booking.id.slice(0, 8).toUpperCase()}</td></tr>
          <tr style="border-top:1px solid rgba(255,255,255,0.08);"><td style="padding:8px 0;color:#8b85a8;">Total pagado</td><td style="padding:8px 0;text-align:right;font-weight:bold;color:#00e5ff;">${formatCLP(booking.price_clp)} CLP</td></tr>
        </table>

        <p style="margin-top:24px;font-size:13px;color:#8b85a8;line-height:1.6;">
          Te recomendamos llegar 10 minutos antes de tu horario. Dirección: ${cfg.BUSINESS_ADDRESS}.
          Si necesitas reagendar o cancelar, responde este correo.
        </p>
      </div>
    </div>
  </div>`;
}

async function sendBookingConfirmation(booking, game) {
  const t = getTransporter();
  const html = buildConfirmationHtml(booking, game);
  const subject = `Reserva confirmada — ${game.title} · ${booking.booking_date} ${booking.start_time}`;

  if (!t) {
    console.log('[email:simulado]', { to: booking.email, subject });
    return { simulated: true };
  }

  return t.sendMail({
    from: `"${cfg.FROM_NAME}" <${cfg.FROM_EMAIL}>`,
    to: booking.email,
    subject,
    html
  });
}

module.exports = { sendBookingConfirmation };
