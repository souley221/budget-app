// ── Auth guard ────────────────────────────────────────────────────────────
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

// ── État ──────────────────────────────────────────────────────────────────
let allInstitutions = [];
let currentCountry  = 'FR';
const fmt = n => (+n).toLocaleString('fr-FR', { style:'currency', currency:'EUR', minimumFractionDigits:2 });

// ── Étapes ────────────────────────────────────────────────────────────────
function showStep(n) {
  [1, 2, 3].forEach(i => {
    document.getElementById(`step${i}`).style.display = i === n ? '' : 'none';
    const ind = document.getElementById(`step-indicator-${i}`);
    ind.classList.toggle('active', i === n);
    ind.classList.toggle('done', i < n);
  });
}

// ── Init ──────────────────────────────────────────────────────────────────
(async () => {
  const hideOverlay = () => document.getElementById('loadingOverlay').classList.add('hidden');

  try {
    // Vérifier si on revient d'un redirect Enable Banking (code OAuth dans l'URL)
    const params = new URLSearchParams(window.location.search);
    const oauthCode = params.get('code');
    const stateParam = params.get('state'); // fallback si sessionStorage vide (nouvel onglet)
    const gcReqId = sessionStorage.getItem('gc_pending_req_id') || stateParam;

    if (oauthCode && gcReqId) {
      window.history.replaceState({}, '', '/bank-connect.html');
      sessionStorage.removeItem('gc_pending_req_id');
      await finalizeConnection(gcReqId, oauthCode);
      return;
    }

    // Vérifier si GoCardless est configuré
    const statusRes = await fetch('/api/gc/status', { headers: authHeaders() });
    const data = statusRes.ok ? await statusRes.json() : { configured: false };

    hideOverlay();

    if (!data.configured) {
      document.getElementById('notConfigured').style.display = '';
    } else {
      document.getElementById('searchSection').style.display = '';
      await loadCountry('FR', document.querySelector('.ctab.active'));
    }

    showStep(1);
  } catch (e) {
    hideOverlay();
    document.getElementById('notConfigured').style.display = '';
    showStep(1);
    console.error('Erreur init bank-connect:', e);
  }
})();

// ── Chargement des institutions ───────────────────────────────────────────
async function loadCountry(country, btn) {
  currentCountry = country;
  document.querySelectorAll('.ctab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('institutionsGrid').innerHTML = '';
  document.getElementById('institutionsEmpty').style.display = 'none';
  document.getElementById('institutionsLoading').style.display = 'flex';
  document.getElementById('searchInput').value = '';

  try {
    const r = await fetch(`/api/gc/institutions?country=${country}`, { headers: authHeaders() });
    if (!r.ok) throw new Error(await r.text());
    allInstitutions = await r.json();
    filterInstitutions();
  } catch (e) {
    document.getElementById('institutionsLoading').style.display = 'none';
    document.getElementById('institutionsGrid').innerHTML = `<p style="color:var(--red);font-size:.85rem">Erreur : ${e.message}</p>`;
  }
}

function filterInstitutions() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  const filtered = q ? allInstitutions.filter(i => i.name.toLowerCase().includes(q)) : allInstitutions;
  renderInstitutions(filtered);
}

function renderInstitutions(list) {
  document.getElementById('institutionsLoading').style.display = 'none';
  document.getElementById('institutionsEmpty').style.display = list.length === 0 ? '' : 'none';

  document.getElementById('institutionsGrid').innerHTML = list.slice(0, 80).map(inst => {
    const logo = inst.logo
      ? `<img class="inst-logo" src="${inst.logo}" alt="${inst.name}" onerror="this.style.display='none';this.nextSibling.style.display='flex'">`
        + `<div class="inst-logo-fallback" style="display:none">🏦</div>`
      : `<div class="inst-logo-fallback">🏦</div>`;
    return `<div class="inst-card" onclick="selectInstitution('${inst.id}', '${inst.name.replace(/'/g, "\\'")}', '${(inst.logo||'').replace(/'/g, "\\'")}')">
      ${logo}
      <div class="inst-name">${inst.name}</div>
    </div>`;
  }).join('');
}

