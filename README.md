# Sistema de Reservas — Umbral VR



Sistema completo de reservas online: el usuario elige un juego, un horario
(bloques de 40 min, 10:00–20:00), la cantidad de jugadores (máx. 6), paga
con **Webpay Plus (Transbank)** y recibe un **correo de confirmación**
automático. Mantiene el mismo estilo visual del sitio Umbral VR.

```
booking/
├── frontend/              → la web de reservas (estático, mismo estilo del sitio)
│   ├── index.html          (tu sitio principal, con los botones "Reservar" ya conectados)
│   ├── reserva.html         el wizard de 4 pasos
│   ├── confirmacion.html    pantalla post-pago
│   ├── css/style.css        tu CSS original (sin cambios)
│   ├── css/booking.css      estilos nuevos del wizard (mismos tokens de color/fuente)
│   ├── js/booking.js        lógica del wizard (habla con la API)
│   └── assets/              logo (agrega aquí tus imágenes de juegos, ver abajo)
│
└── server/                → el backend (Node.js + Express + SQLite)
    ├── server.js            servidor principal
    ├── config.js            toda la configuración editable (horarios, precio, etc.)
    ├── db/                  esquema, seed de juegos y conexión SQLite
    ├── routes/               /api/games, /api/slots, /api/bookings, /api/webpay
    ├── webpay.js             integración con Transbank
    ├── email.js              envío de correo de confirmación
    └── .env.example          variables de entorno a completar
```

## 1. Cómo funciona el flujo

1. **Elige juego** → `GET /api/games`
2. **Elige fecha/horario** → `GET /api/slots?date=YYYY-MM-DD` (bloques de
   40 min entre 10:00 y 20:00; se descartan los ya tomados y los que ya pasaron hoy)
3. **Elige jugadores** (1 a 6) → se calcula el precio en el navegador
4. **Pago**:
   - El frontend crea la reserva → `POST /api/bookings` (queda en estado
     `pending_payment`, y **ese horario se bloquea de inmediato** para que
     nadie más lo tome — a nivel de base de datos, no solo en el navegador).
   - Se crea la transacción en Transbank → `POST /api/webpay/create`.
   - El usuario es redirigido a pagar en el sitio de Webpay.
   - Transbank redirige de vuelta a `POST /api/webpay/return`, donde el
     backend **confirma la transacción y verifica que el monto pagado
     coincide exactamente con el de la reserva** antes de marcarla como
     pagada (`paid`). Nunca se confía en datos que vengan del navegador.
   - Si el pago fue exitoso, se envía el correo de confirmación
     automáticamente y el usuario ve `confirmacion.html`.
   - Si el usuario abandona el pago sin terminar, la reserva vuelve a
     quedar disponible sola después de 15 minutos (configurable).

## 2. Instalación del backend

