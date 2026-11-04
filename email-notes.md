# Brevo transactional email integration notes

KaziFlow sends account-verification and password-reset email through Brevo's server-side transactional email API. The official endpoint is `POST https://api.brevo.com/v3/smtp/email`. The API key is sent in the `api-key` request header, not a browser bundle. Static-content messages use a `sender` object, a `to` recipient array, `subject`, and `htmlContent` and/or `textContent`. A successful send returns HTTP 201 and a `messageId`. The sender must be configured and authorized in Brevo before messages are sent.

The implementation keeps Brevo API credentials on the server. It uses a configured HTTPS website origin rather than the request Host to construct one-time links. The sender is configured through the verified `KAZIFLOW_EMAIL_FROM`; the server is disabled for mail until the sender, public origin and Brevo key are all present. No test email is sent during automated tests.

## Official references

- [Brevo — Send a transactional email guide](https://developers.brevo.com/docs/send-a-transactional-email)
- [Brevo — Send a transactional email API reference](https://developers.brevo.com/reference/send-transac-email)
