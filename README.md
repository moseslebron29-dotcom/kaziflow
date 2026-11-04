# KaziFlow — Tasks, WhatsApp Status Ads & M-Pesa

KaziFlow is a mobile-first Kenyan earning platform. Members register, verify their email with a six-digit code, activate once with KES 100 through M-Pesa, complete administrator-published tasks, and withdraw approved earnings to M-Pesa. Advertisers fund WhatsApp Status campaigns; administrators review all evidence before any reward is credited.

**Stack:** React 19 + Vite (client) · Express + tRPC (server) · Drizzle ORM + PostgreSQL · Brevo (email) · Safaricom Daraja (STK Push + B2C) · S3-compatible storage, a persistent disk, or (default) the Postgres database for uploads.

---

## Features

| Area | What it does |
| --- | --- |
| Accounts | Register (full name, email, phone, county, password), login/logout, six-digit email OTP, forgot/reset password, profile, change password. scrypt password hashing, signed HttpOnly session cookie, session invalidation on password reset. |
| Activation | One-time KES 100 STK Push. Pending / succeeded / failed states, M-Pesa receipt, server callback **plus** server-side STK Query before activation. Duplicate and replayed callbacks are ignored. |
| Task marketplace | 28 categories in four groups (Social Media, Online, Entertainment & Interactive, Other Earning Opportunities). Each task has title, category, description, KES reward, time estimate, slots, instructions, submission requirements, evidence rules, Start button and status. Modes: manual review, link visit, video, auto-scored quiz. One submission per member per task (one per day for daily tasks). |
| Admin | Create/edit/suspend/delete tasks, review and approve/reject submissions, review WhatsApp evidence, campaigns, payments, withdrawals (B2C), members, advertisers, reviews, announcements, broadcast emails, support, platform settings (fees, minimums, referral commission), administrators, audit log. |
| Wallet | Available, pending, lifetime and withdrawn balances backed by an append-only ledger with idempotency keys. Withdrawals reserve funds immediately; **Paid** is set only after a matching Safaricom B2C result (amount, phone and receipt checked). |
| Referrals | Unique link per member, self-referral and duplicate protection, configurable commission credited once when the referred member activates. |
| WhatsApp Status Ads | Advertisers create, upload image/MP4, fund via STK and monitor campaigns. Members submit status + insights screenshots. Reported views and approved views are kept separate; rewards are capped by per-member maximum and remaining funded budget. |
| Reviews | Members submit one review (editable), admins approve/reject/remove. Only approved reviews show on the homepage under "WHAT KENYANS ARE SAYING ABOUT KAZIFLOW". Display name and optional county only — never email or phone. Phone numbers, emails and links are blocked in review text. |
| Announcements | Admin push ads with image/video, link, audience, publish/expiry, pause/delete, impression and click counts. Shown as a dismissible popup on the member dashboard only (never on payment, task or withdrawal screens). |
| AdSense-ready | `AdSlot` renders only on public content pages (homepage FAQ area, policy pages) and only after `ADSENSE_CLIENT_ID` and slot IDs are set. No ads on task, wallet or payment pages. |

## Project layout

```
client/          React app (pages in client/src/pages)
server/          Express + tRPC routers, Daraja, Brevo, storage, migrations
server/_core/    HTTP server, sessions, tRPC context
shared/          Rules shared by client, server and tests (money, categories, reviews)
drizzle/         PostgreSQL schema and committed SQL migrations
render.yaml      Render Blueprint
Dockerfile       Optional container build
.env.example     Every environment variable (placeholders only)
```

## Local development

Requires Node 20.11+ (22 recommended) and PostgreSQL 14+.

```sh
npm install
cp .env.example .env        # fill in local values; set KAZIFLOW_COOKIE_SECURE=false for http://localhost
npm run db:migrate          # applies drizzle/*.sql (safe to repeat)
npm run dev                 # http://localhost:3000
```

Checks:

```sh
npm run check   # TypeScript
npm test        # unit tests (OTP, withdrawals, rewards, quizzes, reviews, Daraja, Brevo, sessions)
npm run build   # client to dist/public, server to dist/index.js + dist/migrate.js
```

## Deploying to Render

1. Push this repository to GitHub (the `.env` file is git-ignored — never commit it).
2. In Render choose **New → Blueprint** and select the repository. `render.yaml` creates:
   - a PostgreSQL database (`kaziflow-db`),
   - a Node web service with a 1 GB persistent disk at `/var/data` for uploads,
   - generated values for `KAZIFLOW_SESSION_SECRET` and `DARAJA_CALLBACK_TOKEN`.
