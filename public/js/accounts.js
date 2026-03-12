// ═══════════════════════════════════════════════════════
//  AUTH GUARD
// ═══════════════════════════════════════════════════════
const token = localStorage.getItem('budget_token');
if (!token) window.location.href = '/login.html';

const username = localStorage.getItem('budget_username') || '';
document.getElementById('userBadge').textContent = '👤 ' + username;

function logout() {
  localStorage.removeItem('budget_token');
  localStorage.removeItem('budget_username');
  window.location.href = '/login.html';
}

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
}

// ═══════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════
const COLORS = ['#3b82f6','#22c55e','#a855f7','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316','#64748b','#6366f1'];

const TYPE_META = {
  courant:       { label: 'Compte courant',  emoji: '💳', bg: 'rgba(59,130,246,.15)',  color: '#3b82f6' },
  epargne:       { label: 'Épargne',          emoji: '🏦', bg: 'rgba(34,197,94,.15)',   color: '#22c55e' },
  pea:           { label: 'PEA',              emoji: '📈', bg: 'rgba(99,102,241,.15)',  color: '#6366f1' },
  assurance:     { label: 'Assurance vie',    emoji: '🛡️', bg: 'rgba(168,85,247,.15)',  color: '#a855f7' },
  investissement:{ label: 'Compte titres',   emoji: '📊', bg: 'rgba(245,158,11,.15)',  color: '#f59e0b' },
  crypto:        { label: 'Crypto',           emoji: '₿',  bg: 'rgba(249,115,22,.15)',  color: '#f97316' },
  dette:         { label: 'Dette / Crédit',   emoji: '📉', bg: 'rgba(239,68,68,.15)',   color: '#ef4444' },
};

// ═══════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════
let accounts = [];
let selectedColor = COLORS[0];
let updateTargetId = null;

// ═══════════════════════════════════════════════════════
//  FORMAT
// ═══════════════════════════════════════════════════════
const fmt = n => (+n).toLocaleString('fr-FR', { style:'currency', currency:'EUR', minimumFractionDigits:2, maximumFractionDigits:2 });
const fmtK = n => {
  const abs = Math.abs(n);
  if (abs >= 1000) return (n/1000).toLocaleString('fr-FR', { minimumFractionDigits:1, maximumFractionDigits:1 }) + ' k€';
  return fmt(n);
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1)   return 'À l\'instant';
  if (min < 60)  return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)    return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30)    return `il y a ${d}j`;
  return new Date(dateStr).toLocaleDateString('fr-FR', { day:'numeric', month:'short' });
}

// ═══════════════════════════════════════════════════════
//  API
// ═══════════════════════════════════════════════════════
async function loadAccounts() {
  const r = await fetch('/api/accounts', { headers: authHeaders() });
  if (r.status === 401) { logout(); return; }
  accounts = await r.json();
}

async function apiCreate(data) {
  const r = await fetch('/api/accounts', { method:'POST', headers: authHeaders(), body: JSON.stringify(data) });
  return r.json();
}

async function apiUpdate(id, data) {
  await fetch(`/api/accounts/${id}`, { method:'PUT', headers: authHeaders(), body: JSON.stringify(data) });
}

async function apiDelete(id) {
  await fetch(`/api/accounts/${id}`, { method:'DELETE', headers: authHeaders() });
}

