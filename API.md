# KaziFlow API reference

The browser application uses the same-origin tRPC endpoint at `/api/trpc`. Procedure input schemas are validated in the corresponding server router with Zod. Cookie-authenticated procedures resolve the signed application session against the current account/role and reject suspended users. Role checks, ownership checks and financial state transitions are enforced in the server, not by UI visibility.

## Procedure namespaces

### `auth.*`

- `status` — public readiness flags; does not expose secret values.
- `me`, `register`, `login`, `adminLogin`, `logout` — current account, member/advertiser creation and session actions.
- `forgotPassword`, `resetPassword`, `verifyEmail`, `resendVerification` — one-time email workflows. They are not operational until the email provider is configured.
- `updateProfile` — update supported account profile details.
- `bootstrapAdmin`, `adminSetupStatus` — one-time, configured-email-bound primary administrator setup. Bootstrap requires the configured token, new password and unused one-time setup state.

### `member.*`

- `activationStatus`, `startActivation` — activation fee and M-Pesa STK Push state.
- `tasks`, `startTask`, `submitTask`, `mySubmissions`, `uploadEvidence` — funded task discovery, server-recorded attempts, evidence and moderation status.
- `whatsappCampaigns`, `submitWhatsappAd` — eligible ad campaigns and screenshot-backed submissions.
- `wallet`, `withdraw`, `withdrawals`, `history` — balances, reserved withdrawals and transaction history.
- `referrals` — referral attribution and status.
- `supportTickets`, `createSupportTicket` — member-owned support tickets.

### `advertiser.*`

- `overview` — owned campaigns and reporting.
- `uploadMedia`, `uploadVideo` — validated campaign-media uploads, returning internal asset IDs.
- `createCampaign`, `fundCampaign` — campaign configuration and provider-gated M-Pesa funding.
- `participants` — participating-member and administrator-reviewed screenshot-reported view data.

### `admin.*`

- `overview`, `users`, `userHistory`, `setSuspended` — user/account review and scoped financial history.
- `administrators`, `setAdministratorAccess` — delegated admin access; super-admin only.
- `tasks`, `createTask`, `updateTask`, `deleteTask`, `taskSubmissions`, `reviewTaskSubmission` — funded work and moderation.
- `whatsappSubmissions`, `reviewWhatsappSubmission`, `campaigns`, `reviewCampaign` — evidence review, spend limits and campaign administration.
- `payments`, `investigatePayment` — payment attempts and investigation notes.
- `withdrawals`, `processWithdrawal` — withdrawal review. Current provider boundary prevents a manual transition to Paid.
- `settings`, `updateSettings`, `supportTickets`, `respondSupportTicket`, `auditEvents` — policy limits, support and auditable changes.

### `reviews.*`

- `publicApproved`, `mine`, `submit` — approved public reviews and member-submitted rating/content.
- `adminList`, `moderate`, `delete` — searchable/rating-filtered moderation, rejection notes and removal.

## REST endpoints

- `GET /api/health` — unauthenticated service readiness response.
- `GET /api/evidence?id=<assetId>` — private uploaded evidence; requires a valid owner/admin session and asset ownership/role checks.
- `POST /api/daraja/callback` — Safaricom STK Push callback receiver. The handler validates known checkout attempts, matches callback fields, queries Daraja from the server and applies a credit/activation only after provider confirmation. A malformed, unknown, mismatched or inconclusive result is not a payment credit.
- `GET /api/platform/config.js` — platform-owned, allowlisted public runtime settings only.

No client-side API should receive Daraja consumer credentials, passkeys, bootstrap tokens, raw private object-storage keys or password hashes. See `server/` for the authoritative procedure schemas and state transitions.
