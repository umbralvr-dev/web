const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const cfg = require('./config');
const db = require('./db');
const seed = require('./db/seed');
const { releaseExpiredBookings } = require('./utils/cleanup');

// Carga la biblioteca de juegos si la tabla está vacía (primer arranque).
const gameCount = db.prepare('SELECT COUNT(*) AS n FROM games').get().n;
if (gameCount === 0) seed();

const app = express();

// ---- Seguridad base ----
app.use(helmet());
app.use(express.json({ limit: '100kb' })); // limita tamaño de payload
app.use(
  cors({
    origin: cfg.SITE_ORIGIN === '*' ? true : cfg.SITE_ORIGIN.split(','),
    methods: ['GET', 'POST'],
  })
);

// Rate limit general (protege contra abuso/DoS básico).
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false
  })
);

// Rate limit más estricto para creación de reservas y pagos.
const strictLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' }
});

// ---- Rutas ----
app.use('/api/games', require('./routes/games'));
app.use('/api/slots', require('./routes/slots'));
app.use('/api/bookings', strictLimiter, require('./routes/bookings'));
app.use('/api/webpay', strictLimiter, require('./routes/webpay'));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Manejador de errores centralizado — nunca expone detalles internos.
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(err.status || 500).json({
    error: err.publicMessage || 'Ocurrió un error inesperado. Intenta nuevamente.'
  });
});

app.listen(cfg.PORT, () => {
  console.log(`Umbral VR booking API escuchando en http://localhost:${cfg.PORT}`);
  console.log(`Modo Transbank: ${cfg.TBK_ENV}`);
});

// Limpiador proactivo: libera reservas "pending_payment" vencidas cada
// 2 minutos, sin depender de que alguien consulte esa fecha específica.
// Así un cupo no queda "fantasma" tomado si nadie vuelve a mirarlo.
setInterval(releaseExpiredBookings, 2 * 60 * 1000);
