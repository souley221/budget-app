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
//  STATE
// ═══════════════════════════════════════════════════════
const MOIS = ['Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];
const PIE_COLORS = ['#3b82f6','#ef4444','#f59e0b','#22c55e','#a855f7','#ec4899','#14b8a6','#f97316','#64748b'];

// revenus : [{ label, vals:[12] }, ...]
// depenses: [{ cat, label, vals:[12] }, ...]
let state = { revenus: [], depenses: [], credits: [] };

// ═══════════════════════════════════════════════════════
//  API
// ═══════════════════════════════════════════════════════
async function loadData() {
  const [budgetRes, creditsRes] = await Promise.all([
    fetch('/api/budget',  { headers: authHeaders() }),
    fetch('/api/credits', { headers: authHeaders() }),
  ]);
  if (budgetRes.status === 401 || creditsRes.status === 401) { logout(); return; }
  const budget  = await budgetRes.json();
  const credits = await creditsRes.json();
  state.revenus  = budget.revenus;
  state.depenses = budget.depenses;
  state.credits  = credits;
}

async function saveBudget() {
  await fetch('/api/budget', {
    method: 'PUT', headers: authHeaders(),
    body: JSON.stringify({ revenus: state.revenus, depenses: state.depenses })
  });
  showSaveStatus();
}

async function apiAddCredit(data) {
  const r = await fetch('/api/credits', { method:'POST', headers:authHeaders(), body:JSON.stringify(data) });
  return r.json();
}
async function apiUpdateCredit(id, data) {
  await fetch(`/api/credits/${id}`, { method:'PUT', headers:authHeaders(), body:JSON.stringify(data) });
}
async function apiDeleteCredit(id) {
  await fetch(`/api/credits/${id}`, { method:'DELETE', headers:authHeaders() });
}

function showSaveStatus() {
  const el = document.getElementById('saveStatus');
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// ═══════════════════════════════════════════════════════
//  COMPUTED
// ═══════════════════════════════════════════════════════
function compute() {
  const rev = MOIS.map((_,i) => state.revenus.reduce((s,r) => s + (r.vals[i]||0), 0));
  const dep = MOIS.map((_,i) => state.depenses.reduce((s,d) => s + (d.vals[i]||0), 0));
  const ep  = MOIS.map((_,i) => +(rev[i] - dep[i]).toFixed(2));
  return { rev, dep, ep,
    tRevA: rev.reduce((a,b)=>a+b,0),
    tDepA: dep.reduce((a,b)=>a+b,0),
    tEpA:  ep.reduce((a,b)=>a+b,0)
  };
}

function catMap() {
  const m = {};
  state.depenses.forEach(d => {
    const t = d.vals.reduce((a,b)=>a+b,0);
    if (t > 0) m[d.cat||'Divers'] = (m[d.cat||'Divers']||0) + t;
  });
  return m;
}

// ═══════════════════════════════════════════════════════
//  FORMAT
// ═══════════════════════════════════════════════════════
const fmt  = n => (+n).toLocaleString('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0});
const fmtD = n => (+n).toLocaleString('fr-FR',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2});

// ═══════════════════════════════════════════════════════
//  EMPTY STATE
// ═══════════════════════════════════════════════════════
function renderEmptyState() {
  const hasData = state.revenus.length > 0 || state.depenses.length > 0;
  document.getElementById('emptyState').style.display  = hasData ? 'none' : 'flex';
  document.getElementById('mainContent').style.display = hasData ? '' : 'none';
}

// ═══════════════════════════════════════════════════════
//  CHARTS
// ═══════════════════════════════════════════════════════
let chartOverview, chartSavings, chartPie;
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = '#2e3250';
Chart.defaults.font.family = 'Segoe UI, system-ui, sans-serif';
const gridOpts = { color:'rgba(46,50,80,.5)', drawBorder:false };

function initCharts() {
  const { rev, dep, ep } = compute();
  const cm = catMap();
  const catLabels = Object.keys(cm);
  const catVals   = catLabels.map(k => +cm[k].toFixed(2));
  const catTotal  = catVals.reduce((a,b)=>a+b,0);
  const moyEp     = ep.reduce((a,b)=>a+b,0)/12;

  if (chartOverview) chartOverview.destroy();
  chartOverview = new Chart(document.getElementById('chartOverview'), {
    type:'bar',
    data: { labels:MOIS, datasets:[
      { label:'Revenus',  data:rev, backgroundColor:'rgba(59,130,246,.7)', borderRadius:5, order:1 },
      { label:'Dépenses', data:dep, backgroundColor:'rgba(239,68,68,.65)',  borderRadius:5, order:2 },
      { label:'Épargne',  data:ep,  type:'line', borderColor:'#22c55e',
        backgroundColor:'rgba(34,197,94,.1)', borderWidth:2.5, pointBackgroundColor:'#22c55e',
        pointRadius:5, pointHoverRadius:7, fill:true, tension:.35, order:0 }
    ]},
    options: { responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      plugins:{ legend:{position:'top',labels:{padding:18,boxWidth:12}},
        tooltip:{callbacks:{label:ctx=>` ${ctx.dataset.label} : ${fmtD(ctx.parsed.y)}`}} },
      scales:{ x:{grid:gridOpts}, y:{grid:gridOpts,ticks:{callback:v=>fmt(v)}} } }
  });

  if (chartSavings) chartSavings.destroy();
  chartSavings = new Chart(document.getElementById('chartSavings'), {
    type:'bar',
    data: { labels:MOIS, datasets:[{ label:'Épargne', data:ep,
      backgroundColor:ep.map(v=>v>=moyEp?'rgba(34,197,94,.85)':'rgba(34,197,94,.38)'), borderRadius:6 }] },
    options: { responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{callbacks:{
        label:ctx=>` Épargne : ${fmtD(ctx.parsed.y)}`,
        afterLabel:ctx=>rev[ctx.dataIndex]>0?` Taux : ${((ctx.parsed.y/rev[ctx.dataIndex])*100).toFixed(1)} %`:''
      }}},
      scales:{ x:{grid:gridOpts}, y:{grid:gridOpts,ticks:{callback:v=>fmt(v)}} } }
  });

  if (chartPie) chartPie.destroy();
  chartPie = new Chart(document.getElementById('chartPie'), {
    type:'doughnut',
    data: { labels:catLabels, datasets:[{ data:catVals, backgroundColor:PIE_COLORS, borderWidth:2, borderColor:'#1a1d27', hoverOffset:8 }] },
    options: { responsive:true, maintainAspectRatio:false, cutout:'62%',
      plugins:{ legend:{display:false}, tooltip:{callbacks:{
        label:ctx=>` ${ctx.label} : ${fmtD(ctx.parsed)}${catTotal>0?' ('+((ctx.parsed/catTotal)*100).toFixed(1)+' %)':''}`
      }}} }
  });

  document.getElementById('pieLegend').innerHTML = catTotal > 0
    ? catLabels.map((lbl,i) =>
        `<div class="legend-item">
          <span class="legend-dot" style="background:${PIE_COLORS[i]}"></span>
          <span class="legend-name">${lbl}</span>
          <span class="legend-pct">${((catVals[i]/catTotal)*100).toFixed(1)} %</span>
          <span class="legend-amt">${fmt(catVals[i])}</span>
        </div>`).join('')
    : '<span style="color:var(--muted);font-size:.8rem">Aucune dépense</span>';
}

// ═══════════════════════════════════════════════════════
//  KPIs
// ═══════════════════════════════════════════════════════
function renderKPIs() {
  const { ep, tRevA, tDepA, tEpA } = compute();
  const bestIdx = ep.indexOf(Math.max(...ep));
  document.getElementById('kpi-revenus').textContent  = fmt(tRevA);
  document.getElementById('kpi-rev-moy').textContent  = `Moy. mensuelle : ${fmt(tRevA/12)}`;
  document.getElementById('kpi-depenses').textContent = fmt(tDepA);
  document.getElementById('kpi-dep-moy').textContent  = `Moy. mensuelle : ${fmt(tDepA/12)}`;
  document.getElementById('kpi-epargne').textContent  = fmt(tEpA);
  document.getElementById('kpi-ep-moy').textContent   = `Moy. mensuelle : ${fmt(tEpA/12)}`;
  document.getElementById('kpi-taux').textContent     = tRevA > 0 ? ((tEpA/tRevA)*100).toFixed(1) + ' %' : '— %';
  document.getElementById('kpi-best').textContent     = fmt(ep[bestIdx]);
  document.getElementById('kpi-best-mois').textContent= MOIS[bestIdx];
}

// ═══════════════════════════════════════════════════════
//  TABLE
// ═══════════════════════════════════════════════════════
function renderTable() {
  const { rev, dep, ep, tRevA, tDepA, tEpA } = compute();
  document.getElementById('tableBody').innerHTML = MOIS.map((m,i) => {
    const taux = rev[i] > 0 ? ((ep[i]/rev[i])*100).toFixed(1) : '0.0';
    return `<tr onclick="openMonthModal(${i})">
      <td><strong>${m}</strong></td>
      <td style="color:var(--blue)">${fmtD(rev[i])}</td>
      <td style="color:var(--red)">${fmtD(dep[i])}</td>
      <td class="${ep[i]>=0?'pos-val':'neg-val'}" style="font-weight:700">${fmtD(ep[i])}</td>
      <td class="${+taux>=20?'pos-val':+taux>=10?'':'neg-val'}">${taux} %</td>
      <td style="color:var(--blue);font-size:.75rem">✏️</td>
    </tr>`;
  }).join('');
  document.getElementById('tableFoot').innerHTML = `<tr>
    <td>TOTAL / MOY.</td>
    <td style="color:var(--blue)">${fmt(tRevA)}</td>
    <td style="color:var(--red)">${fmt(tDepA)}</td>
    <td style="color:var(--green)">${fmt(tEpA)}</td>
    <td style="color:var(--purple)">${tRevA>0?((tEpA/tRevA)*100).toFixed(1)+'%':'— %'}</td>
    <td></td>
  </tr>`;
}

// ═══════════════════════════════════════════════════════
//  CREDITS
// ═══════════════════════════════════════════════════════
function calcCreditEnd(c) {
  const taux = c.tauxAnnuel || 0;
  let nMois;
  if (taux > 0) {
    const tm = taux / 100 / 12;
    nMois = -Math.log(1 - c.capitalRestant * tm / c.mensualite) / Math.log(1 + tm);
  } else {
    nMois = c.capitalRestant / c.mensualite;
  }
  nMois = Math.ceil(nMois);
  const end = new Date();
  end.setMonth(end.getMonth() + nMois);
  return { nMois, end };
}

function renderCredits() {
  const grid = document.getElementById('creditGrid');
  const cards = state.credits.map(c => {
    const pct = Math.min(100, Math.max(0, ((c.capitalInitial - c.capitalRestant) / c.capitalInitial) * 100));
    const { nMois, end } = calcCreditEnd(c);
    const endStr = end.toLocaleDateString('fr-FR', {month:'long', year:'numeric'});
    const color = pct >= 75 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';
    return `<div class="credit-card">
      <div class="credit-card-header">
        <div class="credit-name">${c.nom}</div>
        <span class="credit-badge">${c.mensualite} €/mois</span>
      </div>
      <div class="credit-amounts">
        <div class="credit-amt-item">
          <div class="credit-amt-label">Capital initial</div>
          <div class="credit-amt-val">${fmt(c.capitalInitial)}</div>
        </div>
        <div class="credit-amt-item">
          <div class="credit-amt-label">Remboursé</div>
          <div class="credit-amt-val" style="color:${color}">${fmt(c.capitalInitial - c.capitalRestant)}</div>
        </div>
        <div class="credit-amt-item">
          <div class="credit-amt-label">Restant dû</div>
          <div class="credit-amt-val" style="color:var(--red)">${fmt(c.capitalRestant)}</div>
        </div>
      </div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width:${pct.toFixed(1)}%;background:${color}"></div>
      </div>
      <div class="credit-meta">
        <span style="color:${color};font-weight:700">${pct.toFixed(1)} % remboursé</span>
        <span>encore ${nMois} mois</span>
        <span style="color:var(--orange);font-weight:600">Fin : ${endStr}</span>
      </div>
      ${c.tauxAnnuel ? `<div style="font-size:.72rem;color:var(--muted);margin-top:6px">Taux : ${c.tauxAnnuel} % / an</div>` : ''}
      <div class="credit-actions">
        <button class="btn btn-ghost btn-sm" onclick="openCreditModal(${c.id});event.stopPropagation()">✏️ Modifier</button>
        <button class="btn btn-danger  btn-sm" onclick="deleteCredit(${c.id});event.stopPropagation()">🗑️ Supprimer</button>
      </div>
    </div>`;
  }).join('');

  grid.innerHTML = cards + `<div class="add-credit-card" onclick="openCreditModal(null)">
    <span class="plus">＋</span><span>Ajouter un crédit</span>
  </div>`;
}

function renderAll() {
  renderEmptyState();
  renderTable();
  if (state.revenus.length > 0 || state.depenses.length > 0) {
    renderKPIs();
    initCharts();
  }
  renderCredits();
}

// ═══════════════════════════════════════════════════════
//  MONTH MODAL — tabs et formulaires d'ajout
// ═══════════════════════════════════════════════════════
let currentMonthIdx = null;

function openMonthModal(i) {
  currentMonthIdx = i;
  document.getElementById('monthModalTitle').textContent = 'Modifier — ' + MOIS[i];
  switchTab('revenus');
  buildMonthTabs(i);
  document.getElementById('monthModal').classList.add('open');
}
function closeMonthModal() { document.getElementById('monthModal').classList.remove('open'); }

function switchTab(tab) {
  document.getElementById('tabRevenus').style.display  = tab === 'revenus'  ? '' : 'none';
  document.getElementById('tabDepenses').style.display = tab === 'depenses' ? '' : 'none';
  document.querySelectorAll('.modal-tab').forEach((t,k) =>
    t.classList.toggle('active', (k===0 && tab==='revenus') || (k===1 && tab==='depenses')));
}

function buildMonthTabs(i) {
  // ── Revenus ──────────────────────────────────────────
  const revRows = state.revenus.map((r, j) => `
    <div class="edit-row" id="rev-row-${j}">
      <label>${r.label}</label>
      <input type="number" min="0" step="0.01" id="r_${j}" value="${r.vals[i]}" />
      <span class="unit">€</span>
      <button class="btn-row-delete" onclick="deleteRevenueRow(${j})" title="Supprimer cette ligne">✕</button>
    </div>`).join('');

  document.getElementById('tabRevenus').innerHTML = `
    <div class="edit-section">
      <div class="edit-section-title">Revenus de ${MOIS[i]}</div>
      ${revRows || '<p class="empty-rows-hint">Aucune ligne de revenu. Ajoutez-en une ci-dessous.</p>'}
      <div class="add-row-form" id="addRevForm" style="display:none">
        <input type="text" id="newRevLabel" placeholder="Libellé (ex: Salaire)" />
        <div class="add-row-actions">
          <button class="btn btn-primary btn-sm" onclick="confirmAddRevenueRow(${i})">Ajouter</button>
          <button class="btn btn-ghost   btn-sm" onclick="toggleAddForm('addRevForm')">Annuler</button>
        </div>
      </div>
      <button class="btn-add-row" onclick="toggleAddForm('addRevForm')">＋ Nouvelle ligne de revenu</button>
    </div>`;

  // ── Dépenses ─────────────────────────────────────────
  const depRows = state.depenses.map((d, j) => `
    <div class="edit-row" id="dep-row-${j}">
      <label><span class="row-cat-badge">${d.cat||'Divers'}</span>${d.label}</label>
      <input type="number" min="0" step="0.01" id="d_${j}" value="${d.vals[i]}" />
      <span class="unit">€</span>
      <button class="btn-row-delete" onclick="deleteExpenseRow(${j})" title="Supprimer cette ligne">✕</button>
    </div>`).join('');

  document.getElementById('tabDepenses').innerHTML = `
    <div class="edit-section">
      <div class="edit-section-title">Dépenses de ${MOIS[i]}</div>
      ${depRows || '<p class="empty-rows-hint">Aucune ligne de dépense. Ajoutez-en une ci-dessous.</p>'}
      <div class="add-row-form" id="addDepForm" style="display:none">
        <input type="text" id="newDepLabel" placeholder="Libellé (ex: Loyer)" />
        <input type="text" id="newDepCat"   placeholder="Catégorie (ex: Logement)" />
        <div class="add-row-actions">
          <button class="btn btn-primary btn-sm" onclick="confirmAddExpenseRow(${i})">Ajouter</button>
          <button class="btn btn-ghost   btn-sm" onclick="toggleAddForm('addDepForm')">Annuler</button>
        </div>
      </div>
      <button class="btn-add-row" onclick="toggleAddForm('addDepForm')">＋ Nouvelle ligne de dépense</button>
    </div>`;
}

function toggleAddForm(id) {
  const form = document.getElementById(id);
  const visible = form.style.display !== 'none';
  form.style.display = visible ? 'none' : 'flex';
  if (!visible) {
    // focus le premier input du formulaire
    form.querySelector('input')?.focus();
  }
}

// ── Sauvegarde les valeurs actuellement affichées dans les inputs ──
function saveCurrentEdits() {
  const i = currentMonthIdx;
  if (i === null) return;
  state.revenus.forEach((r, j) => {
    const el = document.getElementById('r_' + j);
    if (el) r.vals[i] = parseFloat(el.value) || 0;
  });
  state.depenses.forEach((d, j) => {
    const el = document.getElementById('d_' + j);
    if (el) d.vals[i] = parseFloat(el.value) || 0;
  });
}

// ── Ajouter ligne revenu ──────────────────────────────
function confirmAddRevenueRow(i) {
  const label = document.getElementById('newRevLabel').value.trim();
  if (!label) { document.getElementById('newRevLabel').focus(); return; }
  saveCurrentEdits();
  state.revenus.push({ label, vals: Array(12).fill(0) });
  buildMonthTabs(i);
  // focus le nouvel input
  document.getElementById(`r_${state.revenus.length - 1}`)?.focus();
}

// ── Ajouter ligne dépense ─────────────────────────────
function confirmAddExpenseRow(i) {
  const label = document.getElementById('newDepLabel').value.trim();
  const cat   = document.getElementById('newDepCat').value.trim() || 'Divers';
  if (!label) { document.getElementById('newDepLabel').focus(); return; }
  saveCurrentEdits();
  state.depenses.push({ cat, label, vals: Array(12).fill(0) });
  buildMonthTabs(i);
  document.getElementById(`d_${state.depenses.length - 1}`)?.focus();
}

// ── Supprimer ligne revenu ────────────────────────────
function deleteRevenueRow(j) {
  if (!confirm(`Supprimer "${state.revenus[j].label}" de tous les mois ?`)) return;
  saveCurrentEdits();
  state.revenus.splice(j, 1);
  buildMonthTabs(currentMonthIdx);
}

// ── Supprimer ligne dépense ───────────────────────────
function deleteExpenseRow(j) {
  if (!confirm(`Supprimer "${state.depenses[j].label}" de tous les mois ?`)) return;
  saveCurrentEdits();
  state.depenses.splice(j, 1);
  buildMonthTabs(currentMonthIdx);
}

async function saveMonth() {
  saveCurrentEdits();
  renderAll();
  closeMonthModal();
  await saveBudget();
}

// ═══════════════════════════════════════════════════════
//  CREDIT MODAL
// ═══════════════════════════════════════════════════════
function openCreditModal(id) {
  document.getElementById('creditModal').classList.add('open');
  if (id === null) {
    document.getElementById('creditModalTitle').textContent = 'Ajouter un crédit';
    document.getElementById('creditId').value = '';
    ['cNom','cCapitalInitial','cCapitalRestant','cMensualite','cTaux'].forEach(k =>
      document.getElementById(k).value = '');
  } else {
    const c = state.credits.find(x => x.id === id);
    document.getElementById('creditModalTitle').textContent = 'Modifier — ' + c.nom;
    document.getElementById('creditId').value           = c.id;
    document.getElementById('cNom').value               = c.nom;
    document.getElementById('cCapitalInitial').value    = c.capitalInitial;
    document.getElementById('cCapitalRestant').value    = c.capitalRestant;
    document.getElementById('cMensualite').value        = c.mensualite;
    document.getElementById('cTaux').value              = c.tauxAnnuel || '';
  }
}
function closeCreditModal() { document.getElementById('creditModal').classList.remove('open'); }

async function saveCredit() {
  const nom  = document.getElementById('cNom').value.trim();
  const capI = parseFloat(document.getElementById('cCapitalInitial').value)||0;
  const capR = parseFloat(document.getElementById('cCapitalRestant').value)||0;
  const mens = parseFloat(document.getElementById('cMensualite').value)||0;
  const taux = parseFloat(document.getElementById('cTaux').value)||0;
  if (!nom || mens <= 0) { alert('Veuillez renseigner le nom et la mensualité.'); return; }

  const idVal = document.getElementById('creditId').value;
  const payload = { nom, capitalInitial:capI, capitalRestant:capR, mensualite:mens, tauxAnnuel:taux };

  if (idVal) {
    await apiUpdateCredit(+idVal, payload);
    const idx = state.credits.findIndex(x => x.id === +idVal);
    state.credits[idx] = { id:+idVal, ...payload };
  } else {
    const created = await apiAddCredit(payload);
    state.credits.push(created);
  }
  renderCredits();
  closeCreditModal();
  showSaveStatus();
}

async function deleteCredit(id) {
  if (!confirm('Supprimer ce crédit ?')) return;
  await apiDeleteCredit(id);
  state.credits = state.credits.filter(x => x.id !== id);
  renderCredits();
  showSaveStatus();
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(o =>
  o.addEventListener('click', e => { if (e.target===o) o.classList.remove('open'); }));

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
(async () => {
  await loadData();
  document.getElementById('loadingOverlay').classList.add('hidden');
  renderAll();
})();
