# KaziFlow API reference

The browser talks to the same-origin tRPC endpoint `/api/trpc`. Every input is validated with Zod in the router. Roles and ownership are enforced on the server.

## tRPC procedures

### `admin.*`

- `overview` — admin
- `users` — admin
- `userHistory` — admin
- `setSuspended` — admin
- `administrators` — superAdmin
- `setAdministratorAccess` — superAdmin
- `tasks` — admin
- `createTask` — admin
- `updateTask` — admin
- `setTaskStatus` — admin
- `deleteTask` — admin
- `taskSubmissions` — admin
- `reviewTaskSubmission` — admin
- `whatsappSubmissions` — admin
- `reviewWhatsappSubmission` — admin
- `campaigns` — admin
- `reviewCampaign` — admin
- `payments` — admin
- `investigatePayment` — admin
- `withdrawals` — admin
- `payWithdrawal` — admin
- `markPayoutFailed` — admin
- `rejectWithdrawal` — admin
- `settings` — admin
- `updateSettings` — admin
- `supportTickets` — admin
- `respondSupportTicket` — admin
- `emailLog` — admin
- `broadcastEmail` — admin
- `auditEvents` — admin
- `advertisers` — admin

### `advertiser.*`

- `overview` — advertiser
- `uploadMedia` — advertiser
- `uploadVideo` — advertiser
- `createCampaign` — advertiser
- `fundCampaign` — advertiser
- `participants` — advertiser
- `transactions` — advertiser

### `announcement.*`

- `adminList` — admin
- `uploadMedia` — admin
- `create` — admin
- `update` — admin
- `setStatus` — admin
- `delete` — admin
- `next` — protected
- `seen` — protected
- `clicked` — protected
- `dismiss` — protected

### `auth.*`

- `status` — public
- `me` — public
- `register` — public
- `login` — public
- `adminLogin` — public
- `logout` — public
- `sendVerificationCode` — protected
- `verifyEmailCode` — protected
- `forgotPassword` — public
- `resetPassword` — public
- `changePassword` — protected
- `updateProfile` — protected
- `bootstrapAdmin` — public
- `adminSetupStatus` — public

### `member.*`

- `activationStatus` — protected
- `startActivation` — protected
- `paymentStatus` — protected
- `categories` — public
- `tasks` — public
- `startTask` — protected
- `submitTask` — protected
- `mySubmissions` — protected
- `uploadEvidence` — protected
- `whatsappCampaigns` — protected
- `submitWhatsappAd` — protected
- `wallet` — protected
- `withdrawalSettings` — protected
- `withdraw` — protected
- `withdrawals` — protected
- `history` — protected
- `referrals` — protected
- `supportTickets` — protected
- `createSupportTicket` — protected

### `public.*`

- `info` — public

### `review.*`

- `publicApproved` — public
- `mine` — protected
- `submit` — protected
- `adminList` — admin
- `moderate` — admin
- `delete` — admin

## HTTP endpoints

- `GET /api/health` — health check.
- `POST /api/daraja/callback?token=…` — STK Push result. Payment is accepted only after amount/phone/receipt match and a server-side STK Query confirms it.
- `POST /api/daraja/b2c/result?token=…`, `POST /api/daraja/b2c/timeout?token=…` — B2C payout results. A withdrawal becomes Paid only when amount, phone and receipt match.
- `GET /api/media/<key>` — public campaign/announcement media.
- `GET /api/evidence?id=…` — task/WhatsApp evidence; owner or administrator only.
