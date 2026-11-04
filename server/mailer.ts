import { emailLog } from "../drizzle/schema";
import { getDb } from "./db";

/**
 * Brevo transactional email. The API key stays on the server. Message bodies and
 * one-time codes are never logged; only the template name and delivery status.
 */
function brevoKey() {
  return process.env.KAZIFLOW_BREVO_API_KEY || process.env.BREVO_API_KEY || "";
}

function brevoEndpoint() {
  if (process.env.NODE_ENV !== "production" && process.env.BREVO_API_URL_OVERRIDE) return process.env.BREVO_API_URL_OVERRIDE;
  return "https://api.brevo.com/v3/smtp/email";
}

export function publicOrigin() {
  const value = process.env.KAZIFLOW_PUBLIC_ORIGIN;
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(local && process.env.NODE_ENV !== "production")) return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function senderDetails() {
  const raw = process.env.KAZIFLOW_EMAIL_FROM?.trim();
  if (!raw) return null;
  const match = /^(.*?)\s*<([^<>]+)>$/.exec(raw);
  const email = (match?.[2] ?? raw).trim();
  const name = match?.[1]?.trim().replace(/^"|"$/g, "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return { email, ...(name ? { name } : {}) };
}

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, character => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[character] ?? character;
  });

export function mailerReady() {
  return Boolean(brevoKey() && senderDetails() && publicOrigin());
}

type Block = { kind: "p"; text: string } | { kind: "code"; code: string } | { kind: "button"; label: string; path: string };

function render(heading: string, blocks: Block[]) {
  const origin = publicOrigin() ?? "";
  const htmlBlocks = blocks
    .map(b => {
      if (b.kind === "p") return `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(b.text)}</p>`;
      if (b.kind === "code")
        return `<p style="margin:18px 0;font-size:32px;font-weight:700;letter-spacing:8px;color:#1d2b32;font-family:monospace">${escapeHtml(b.code)}</p>`;
      const link = escapeHtml(new URL(b.path, origin).toString());
      return `<p style="margin:20px 0"><a href="${link}" style="display:inline-block;padding:12px 20px;background:#c6533b;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600">${escapeHtml(b.label)}</a></p>`;
    })
    .join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;padding:24px;color:#1f2a30;background:#ffffff"><p style="color:#c6533b;font-weight:700;font-size:18px;margin:0 0 18px">KaziFlow</p><h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(heading)}</h1>${htmlBlocks}<hr style="border:none;border-top:1px solid #e6ece9;margin:24px 0"/><p style="font-size:12px;color:#6b7a80">You received this because you have a KaziFlow account. KaziFlow staff will never ask for your password or verification code.</p></div>`;
  const text = [
    heading,
    "",
    ...blocks.map(b => (b.kind === "p" ? b.text : b.kind === "code" ? `Code: ${b.code}` : `${b.label}: ${new URL(b.path, origin).toString()}`)),
  ].join("\n");
  return { html, text };
}

async function log(userId: number | null, template: string, subject: string, status: "sent" | "failed" | "skipped", errorText?: string) {
  try {
    const db = await getDb();
    if (db) await db.insert(emailLog).values({ userId, template, subject: subject.slice(0, 200), status, errorText: errorText?.slice(0, 240) ?? null });
  } catch {
    /* Logging must never break delivery. */
  }
}

/** Low-level send. Throws on failure so callers decide whether it is fatal. */
export async function sendEmail(input: { to: string; userId?: number | null; template: string; subject: string; heading: string; blocks: Block[] }) {
  const apiKey = brevoKey();
  const sender = senderDetails();
  if (!apiKey || !sender || !publicOrigin()) {
    await log(input.userId ?? null, input.template, input.subject, "skipped", "Brevo is not configured");
    throw new Error("Brevo transactional email is not configured.");
  }
  const { html, text } = render(input.heading, input.blocks);
  const response = await fetch(brevoEndpoint(), {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender, to: [{ email: input.to }], subject: input.subject, htmlContent: html, textContent: text }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    await log(input.userId ?? null, input.template, input.subject, "failed", `HTTP ${response.status}`);
    throw new Error(`Brevo transactional email returned HTTP ${response.status}.`);
  }
  await log(input.userId ?? null, input.template, input.subject, "sent");
}

