import { getAppCookieOptions } from "./app-session";
import type { Request } from "express";

// Kept as a compatibility export for the starter logout test and surrounding imports.
export function getSessionCookieOptions(_req: Request) {
  return getAppCookieOptions();
}
