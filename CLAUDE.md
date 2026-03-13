# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal budget application — a full-stack Node.js/Express app with a vanilla JS frontend, SQLite database, and Open Banking integration (Enable Banking PSD2 API).

## Commands

```bash
# Start server (production)
npm start

# Start server with auto-reload on file changes
npm run dev
```

Server runs on port 3000. No build step required — frontend is served as static files.

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Description |
|---|---|
| `EB_APPLICATION_ID` | Enable Banking app ID (from enablebanking.com) |
| `EB_PRIVATE_KEY_PATH` | Path to RSA private key (default: `./enablebanking-private.pem`) |
| `EB_PRIVATE_KEY` | Alternative: RSA key content directly as env var |
| `APP_URL` | Base URL for OAuth redirect callbacks (e.g., `http://localhost:3000`) |

## Architecture

### Backend (`server.js`, `database.js`, `enablebanking.js`)

- **Express 5** REST API with JWT authentication (RS256 via `jsonwebtoken`, passwords via `bcryptjs`)
- **SQLite** database via `better-sqlite3` — synchronous API, no async/await in DB layer
- All protected routes use an `authenticateToken` middleware that extracts `user_id` from JWT
- All DB queries are scoped by `user_id` — multi-user by design

**Key tables:**
- `budget_state` — one row per user, stores monthly revenue/expense data as JSON arrays
- `bank_accounts` — manual + Open Banking accounts with optional `gc_account_id`/`gc_req_id` for synced accounts
- `credits` — loan tracking
- `gc_tokens` / `gc_requisitions` — Enable Banking OAuth state

**Enable Banking flow** (`enablebanking.js`):
1. Client calls `GET /api/banking/institutions?country=FR` to list banks
2. Client initiates `POST /api/banking/connect` → returns an `auth_url` for the bank's OAuth page
3. Bank redirects to `/bank-connect.html?code=...` → frontend calls `POST /api/banking/callback` to exchange code for tokens and import accounts
4. `POST /api/banking/sync/:accountId` refreshes a single account's balance

`gocardless.js` is legacy/unused — Enable Banking is the active integration.

### Frontend (`public/`)

Pure vanilla JS, no framework, no build tool. Pages:
- `login.html` / `js/login.js` — auth, stores JWT in `localStorage`
- `dashboard.html` / `js/dashboard.js` — main KPIs, Chart.js charts, monthly budget editing, credit management
- `accounts.html` / `js/accounts.js` — bank account CRUD + Open Banking connection flow
- `bank-connect.html` / `js/bank-connect.js` — OAuth callback handler

All API calls include `Authorization: Bearer <token>` header. JWT is stored in `localStorage` under the key `token`.

### Budget Data Model

`budget_state.revenus_json` and `budget_state.depenses_json` are serialized arrays of `{nom, montant}` objects per month, structured as a 12-element array (index 0 = January). Each element is itself an array of line items.

## Key Conventions

- UI and all API responses are in **French**
- JWT secret is hardcoded in `server.js` as `'budget2026_jwt_secret_key_change_in_prod'` — this must be changed before any real deployment
- Database schema migrations are applied inline in `database.js` using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (SQLite-compatible pattern)
- Chart.js is loaded from CDN in `dashboard.html`
