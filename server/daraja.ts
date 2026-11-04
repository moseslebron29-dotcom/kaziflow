import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const SANDBOX = "https://sandbox.safaricom.co.ke";
const PRODUCTION = "https://api.safaricom.co.ke";
const tokenCache = new Map<string, { value: string; expiresAt: number }>();

function baseUrl(environment: string) {
  // Test-only override so automated checks can use a local mock of Daraja.
  if (process.env.NODE_ENV !== "production" && process.env.DARAJA_BASE_URL_OVERRIDE)
    return process.env.DARAJA_BASE_URL_OVERRIDE.replace(/\/+$/, "");
  return environment === "production" ? PRODUCTION : SANDBOX;
}

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
  let origin: string;
  try {
    const url = new URL(callbackUrl);
    if (url.protocol !== "https:" || url.pathname !== "/api/daraja/callback") return null;
    origin = url.origin;
  } catch {
    return null;
  }
  const token = process.env.DARAJA_CALLBACK_TOKEN;
  const stkCallback = token ? `${origin}/api/daraja/callback?token=${encodeURIComponent(token)}` : `${origin}/api/daraja/callback`;
  return {
    consumerKey,
    consumerSecret,
    shortcode,
    passkey,
    callbackUrl: stkCallback,
    origin,
    environment,
    // Paybill uses CustomerPayBillOnline; set DARAJA_TRANSACTION_TYPE=CustomerBuyGoodsOnline for a till.
    transactionType: process.env.DARAJA_TRANSACTION_TYPE === "CustomerBuyGoodsOnline" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline",
    partyB: process.env.DARAJA_PARTY_B || shortcode,
    base: baseUrl(environment),
  };
}

export function darajaReady() {
  return config() !== null;
}

/** B2C payouts need their own initiator credentials and a callback token. */
function b2cConfig() {
  const c = config();
  const shortcode = process.env.DARAJA_B2C_SHORTCODE;
  const initiator = process.env.DARAJA_B2C_INITIATOR_NAME;
  const credential = process.env.DARAJA_B2C_SECURITY_CREDENTIAL;
  const token = process.env.DARAJA_CALLBACK_TOKEN;
  if (!c || !shortcode || !initiator || !credential || !token || token.length < 16) return null;
  return {
    ...c,
    consumerKey: process.env.DARAJA_B2C_CONSUMER_KEY || c.consumerKey,
    consumerSecret: process.env.DARAJA_B2C_CONSUMER_SECRET || c.consumerSecret,
    b2cShortcode: shortcode,
    initiator,
    credential,
    commandId: process.env.DARAJA_B2C_COMMAND_ID || "BusinessPayment",
    resultUrl: `${c.origin}/api/daraja/b2c/result?token=${encodeURIComponent(token)}`,
    timeoutUrl: `${c.origin}/api/daraja/b2c/timeout?token=${encodeURIComponent(token)}`,
  };
}

export function b2cReady() {
  return b2cConfig() !== null;
}

