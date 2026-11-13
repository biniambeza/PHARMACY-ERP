# End-to-end tests (Playwright)

Browser tests for the main flows. They do not need a real database:
Playwright starts the real Express backend on an **in-memory MongoDB** with seeded data
(`backend/tests/e2e/server.js`), plus the Vite dev server pointed at it.

## Run locally

One-time setup (packages are already in `package.json`):

```bash
cd backend && npm install
cd ../frontend && npm install
npx playwright install chromium      # downloads Chromium only
```

Run the tests (from `frontend/`):

```bash
npm run test:e2e                     # headless, all tests
npm run test:e2e:ui                  # Playwright UI mode (watch/debug)
npx playwright test e2e/pos.spec.js  # one file
npx playwright show-report           # open the last HTML report
```

The first run downloads a MongoDB binary for `mongodb-memory-server` (cached afterwards).

Ports: backend `5055` (`E2E_PORT`), Vite `5179` (`E2E_WEB_PORT`). Locally, servers that are
already running on those ports are reused (in CI they are always started fresh).

To start only the seeded backend (for example to explore it by hand):

```bash
cd backend && npm run e2e:server     # prints "[e2e] backend ready on ..." when seeded
```

## What is seeded

See `backend/tests/e2e/fixtures.json` (shared by the server and the tests): a platform admin,
a pharmacy with an owner and a cashier (password `E2e-Passw0rd!`), five medicines with stock
(one batch expires in 20 days), a supplier, an ordered purchase order, and an insurance scheme
(100% cover, fixed copay 5) with one member.

The e2e server never reads `backend/.env`: it sets `MONGO_URI` to the memory server, uses a
fixed test JWT secret, `NODE_ENV=test` (no rate limits, jobs, email or SMS) and stops MongoDB
on SIGINT/SIGTERM.

## Tests

| File | Flow |
| --- | --- |
| `auth.spec.js` | Owner login (dashboard + sidebar), wrong password error, cashier sees only cashier menus |
| `pos.spec.js` | POS cash sale with change; receipt shows the invoice number; stock goes down |
| `returns.spec.js` | Return 1 item from Sales History; refund notice; item restocked |
| `procurement.spec.js` | Receive an ordered PO; stock goes up; PO marked received |
| `insurance.spec.js` | Insurance sale: scheme + member, insurer share, patient pays the copay in cash |
| `two-factor.spec.js` | Enable 2FA in Settings (TOTP computed in the test), sign out, sign in with a code |

## Writing tests

- Each test signs in by itself and uses its own medicine / user / purchase order, so tests run
  in parallel and can be retried. Create extra data through the API (`support/helpers.js`).
- Prefer role, label, placeholder and text selectors (the UI is in English in tests).
- Assert stock changes as a difference (before/after), because a reused local server keeps
  its data between runs.
