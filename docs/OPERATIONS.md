# Operations runbook

How to keep the Pharmacy ERP running reliably: monitoring, error tracking, backups,
restore tests and safe upgrades. All commands run from `backend/` unless noted.

---

## 1. Health checks and uptime monitoring

| Endpoint | Auth | What it checks | Use it for |
|---|---|---|---|
| `GET /api/health` | none | **Liveness only**: always `200` while the process is up. Never touches the database; the Mongoose connection state is reported in the `db` field (`up` / `down` / `connecting` / `disconnecting`) | Render health check, uptime monitors, keeping the free tier awake |
| `GET /api/health/ready` | none | **Readiness**: sends an admin `ping` to MongoDB (timeout `HEALTH_READY_TIMEOUT_MS`, default 2 s); `200` when it answers, `503` otherwise | Database alerting, after-deploy smoke tests |

`/api/health` deliberately does not fail when MongoDB is unreachable: a short Atlas
failover must not make Render restart (or refuse to promote) a healthy process. Alert on
the database with a monitor on `/api/health/ready`. Both responses carry `Cache-Control: no-store`:

```json
{ "success": true, "status": "ok", "db": "up", "version": "1.0.0", "commit": "3f2c1a9…", "uptime": 5231, "timestamp": "…" }
```

`version` comes from `backend/package.json`; `commit` from `RENDER_GIT_COMMIT` (set
automatically on Render) or `GIT_COMMIT`. Use it to confirm which build is live.
Neither endpoint exposes error details.

### Set up an external uptime monitor (5 minutes)

Use any free external monitor, e.g. **UptimeRobot** or **Better Stack (Uptime)**:

1. Create an **HTTP(s)** monitor for `https://<your-backend>.onrender.com/api/health`.
2. Interval: **5 minutes**. Expected status: **200**. Optionally add a keyword check for `"success":true`.
3. Alert contacts: email + SMS / Telegram for the owner and whoever is on call.
4. Second monitor on `/api/health/ready` every 5-15 minutes: this is the one that alerts when the database is unreachable.
5. Add a monitor for the frontend URL too (Vercel / static host).

On the Render **free tier** the service sleeps after ~15 minutes without traffic; a
5-minute ping keeps it awake (the free instance hours still count against the monthly
limit). In Render, also set **Health Check Path** = `/api/health` so failed deploys are
not promoted.

---

## 2. Error tracking (Sentry, optional)

Both apps report errors to Sentry **only when a DSN is configured**; otherwise the SDK
is not loaded at all. Create two Sentry projects (Node + React) on sentry.io (free
Developer plan is enough).

### Backend

```
SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
SENTRY_ENVIRONMENT=production         # default NODE_ENV
SENTRY_RELEASE=                       # default RENDER_GIT_COMMIT, then package.json version
SENTRY_TRACES_SAMPLE_RATE=0           # 0..1; keep 0 unless you want performance traces
```

- Loaded from `backend/instrument.js`, which `server.js` requires before Express and Mongoose.
- Never active when `NODE_ENV=test`.
- Only **unexpected / 5xx** errors are sent. Operational 4xx errors (`AppError`, validation,
  invalid ids, duplicates, CORS) are filtered using the same mapping as `middleware/errorHandler.js`.
- **Privacy:** no request bodies, cookies, `Authorization` / cookie / token headers, query
  strings, IP addresses or local variables. Keys that look like passwords, tokens, secrets,
  OTPs or card data are redacted. The user is identified by id only.
- Events are tagged with `pharmacyId` (the active branch) when the request had one.

### Frontend

```
VITE_SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
VITE_SENTRY_ENVIRONMENT=production
VITE_SENTRY_RELEASE=
VITE_SENTRY_TRACES_SAMPLE_RATE=0
```

- These are **build-time** variables: set them in Vercel (or your host) and redeploy.
- The SDK is loaded lazily from `src/utils/monitoring.js`; without a DSN it is never downloaded.
- The app's `ErrorBoundary` reports render crashes; uncaught errors and promise rejections
  are captured globally. **No session replay.** Console output, cookies, headers and query
  strings are not sent.

**Check it works:** after deploying, trigger a test error in a non-production environment
and confirm it appears in Sentry. Set an alert rule ("a new issue is created" → email).

---

## 3. Backups

### What exists

| Tool | Command |
|---|---|
| Manual backup (all data) | `npm run backup` (`--gzip`, `--out=<dir>`, `--pharmacy=<id>`) |
| Restore | `npm run restore -- --dir=<folder> --dry-run`, then `--confirm=<db name>` |
| Automatic backups | set `BACKUP_CRON` (see below) |
| Restore test | `npm run backup:verify` |

