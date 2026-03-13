require('dotenv').config();
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const cors    = require('cors');
const path    = require('path');
const db      = require('./database');
const eb      = require('./enablebanking');

const app    = express();
const PORT   = 3000;
const SECRET = 'budget2026_jwt_secret_key_change_in_prod';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Middleware auth ───────────────────────────────────
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Token manquant' });
  try {
    req.user = jwt.verify(header.split(' ')[1], SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
}

// ─── Auth ──────────────────────────────────────────────
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Champs requis manquants' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (min 6 caractères)' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
    const token = jwt.sign({ id: info.lastInsertRowid, username }, SECRET, { expiresIn: '30d' });
    res.json({ token, username });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Nom d\'utilisateur déjà pris' });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Identifiants incorrects' });
  const token = jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '30d' });
  res.json({ token, username: user.username });
});

app.get('/api/budget', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM budget_state WHERE user_id = ?').get(req.user.id);
  if (!row) return res.json({ revenus: [], depenses: [] });
  res.json({ revenus: JSON.parse(row.revenus_json), depenses: JSON.parse(row.depenses_json) });
});

app.put('/api/budget', auth, (req, res) => {
  const { revenus, depenses } = req.body;
  db.prepare(`
    INSERT INTO budget_state (user_id, revenus_json, depenses_json, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      revenus_json = excluded.revenus_json,
      depenses_json = excluded.depenses_json,
      updated_at = CURRENT_TIMESTAMP
  `).run(req.user.id, JSON.stringify(revenus), JSON.stringify(depenses));
  res.json({ ok: true });
});

// ─── Credits ───────────────────────────────────────────
app.get('/api/credits', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM credits WHERE user_id = ? ORDER BY id').all(req.user.id);
  res.json(rows.map(r => ({
    id: r.id, nom: r.nom,
    capitalInitial: r.capital_initial, capitalRestant: r.capital_restant,
    mensualite: r.mensualite, tauxAnnuel: r.taux_annuel
  })));
});

app.post('/api/credits', auth, (req, res) => {
  const { nom, capitalInitial, capitalRestant, mensualite, tauxAnnuel } = req.body;
  const info = db.prepare(
    'INSERT INTO credits (user_id, nom, capital_initial, capital_restant, mensualite, taux_annuel) VALUES (?,?,?,?,?,?)'
  ).run(req.user.id, nom, capitalInitial, capitalRestant, mensualite, tauxAnnuel || 0);
  res.json({ id: info.lastInsertRowid, nom, capitalInitial, capitalRestant, mensualite, tauxAnnuel: tauxAnnuel || 0 });
});

