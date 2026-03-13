const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'budget.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS budget_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    revenus_json TEXT NOT NULL,
    depenses_json TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS bank_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    nom TEXT NOT NULL,
    banque TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'courant',
    solde REAL NOT NULL DEFAULT 0,
    iban_fin TEXT DEFAULT '',
    couleur TEXT DEFAULT '#3b82f6',
    synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS credits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    nom TEXT NOT NULL,
    capital_initial REAL NOT NULL,
    capital_restant REAL NOT NULL,
    mensualite REAL NOT NULL,
    taux_annuel REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS gc_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    access_expires_at INTEGER NOT NULL,
    refresh_expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS gc_requisitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    gc_req_id TEXT NOT NULL UNIQUE,
    institution_id TEXT NOT NULL,
    institution_name TEXT,
    institution_logo TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// ── Migrations : colonnes GoCardless sur bank_accounts ──────────────────
[
  ['gc_account_id', 'TEXT DEFAULT NULL'],
  ['gc_req_id',     'TEXT DEFAULT NULL'],
  ['is_gc',         'INTEGER DEFAULT 0'],
].forEach(([col, def]) => {
  try { db.exec(`ALTER TABLE bank_accounts ADD COLUMN ${col} ${def}`); }
  catch (_) { /* colonne déjà présente */ }
});

module.exports = db;