function showSave() {
  const el = document.getElementById('saveStatus');
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// ═══════════════════════════════════════════════════════
//  KPIs
// ═══════════════════════════════════════════════════════
function renderKPIs() {
  const epargneTypes = ['epargne', 'pea', 'assurance', 'investissement', 'crypto'];
  const courantTypes = ['courant'];
  const detteTypes   = ['dette'];

  const patrimoine = accounts.reduce((s, a) => s + a.solde, 0);
  const epargne    = accounts.filter(a => epargneTypes.includes(a.type)).reduce((s,a) => s + a.solde, 0);
  const courant    = accounts.filter(a => courantTypes.includes(a.type)).reduce((s,a) => s + a.solde, 0);
  const dettes     = accounts.filter(a => detteTypes.includes(a.type)).reduce((s,a) => s + Math.abs(a.solde), 0);

  const nbEp  = accounts.filter(a => epargneTypes.includes(a.type)).length;
  const nbCo  = accounts.filter(a => courantTypes.includes(a.type)).length;
  const nbDe  = accounts.filter(a => detteTypes.includes(a.type)).length;

  document.getElementById('kpi-patrimoine').textContent = fmtK(patrimoine);
  document.getElementById('kpi-nb-comptes').textContent = `${accounts.length} compte${accounts.length>1?'s':''}`;
  document.getElementById('kpi-epargne').textContent    = fmtK(epargne);
  document.getElementById('kpi-nb-epargne').textContent = `${nbEp} compte${nbEp>1?'s':''}`;
  document.getElementById('kpi-courant').textContent    = fmtK(courant);
  document.getElementById('kpi-nb-courant').textContent = `${nbCo} compte${nbCo>1?'s':''}`;
  document.getElementById('kpi-dettes').textContent     = fmtK(dettes);
  document.getElementById('kpi-nb-dettes').textContent  = `${nbDe} compte${nbDe>1?'s':''}`;
}

// ═══════════════════════════════════════════════════════
//  RENDER CARDS
// ═══════════════════════════════════════════════════════
function renderAccounts() {
  const grid = document.getElementById('accountsGrid');

  const cards = accounts.map(a => {
    const meta = TYPE_META[a.type] || TYPE_META.courant;
    const isNeg = a.solde < 0;
    const balanceColor = isNeg ? 'var(--red)' : (a.type === 'dette' ? 'var(--red)' : 'var(--text)');

    return `
    <div class="account-card" id="acc-${a.id}">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${a.couleur}"></div>
      <div class="account-header">
        <div class="account-icon-wrap">
          <div class="account-icon" style="background:${meta.bg};color:${meta.color}">${meta.emoji}</div>
          <div>
            <div class="account-info-name">${a.nom}</div>
            <div class="account-info-bank">${a.banque}</div>
          </div>
        </div>
        <span class="account-type-badge" style="background:${meta.bg};color:${meta.color}">${meta.label}</span>
      </div>

      <div class="account-balance">
        <div class="account-balance-label">Solde</div>
        <div class="account-balance-value" style="color:${balanceColor}">${fmt(a.solde)}</div>
      </div>

      <div class="account-meta">
        <span class="account-iban">${a.ibanFin ? '•••• ' + a.ibanFin : ''}</span>
        <span title="${new Date(a.syncedAt).toLocaleString('fr-FR')}">🔄 ${timeAgo(a.syncedAt)}</span>
      </div>

      <div class="account-actions">
        <button class="btn btn-primary btn-sm" onclick="openUpdateModal(${a.id})">↑ Mettre à jour</button>
        <button class="btn btn-ghost   btn-sm" onclick="openEditModal(${a.id})">✏️</button>
        <button class="btn btn-danger  btn-sm" onclick="deleteAccount(${a.id})">🗑️</button>
      </div>
    </div>`;
  }).join('');

  grid.innerHTML = cards + `
    <div class="add-account-card" onclick="openAddModal()">
      <span class="plus">＋</span>
      <span>Ajouter un compte</span>
    </div>`;
}

function renderAll() {
  renderKPIs();
  renderAccounts();
}

// ═══════════════════════════════════════════════════════
//  COLOR PICKER
// ═══════════════════════════════════════════════════════
function buildColorPicker(current) {
  selectedColor = current || COLORS[0];
  document.getElementById('colorPicker').innerHTML = COLORS.map(c =>
    `<div class="color-dot ${c === selectedColor ? 'selected' : ''}"
         style="background:${c}"
         onclick="selectColor('${c}')"></div>`
  ).join('');
}

function selectColor(c) {
  selectedColor = c;
  document.querySelectorAll('.color-dot').forEach(el => {
    el.classList.toggle('selected', el.style.background === c || el.style.backgroundColor === c);
  });
}

// ═══════════════════════════════════════════════════════
//  ACCOUNT MODAL (ajout / édition)
// ═══════════════════════════════════════════════════════
function openAddModal() {
  document.getElementById('accountModalTitle').textContent = 'Ajouter un compte';
  document.getElementById('accountId').value = '';
  ['aNom','aBanque','aSolde','aIban'].forEach(k => document.getElementById(k).value = '');
  document.getElementById('aType').value = 'courant';
  buildColorPicker(COLORS[0]);
  document.getElementById('accountModal').classList.add('open');
}

function openEditModal(id) {
  const a = accounts.find(x => x.id === id);
  document.getElementById('accountModalTitle').textContent = 'Modifier — ' + a.nom;
  document.getElementById('accountId').value  = a.id;
  document.getElementById('aNom').value       = a.nom;
  document.getElementById('aBanque').value    = a.banque;
  document.getElementById('aType').value      = a.type;
  document.getElementById('aSolde').value     = a.solde;
  document.getElementById('aIban').value      = a.ibanFin || '';
  buildColorPicker(a.couleur);
  document.getElementById('accountModal').classList.add('open');
}

function closeAccountModal() { document.getElementById('accountModal').classList.remove('open'); }

async function saveAccount() {
  const nom    = document.getElementById('aNom').value.trim();
  const banque = document.getElementById('aBanque').value.trim();
  const type   = document.getElementById('aType').value;
  const solde  = parseFloat(document.getElementById('aSolde').value) || 0;
  const ibanFin= document.getElementById('aIban').value.trim();
  if (!nom || !banque) { alert('Nom et banque sont requis.'); return; }

  const payload = { nom, banque, type, solde, ibanFin, couleur: selectedColor };
  const idVal = document.getElementById('accountId').value;

  if (idVal) {
    await apiUpdate(+idVal, payload);
    const idx = accounts.findIndex(x => x.id === +idVal);
    accounts[idx] = { ...accounts[idx], ...payload, syncedAt: new Date().toISOString() };
  } else {
    const created = await apiCreate(payload);
    accounts.push(created);
  }

  closeAccountModal();
  renderAll();
  showSave();
}

// ═══════════════════════════════════════════════════════
//  QUICK UPDATE MODAL
// ═══════════════════════════════════════════════════════
function openUpdateModal(id) {
  const a = accounts.find(x => x.id === id);
  updateTargetId = id;
  document.getElementById('updateModalTitle').textContent = '↑ ' + a.nom + ' — ' + a.banque;
  document.getElementById('newSolde').value = a.solde;
  document.getElementById('updateModal').classList.add('open');
  setTimeout(() => {
    const input = document.getElementById('newSolde');
    input.focus();
    input.select();
  }, 100);
}

function closeUpdateModal() {
  document.getElementById('updateModal').classList.remove('open');
  updateTargetId = null;
}

async function confirmUpdateSolde() {
  const solde = parseFloat(document.getElementById('newSolde').value);
  if (isNaN(solde)) return;
  const a = accounts.find(x => x.id === updateTargetId);
  const payload = { nom: a.nom, banque: a.banque, type: a.type, solde, ibanFin: a.ibanFin, couleur: a.couleur };
  await apiUpdate(updateTargetId, payload);
  const idx = accounts.findIndex(x => x.id === updateTargetId);
  accounts[idx] = { ...accounts[idx], solde, syncedAt: new Date().toISOString() };
  closeUpdateModal();
  renderAll();
  showSave();
}

// ═══════════════════════════════════════════════════════
//  DELETE
// ═══════════════════════════════════════════════════════
async function deleteAccount(id) {
  const a = accounts.find(x => x.id === id);
  if (!confirm(`Supprimer "${a.nom}" ?`)) return;
  await apiDelete(id);
  accounts = accounts.filter(x => x.id !== id);
  renderAll();
  showSave();
}

// ═══════════════════════════════════════════════════════
//  CLOSE ON OVERLAY CLICK + ENTER KEY
// ═══════════════════════════════════════════════════════
document.querySelectorAll('.modal-overlay').forEach(o =>
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); }));

document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (document.getElementById('accountModal').classList.contains('open')) saveAccount();
    if (document.getElementById('updateModal').classList.contains('open'))  confirmUpdateSolde();
  }
  if (e.key === 'Escape') {
    closeAccountModal();
    closeUpdateModal();
  }
});

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
(async () => {
  await loadAccounts();
  document.getElementById('loadingOverlay').classList.add('hidden');
  renderAll();
})();
