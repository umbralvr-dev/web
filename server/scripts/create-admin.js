// Script para crear (o resetear la contraseña de) una cuenta de
// administrador. Se corre a mano desde la terminal — NUNCA existe un
// endpoint HTTP para crear administradores, precisamente para que esto
// no pueda hacerse remotamente por nadie más que quien tiene acceso al
// servidor.
//
// Uso:
//   npm run create-admin
//
const readline = require('readline');
const { v4: uuidv4 } = require('uuid');

const db = require('../db');
const { hashPassword } = require('../auth');

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    if (!hidden) {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }

    // Oculta lo que se escribe (para la contraseña).
    const stdin = process.stdin;
    process.stdout.write(question);
    let input = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const onData = (char) => {
      char = char.toString();
      if (char === '\n' || char === '\r' || char === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        rl.close();
        resolve(input);
      } else if (char === '\u0003') {
        process.exit(1); // Ctrl+C
      } else if (char === '\u007f') {
        input = input.slice(0, -1); // backspace
      } else {
        input += char;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  console.log('=== Crear/actualizar cuenta de administrador — Umbral VR ===\n');

  const username = (await ask('Usuario (ej: admin): ')).trim();
  if (!username || username.length < 3) {
    console.error('El usuario debe tener al menos 3 caracteres.');
    process.exit(1);
  }

  const password = await ask('Contraseña (mínimo 10 caracteres, no se mostrará): ', true);
  if (!password || password.length < 10) {
    console.error('La contraseña debe tener al menos 10 caracteres.');
    process.exit(1);
  }

  const confirm = await ask('Confirma la contraseña: ', true);
  if (password !== confirm) {
    console.error('Las contraseñas no coinciden.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);

  if (existing) {
    db.prepare('UPDATE admins SET password_hash = ?, active = 1 WHERE username = ?').run(passwordHash, username);
    console.log(`\n✔ Contraseña actualizada para el usuario "${username}".`);
  } else {
    db.prepare(
      `INSERT INTO admins (id, username, password_hash) VALUES (?, ?, ?)`
    ).run(uuidv4(), username, passwordHash);
    console.log(`\n✔ Cuenta de administrador "${username}" creada correctamente.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
