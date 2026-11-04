import { createHash } from "node:crypto";

const SANDBOX = "https://sandbox.safaricom.co.ke";
const PRODUCTION = "https://api.safaricom.co.ke";
let cachedToken: { value: string; expiresAt: number } | null = null;

function config() {
  const consumerKey = process.env.DARAJA_CONSUMER_KEY;
  const consumerSecret = process.env.DARAJA_CONSUMER_SECRET;
  const shortcode = process.env.DARAJA_SHORTCODE;
  const passkey = process.env.DARAJA_PASSKEY;
  const callbackUrl = process.env.DARAJA_CALLBACK_URL;
  const environment = process.env.DARAJA_ENVIRONMENT;
  if (!consumerKey || !consumerSecret || !shortcode || !passkey || !callbackUrl || !environment) return null;
  if (environment !== "sandbox" && environment !== "production") return null;
  if (environment === "production" && process.env.KAZIFLOW_LIVE_PAYMENTS_ENABLED !== "true") return null;
  try {
    const url = new URL(callbackUrl);
    if (url.protocol !== "https:" || url.pathname !== "/api/daraja/callback") return null;
  } catch { return null; }
  return { consumerKey, consumerSecret, shortcode, passkey, callbackUrl, base: environment === "production" ? PRODUCTION : SANDBOX };
}

export function darajaReady() { return config() !== null; }

function kenyaTimestamp(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}${map.month}${map.day}${map.hour}${map.minute}${map.second}`;
}

async function accessToken(c: NonNullable<ReturnType<typeof config>>) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;
  const basic = Buffer.from(`${c.consumerKey}:${c.consumerSecret}`).toString("base64");
  const response = await fetch(`${c.base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${basic}` }, signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Daraja OAuth returned HTTP ${response.status}`);
  const body = await response.json() as { access_token?: string; expires_in?: string | number };
  if (!body.access_token) throw new Error("Daraja did not return an access token");
  const seconds = Number(body.expires_in ?? 3600);
  cachedToken = { value: body.access_token, expiresAt: Date.now() + Math.max(60, seconds - 60) * 1000 };
  return body.access_token;
}

async function requestJson(url: string, token: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(18_000),
  });
  const text = await response.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { /* Report only HTTP status. */ }
  if (!response.ok) throw new Error(`Daraja request returned HTTP ${response.status}`);
  return data;
}

export function normalizeKenyanPhone(value: string) {
  const digits = value.replace(/[\s()+-]/g, "");
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  throw new Error("Enter a valid Kenyan M-Pesa number, for example 0712345678.");
}

export async function initiateStkPush(input: { paymentId: number; phone: string; amountMinor: number; description: string }) {
  const c = config();
  if (!c) throw new Error("Daraja activation is not configured.");
  if (input.amountMinor <= 0 || input.amountMinor % 100 !== 0) throw new Error("Daraja STK amounts must be whole KES amounts.");
  const phone = normalizeKenyanPhone(input.phone);
  const timestamp = kenyaTimestamp();
  const password = Buffer.from(`${c.shortcode}${c.passkey}${timestamp}`).toString("base64");
  const token = await accessToken(c);
  const reference = `KAZI${input.paymentId}`.slice(0, 12);
  const response = await requestJson(`${c.base}/mpesa/stkpush/v1/processrequest`, token, {
    BusinessShortCode: c.shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: input.amountMinor / 100,
    PartyA: phone,
    PartyB: c.shortcode,
    PhoneNumber: phone,
    CallBackURL: c.callbackUrl,
    AccountReference: reference,
    TransactionDesc: input.description.slice(0, 13),
  });
  if (String(response.ResponseCode) !== "0" || typeof response.CheckoutRequestID !== "string") {
    throw new Error("Daraja did not accept the STK Push request.");
  }
  return {
    checkoutRequestId: response.CheckoutRequestID,
    merchantRequestId: typeof response.MerchantRequestID === "string" ? response.MerchantRequestID : null,
    customerMessage: typeof response.CustomerMessage === "string" ? response.CustomerMessage : "Check your phone and complete the M-Pesa prompt.",
  };
}

export async function queryStkPush(checkoutRequestId: string) {
  const c = config();
  if (!c) throw new Error("Daraja activation is not configured.");
  const timestamp = kenyaTimestamp();
  const password = Buffer.from(`${c.shortcode}${c.passkey}${timestamp}`).toString("base64");
  const token = await accessToken(c);
  return requestJson(`${c.base}/mpesa/stkpushquery/v1/query`, token, {
    BusinessShortCode: c.shortcode,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  });
}

export function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

export type ParsedStkCallback = {
  checkoutRequestId: string;
  merchantRequestId: string | null;
  resultCode: number;
  resultDescription: string;
  receipt: string | null;
  phone: string | null;
  amountMinor: number | null;
};

export function parseStkCallback(body: unknown): ParsedStkCallback | null {
  if (!body || typeof body !== "object") return null;
  const root = body as { Body?: { stkCallback?: Record<string, unknown> } };
  const callback = root.Body?.stkCallback;
  if (!callback || typeof callback.CheckoutRequestID !== "string" || typeof callback.ResultCode !== "number") return null;
  const items = (callback.CallbackMetadata as { Item?: Array<{ Name?: string; Value?: unknown }> } | undefined)?.Item ?? [];
  const item = (name: string) => items.find((entry) => entry.Name === name)?.Value;
  const rawAmount = item("Amount");
  return {
    checkoutRequestId: callback.CheckoutRequestID,
    merchantRequestId: typeof callback.MerchantRequestID === "string" ? callback.MerchantRequestID : null,
    resultCode: callback.ResultCode,
    resultDescription: typeof callback.ResultDesc === "string" ? callback.ResultDesc.slice(0, 500) : "Provider callback received",
    receipt: typeof item("MpesaReceiptNumber") === "string" ? String(item("MpesaReceiptNumber")).slice(0, 64) : null,
    phone: item("PhoneNumber") != null ? String(item("PhoneNumber")) : null,
    amountMinor: rawAmount != null && Number.isFinite(Number(rawAmount)) ? Math.round(Number(rawAmount) * 100) : null,
  };
}