/** Fire-and-forget notification. Failures are logged, never surfaced to members. */
export function notify(input: Parameters<typeof sendEmail>[0]) {
  if (!mailerReady()) {
    void log(input.userId ?? null, input.template, input.subject, "skipped", "Brevo is not configured");
    return;
  }
  sendEmail(input).catch(error =>
    console.error(`[Mail] ${input.template} delivery failed:`, error instanceof Error ? error.message : "unknown error")
  );
}

export const templates = {
  otp(name: string, code: string, purpose: "email_verify" | "password_reset") {
    const verify = purpose === "email_verify";
    return {
      template: verify ? "otp_verify" : "otp_reset",
      subject: verify ? "Your KaziFlow verification code" : "Your KaziFlow password reset code",
      heading: verify ? "Confirm your email address" : "Reset your password",
      blocks: [
        { kind: "p", text: `Hi ${name || "there"},` },
        { kind: "p", text: verify ? "Enter this six-digit code on KaziFlow to verify your email." : "Enter this six-digit code on KaziFlow to set a new password." },
        { kind: "code", code },
        { kind: "p", text: "The code expires in 10 minutes and can be used once. If you did not request it, ignore this email." },
      ] as Block[],
    };
  },
  welcome(name: string) {
    return {
      template: "welcome",
      subject: "Karibu KaziFlow!",
      heading: `Karibu, ${name || "member"}!`,
      blocks: [
        { kind: "p", text: "Your email is verified. Activate your account with the one-time KES 100 fee to start tasks and WhatsApp Status campaigns." },
        { kind: "button", label: "Open my dashboard", path: "/dashboard" },
      ] as Block[],
    };
  },
  activation(name: string, receipt: string | null) {
    return {
      template: "activation",
      subject: "Your KaziFlow account is active",
      heading: "Account activated",
      blocks: [
        { kind: "p", text: `Hi ${name || "member"}, Safaricom confirmed your KES 100 activation payment${receipt ? ` (M-Pesa receipt ${receipt})` : ""}.` },
        { kind: "p", text: "You can now start available tasks and join WhatsApp Status campaigns." },
        { kind: "button", label: "Browse tasks", path: "/tasks" },
      ] as Block[],
    };
  },
  submissionDecision(name: string, title: string, approved: boolean, amount: string, note: string | null) {
    return {
      template: approved ? "task_approved" : "task_rejected",
      subject: approved ? `Approved: ${title}`.slice(0, 120) : `Update on your submission: ${title}`.slice(0, 120),
      heading: approved ? "Submission approved" : "Submission not approved",
      blocks: [
        { kind: "p", text: `Hi ${name || "member"},` },
        {
          kind: "p",
          text: approved
            ? `Your submission for "${title}" was approved and ${amount} was added to your available balance.`
            : `Your submission for "${title}" was not approved.${note ? ` Reason: ${note}` : ""}`,
        },
        { kind: "button", label: "View my submissions", path: "/submissions" },
      ] as Block[],
    };
  },
  withdrawal(name: string, status: string, amount: string, detail: string) {
    return {
      template: `withdrawal_${status}`,
      subject: `Withdrawal update: ${status.replaceAll("_", " ")}`,
      heading: "Withdrawal update",
      blocks: [
        { kind: "p", text: `Hi ${name || "member"}, your ${amount} withdrawal request is now ${status.replaceAll("_", " ")}.` },
        { kind: "p", text: detail },
        { kind: "button", label: "View my wallet", path: "/wallet" },
      ] as Block[],
    };
  },
  announcement(title: string, body: string) {
    return {
      template: "announcement",
      subject: title.slice(0, 120),
      heading: title,
      blocks: [...body.split(/\n{2,}/).map(text => ({ kind: "p", text }) as Block), { kind: "button", label: "Open KaziFlow", path: "/dashboard" } as Block],
    };
  },
};
