function publicOrigin() {
  const configured = process.env.KAZIFLOW_PUBLIC_ORIGIN;
  const previewFallback =
    process.env.NODE_ENV === "development"
      ? process.env.MANUS_ADDON_PREVIEW_PUBLIC_ORIGIN
      : undefined;
  const value = configured || previewFallback;
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      return null;
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

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, character => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });

export function mailerReady() {
  return Boolean(
    process.env.KAZIFLOW_BREVO_API_KEY && senderDetails() && publicOrigin()
  );
}

export async function sendAccountEmail(
  to: string,
  subject: string,
  heading: string,
  token: string,
  path: string
) {
  const apiKey = process.env.KAZIFLOW_BREVO_API_KEY;
  const sender = senderDetails();
  const origin = publicOrigin();
  if (!apiKey || !sender || !origin)
    throw new Error("Brevo transactional email is not configured.");

  const url = new URL(path, origin);
  if (url.origin !== origin || !url.pathname.startsWith("/"))
    throw new Error("Account email link must remain on the configured site origin.");
  url.searchParams.set("token", token);
  const link = url.toString();
  const safeLink = escapeHtml(link);
  const safeHeading = escapeHtml(heading);
  const safeBrand = escapeHtml("KaziFlow");
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#202a32"><p style="color:#c6533b;font-weight:bold">${safeBrand}</p><h1>${safeHeading}</h1><p>Use this single-use link. It expires in 30 minutes.</p><p><a href="${safeLink}" style="display:inline-block;padding:12px 18px;background:#c6533b;color:white;text-decoration:none;border-radius:8px">Continue securely</a></p><p>If you did not request this, you can ignore this message.</p></div>`;
  const text = `${heading}\n\nThis single-use link expires in 30 minutes:\n${link}\n\nIf you did not request this, ignore this message.`;
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok)
    throw new Error(`Brevo transactional email returned HTTP ${response.status}.`);
}
