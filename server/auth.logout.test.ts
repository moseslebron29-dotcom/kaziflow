import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const cleared: { name: string; options: Record<string, unknown> }[] = [];
    const ctx = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: (name: string, options: Record<string, unknown>) => cleared.push({ name, options }) } as unknown as TrpcContext["res"],
    } as TrpcContext;
    const result = await appRouter.createCaller(ctx).auth.logout();
    expect(result).toEqual({ success: true });
    expect(cleared).toHaveLength(1);
    expect(cleared[0]?.name).toBe(COOKIE_NAME);
    expect(cleared[0]?.options).toMatchObject({ httpOnly: true, path: "/", sameSite: "lax" });
  });
});