// ── Sélection d'une banque → lancer le flux OAuth ─────────────────────────
async function selectInstitution(id, name, logo) {
  showStep(2);

  // Afficher le nom de la banque sur l'étape 2
  document.getElementById('redirectBankLogo').textContent = logo ? '' : '🏦';
  if (logo) {
    document.getElementById('redirectBankLogo').innerHTML =
      `<img src="${logo}" style="width:60px;height:60px;object-fit:contain;border-radius:14px;background:#fff;padding:6px" />`;
  }
  document.getElementById('redirectBankName').textContent = name;

  try {
    const r = await fetch('/api/gc/connect', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ institutionId: id, institutionName: name, institutionLogo: logo }),
    });
    if (!r.ok) {
      const err = await r.json();
      alert('Erreur : ' + (err.error || 'Impossible de contacter GoCardless'));
      showStep(1);
      return;
    }
    const { id: reqId, link } = await r.json();

    // Stocker l'ID de réquisition avant de quitter la page
    sessionStorage.setItem('gc_pending_req_id', reqId);

    // Attendre 1s pour montrer l'animation, puis rediriger
    setTimeout(() => { window.location.href = link; }, 1200);
  } catch (e) {
    alert('Erreur réseau : ' + e.message);
    showStep(1);
  }
}

// ── Finalisation après retour OAuth ──────────────────────────────────────
async function finalizeConnection(gcReqId, oauthCode) {
  document.getElementById('loadingOverlay').classList.add('hidden');
  showStep(3);

  document.getElementById('step3Title').textContent = 'Synchronisation en cours…';
  document.getElementById('step3Desc').textContent = 'Récupération de vos comptes bancaires…';
  document.getElementById('importedAccountsList').innerHTML =
    '<div style="display:flex;align-items:center;gap:10px;color:var(--muted)"><div class="spinner" style="width:20px;height:20px;border-width:2px"></div> Importation…</div>';

  try {
    const r = await fetch(`/api/gc/finalize/${gcReqId}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ code: oauthCode }),
    });
    const result = await r.json();

    if (!r.ok) {
      document.getElementById('step3Title').textContent = 'Erreur de synchronisation';
      document.getElementById('step3Desc').textContent = result.error || 'Une erreur est survenue.';
      document.getElementById('importedAccountsList').innerHTML =
        `<p style="color:var(--red)">${result.error}</p>`;
      return;
    }

    if (result.status !== 'LN') {
      document.getElementById('step3Title').textContent = 'Autorisation en attente';
      document.getElementById('step3Desc').textContent =
        `Statut de la connexion : ${result.status}. Veuillez réessayer dans quelques instants.`;
      document.getElementById('importedAccountsList').innerHTML = '';
      return;
    }

    document.getElementById('step3Title').textContent = `${result.accounts.length} compte(s) synchronisé(s)`;
    document.getElementById('step3Desc').textContent =
      'Vos comptes ont été importés et sont maintenant visibles dans la page Comptes.';

    const TYPE_LABEL = {
      courant: 'Compte courant', epargne: 'Épargne',
      pea: 'PEA', assurance: 'Assurance vie',
      investissement: 'Compte titres', crypto: 'Crypto', dette: 'Dette',
    };

    document.getElementById('importedAccountsList').innerHTML = result.accounts.map(acc => `
      <div class="imported-item">
        <div class="imported-item-icon">🏦</div>
        <div class="imported-item-info">
          <div class="imported-item-name">${acc.iban ? 'IBAN •••• ' + acc.iban.slice(-4) : 'Compte bancaire'}</div>
          <div class="imported-item-iban">${TYPE_LABEL[acc.type] || acc.type}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <div class="imported-item-balance">${fmt(acc.solde)}</div>
          <span class="imported-item-badge">${acc.updated ? 'Mis à jour' : 'Nouveau'}</span>
        </div>
      </div>
    `).join('');
  } catch (e) {
    document.getElementById('step3Title').textContent = 'Erreur réseau';
    document.getElementById('importedAccountsList').innerHTML = `<p style="color:var(--red)">${e.message}</p>`;
  }
}

function resetFlow() {
  showStep(1);
  document.getElementById('searchInput').value = '';
  filterInstitutions();
}
