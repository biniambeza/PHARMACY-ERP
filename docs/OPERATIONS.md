# Operations runbook

How to keep the Pharmacy ERP running reliably: monitoring, error tracking, backups,
restore tests and safe upgrades. All commands run from `backend/` unless noted.

---

## 1. Health checks and uptime monitoring

| Endpoint | Auth | What it checks | Use it for |
|---|---|---|---|
| `GET /api/health` | none | Process is up and Mongoose reports a connection (no DB round trip) | Uptime monitors, Render health check, keeping the free tier awake |
| `GET /api/health/ready` | none | Also sends an admin `ping` to MongoDB (timeout `HEALTH_READY_TIMEOUT_MS`, default 2 s) | Deeper checks, after-deploy smoke tests |

Both return `200` when healthy and `503` otherwise, with `Cache-Control: no-store`:

```json
{ "success": true, "db": "up", "version": "1.0.0", "commit": "3f2c1a9…", "uptime": 5231, "timestamp": "…" }
```

`version` comes from `backend/package.json`; `commit` from `RENDER_GIT_COMMIT` (set
automatically on Render) or `GIT_COMMIT`. Use it to confirm which build is live.
Neither endpoint exposes error details.

### Set up an external uptime monitor (5 minutes)

Use any free external monitor, e.g. **UptimeRobot** or **Better Stack (Uptime)**:

1. Create an **HTTP(s)** monitor for `https://<your-backend>.onrender.com/api/health`.
2. Interval: **5 minutes**. Expected status: **200**. Optionally add a keyword check for `"success":true`.
3. Alert contacts: email + SMS / Telegram for the owner and whoever is on call.
4. Optional second monitor on `/api/health/ready` every 15 minutes (alerts when the database is unreachable).
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
BACKUP_CRON=30 2 * * *        # every day at 02:30 (JOBS_TZ applies)
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
5. Start the app (indexes are rebuilt on start), check `/api/health/ready`, log in and spot-check sales and stock.

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
