/* ===========================================================
   Umbral VR — Lógica del wizard de reservas
   Habla con la API definida en API_BASE. Cambia esa constante
   por la URL real de tu backend cuando lo despliegues.
   =========================================================== */
/* URL BACKEND */
const API_BASE = window.UMBRAL_API_BASE || 'https://web-production-6f38d.up.railway.app/api';

const state = {
  step: 1,
  game: null,       // { id, title, coverUrl }
  date: null,
  time: null,
  players: 1,
  pricePerPlayer: 12000, // se sobreescribe con el valor real que venga del backend al crear la reserva
  bookingId: null
};

const el = (id) => document.getElementById(id);
const gamesGrid = el('gamesGrid');
const dateInput = el('dateInput');
const slotsGrid = el('slotsGrid');
const playersCount = el('playersCount');
const playersPrice = el('playersPrice');
const errorBanner = el('errorBanner');
const loadingOverlay = el('loadingOverlay');
const loadingText = el('loadingText');
const btnNext = el('btnNext');
const btnBack = el('btnBack');

function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.classList.add('show');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function clearError() {
  errorBanner.classList.remove('show');
  errorBanner.textContent = '';
}
function showLoading(msg) {
  loadingText.textContent = msg || 'Procesando...';
  loadingOverlay.classList.add('show');
}
function hideLoading() {
  loadingOverlay.classList.remove('show');
}
function formatCLP(n) {
  return '$' + Number(n).toLocaleString('es-CL') + ' CLP';
}

/* ---------------- Navegación entre pasos ---------------- */

function goToStep(n) {
  clearError();
  state.step = n;

  document.querySelectorAll('.booking-panel').forEach((p) => {
    p.classList.toggle('active', Number(p.dataset.panel) === n);
  });

  document.querySelectorAll('.stepper .step').forEach((s) => {
    const stepNum = Number(s.dataset.step);
    s.classList.toggle('active', stepNum === n);
    s.classList.toggle('done', stepNum < n);
  });

  btnBack.disabled = n === 1;
  btnNext.textContent = n === 4 ? 'Pagar con Webpay' : 'Continuar';

  if (n === 4) fillSummary();
}

function validateStep(n) {
  if (n === 1 && !state.game) {
    showError('Selecciona un juego para continuar.');
    return false;
  }
  if (n === 2 && (!state.date || !state.time)) {
    showError('Elige una fecha y un horario disponible.');
    return false;
  }
  if (n === 3 && (!state.players || state.players < 1)) {
    showError('Selecciona al menos 1 jugador.');
    return false;
  }
  return true;
}

btnNext.addEventListener('click', async () => {
  if (!validateStep(state.step)) return;

  if (state.step < 4) {
    goToStep(state.step + 1);
    return;
  }

  // Paso 4: validar formulario y proceder al pago
  if (!validatePaymentForm()) return;
  await submitBookingAndPay();
});

btnBack.addEventListener('click', () => {
  if (state.step > 1) goToStep(state.step - 1);
});

/* ---------------- Paso 1: Juegos ---------------- */

async function loadGames() {
  try {
    const res = await fetch(`${API_BASE}/games`);
    if (!res.ok) throw new Error('No se pudo cargar la biblioteca de juegos.');
    const data = await res.json();
    renderGames(data.games);
  } catch (err) {
    gamesGrid.innerHTML = `<p class="bk-slots-empty">No pudimos cargar los juegos. Intenta recargar la página.</p>`;
    console.error(err);
  }
}

function renderGames(games) {
  gamesGrid.innerHTML = games
    .map(
      (g) => `
    <div class="bk-game-card" data-id="${g.id}" data-title="${g.title}" data-cover="${g.cover_url}" tabindex="0" role="button" aria-pressed="false">
      ${g.featured ? '<span class="bk-game-featured-badge">Destacado</span>' : ''}
      <span class="bk-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg></span>
      <img src="${g.cover_url}" alt="${g.title}" loading="lazy">
      <div class="bk-game-info">
        <span class="bk-game-tag">${g.tag}</span>
        <h3>${g.title}</h3>
      </div>
    </div>`
    )
    .join('');

  gamesGrid.querySelectorAll('.bk-game-card').forEach((card) => {
    card.addEventListener('click', () => selectGame(card));
    card.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' || e.key === ' ') selectGame(card);
    });
  });
}

function selectGame(card) {
  gamesGrid.querySelectorAll('.bk-game-card').forEach((c) => {
    c.classList.remove('selected');
    c.setAttribute('aria-pressed', 'false');
  });
  card.classList.add('selected');
  card.setAttribute('aria-pressed', 'true');
  state.game = {
    id: card.dataset.id,
    title: card.dataset.title,
    coverUrl: card.dataset.cover
  };
  clearError();
}

/* ---------------- Paso 2: Fecha y horario ---------------- */