app.put('/api/credits/:id', auth, (req, res) => {
  const { nom, capitalInitial, capitalRestant, mensualite, tauxAnnuel } = req.body;
  const credit = db.prepare('SELECT * FROM credits WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!credit) return res.status(404).json({ error: 'Crédit introuvable' });
  db.prepare(
    'UPDATE credits SET nom=?, capital_initial=?, capital_restant=?, mensualite=?, taux_annuel=? WHERE id=?'
  ).run(nom, capitalInitial, capitalRestant, mensualite, tauxAnnuel || 0, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/credits/:id', auth, (req, res) => {
  const credit = db.prepare('SELECT * FROM credits WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!credit) return res.status(404).json({ error: 'Crédit introuvable' });
  db.prepare('DELETE FROM credits WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Bank Accounts ─────────────────────────────────────
app.get('/api/accounts', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM bank_accounts WHERE user_id = ? ORDER BY id').all(req.user.id);
  res.json(rows.map(r => ({
    id: r.id, nom: r.nom, banque: r.banque, type: r.type,
    solde: r.solde, ibanFin: r.iban_fin, couleur: r.couleur,
    syncedAt: r.synced_at, isGc: r.is_gc === 1
  })));
});

app.post('/api/accounts', auth, (req, res) => {
  const { nom, banque, type, solde, ibanFin, couleur } = req.body;
  if (!nom || !banque) return res.status(400).json({ error: 'Nom et banque requis' });
  const info = db.prepare(
    'INSERT INTO bank_accounts (user_id, nom, banque, type, solde, iban_fin, couleur, synced_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)'
  ).run(req.user.id, nom, banque, type||'courant', solde||0, ibanFin||'', couleur||'#3b82f6');
  res.json({ id: info.lastInsertRowid, nom, banque, type: type||'courant', solde: solde||0, ibanFin: ibanFin||'', couleur: couleur||'#3b82f6', syncedAt: new Date().toISOString() });
});

app.put('/api/accounts/:id', auth, (req, res) => {
  const acc = db.prepare('SELECT * FROM bank_accounts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!acc) return res.status(404).json({ error: 'Compte introuvable' });
  const { nom, banque, type, solde, ibanFin, couleur } = req.body;
  db.prepare(
    'UPDATE bank_accounts SET nom=?, banque=?, type=?, solde=?, iban_fin=?, couleur=?, synced_at=CURRENT_TIMESTAMP WHERE id=?'
  ).run(nom, banque, type, solde, ibanFin||'', couleur, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/accounts/:id', auth, (req, res) => {
  const acc = db.prepare('SELECT * FROM bank_accounts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!acc) return res.status(404).json({ error: 'Compte introuvable' });
  db.prepare('DELETE FROM bank_accounts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Enable Banking Open Banking ───────────────────────────────────────────

// GET /api/gc/status — credentials configurés ?
app.get('/api/gc/status', auth, (_req, res) => {
  res.json({ configured: eb.isConfigured() });
});

// Cache institutions en mémoire (5 min)
let institutionsCache = { data: {}, ts: 0 };

// GET /api/gc/institutions?country=FR — liste des banques
app.get('/api/gc/institutions', auth, async (req, res) => {
  if (!eb.isConfigured()) return res.status(503).json({ error: 'Enable Banking non configuré' });
  try {
    const country  = req.query.country || 'FR';
    const cacheKey = country;
    if (institutionsCache.data[cacheKey] && Date.now() - institutionsCache.ts < 5 * 60 * 1000) {
      return res.json(institutionsCache.data[cacheKey]);
    }
    const data = await eb.getInstitutions(country);
    institutionsCache = { data: { ...institutionsCache.data, [cacheKey]: data }, ts: Date.now() };
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/gc/connect — démarrer le flux OAuth pour une banque
app.post('/api/gc/connect', auth, async (req, res) => {
  if (!eb.isConfigured()) return res.status(503).json({ error: 'Enable Banking non configuré' });
  try {
    const { institutionId, institutionName, institutionLogo } = req.body;
    if (!institutionId) return res.status(400).json({ error: 'institutionId requis' });
    const appUrl     = process.env.APP_URL || 'http://localhost:3000';
    const redirectUrl = `${appUrl}/bank-connect.html`;
    const result = await eb.createSession(db, req.user.id, institutionId, institutionName, institutionLogo, redirectUrl);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/gc/finalize/:reqId — finaliser après retour OAuth + importer les comptes
app.post('/api/gc/finalize/:reqId', auth, async (req, res) => {
  if (!eb.isConfigured()) return res.status(503).json({ error: 'Enable Banking non configuré' });
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'code OAuth manquant' });
    const result = await eb.finalizeSession(db, req.user.id, req.params.reqId, code);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/gc/refresh/:accountId — rafraîchir le solde d'un compte
app.post('/api/gc/refresh/:accountId', auth, async (req, res) => {
  if (!eb.isConfigured()) return res.status(503).json({ error: 'Enable Banking non configuré' });
  try {
    const solde = await eb.refreshAccount(db, +req.params.accountId, req.user.id);
    res.json({ ok: true, solde });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Fallback → login ──────────────────────────────────
app.get('/{*path}', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.listen(PORT, () => console.log(`✅  Budget App → http://localhost:${PORT}`));