export function callbackTokenValid(candidate: unknown, required = false) {
  const expected = process.env.DARAJA_CALLBACK_TOKEN;
  if (!expected) return !required;
  if (typeof candidate !== "string") return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function kenyaTimestamp(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}${map.month}${map.day}${map.hour}${map.minute}${map.second}`;
}

async function accessToken(c: { base: string; consumerKey: string; consumerSecret: string }) {
  const cacheKey = `${c.base}|${c.consumerKey}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.value;
  const basic = Buffer.from(`${c.consumerKey}:${c.consumerSecret}`).toString("base64");
  const response = await fetch(`${c.base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${basic}` },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Daraja OAuth returned HTTP ${response.status}`);
  const body = (await response.json()) as { access_token?: string; expires_in?: string | number };
  if (!body.access_token) throw new Error("Daraja did not return an access token");
  const seconds = Number(body.expires_in ?? 3600);
  tokenCache.set(cacheKey, { value: body.access_token, expiresAt: Date.now() + Math.max(60, seconds - 60) * 1000 });
  return body.access_token;
}

async function requestJson(url: string, token: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(18_000),
  });
  const text = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    /* Report only HTTP status. */
  }
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
    TransactionType: c.transactionType,
    Amount: input.amountMinor / 100,
    PartyA: phone,
    PartyB: c.partyB,
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
    customerMessage:
      typeof response.CustomerMessage === "string" ? response.CustomerMessage : "Check your phone and complete the M-Pesa prompt.",
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

/** Sends a B2C payout. Success here only means Safaricom accepted the request. */
export async function initiateB2cPayout(input: { withdrawalId: number; phone: string; amountMinor: number }) {
  const c = b2cConfig();
  if (!c) throw new Error("M-Pesa B2C payouts are not configured.");
  if (input.amountMinor <= 0 || input.amountMinor % 100 !== 0) throw new Error("Payout amounts must be whole KES.");
  const phone = normalizeKenyanPhone(input.phone);
  const token = await accessToken(c);
  const originatorConversationId = `KFW${input.withdrawalId}-${randomBytes(6).toString("hex")}`;
  const response = await requestJson(`${c.base}/mpesa/b2c/v3/paymentrequest`, token, {
    OriginatorConversationID: originatorConversationId,
    InitiatorName: c.initiator,
    SecurityCredential: c.credential,
    CommandID: c.commandId,
    Amount: input.amountMinor / 100,
    PartyA: c.b2cShortcode,
    PartyB: phone,
    Remarks: `KaziFlow withdrawal ${input.withdrawalId}`.slice(0, 100),
    QueueTimeOutURL: c.timeoutUrl,
    ResultURL: c.resultUrl,
    Occasion: `W${input.withdrawalId}`,
  });
  if (String(response.ResponseCode) !== "0" || typeof response.ConversationID !== "string")
    throw new Error("Daraja did not accept the B2C payout request.");
  return {
    conversationId: response.ConversationID,
    originatorConversationId:
      typeof response.OriginatorConversationID === "string" ? response.OriginatorConversationID : originatorConversationId,
  };
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
  const item = (name: string) => items.find(entry => entry.Name === name)?.Value;
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

export type ParsedB2cResult = {
  conversationId: string | null;
  originatorConversationId: string | null;
  resultCode: number;
  resultDescription: string;
  transactionId: string | null;
  amountMinor: number | null;
  receiverPhone: string | null;
};

export function parseB2cResult(body: unknown): ParsedB2cResult | null {
  if (!body || typeof body !== "object") return null;
  const result = (body as { Result?: Record<string, unknown> }).Result;
  if (!result || result.ResultCode === undefined) return null;
  const code = Number(result.ResultCode);
  if (!Number.isFinite(code)) return null;
  const params =
    (result.ResultParameters as { ResultParameter?: Array<{ Key?: string; Value?: unknown }> | { Key?: string; Value?: unknown } } | undefined)
      ?.ResultParameter ?? [];
  const list = Array.isArray(params) ? params : [params];
  const value = (key: string) => list.find(p => p.Key === key)?.Value;
  const amount = value("TransactionAmount");
  const receiver = value("ReceiverPartyPublicName");
  const receiverDigits = typeof receiver === "string" ? /^(\d{9,12})/.exec(receiver.replace(/\s/g, ""))?.[1] ?? null : null;
  const receipt = value("TransactionReceipt") ?? result.TransactionID;
  return {
    conversationId: typeof result.ConversationID === "string" ? result.ConversationID : null,
    originatorConversationId: typeof result.OriginatorConversationID === "string" ? result.OriginatorConversationID : null,
    resultCode: code,
    resultDescription: typeof result.ResultDesc === "string" ? result.ResultDesc.slice(0, 500) : "B2C result received",
    transactionId: typeof receipt === "string" && receipt.length ? receipt.slice(0, 64) : null,
    amountMinor: amount != null && Number.isFinite(Number(amount)) ? Math.round(Number(amount) * 100) : null,
    receiverPhone: receiverDigits,
  };
}