3. Fill in the variables marked *sync: false* (see table below).
4. Build command: `npm ci --include=dev && npm run build` · Start command: `npm start` (runs migrations, then starts the server) · Health check: `/api/health`.
5. After the first deploy open `https://<your-domain>/admin/setup`, enter `moseslebron29@gmail.com`, the `KAZIFLOW_ADMIN_BOOTSTRAP_TOKEN` and a strong password. Setup works only once. Then remove the bootstrap token from Render.
6. In the Safaricom developer portal register `https://<your-domain>/api/daraja/callback` (STK) — the app appends the callback token automatically. B2C result/timeout URLs are generated from the same origin.
7. Test with `DARAJA_ENVIRONMENT=sandbox`. Switch to `production` and set `KAZIFLOW_LIVE_PAYMENTS_ENABLED=true` only after Safaricom go-live approval.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string (Render internal URL). |
| `DATABASE_SSL` | no | `true` when using an external/public database URL. |
| `DATABASE_POOL_MAX` | no | Connection pool size (default 10). |
| `NODE_ENV` | yes | `production` on Render. |
| `PORT` | auto | Set by Render. |
| `KAZIFLOW_PUBLIC_ORIGIN` | yes | Public `https://` address; used in emails and callbacks. |
| `KAZIFLOW_SESSION_SECRET` | yes | 32+ random characters; signs sessions and OTP hashes. |
| `KAZIFLOW_COOKIE_SECURE` | no | `false` only for http local development. |
| `ADMIN_EMAIL` | yes | Primary super-administrator email. |
| `KAZIFLOW_ADMIN_BOOTSTRAP_TOKEN` | first deploy | One-time admin setup token (32+ characters). |
| `KAZIFLOW_BREVO_API_KEY` | yes | Brevo API key (server only). `BREVO_API_KEY` is accepted as an alias. |
| `KAZIFLOW_EMAIL_FROM` | yes | Verified Brevo sender, e.g. `KaziFlow <no-reply@domain>`. |
| `DARAJA_ENVIRONMENT` | yes | `sandbox` or `production`. |
| `DARAJA_CONSUMER_KEY`, `DARAJA_CONSUMER_SECRET` | yes | Daraja app credentials. |
| `DARAJA_SHORTCODE`, `DARAJA_PASSKEY` | yes | STK Push shortcode and passkey. |
| `DARAJA_TRANSACTION_TYPE` | no | `CustomerPayBillOnline` (default) or `CustomerBuyGoodsOnline`. |
| `DARAJA_PARTY_B` | no | Till number for Buy Goods when different from the shortcode. |
| `DARAJA_CALLBACK_URL` | yes | `https://<domain>/api/daraja/callback`. |
| `DARAJA_CALLBACK_TOKEN` | yes | Random secret added to all M-Pesa callback URLs. |
| `KAZIFLOW_LIVE_PAYMENTS_ENABLED` | production | Must be `true` before live payments start. |
| `DARAJA_B2C_SHORTCODE`, `DARAJA_B2C_INITIATOR_NAME`, `DARAJA_B2C_SECURITY_CREDENTIAL` | for withdrawals | B2C payout configuration. |
| `DARAJA_B2C_CONSUMER_KEY`, `DARAJA_B2C_CONSUMER_SECRET` | no | Only if B2C uses a separate Daraja app. |
| `DARAJA_B2C_COMMAND_ID` | no | Default `BusinessPayment`. |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | recommended | S3-compatible storage for uploads (R2/S3/B2). |
| `UPLOAD_DIR` | optional | Disk path for uploads on a persistent disk (`/var/data/uploads`). Leave unset to keep uploads in the database. |
| `ADSENSE_CLIENT_ID`, `VITE_ADSENSE_SLOT_HOME`, `VITE_ADSENSE_SLOT_POLICY` | no | Only after Google approves the site. `VITE_*` values are read at build time. |

`BREVO_API_URL_OVERRIDE` and `DARAJA_BASE_URL_OVERRIDE` exist only for local testing against mock servers and are ignored when `NODE_ENV=production`.

## Security notes

- All credentials are read from server environment variables; nothing secret is shipped to the browser.
- Roles (`user`, `admin`, `super_admin`) are checked server-side on every admin procedure; only a super-admin can grant administrator access. Profile updates cannot change roles.
- OTPs are HMAC-hashed, expire after 10 minutes, allow 5 attempts, have a 60-second resend cooldown and an hourly cap. A per-account database lock prevents racing the limits. Codes are never logged or returned by the API, and are not put in email subjects.
- Request rate limits (login, registration, OTP, uploads, reviews) are kept in memory per server instance — adequate for one Render instance; use a shared store if you scale horizontally.
- Uploads are type- and size-checked, stored under random keys, hashed to detect reused evidence, and evidence files are served only to their owner and administrators.
- Ledger entries carry unique idempotency keys so approvals, referral commissions and callbacks cannot pay twice.

## Database

Schema: `drizzle/schema.ts`. Migrations: `drizzle/0000_initial_postgres.sql` (+ journal). `npm start` runs `dist/migrate.js` before the server, so new committed migrations apply automatically on each deploy. To create a new migration after a schema change: `npx drizzle-kit generate`, review the SQL, commit it.

Render PostgreSQL includes daily backups on paid plans; confirm your plan's backup retention in the Render dashboard.
