/* ===========================================================
   Umbral VR — Lógica del panel de administración
   =========================================================== */

const API_BASE = window.UMBRAL_API_BASE || 'https://web-production-6f38d.up.railway.app/api';
const el = (id) => document.getElementById(id);

// Todas las peticiones al panel deben ir con credentials:'include'
// para que la cookie de sesión (httpOnly) viaje con ellas.
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ocurrió un error inesperado.');
  return data;
}

/* =================== admin-login.html =================== */

if (el('loginForm')) {
  el('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = el('loginError');
    errorBox.classList.remove('show');

    const username = el('username').value.trim();
    const password = el('password').value;

    if (!username || !password) {
      errorBox.textContent = 'Ingresa tu usuario y contraseña.';
      errorBox.classList.add('show');
      return;
    }

    el('loginBtn').disabled = true;
    el('loginBtn').textContent = 'Ingresando…';

    try {
      const data = await apiFetch('/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      // Guardamos el token CSRF de esta sesión para usarlo en cada
      // petición que modifique datos (crear/editar/cancelar reservas).
      sessionStorage.setItem('umbral_csrf', data.csrfToken);
      sessionStorage.setItem('umbral_admin_user', data.username);
      window.location.href = 'admin.html';
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.add('show');
    } finally {
      el('loginBtn').disabled = false;
      el('loginBtn').textContent = 'Ingresar';
    }
  });
}

/* =================== admin.html (dashboard) =================== */