Necesitas [Node.js 18+](https://nodejs.org) instalado en el servidor donde
vayas a correr esto (tu computador para probar, o un hosting real después).

```bash
cd server
npm install
cp .env.example .env
```

Abre `.env` y completa como mínimo:

- `SITE_ORIGIN` → el dominio real de tu web (para seguridad/CORS)
- `BACKEND_PUBLIC_URL` y `FRONTEND_URL` → tus URLs reales cuando despliegues
- `PRICE_PER_PLAYER_CLP` → tu precio real por jugador (por defecto $12.000)

Luego:

```bash
npm run start
```

El servidor queda escuchando en `http://localhost:4000` (o el `PORT` que
hayas puesto). En el primer arranque crea automáticamente la base de
datos SQLite y carga la biblioteca de juegos.

## 3. Probar el sitio localmente

El `frontend/` es HTML/CSS/JS estático — puedes abrirlo con cualquier
servidor local, por ejemplo:

```bash
cd frontend
npx serve .          # o "python3 -m http.server 5500"
```

Abre `reserva.html` en el navegador y prueba el flujo completo. Mientras
`TBK_ENV=integration` (el valor por defecto), Transbank te deja pagar con
**tarjetas de prueba** sin cobrar dinero real:

- Tarjeta de crédito de prueba: `4051 8856 0044 6623`, cualquier fecha
  futura, CVV `123`
- RUT y clave de prueba los entrega la propia pantalla de Webpay en modo
  integración (Transbank los muestra en pantalla al pagar)

Documentación oficial de pruebas:
https://www.transbankdevelopers.cl/documentacion/como_empezar#ambiente-de-integracion

## 4. Poner las portadas de los juegos

En `frontend/assets/games/` coloca tus imágenes con estos nombres
(los mismos que ya usa tu sitio principal):

```
spatial-ops-cover.jpg
zombies-cover.jpg
mansion-cover.jpg
party-cover.jpg
kraken-cover.jpg
squad-cover.jpg
```

Si agregas o quitas juegos, edítalo en `server/db/seed.js` y vuelve a
correr `npm run seed`.

## 5. Ir a producción — lo que TÚ necesitas conseguir

Este sistema queda 100% funcional en modo de pruebas apenas instales las
dependencias. Para cobrar dinero real y que funcione en internet
necesitas tres cosas que **debes tramitar tú directamente**, porque
requieren tu identidad/empresa real:

### a) Afiliarte como comercio en Transbank
Postula en https://www.transbankdevelopers.cl — te piden datos de tu
empresa/boleta y te entregan un `CommerceCode` y `ApiKey` **reales**.
Cuando los tengas, en tu `.env`:
```
TBK_ENV=production
TBK_COMMERCE_CODE=tu_codigo_real
TBK_API_KEY=tu_api_key_real
```
Transbank exige que tu backend corra bajo **HTTPS**.

### b) Una cuenta de correo para enviar las confirmaciones
Cualquier proveedor SMTP sirve (Zoho Mail, Gmail Workspace, Brevo,
Resend, Amazon SES...). Completa `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`
en el `.env`. Mientras no lo configures, el sistema simplemente **imprime
el correo en la consola del servidor** en vez de enviarlo — así puedes
probar todo el flujo sin tener esto listo todavía.

### c) Hosting para el backend
El `server/` es una app Node.js normal — funciona en Railway, Render,
un VPS, o cualquier hosting que soporte Node + HTTPS. La base de datos
SQLite vive en un archivo (`db/umbral-vr.sqlite3`); si tu hosting borra
el disco entre despliegues, usa un volumen persistente (todos los
proveedores mencionados lo ofrecen).

## 6. Seguridad — qué ya está implementado

- **El precio nunca lo decide el navegador**: el monto que se cobra en
  Transbank sale siempre de la base de datos del servidor, no de lo que
  mande el frontend — así nadie puede manipular el precio.
- **Un horario no se puede reservar dos veces**: hay un índice único en
  la base de datos (`fecha + hora`), así que aunque dos personas hagan
  clic al mismo milisegundo, la base de datos rechaza la segunda.
- **Verificación de monto post-pago**: antes de marcar una reserva como
  pagada, se compara el monto que confirma Transbank contra el monto
  original de la reserva.
- **Validación de todos los campos** (email, teléfono, fechas, horarios,
  cantidad de jugadores) tanto en el navegador como, de nuevo, en el
  servidor (nunca confíes solo en el navegador).
- **Rate limiting**: límites de intentos por IP en creación de reservas
  y pagos, para dificultar abuso automatizado.
- **Cabeceras de seguridad** (`helmet`) y CORS restringido a tu dominio.
- **Sin contraseñas ni datos sensibles guardados**: no se almacenan datos
  de tarjetas — eso lo maneja Transbank directamente, tu servidor nunca
  los ve (así funciona Webpay Plus).
- **Secretos fuera del código**: todas las claves (Transbank, correo)
  viven en `.env`, que nunca se sube a un repositorio (`.gitignore` ya
  incluido).

## 7. Personalización rápida

Casi todo lo editable está en `server/config.js`:

```js
ARENA_OPEN_TIME: '10:00',
ARENA_CLOSE_TIME: '20:00',
SESSION_MINUTES: 40,
MAX_PLAYERS: 6,
PRICE_PER_PLAYER_CLP: 12000,
```

Cambia estos valores y reinicia el servidor — el frontend se ajusta
solo porque calcula todo desde la API.

---

¿Dudas sobre algún paso (por ejemplo desplegar el backend, o conseguir
la afiliación con Transbank)? Cuéntame en qué parte estás y seguimos
desde ahí.
