/**
 * Enable Banking API (PSD2 / Open Banking)
 * https://enablebanking.com/docs/api/
 *
 * Auth : JWT signé en RS256 avec la clé privée de votre application.
 * Inscription gratuite : https://enablebanking.com/sign-in/
 */
const jwt  = require('jsonwebtoken');
const fs   = require('fs');
const path = require('path');

const EB_BASE = 'https://api.enablebanking.com';

// ── Configuration ──────────────────────────────────────────────────────────
function isConfigured() {
  return !!(process.env.EB_APPLICATION_ID &&
    (process.env.EB_PRIVATE_KEY_PATH || process.env.EB_PRIVATE_KEY));
}

function getAppJwt() {
  const appId = process.env.EB_APPLICATION_ID;
  if (!appId) throw new Error('EB_APPLICATION_ID manquant dans .env');

  let privateKey;
  if (process.env.EB_PRIVATE_KEY_PATH) {
    privateKey = fs.readFileSync(path.resolve(process.env.EB_PRIVATE_KEY_PATH), 'utf8');
  } else if (process.env.EB_PRIVATE_KEY) {
    privateKey = process.env.EB_PRIVATE_KEY.replace(/\\n/g, '\n');
  } else {
    throw new Error('EB_PRIVATE_KEY_PATH ou EB_PRIVATE_KEY manquant dans .env');
  }

  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 3600 }, privateKey, { algorithm: 'RS256', keyid: appId });
}

