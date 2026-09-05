const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'umbral-vr.sqlite3');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL'); // mejor concurrencia (lecturas no bloquean escrituras)
db.pragma('foreign_keys = ON');

// Aplica el esquema si las tablas aún no existen (idempotente, seguro
// de correr en cada arranque del servidor).
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

module.exports = db;