A backup is a folder `backup-YYYYMMDD-HHmmss/` with `manifest.json` and one
Canonical-EJSON file per collection (types such as ObjectId and Date survive). Backup
folders are git-ignored.

### Automatic backups

Off unless `BACKUP_CRON` is set (independent of `ENABLE_JOBS`; never in tests):

```
BACKUP_CRON=30 2 * * *        # every day at 02:30 (JOBS_TZ applies, default Africa/Addis_Ababa)
BACKUP_DIR=/var/data/backups  # default backend/backups
BACKUP_RETENTION_DAYS=14      # older job backups are deleted; the newest is always kept; 0 = keep all
BACKUP_GZIP=true
```

Rotation only deletes full-backup folders (`backup-YYYYMMDD-HHmmss`, containing a
`manifest.json`) inside `BACKUP_DIR`; per-pharmacy backups and other files are left alone.

### Off-site copies (important)

- **Render disks are ephemeral**: anything written to the service filesystem is lost on
  every deploy or restart. On Render, either attach a persistent disk and point `BACKUP_DIR`
  at it, or — better — rely on the database provider's backups and run `npm run backup`
  from another machine.
- **Use MongoDB Atlas backups as the primary safety net:** enable Cloud Backup / snapshots
  (paid tiers, with point-in-time restore) or, on the free M0 tier, schedule `npm run backup`
  from a trusted machine since M0 has no automatic snapshots.
- Follow **3-2-1**: at least 3 copies, on 2 different media, 1 off-site (e.g. upload the
  gzipped folder to cloud storage such as S3 / Backblaze B2 / Google Drive with
  restricted access). Backups contain personal and health data: store them encrypted and
  limit who can read them.

### Test your restore — monthly

A backup you have never restored is not a backup. Once a month (and after any backup
format change):

```bash
npm run backup -- --gzip                 # or use last night's automatic backup
npm run backup:verify -- --drop          # restores the newest backup into a scratch db and compares
```

`backup:verify` options: `--dir <folder>` (default: newest in `BACKUP_DIR`),
`--target <db>` (default `<live db>_restore_test`), `--sample <n>` (ids checked per
collection, default 20), `--force` (drop a non-empty scratch db first), `--drop`
(remove the scratch db afterwards).

Safety: the target must differ from the live database and from the database the backup
came from, and its name must contain `restore` or `test`. The live database is never
written. It restores into the scratch db, compares per-collection document counts with the
manifest and checks a sample of `_id`s, and prints PASS/FAIL (exit code 1 on failure).

Record the date and result in your ops log. If it fails, investigate before you need it.

### Restoring for real

1. Stop writes (put the app in maintenance or scale to 0).
2. Take a fresh backup of the current state, even if broken.
3. `npm run restore -- --dir=<folder> --dry-run` and read the report.
4. `npm run restore -- --dir=<folder> --confirm=<db name> [--mode=replace]`.
5. Start the app (missing indexes are created on start), check `/api/health/ready`, log in and spot-check sales and stock.

---

## 4. Test the upgrade on a copy before deploying

Before deploying a release with schema changes, migrations or big features, run it
against a copy of production first.

```bash
# 1. Copy production to a scratch database on the same cluster (MONGO_URI host)
npm run db:clone -- --from pharmacy-erp --to pharmacy-erp-upgrade-test
```

`db:clone` copies every collection (documents, collection options, indexes) and view.
It refuses when `--to` equals `--from`, when either is `admin`/`local`/`config`, when
`--to` is the database `MONGO_URI` itself points to (unless `--allow-live-target`), and
when the target already has data unless you pass `--force` (which drops the target
first). The source is only read. It prints source/target counts per collection.

2. **Point a local backend at the copy**: in a local `backend/.env` (never the production
   service), set `MONGO_URI` to the same cluster but with the copy's database name, e.g.
   `…mongodb.net/pharmacy-erp-upgrade-test?…`. Set `NODE_ENV=development`, leave
   `ENABLE_JOBS`, `BACKUP_CRON`, SMTP and SMS settings **empty** so no real emails/SMS are sent.
3. **Start the new code**: `git checkout <release branch>`, `npm ci`, `npm run dev`; start
   the frontend against it (`VITE_API_URL=http://localhost:5000/api npm run dev`).
4. **Smoke test** (15 minutes):
   - `GET /api/health/ready` is 200 and shows the new version;
   - log in as owner, cashier and platform admin;
   - dashboard and reports load; stock levels look the same as production;
   - make a sale (cash + split payment), print the receipt, return it;
   - receive a purchase order; run a stock adjustment;
   - check the server log for errors.
