// Autenticación del panel de administración.
//
// Decisiones de seguridad clave:
//  - Contraseñas: hash con bcrypt (nunca se guarda ni se loguea texto plano).
//  - Sesiones: token aleatorio de 256 bits, generado con crypto (no Math.random).
//    En la base de datos solo se guarda el HASH del token — igual que con
//    las contraseñas — para que una fuga de la base de datos no permita
//    hacerse pasar por un administrador.
//  - El token real vive solo en una cookie httpOnly + secure + sameSite=strict,
//    así JavaScript del navegador no puede leerlo (mitiga XSS) y no viaja
//    entre sitios (mitiga CSRF, junto con el token CSRF explícito de abajo).
//  - CSRF: además del SameSite de la cookie, exigimos un token CSRF por
//    header en cada request que modifica datos (defensa en profundidad).
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const db = require('./db');
const cfg = require('./config');

const SESSION_DURATION_MS = cfg.ADMIN_SESSION_HOURS * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex'); // 256 bits
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Crea una sesión nueva para un admin ya autenticado y devuelve el
 * token en crudo (para la cookie) y el token CSRF (para el frontend).
 * Solo el HASH del token de sesión queda en la base de datos.
 */
function createSession(adminId, { ip, userAgent }) {
  const rawToken = randomToken();
  const csrfToken = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  db.prepare(
    `INSERT INTO admin_sessions (id, admin_id, token_hash, csrf_token, ip_address, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(uuidv4(), adminId, sha256(rawToken), csrfToken, ip || null, userAgent || null, expiresAt);

  return { rawToken, csrfToken, expiresAt };
}

/**
 * Valida un token de sesión (el que viene en la cookie). Devuelve la
 * fila de sesión + los datos del admin si es válida y no ha expirado,
 * o null si no.
 */
function getSessionByToken(rawToken) {
  if (!rawToken) return null;
  const tokenHash = sha256(rawToken);

  const session = db
    .prepare(
      `SELECT s.*, a.username, a.active
       FROM admin_sessions s
       JOIN admins a ON a.id = s.admin_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash);

  if (!session) return null;
  if (!session.active) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    // Sesión vencida — la limpiamos de una vez.
    db.prepare('DELETE FROM admin_sessions WHERE id = ?').run(session.id);
    return null;
  }
  return session;
}

function revokeSession(rawToken) {
  if (!rawToken) return;
  db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(sha256(rawToken));
}

// Limpia sesiones vencidas de la base de datos (housekeeping).
function releaseExpiredSessions() {
  db.prepare(`DELETE FROM admin_sessions WHERE expires_at < datetime('now')`).run();
}

function logAudit({ adminId, adminUsername, action, bookingId, details, ip }) {
  db.prepare(
    `INSERT INTO admin_audit_log (admin_id, admin_username, action, booking_id, details, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(adminId, adminUsername, action, bookingId || null, details ? JSON.stringify(details) : null, ip || null);
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  getSessionByToken,
  revokeSession,
  releaseExpiredSessions,
  logAudit,
  SESSION_DURATION_MS
};
