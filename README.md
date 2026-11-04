# KaziFlow — Microtasks & WhatsApp Ads

KaziFlow is a mobile-first Kenyan task, advertiser and WhatsApp Status campaign platform. The full-stack application uses the existing React/Vite, Express, tRPC and Drizzle project with the Manus-managed, MySQL-compatible database. User accounts, password hashes, roles, tasks, campaign records, evidence indexes, payment attempts, wallets, immutable ledger entries, withdrawals, reviews, support tickets, settings and audit events are relational database records. Uploaded assets use managed object storage rather than container-local files.

## Database provider and persistence

The configured provider is the **Manus-managed MySQL-compatible database**, not PostgreSQL. This is the native database capability supported by the current Manus WebDev hosting setup and the application uses Drizzle's MySQL dialect with `mysql2`. The database is a managed service separate from the published application container. Its schema and data survive server restarts and application redeployments; both development and the published container connect to the same project database. This does not mean changes in development are isolated from production.

PostgreSQL is not available as the managed database for this project. The WebDev database capability can be turned off to connect an external database, but moving this project to PostgreSQL would require choosing and configuring that external provider, converting the Drizzle schema and migrations to a PostgreSQL dialect, and supplying a protected production DSN. This project has not been switched to an external provider.

## Backups and migrations

The application does not use JSON files or in-memory maps for accounts or financial records. A server restart does not erase MySQL rows. No project-specific automated database backup or point-in-time restore has been configured. Manus's website Task Data Backup is a separate manual, point-in-time export that includes website code, uploaded files, website database contents, configuration and secrets; it does not continuously sync later registrations or transactions. For a live site, keep fresh complete exports as a separate backup practice. The managed database surface does not provide a separate full database export/restore API or point-in-time recovery endpoint. Do not claim automatic database backups unless a separately verified backup service is configured.

Database structure is versioned under `drizzle/` with Drizzle's migration journal. The platform provisions the database but does not automatically apply application migrations on publish. Use `pnpm db:migrate` for each reviewed, committed migration before relying on its fields/tables. Migrations should be deterministic and additive where possible, and must be run only once per migration. Development and the published deployment share the database, so a development migration changes the live schema too; avoid destructive SQL and fabricated financial test writes. The initial KaziFlow schema migration has been generated, reviewed and applied to the connected managed database.

## Local development and checks

Use Node and the package-manager version pinned in `package.json`/`pnpm-lock.yaml`.

```sh
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
```

The app listens on `PORT` (default `3000`). Build and check with:

```sh
pnpm check
pnpm test
pnpm build
```

`pnpm db:push` generates and applies new schema changes. Use it only after reviewing the generated SQL; prefer an explicit migration committed with the code. The container's health endpoint is `/api/health`.

## Secure accounts, roles and sessions

Email-and-password registration stores a salted scrypt password hash, never a plain-text password. Verification and reset tokens are stored as SHA-256 hashes, expire after 30 minutes, and can be used once. Password reset increments the account session version, invalidating earlier sessions. User and administrator roles are persisted in MySQL and checked by server-side middleware on every protected action. The primary super-admin setup is bound to the specified `ADMIN_EMAIL` and a one-time token; no default admin password is hardcoded.

HTTPS Preview and production set an `HttpOnly; Secure; SameSite=None` cookie. Local plain-HTTP development uses a separate `SameSite=Lax` cookie setting. The app does not store login tokens in local storage. A normal top-level same-origin Android or desktop browser session works with the same server cookie; browser policies may still block third-party cookies when the site is embedded in an iframe.

## Runtime configuration

Use the platform's protected project-input workflow for credentials. Never put real values in source, `.env.example`, client code, shell history or Git. See [.env.example](.env.example) for names/placeholders and [API.md](API.md) for the API namespaces. The managed platform supplies the database DSN and storage credentials.

Brevo transactional email requires `KAZIFLOW_BREVO_API_KEY`, a Brevo-verified `KAZIFLOW_EMAIL_FROM` sender and an HTTPS `KAZIFLOW_PUBLIC_ORIGIN`. Production verification/reset URLs must use the published site's actual HTTPS origin. Without all three settings, KaziFlow reports email delivery as unconfigured. Brevo's server-side API key never enters browser code.

The initial primary administrator requires `ADMIN_EMAIL` and `KAZIFLOW_ADMIN_BOOTSTRAP_TOKEN`. The token must be a private random value of at least 32 characters. Use it once at `/admin/setup` with a new password, then rotate/remove it. The application does not ship a default administrator password.

Safaricom Daraja STK Push requires `DARAJA_CONSUMER_KEY`, `DARAJA_CONSUMER_SECRET`, `DARAJA_SHORTCODE`, `DARAJA_PASSKEY`, `DARAJA_ENVIRONMENT` and `DARAJA_CALLBACK_URL`. The callback must be a public HTTPS URL ending exactly in `/api/daraja/callback`. Use `sandbox` while testing. The server matches callback phone, amount and receipt, queries Daraja server-side and grants activation/funding only after confirmation. Production STK requests remain disabled unless `KAZIFLOW_LIVE_PAYMENTS_ENABLED=true` is deliberately set after separate go-live approval.

A dedicated `KAZIFLOW_SESSION_SECRET` (minimum 32 characters) is optional in the managed environment. If absent, the app derives a project-specific key from the injected platform secret and project ID. Do not expose that derived key.

## Product and money-handling boundaries

The activation fee defaults to KES 100. A task or WhatsApp submission does not become available balance until approved; credits use idempotent ledger keys and database transactions. WhatsApp Status evidence consists of member-submitted screenshots. Moderators can approve a capped number of screenshot-reported views, but the screenshots do not independently prove the identity or count of viewers. Advertiser reporting therefore describes administrator-reviewed screenshot-reported views. Video-task timing is an elapsed-time gate plus manual evidence review, not proof that an external video played continuously.

Withdrawal requests reserve available funds. The supported states are Pending, Processing and reasoned Rejected. `Paid` is intentionally unavailable until a real M-Pesa B2C or equivalent payout provider and independently verifiable disbursement receipt are integrated. An administrator-entered receipt alone is not treated as provider confirmation. Advertiser campaigns are not activated until funding is confirmed and an administrator approves activation. Initial public review cards are labelled demonstrations; only moderated, approved member submissions are shown as real feedback.

## Deployment and publication

Before public release, configure Brevo's verified sender and the production `KAZIFLOW_PUBLIC_ORIGIN`, confirm the publicly reachable Daraja callback, and decide whether activation payments should remain sandboxed. No real payment is initiated during code checks. The configured container uses the managed database and `/api/health` for readiness.

The current project setting has auto-publish enabled. A push/checkpoint to the canonical branch may publish the application. No GitHub push or publication is authorized by this documentation; wait for the owner to request it after the requested checks and review.

See [Safaricom integration notes](daraja-notes.md) and [API reference](API.md). KaziFlow uses its own name, logo and design rather than copying the reference platform.