function setupDateInput() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;

  dateInput.min = todayStr;
  dateInput.value = todayStr;
  loadSlots(todayStr);

  dateInput.addEventListener('change', () => {
    state.time = null;
    if (dateInput.value) loadSlots(dateInput.value);
  });
}

async function loadSlots(date) {
  slotsGrid.innerHTML = `<p class="bk-slots-empty">Cargando horarios…</p>`;
  try {
    const res = await fetch(`${API_BASE}/slots?date=${encodeURIComponent(date)}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'No se pudo obtener la disponibilidad.');
    }
    const data = await res.json();
    state.date = date;
    renderSlots(data.slots);
  } catch (err) {
    slotsGrid.innerHTML = `<p class="bk-slots-empty">${err.message}</p>`;
  }
}

function renderSlots(slots) {
  if (!slots.length) {
    slotsGrid.innerHTML = `<p class="bk-slots-empty">No hay horarios configurados para este día.</p>`;
    return;
  }
  slotsGrid.innerHTML = slots
    .map(
      (s) => `<div class="bk-slot ${s.available ? '' : 'taken'}" data-time="${s.time}">${s.time}</div>`
    )
    .join('');

  slotsGrid.querySelectorAll('.bk-slot:not(.taken)').forEach((slotEl) => {
    slotEl.addEventListener('click', () => {
      slotsGrid.querySelectorAll('.bk-slot').forEach((s) => s.classList.remove('selected'));
      slotEl.classList.add('selected');
      state.time = slotEl.dataset.time;
      clearError();
    });
  });
}

/* ---------------- Paso 3: Jugadores ---------------- */

function updatePlayersUI() {
  playersCount.textContent = state.players;
  playersPrice.textContent = formatCLP(state.players * state.pricePerPlayer);
  el('playersMinus').disabled = state.players <= 1;
  el('playersPlus').disabled = state.players >= 6;
}

el('playersMinus').addEventListener('click', () => {
  if (state.players > 1) {
    state.players--;
    updatePlayersUI();
  }
});
el('playersPlus').addEventListener('click', () => {
  if (state.players < 6) {
    state.players++;
    updatePlayersUI();
  }
});

/* ---------------- Paso 4: Pago ---------------- */

function fillSummary() {
  el('sumGame').textContent = state.game?.title || '—';
  el('sumDate').textContent = formatDateEs(state.date);
  el('sumTime').textContent = state.time ? `${state.time} hrs` : '—';
  el('sumPlayers').textContent = `${state.players} jugador${state.players > 1 ? 'es' : ''}`;
  el('sumTotal').textContent = formatCLP(state.players * state.pricePerPlayer);
}

function formatDateEs(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
}

function validatePaymentForm() {
  let valid = true;

  const name = el('fullName').value.trim();
  const email = el('email').value.trim();
  const phone = el('phone').value.trim();

  toggleFieldError('grp-name', name.length >= 2);
  toggleFieldError('grp-email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  toggleFieldError('grp-phone', /^[0-9+\s()-]{7,20}$/.test(phone));

  if (name.length < 2) valid = false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) valid = false;
  if (!/^[0-9+\s()-]{7,20}$/.test(phone)) valid = false;

  if (!valid) showError('Revisa los datos marcados en rojo antes de continuar.');
  return valid;
}

function toggleFieldError(groupId, isValid) {
  el(groupId).classList.toggle('invalid', !isValid);
}

async function submitBookingAndPay() {
  showLoading('Reservando tu horario…');
  try {
    const bookingRes = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: state.game.id,
        date: state.date,
        time: state.time,
        players: state.players,
        fullName: el('fullName').value.trim(),
        email: el('email').value.trim(),
        phone: el('phone').value.trim()
      })
    });

    const bookingData = await bookingRes.json();
    if (!bookingRes.ok) throw new Error(bookingData.error || 'No se pudo crear la reserva.');

    state.bookingId = bookingData.bookingId;

    showLoading('Redirigiendo a Webpay…');
    const payRes = await fetch(`${API_BASE}/webpay/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: state.bookingId })
    });
    const payData = await payRes.json();
    if (!payRes.ok) throw new Error(payData.error || 'No se pudo iniciar el pago.');

    // Redirección estándar a Webpay Plus: POST con token_ws al url entregado.
    const form = el('webpayRedirectForm');
    form.action = payData.url;
    el('webpayTokenInput').value = payData.token;
    form.submit();
  } catch (err) {
    hideLoading();
    showError(err.message || 'Ocurrió un error. Intenta nuevamente.');
    // Si la reserva alcanzó a crearse pero el paso de pago falló, el
    // horario se libera solo tras el tiempo de espera configurado en
    // el backend (PENDING_HOLD_MINUTES), así que es seguro reintentar.
  }
}

/* ---------------- Init ---------------- */

loadGames();
setupDateInput();
updatePlayersUI();
goToStep(1);
