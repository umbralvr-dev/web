require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 4000,

  // Origen(es) permitidos para CORS — pon aquí el dominio real de tu web
  // (https://umbralvr.cl) en producción. En desarrollo local se permite *.
  SITE_ORIGIN: process.env.SITE_ORIGIN || 'http://localhost:5500',

  // ---- Reglas del negocio (edítalas aquí, no en el código) ----
  ARENA_OPEN_TIME: '10:00',
  ARENA_CLOSE_TIME: '20:00',   // última sesión inicia antes de esta hora
  SESSION_MINUTES: 40,
  MAX_PLAYERS: 6,
  PRICE_PER_PLAYER_CLP: Number(process.env.PRICE_PER_PLAYER_CLP || 12000),

  // Minutos que se reserva un cupo en estado "pending_payment" antes de
  // liberarse automáticamente si el usuario no completa el pago.
  PENDING_HOLD_MINUTES: 15,

  // ---- Transbank Webpay Plus ----
  // Por defecto usa el ambiente de INTEGRACIÓN (pruebas) que entrega el
  // propio SDK de Transbank — no requiere credenciales reales y es
  // seguro para desarrollo. Para producción, Transbank te entrega un
  // COMMERCE_CODE y API_KEY reales al afiliarte como comercio.
  TBK_ENV: process.env.TBK_ENV || 'integration', // 'integration' | 'production'
  TBK_COMMERCE_CODE: process.env.TBK_COMMERCE_CODE || '',
  TBK_API_KEY: process.env.TBK_API_KEY || '',

  // URL pública de tu backend (para el retorno de Transbank) y de tu
  // frontend (para redirigir al usuario tras el pago).
  BACKEND_PUBLIC_URL: process.env.BACKEND_PUBLIC_URL || 'http://localhost:4000',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5500',

  // ---- Correo (confirmación de reserva) ----
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  FROM_EMAIL: process.env.FROM_EMAIL || 'reservas@umbralvr.cl',
  FROM_NAME: process.env.FROM_NAME || 'Umbral VR',

  BUSINESS_NAME: 'Umbral VR',
  BUSINESS_ADDRESS: 'Puerto Montt, Región de Los Lagos, Chile'
};
