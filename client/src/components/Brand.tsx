import { Link } from "wouter";

export function BrandMark({ small = false }: { small?: boolean }) {
  return <span className={`brand-mark${small ? " brand-mark-small" : ""}`} aria-hidden="true"><svg viewBox="0 0 40 40" role="img"><path d="M8 8v24M8 20 29 8M8 20l21 12" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="30" cy="8" r="3" fill="currentColor"/><circle cx="30" cy="32" r="3" fill="currentColor"/></svg></span>;
}

export function Wordmark({ to = "/", inverse = false }: { to?: string; inverse?: boolean }) {
  return <Link href={to} className={`brand-wordmark${inverse ? " brand-wordmark-inverse" : ""}`} aria-label="KaziFlow home"><BrandMark /><span>KaziFlow</span></Link>;
}
