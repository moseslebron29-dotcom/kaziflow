/** Contact-detail checks for public member reviews. Shared by the server and tests. */
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
// Kenyan mobile numbers: 07XXXXXXXX, 01XXXXXXXX, 2547XXXXXXXX, +2541XXXXXXXX (spaces, dots and hyphens ignored).
const KENYAN_PHONE = /(?<!\d)(?:\+?254|0)[17]\d{8}(?!\d)/;
const LINK = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|co\.ke|ke|net|org|io|app|me|ly)\b/i;

export function reviewContentProblem(text: string): string | null {
  if (EMAIL.test(text)) return "Please remove email addresses from your review.";
  if (KENYAN_PHONE.test(text.replace(/[\s.()-]/g, ""))) return "Please remove phone numbers from your review.";
  if (LINK.test(text)) return "Links are not allowed in reviews.";
  return null;
}