// ── Fetch helper ───────────────────────────────────────────────────────────
async function ebFetch(urlPath, options = {}) {
  return fetch(`${EB_BASE}${urlPath}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Accept':       'application/json',
      'Authorization': `Bearer ${getAppJwt()}`,
      ...(options.headers || {}),
    },
  });
}

// ── Institutions ───────────────────────────────────────────────────────────
async function getInstitutions(country = 'FR') {
  const r = await ebFetch(`/aspsps?country=${country}&psu_type=personal`);
  if (!r.ok) throw new Error(`Enable Banking institutions ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const list = Array.isArray(data) ? data : (data.aspsps || []);
  // ID encodé : "FR|BNP Paribas" pour identifier pays + banque
  return list.map(a => ({
    id:   `${a.country || country}|${a.name}`,
    name: a.name,
    logo: a.logo || null,
  }));
}

// ── Créer une session (démarrer le flux OAuth) ─────────────────────────────
async function createSession(db, userId, institutionId, institutionName, institutionLogo, redirectUrl) {
  const country  = institutionId.split('|')[0] || 'FR';
  const aspspName = institutionName;

  // Consentement valable 90 jours
  const validUntil = new Date(Date.now() + 90 * 24 * 3600 * 1000)
    .toISOString().replace(/\.\d{3}Z$/, '+00:00');

  const state = `bgt_${userId}_${Date.now()}`;

  const r = await ebFetch('/auth', {
    method: 'POST',
    body: JSON.stringify({
      access: {
        valid_until:  validUntil,
        balances:     true,
        details:      true,
        transactions: false,
      },
      aspsp:                      { name: aspspName, country },
      state,
      redirect_url:               redirectUrl,
      psu_type:                   'personal',
      credentials_auto_onboarding: true,
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Enable Banking auth error ${r.status}: ${err}`);
  }

  const data = await r.json();

  db.prepare(`
    INSERT INTO gc_requisitions (user_id, gc_req_id, institution_id, institution_name, institution_logo, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
    ON CONFLICT(gc_req_id) DO NOTHING
  `).run(userId, state, institutionId, aspspName, institutionLogo || '');

  return { id: state, link: data.url };
}

// ── Finalisation : importer les comptes après auth bancaire ────────────────
async function finalizeSession(db, userId, pendingState, code) {
  const r = await ebFetch('/sessions', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  if (!r.ok) throw new Error(`Enable Banking session ${r.status}: ${await r.text()}`);
  const session = await r.json();

  const sessionId = session.session_id || pendingState;
  const status = session.status || 'AUTHORIZED';

  db.prepare('UPDATE gc_requisitions SET status=?, gc_req_id=? WHERE gc_req_id=? AND user_id=?')
    .run(status, sessionId, pendingState, userId);

  const rawAccounts = session.accounts || [];
  if (!rawAccounts.length) {
    return { status, accounts: [] };
  }

  const reqRow = db.prepare('SELECT * FROM gc_requisitions WHERE gc_req_id=?').get(sessionId);

  const accounts = await Promise.all(rawAccounts.map(async (acc) => {
    const uid = acc.uid || acc.id;

    const [detRes, balRes] = await Promise.all([
      ebFetch(`/accounts/${uid}/details`),
      ebFetch(`/accounts/${uid}/balances`),
    ]);

    const details = detRes.ok ? await detRes.json() : {};
    const balData = balRes.ok ? await balRes.json() : {};

    const accDetails = details.account || {};
    const balList    = balData.balances || [];

    const bal = balList.find(b => b.balance_type === 'interimAvailable' || b.balance_type === 'closingAvailable')
             || balList.find(b => b.balance_type === 'closingBooked')
             || balList[0];

    const solde = parseFloat(bal?.balance_amount?.amount ?? 0);
    const iban  = accDetails.iban || acc.iban || '';

    const product = (accDetails.product || accDetails.name || '').toLowerCase();
    let type = 'courant';
    if (/épargne|epargne|savings|livret/.test(product)) type = 'epargne';
    else if (/pea/.test(product)) type = 'pea';
    else if (/assurance|vie/.test(product)) type = 'assurance';

    const existing = db.prepare('SELECT id FROM bank_accounts WHERE gc_account_id=? AND user_id=?').get(uid, userId);
    let accountId;

    if (existing) {
      db.prepare('UPDATE bank_accounts SET solde=?, synced_at=CURRENT_TIMESTAMP WHERE id=?')
        .run(solde, existing.id);
      accountId = existing.id;
    } else {
      const info = db.prepare(`
        INSERT INTO bank_accounts (user_id, nom, banque, type, solde, iban_fin, couleur, synced_at, gc_account_id, gc_req_id, is_gc)
        VALUES (?, ?, ?, ?, ?, ?, '#3b82f6', CURRENT_TIMESTAMP, ?, ?, 1)
      `).run(
        userId,
        accDetails.name || accDetails.owner_name || reqRow?.institution_name || 'Compte',
        reqRow?.institution_name || 'Banque',
        type, solde,
        iban ? iban.slice(-4) : '',
        uid, sessionId,
      );
      accountId = info.lastInsertRowid;
    }

    return { id: accountId, gcAccountId: uid, iban, solde, type, updated: !!existing };
  }));

  return { status, accounts };
}

// ── Rafraîchir le solde d'un compte ──────────────────────────────────────
async function refreshAccount(db, accountId, userId) {
  const acc = db.prepare('SELECT * FROM bank_accounts WHERE id=? AND user_id=? AND is_gc=1').get(accountId, userId);
  if (!acc) throw new Error('Compte Enable Banking introuvable');

  const r = await ebFetch(`/accounts/${acc.gc_account_id}/balances`);
  if (!r.ok) throw new Error(`Enable Banking balance ${r.status}: ${await r.text()}`);
  const data = await r.json();

  const balList = data.balances || [];
  const bal = balList.find(b => b.balance_type === 'interimAvailable' || b.balance_type === 'closingAvailable')
           || balList.find(b => b.balance_type === 'closingBooked')
           || balList[0];
  const solde = parseFloat(bal?.balance_amount?.amount ?? acc.solde);

  db.prepare('UPDATE bank_accounts SET solde=?, synced_at=CURRENT_TIMESTAMP WHERE id=?').run(solde, accountId);
  return solde;
}

module.exports = { isConfigured, getInstitutions, createSession, finalizeSession, refreshAccount };
