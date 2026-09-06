const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const db = require('../../db');
const cfg = require('../../config');
const { verifyPassword, createSession, revokeSession, logAudit } = require('../../auth');
const { requireAdminAuth, requireCsrf } = require('../../middleware/adminAuth');

const router = express.Router();

// Límite estricto para login: dificulta ataques de fuerza bruta contra
// las contraseñas de administrador. 8 intentos cada 15 min por IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de acceso. Intenta de nuevo en unos minutos.' }
});

function cookieOptions() {
  const crossSite = cfg.NODE_ENV === 'production';
  return {
    httpOnly: true,
    // El panel se despliega en un dominio/proyecto de Railway distinto
    // al del backend, así que desde el punto de vista del navegador
    // esto es un sitio "cruzado" (cross-site) — SameSite=Strict o Lax
    // bloquearían la cookie por completo. SameSite=None es obligatorio
    // aquí, y el navegador exige Secure (HTTPS) para permitirlo, lo
    // cual ya cumplimos en producción. La protección contra CSRF pasa
    // entonces a depender del token CSRF explícito (ver middleware
    // requireCsrf), que es defensa suficiente y es la práctica
    // estándar para APIs separadas del frontend.
    secure: crossSite,
    sameSite: crossSite ? 'none' : 'lax',
    maxAge: cfg.ADMIN_SESSION_HOURS * 60 * 60 * 1000,
    path: '/'
  };
}

// POST /api/admin/auth/login
router.post(
  '/login',
  loginLimiter,
  [
    body('username').isString().trim().notEmpty().isLength({ max: 100 }),
    body('password').isString().notEmpty().isLength({ max: 200 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
    }

    const { username, password } = req.body;
    const ip = req.ip;

    const admin = db.prepare('SELECT * FROM admins WHERE username = ? AND active = 1').get(username);

    // Mensaje idéntico si el usuario no existe o la contraseña está mal
    // — así no revelamos cuáles nombres de usuario existen.
    const genericError = { error: 'Usuario o contraseña incorrectos.' };

    if (!admin) {
      logAudit({ adminId: 'unknown', adminUsername: username, action: 'login_failed', ip });
      return res.status(401).json(genericError);
    }

    const validPassword = await verifyPassword(password, admin.password_hash);
    if (!validPassword) {
      logAudit({ adminId: admin.id, adminUsername: admin.username, action: 'login_failed', ip });
      return res.status(401).json(genericError);
    }

    const { rawToken, csrfToken } = createSession(admin.id, { ip, userAgent: req.get('User-Agent') });

    db.prepare(`UPDATE admins SET last_login_at = datetime('now') WHERE id = ?`).run(admin.id);
    logAudit({ adminId: admin.id, adminUsername: admin.username, action: 'login', ip });

    res.cookie(cfg.ADMIN_COOKIE_NAME, rawToken, cookieOptions());
    res.json({ username: admin.username, csrfToken });
  }
);

// POST /api/admin/auth/logout
router.post('/logout', requireAdminAuth, requireCsrf, (req, res) => {
  const rawToken = req.cookies?.[cfg.ADMIN_COOKIE_NAME];
  revokeSession(rawToken);
  // clearCookie debe usar las mismas opciones (path, sameSite, secure)
  // con las que se creó, o algunos navegadores no la eliminan.
  res.clearCookie(cfg.ADMIN_COOKIE_NAME, cookieOptions());
  res.json({ ok: true });
});

// GET /api/admin/auth/me — para que el frontend sepa si la sesión sigue viva.
router.get('/me', requireAdminAuth, (req, res) => {
  res.json({ username: req.admin.username, csrfToken: req.admin.sessionCsrfToken });
});

module.exports = router;