if (el('bookingsTbody')) {
  const state = {
    games: [],
    bookings: [],
    csrfToken: sessionStorage.getItem('umbral_csrf'),
    pendingDeleteId: null
  };

  const STATUS_LABELS = {
    paid: 'Pagada',
    pending_payment: 'Pendiente',
    failed: 'Fallida',
    cancelled: 'Cancelada (cliente)',
    cancelled_by_admin: 'Cancelada (admin)',
    expired: 'Expirada'
  };

  function csrfHeaders() {
    return { 'X-CSRF-Token': state.csrfToken };
  }

  function showLoading(show) {
    el('loadingOverlay').classList.toggle('show', show);
  }

  function showError(msg, target = 'adminError') {
    const box = el(target);
    box.textContent = msg;
    box.classList.add('show');
  }
  function clearError(target = 'adminError') {
    el(target).classList.remove('show');
  }

  async function checkSession() {
    try {
      const data = await apiFetch('/admin/auth/me');
      state.csrfToken = data.csrfToken; // refresca por si acaso
      sessionStorage.setItem('umbral_csrf', data.csrfToken);
      el('adminUserChip').textContent = `👤 ${data.username}`;
    } catch (err) {
      // Sesión inválida o vencida → de vuelta al login.
      window.location.href = 'admin-login.html';
    }
  }

  el('logoutBtn').addEventListener('click', async () => {
    try {
      await apiFetch('/admin/auth/logout', { method: 'POST', headers: csrfHeaders() });
    } catch (_) { /* aunque falle, igual mandamos al login */ }
    sessionStorage.clear();
    window.location.href = 'admin-login.html';
  });

  /* -------- Carga de datos -------- */

  async function loadGames() {
    const data = await apiFetch('/games');
    state.games = data.games;
    el('fGame').innerHTML = state.games
      .map((g) => `<option value="${g.id}">${g.title}</option>`)
      .join('');
  }

  function buildTimeOptions() {
    // Mismos bloques de 40 min que la web pública, generados en el
    // navegador solo para poblar el <select> — el servidor valida igual.
    const times = [];
    for (let m = 10 * 60; m + 40 <= 20 * 60; m += 40) {
      const h = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      times.push(`${h}:${mm}`);
    }
    el('fTime').innerHTML = times.map((t) => `<option value="${t}">${t}</option>`).join('');
  }

  async function loadBookings() {
    showLoading(true);
    clearError();
    try {
      const params = new URLSearchParams();
      const q = el('filterSearch').value.trim();
      const from = el('filterFrom').value;
      const to = el('filterTo').value;
      const status = el('filterStatus').value;
      if (q) params.set('q', q);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (status) params.set('status', status);

      const data = await apiFetch(`/admin/bookings?${params.toString()}`);
      state.bookings = data.bookings;
      renderTable();
    } catch (err) {
      showError(err.message);
    } finally {
      showLoading(false);
    }
  }

  function formatCLP(n) {
    return '$' + Number(n).toLocaleString('es-CL');
  }

  function renderTable() {
    const tbody = el('bookingsTbody');
    if (!state.bookings.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="admin-table-empty">No hay reservas con esos filtros.</td></tr>`;
      return;
    }

    tbody.innerHTML = state.bookings
      .map((b) => `
        <tr>
          <td class="admin-code">${b.id.slice(0, 8).toUpperCase()}</td>
          <td>${b.full_name}<br><span class="admin-code">${b.email}</span></td>
          <td>${b.game_title}</td>
          <td>${b.booking_date}</td>
          <td>${b.start_time}</td>
          <td>${b.players}</td>
          <td>${formatCLP(b.price_clp)}</td>
          <td><span class="admin-badge ${b.status}">${STATUS_LABELS[b.status] || b.status}</span></td>
          <td>
            <div class="admin-row-actions">
              <button class="admin-icon-btn" title="Editar" onclick="UmbralAdmin.openEdit('${b.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>
              </button>
              ${b.status !== 'cancelled_by_admin' ? `
              <button class="admin-icon-btn danger" title="Cancelar" onclick="UmbralAdmin.openDelete('${b.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6"/></svg>
              </button>` : ''}
            </div>
          </td>
        </tr>
      `)
      .join('');
  }

  /* -------- Filtros -------- */

  let filterDebounce;
  ['filterSearch', 'filterFrom', 'filterTo', 'filterStatus'].forEach((id) => {
    el(id).addEventListener('input', () => {
      clearTimeout(filterDebounce);
      filterDebounce = setTimeout(loadBookings, 300);
    });
  });
  el('clearFiltersBtn').addEventListener('click', () => {
    el('filterSearch').value = '';
    el('filterFrom').value = '';
    el('filterTo').value = '';
    el('filterStatus').value = '';
    loadBookings();
  });

  /* -------- Modal crear/editar -------- */

  function openModal(booking) {
    clearError('modalError');
    el('fBookingId').value = booking?.id || '';
    el('modalTitle').textContent = booking ? 'Editar reserva' : 'Nueva reserva';
    el('fGame').value = booking?.game_id || state.games[0]?.id || '';
    el('fDate').value = booking?.booking_date || new Date().toISOString().slice(0, 10);
    el('fTime').value = booking?.start_time || '10:00';
    el('fPlayers').value = booking?.players || 1;
    el('fStatus').value = booking?.status || 'paid';
    el('fFullName').value = booking?.full_name || '';
    el('fEmail').value = booking?.email || '';
    el('fPhone').value = booking?.phone || '';
    el('bookingModalOverlay').classList.add('show');
  }
  function closeModal() {
    el('bookingModalOverlay').classList.remove('show');
  }

  el('newBookingBtn').addEventListener('click', () => openModal(null));
  el('modalCloseBtn').addEventListener('click', closeModal);
  el('modalCancelBtn').addEventListener('click', closeModal);

  el('bookingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError('modalError');

    const payload = {
      gameId: el('fGame').value,
      date: el('fDate').value,
      time: el('fTime').value,
      players: Number(el('fPlayers').value),
      fullName: el('fFullName').value.trim(),
      email: el('fEmail').value.trim(),
      phone: el('fPhone').value.trim(),
      status: el('fStatus').value
    };

    const id = el('fBookingId').value;
    el('modalSaveBtn').disabled = true;

    try {
      if (id) {
        await apiFetch(`/admin/bookings/${id}`, {
          method: 'PUT',
          headers: csrfHeaders(),
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch('/admin/bookings', {
          method: 'POST',
          headers: csrfHeaders(),
          body: JSON.stringify(payload)
        });
      }
      closeModal();
      loadBookings();
    } catch (err) {
      showError(err.message, 'modalError');
    } finally {
      el('modalSaveBtn').disabled = false;
    }
  });

  /* -------- Confirmar cancelación -------- */

  function openDeleteModal(id) {
    state.pendingDeleteId = id;
    el('confirmModalOverlay').classList.add('show');
  }
  function closeDeleteModal() {
    state.pendingDeleteId = null;
    el('confirmModalOverlay').classList.remove('show');
  }
  el('confirmNoBtn').addEventListener('click', closeDeleteModal);
  el('confirmYesBtn').addEventListener('click', async () => {
    if (!state.pendingDeleteId) return;
    showLoading(true);
    try {
      await apiFetch(`/admin/bookings/${state.pendingDeleteId}`, {
        method: 'DELETE',
        headers: csrfHeaders()
      });
      closeDeleteModal();
      loadBookings();
    } catch (err) {
      showError(err.message);
      closeDeleteModal();
    } finally {
      showLoading(false);
    }
  });

  // Expuesto para los botones generados dinámicamente en la tabla.
  window.UmbralAdmin = {
    openEdit: (id) => openModal(state.bookings.find((b) => b.id === id)),
    openDelete: openDeleteModal
  };

  /* -------- Init -------- */

  (async function init() {
    await checkSession();
    buildTimeOptions();
    await loadGames();
    await loadBookings();
  })();
}
