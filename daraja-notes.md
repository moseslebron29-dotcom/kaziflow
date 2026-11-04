# Safaricom Daraja integration notes

Implementation uses Safaricom Daraja 3.0 M-Pesa Express (STK Push) in `server/daraja.ts` and processes callback/query verification in `server/payments.ts`.

- The [Safaricom Authorization API reference](https://developer.safaricom.co.ke/apis/Authorization) describes Basic-authenticated client-credentials token generation and bearer tokens for subsequent requests.
- The [Safaricom M-Pesa Express simulator reference](https://developer.safaricom.co.ke/apis/MpesaExpressSimulate) is the provider's API entry point. Its public page gives limited API detail without an authenticated developer account.
- The [M-Pesa Express implementation guide](https://dev.to/msnmongare/m-pesa-express-stk-push-api-guide-40a2) describes the STK Push `processrequest` endpoint and the request fields (`BusinessShortCode`, password/timestamp, phone, callback, reference), the asynchronous `stkCallback` metadata, and receipt/amount/phone values.
- The [STK Push and Query walkthrough](https://dev.to/anne46/implementing-m-pesa-stk-push-and-query-in-ruby-on-rails-328d) corroborates the asynchronous callback and Query workflow.

The integration accepts payment only after the stored checkout reference is matched, callback amount/phone/receipt match the pending attempt, and a server-to-server Daraja STK Query returns `ResultCode: 0`. A browser response or callback by itself cannot activate an account or fund a campaign. Real testing requires the user's own Daraja application credentials, a configured public HTTPS callback URL, and an authorized Safaricom sandbox/production setup; this project does not embed provider credentials or simulate a payment success.