5. If anything fails, fix it before deploying. When done, drop the copy
   (`mongosh` → `use pharmacy-erp-upgrade-test` → `db.dropDatabase()`) — it contains real
   customer data.
6. Deploy: take a backup first (`npm run backup -- --gzip`), deploy, watch Sentry and the
   uptime monitor for 30 minutes.

---

## 5. Demo data (non-production only)

`npm run seed:demo [-- --pharmacy=<id>]` adds suppliers, medicines, stock batches, purchase
orders and 16 sales to a pharmacy. Sales reduce batch stock and write stock movements;
invoice and PO numbers use the normal per-pharmacy sequences, so real POS sales continue
the numbering. It is idempotent (each section is skipped when data exists) and refuses to
run with `NODE_ENV=production` unless `--force`.

---

## 6. Deploy pipeline (CI/CD, Vercel and Render)

Deploys run from `.github/workflows/ci-cd.yml` on pushes to `main`, and only after **all**
of `backend-ci`, `frontend-ci` and `e2e` pass. Deploy jobs never cancel each other half-way.

- **Render: turn Auto-Deploy OFF.** In the Render dashboard (backend service ->
  Settings -> Build & Deploy -> Auto-Deploy) set it to **No** / *Off* and add the service's
  Deploy Hook URL as the GitHub secret `RENDER_DEPLOY_HOOK_URL`. With Auto-Deploy on, Render
  deploys every push to `main` immediately, before (or even if) CI fails.
- **Vercel:** the workflow deploys with `VERCEL_TOKEN`, `VERCEL_ORG_ID` and
  `VERCEL_PROJECT_ID`. If the Vercel Git integration is also connected, disable its automatic
  production deploys for `main` for the same reason.
- **`VITE_API_URL` is required for production builds.** `vite build` fails without it, so set
  it in the Vercel project environment variables (e.g. `https://<service>.onrender.com/api`).
- **Node 22** everywhere (`.nvmrc`, CI, `engines`). Set Node 22 on Render and Vercel too.
- **Security headers** (CSP, HSTS, X-Frame-Options, ...) are set in `frontend/vercel.json`.
  The CSP `connect-src` allows the backend on `https://*.onrender.com` and Sentry ingest hosts
  only. If the API moves to a custom domain, add it to `connect-src`, otherwise every API call
  is blocked. The `sha256-...` in `script-src` allows the one inline script of the insurance
  claim print window (`frontend/src/components/insurance/claimPrint.js`); if that script
  changes, update the hash (the browser console prints the new one).

---

## 7. Process lifecycle (Render)

- **Graceful shutdown.** On `SIGTERM` (every deploy / restart) or `SIGINT` the server stops
  accepting connections, lets in-flight requests finish, stops the cron jobs, closes MongoDB
  and flushes Sentry, then exits 0. If that takes more than 25 s it exits forcibly (Render
  sends `SIGKILL` about 30 s after `SIGTERM`).
- **Crashes.** An `unhandledRejection` is logged and sent to Sentry; the process keeps running.
  An `uncaughtException` is logged, sent to Sentry (flushed) and the process exits 1, so Render
  restarts it.
- **Keep-alive.** `server.keepAliveTimeout` is 65 s (`headersTimeout` 66 s), longer than the
  60 s idle timeout of Render's proxy, to avoid sporadic 502s on reused connections.
- **Compression.** JSON / text responses are gzip-compressed; the streaming exports under
  `/api/export` are not.
- **Node version.** `backend/package.json` declares `"engines": { "node": ">=22 <25" }`.

---

## 8. Background jobs

| Job | Schedule (env) | Lock name |
|---|---|---|
| Daily checks: expiry, expiring soon, low stock, overdue POs, daily summary email/SMS | `EXPIRY_JOB_CRON`, default `0 1 * * *` | `daily-checks` |
| Subscription grace / suspension check | `15 2 * * *` | `subscription-check` |
| Monthly draft insurance claims | `INSURANCE_CLAIM_CRON`, default `0 2 1 * *` | `insurance-claims` |
| Database backup | `BACKUP_CRON` (off unless set) | `database-backup` |

The first three run when `ENABLE_JOBS=true` (default: only when `NODE_ENV=production`);
backups only depend on `BACKUP_CRON`. Nothing runs under `NODE_ENV=test`.

