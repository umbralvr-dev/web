const { getSessionByToken } = require('../auth');
const cfg = require('../config');

/**
 * Exige una sesión de administrador válida (cookie httpOnly). Si es
 * válida, adjunta req.admin = { id, username, sessionCsrfToken }.
 */
function requireAdminAuth(req, res, next) {
  const rawToken = req.cookies?.[cfg.ADMIN_COOKIE_NAME];
  const session = getSessionByToken(rawToken);

  if (!session) {
    return res.status(401).json({ error: 'Sesión inválida o expirada. Inicia sesión de nuevo.' });
  }

  req.admin = {
    id: session.admin_id,
    username: session.username,
    sessionCsrfToken: session.csrf_token
  };
  next();
}

/**
 * Exige que las peticiones que modifican datos (POST/PUT/DELETE) traigan
 * el token CSRF correcto por header. Debe usarse SIEMPRE después de
 * requireAdminAuth (necesita req.admin.sessionCsrfToken).
 *
 * Por qué esto además del cookie SameSite=strict: es defensa en
 * profundidad — algunos navegadores/WebViews antiguos no respetan
 * SameSite correctamente, y este chequeo no depende de eso.
 */
function requireCsrf(req, res, next) {
  const headerToken = req.get('X-CSRF-Token');
  if (!headerToken || headerToken !== req.admin.sessionCsrfToken) {
    return res.status(403).json({ error: 'Token de seguridad inválido. Recarga la página e intenta de nuevo.' });
  }
  next();
}

module.exports = { requireAdminAuth, requireCsrf };
