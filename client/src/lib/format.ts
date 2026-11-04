export function formatKes(minor: number | null | undefined) {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 2 }).format((Number(minor) || 0) / 100);
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function safeError(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message.replace(/^\[[^\]]+\]\s*/, "");
  return "Something went wrong. Please try again.";
}
