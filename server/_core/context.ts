import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getUserById } from "../db";
import { sessionIdentityFromRequest } from "./app-session";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function authenticatedUserFromRequest(req: TrpcContext["req"]): Promise<User | null> {
  let user: User | null = null;
  const identity = await sessionIdentityFromRequest(req);
  if (identity) {
    try {
      const found = await getUserById(identity.id);
      if (found && !found.suspendedAt && (found.sessionVersion ?? 0) === identity.version) user = found;
    } catch (error) {
      console.error("[Auth] Session user lookup failed:", error instanceof Error ? error.message : "unknown error");
    }
  }
  return user;
}

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  const user = await authenticatedUserFromRequest(opts.req);
  return { req: opts.req, res: opts.res, user };
}