**Time zone.** All schedules, the "day" of the daily summary and the month edges of the
insurance claims use `JOBS_TZ`, default **`Africa/Addis_Ababa`** (`INSURANCE_CLAIM_TZ`
overrides the claim month edges only). The zone in use is logged at start-up
(`[jobs] time zone ...`).

**Safe with several instances.** Every run takes a lease lock in the `joblocks` collection
(atomic `findOneAndUpdate`, one document per job: `lockedUntil`, `owner`, `lastRunAt`,
`lastSuccessAt`, `lastError`). If two instances (or the old and the new instance during a
deploy) fire the same schedule, only one runs it; the other logs `skipped: running on
another instance`. A lock left by a crashed instance expires after 1 h (backups: 2 h).
In addition:
- the daily summary is sent at most **once per pharmacy per local day** (a marker in the
  `dedupemarkers` collection is written *before* sending), even if the checks run twice
  (catch-up + schedule, two instances, or a manual "run checks" with summary);
- in-app notifications with a dedupe key are race-free (atomic marker per key and window);
- the insurance claim job and the expiry checks are idempotent.

**Catch-up of missed runs.** On the free Render tier the instance sleeps, so a 01:00 cron
may never fire. About 30 s after start-up (`JOBS_CATCHUP_DELAY_MS`) the server reads
`lastSuccessAt` and runs, once:
- daily checks / subscription check: when the last success is older than 24 h (or never);
- insurance claims: when the last success is before the 1st of the current month (job time zone);
- backup: when `BACKUP_CRON` is set and the last success is older than 24 h.

The first start after this release therefore runs every job once (no `joblocks` documents
yet); all of them are idempotent. Check job health in MongoDB with `db.joblocks.find()`
(`lastSuccessAt`, `lastError`). Failures are logged and, when Sentry is configured,
reported with the tag `job=<name>`.

**Alternative: Render Cron Job.** Instead of the in-process scheduler you can set
`ENABLE_JOBS=false` on the web service and create a Render **Cron Job** (same repo, root
directory `backend`, same environment variables) running on the schedule above, e.g.
`node -e "require('dotenv').config();require('./config/db')().then(()=>require('./jobs').dailyChecksJob()).then(()=>process.exit(0))"`
(likewise `insuranceClaimsJob()` monthly and `subscriptionsJob()` daily). The same lease lock
applies, so a web instance and the cron job never run a job at the same time. This is the
most reliable option when the web service sleeps (Render Cron Jobs are billed separately).

---

## 9. Indexes

At start-up Mongoose `autoIndex` creates any schema index that is missing. It **never
drops** anything, so indexes added by hand or by the **Atlas Performance Advisor** are left
alone. (Earlier versions ran `syncIndexes()` for Sale, PurchaseOrder, Pharmacy and Medicine
on every boot, which silently dropped such indexes.)

To remove obsolete indexes (e.g. the old global unique `invoiceNumber_1`, `poNumber_1` and
`owner_1` indexes from older releases, which cause cross-pharmacy duplicate-key errors),
run the sync script deliberately:

```bash
npm run db:sync-indexes                                   # dry run: lists what would be dropped / created
npm run db:sync-indexes -- --model=Sale,PurchaseOrder     # limit to some models
npm run db:sync-indexes -- --apply --keep=advisor_idx_1   # drop extras (except --keep), create missing
```

It uses `MONGO_URI`. Review the dry run first: every index not declared in a schema is
listed, including Performance Advisor ones; keep those with `--keep` (or add them to the
schema). Dropping and building large indexes adds load: prefer a quiet hour.

---

## 10. Secrets and configuration

All variables are listed with comments in `backend/.env.example`. Required: `MONGO_URI`,
`JWT_SECRET` (at least 32 characters in production).

**`TWO_FACTOR_ENCRYPTION_KEY`.** TOTP secrets are encrypted with this key; when it is unset
they fall back to a key derived from `JWT_SECRET`. Consequence: **rotating `JWT_SECRET`
without `TWO_FACTOR_ENCRYPTION_KEY` locks out every user with two-factor login enabled**
(their secrets can no longer be decrypted; an admin has to reset their 2FA).
- In production the server **refuses to start** when the key is missing and at least one
  user has 2FA enabled; otherwise it prints a loud warning at start-up.
- Existing installation: set `TWO_FACTOR_ENCRYPTION_KEY` to the **current** `JWT_SECRET`
  value (existing enrolments stay readable). From then on `JWT_SECRET` can be rotated on its
  own (that only logs everybody out).
- New installation: generate a separate random value
  (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`).
- Never change `TWO_FACTOR_ENCRYPTION_KEY` itself unless every 2FA user can re-enrol.
