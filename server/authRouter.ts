import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  appSettings,
  authTokens,
  referrals,
  users,
  wallets,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  appSessionReady,
  createAppSession,
  clearAppSession,
  setAppSession,
} from "./_core/app-session";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { normalizeKenyanPhone, darajaReady } from "./daraja";
import { mailerReady, sendAccountEmail } from "./mailer";
import {
  hashOpaqueToken,
  hashPassword,
  limitRequest,
  newOpaqueToken,
  normalizeEmail,
  publicUser,
  settingValue,
  verifyPassword,
  verifySecret,
} from "./security";

const emailSchema = z.string().trim().email().max(320);
const passwordSchema = z.string().min(10).max(128);
const validName = z.string().trim().min(2).max(120);
const adminEmail = () => process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "";
const mintSession = async (
  ctx: { res: any },
  user: typeof users.$inferSelect
) => {
  setAppSession(ctx.res, await createAppSession(user.id, user.sessionVersion));
  return publicUser(user);
};
const dbRequired = async () => {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Account services are temporarily unavailable.",
    });
  return db;
};
const guardRate = (
  req: Parameters<typeof limitRequest>[0],
  action: string,
  maximum = 8
) => {
  try {
    limitRequest(req, action, maximum, 15 * 60_000);
  } catch {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many attempts. Please wait and try again.",
    });
  }
};
const sessionReady = appSessionReady;
const createOneTimeToken = async (
  userId: number,
  kind: "email_verify" | "password_reset"
) => {
  const db = await dbRequired();
  const token = newOpaqueToken();
  await db
    .insert(authTokens)
    .values({
      userId,
      tokenHash: hashOpaqueToken(token),
      kind,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    });
  return token;
};

async function createAccount(
  input: {
    name: string;
    email: string;
    phone: string;
    county: string;
    password: string;
    accountType: "member" | "advertiser";
    referralCode?: string;
  },
  dbOverride?: any,
  role: "user" | "admin" | "super_admin" = "user"
) {
  const db = dbOverride ?? (await dbRequired());
  const emailNormalized = normalizeEmail(input.email);
  const phone = normalizeKenyanPhone(input.phone);
  const exists = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.emailNormalized, emailNormalized))
    .limit(1);
  if (exists.length)
    throw new TRPCError({
      code: "CONFLICT",
      message: "An account with this email already exists.",
    });
  let referredById: number | null = null;
  if (input.referralCode && input.accountType === "member") {
    const referrer = await db
      .select({
        id: users.id,
        emailNormalized: users.emailNormalized,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.referralCode, input.referralCode.trim().toUpperCase()))
      .limit(1);
    if (
      referrer[0] &&
      (referrer[0].emailNormalized === emailNormalized ||
        referrer[0].phone === phone)
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "You cannot use your own account details for a referral.",
      });
    if (referrer[0] && referrer[0].id > 0) referredById = referrer[0].id;
  }
  const passHash = await hashPassword(input.password);
  const result = await db.insert(users).values({
    openId: randomBytes(20).toString("hex"),
    name: input.name.trim(),
    email: input.email.trim(),
    emailNormalized,
    loginMethod: "password",
    role,
    accountType: input.accountType,
    phone,
    county: input.county.trim(),
    passwordHash: passHash,
    sessionVersion: 0,
    mpesaPhone: phone,
    referralCode: randomBytes(7).toString("hex").toUpperCase(),
    referredById,
  });
  const id = Number((result as any)?.[0]?.insertId);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Account creation failed. Please try again.",
    });
  await db
    .insert(wallets)
    .values({
      userId: id,
      availableMinor: 0,
      pendingMinor: 0,
      lifetimeMinor: 0,
    });
  if (referredById)
    await db
      .insert(referrals)
      .values({
        referrerId: referredById,
        referredUserId: id,
        commissionMinor: 0,
        status: "pending",
      });
  const created = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!created[0])
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Account was created but could not be loaded.",
    });
  return created[0];
}

export const authRouter = router({
  status: publicProcedure.query(async () => ({
    sessionReady: sessionReady(),
    darajaReady: darajaReady(),
    mailerReady: mailerReady(),
    activationFeeKes: Math.max(
      1,
      Number(await settingValue("activationFeeMinor", "10000")) / 100 || 100
    ),
    announcement: await settingValue("announcement", ""),
  })),

  me: publicProcedure.query(({ ctx }) =>
    ctx.user ? publicUser(ctx.user) : null
  ),

  register: publicProcedure
    .input(
      z.object({
        name: validName,
        email: emailSchema,
        phone: z.string().trim().min(8).max(24),
        county: z.string().trim().min(2).max(100),
        password: passwordSchema,
        accountType: z.enum(["member", "advertiser"]).default("member"),
        referralCode: z.string().trim().max(24).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      guardRate(ctx.req, "register", 5);
      if (!sessionReady())
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Account sign-in is not configured yet. Please contact support.",
        });
      if (adminEmail() && normalizeEmail(input.email) === adminEmail())
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "This email is reserved for secure primary-administrator setup.",
        });
      let user: typeof users.$inferSelect;
      try {
        user = await createAccount(input);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if ((error as { code?: string })?.code === "ER_DUP_ENTRY")
          throw new TRPCError({
            code: "CONFLICT",
            message: "An account with this email already exists.",
          });
        throw error;
      }
      if (mailerReady()) {
        try {
          const token = await createOneTimeToken(user.id, "email_verify");
          await sendAccountEmail(
            user.email!,
            "Verify your KaziFlow email",
            "Confirm your email address",
            token,
            "/verify-email"
          );
        } catch (error) {
          console.error(
            "[Mail] Verification email could not be sent:",
            error instanceof Error ? error.message : "unknown error"
          );
        }
      }
      return mintSession(ctx, user);
    }),

  login: publicProcedure
    .input(
      z.object({ email: emailSchema, password: z.string().min(1).max(128) })
    )
    .mutation(async ({ ctx, input }) => {
      guardRate(ctx.req, "login", 10);
      if (!sessionReady())
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Account sign-in is not configured yet. Please contact support.",
        });
      const db = await dbRequired();
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.emailNormalized, normalizeEmail(input.email)))
        .limit(1);
      const user = rows[0];
      const valid = await verifyPassword(
        input.password,
        user?.passwordHash ?? null
      );
      if (!user || !valid || user.suspendedAt)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message:
            "Email or password is incorrect, or the account is unavailable.",
        });
      await db
        .update(users)
        .set({ lastSignedIn: new Date() })
        .where(eq(users.id, user.id));
      return mintSession(ctx, { ...user, lastSignedIn: new Date() });
    }),

  adminLogin: publicProcedure
    .input(
      z.object({ email: emailSchema, password: z.string().min(1).max(128) })
    )
    .mutation(async ({ ctx, input }) => {
      guardRate(ctx.req, "admin-login", 8);
      if (!sessionReady())
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Administrator sign-in is not configured yet.",
        });
      const db = await dbRequired();
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.emailNormalized, normalizeEmail(input.email)))
        .limit(1);
      const user = rows[0];
      const valid = await verifyPassword(
        input.password,
        user?.passwordHash ?? null
      );
      const roleAllowed =
        user?.role === "admin" ||
        (user?.role === "super_admin" && adminEmail() === user.emailNormalized);
      if (!user || !roleAllowed || !valid || user.suspendedAt)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message:
            "Administrator email or password is incorrect, or the account is unavailable.",
        });
      await db
        .update(users)
        .set({ lastSignedIn: new Date() })
        .where(eq(users.id, user.id));
      return mintSession(ctx, { ...user, lastSignedIn: new Date() });
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    clearAppSession(ctx.res);
    return { success: true };
  }),

  forgotPassword: publicProcedure
    .input(z.object({ email: emailSchema }))
    .mutation(async ({ ctx, input }) => {
      guardRate(ctx.req, "forgot-password", 5);
      if (!mailerReady())
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Password reset email is not configured. Please contact support.",
        });
      const db = await dbRequired();
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.emailNormalized, normalizeEmail(input.email)))
        .limit(1);
      if (rows[0]) {
        const token = await createOneTimeToken(rows[0].id, "password_reset");
        try {
          await sendAccountEmail(
            rows[0].email!,
            "Reset your KaziFlow password",
            "Reset your password",
            token,
            "/reset-password"
          );
        } catch (error) {
          console.error(
            "[Mail] Password reset could not be delivered:",
            error instanceof Error ? error.message : "unknown error"
          );
        }
      }
      return {
        accepted: true,
        message:
          "If the address belongs to an account, a reset link has been sent.",
      };
    }),

  resetPassword: publicProcedure
    .input(
      z.object({ token: z.string().min(20).max(128), password: passwordSchema })
    )
    .mutation(async ({ ctx, input }) => {
      guardRate(ctx.req, "reset-password", 5);
      const db = await dbRequired();
      const tokenHash = hashOpaqueToken(input.token);
      const rows = await db
        .select()
        .from(authTokens)
        .where(
          and(
            eq(authTokens.tokenHash, tokenHash),
            eq(authTokens.kind, "password_reset"),
            isNull(authTokens.usedAt),
            gt(authTokens.expiresAt, new Date())
          )
        )
        .limit(1);
      if (!rows[0])
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This reset link is invalid or expired.",
        });
      const passwordHash = await hashPassword(input.password);
      await db.transaction(async tx => {
        const locked = await tx
          .select()
          .from(authTokens)
          .where(eq(authTokens.id, rows[0]!.id))
          .limit(1)
          .for("update");
        if (!locked[0] || locked[0].usedAt || locked[0].expiresAt < new Date())
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This reset link is invalid or expired.",
          });
        await tx
          .update(authTokens)
          .set({ usedAt: new Date() })
          .where(eq(authTokens.id, locked[0].id));
        await tx
          .update(users)
          .set({
            passwordHash,
            sessionVersion: sql`${users.sessionVersion} + 1`,
          })
          .where(eq(users.id, locked[0].userId));
      });
      return { success: true };
    }),

  verifyEmail: publicProcedure
    .input(z.object({ token: z.string().min(20).max(128) }))
    .mutation(async ({ input }) => {
      const db = await dbRequired();
      const rows = await db
        .select()
        .from(authTokens)
        .where(
          and(
            eq(authTokens.tokenHash, hashOpaqueToken(input.token)),
            eq(authTokens.kind, "email_verify"),
            isNull(authTokens.usedAt),
            gt(authTokens.expiresAt, new Date())
          )
        )
        .limit(1);
      if (!rows[0])
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This verification link is invalid or expired.",
        });
      await db.transaction(async tx => {
        const locked = await tx
          .select()
          .from(authTokens)
          .where(eq(authTokens.id, rows[0]!.id))
          .limit(1)
          .for("update");
        if (!locked[0] || locked[0].usedAt || locked[0].expiresAt < new Date())
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This verification link is invalid or expired.",
          });
        await tx
          .update(authTokens)
          .set({ usedAt: new Date() })
          .where(eq(authTokens.id, locked[0].id));
        await tx
          .update(users)
          .set({ emailVerifiedAt: new Date() })
          .where(eq(users.id, locked[0].userId));
      });
      return { success: true };
    }),

  resendVerification: protectedProcedure.mutation(async ({ ctx }) => {
    if (!mailerReady())
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Email verification is not configured.",
      });
    if (!ctx.user.email || ctx.user.emailVerifiedAt) return { accepted: true };
    const token = await createOneTimeToken(ctx.user.id, "email_verify");
    await sendAccountEmail(
      ctx.user.email,
      "Verify your KaziFlow email",
      "Confirm your email address",
      token,
      "/verify-email"
    );
    return { accepted: true };
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: validName,
        phone: z.string().trim().min(8).max(24),
        county: z.string().trim().min(2).max(100),
        mpesaPhone: z.string().trim().min(8).max(24),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let phone: string, mpesaPhone: string;
      try {
        phone = normalizeKenyanPhone(input.phone);
        mpesaPhone = normalizeKenyanPhone(input.mpesaPhone);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error ? error.message : "Invalid phone number.",
        });
      }
      const db = await dbRequired();
      await db
        .update(users)
        .set({
          name: input.name.trim(),
          phone,
          county: input.county.trim(),
          mpesaPhone,
        })
        .where(eq(users.id, ctx.user.id));
      const updated = await db
        .select()
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);
      if (!updated[0])
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found.",
        });
      return publicUser(updated[0]);
    }),

  bootstrapAdmin: publicProcedure
    .input(
      z.object({
        name: validName,
        email: emailSchema,
        phone: z.string().trim().min(8).max(24),
        county: z.string().trim().min(2).max(100),
        password: passwordSchema,
        setupToken: z.string().min(20).max(256),
      })
    )
    .mutation(async ({ ctx, input }) => {
      guardRate(ctx.req, "admin-bootstrap", 3);
      const expected = process.env.KAZIFLOW_ADMIN_BOOTSTRAP_TOKEN;
      const primaryEmail = adminEmail();
      if (!primaryEmail || normalizeEmail(input.email) !== primaryEmail)
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Use the configured primary administrator email for initial setup.",
        });
      if (!expected || !verifySecret(input.setupToken, expected))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Secure administrator setup is not available.",
        });
      if (!sessionReady())
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "The application session secret is not configured.",
        });
      const db = await dbRequired();
      let superAdmin: typeof users.$inferSelect | undefined;
      try {
        await db.transaction(async tx => {
          await tx
            .insert(appSettings)
            .values({
              settingKey: "primary_super_admin_bootstrapped",
              valueText: "reserved",
              updatedById: null,
            });
          const existing = await tx
            .select({ id: users.id })
            .from(users)
            .where(
              or(
                eq(users.role, "super_admin"),
                eq(users.emailNormalized, primaryEmail)
              )
            )
            .limit(1)
            .for("update");
          if (existing.length)
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "The configured administrator email or primary administrator account is already in use.",
            });
          const createdAdmin = await createAccount(
            { ...input, accountType: "member" },
            tx,
            "super_admin"
          );
          superAdmin = createdAdmin;
          await tx
            .update(appSettings)
            .set({ valueText: "complete", updatedById: createdAdmin.id })
            .where(
              eq(appSettings.settingKey, "primary_super_admin_bootstrapped")
            );
        });
      } catch (error) {
        if ((error as { code?: string })?.code === "ER_DUP_ENTRY")
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Initial super-administrator setup has already been completed.",
          });
        throw error;
      }
      if (!superAdmin)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Administrator account creation failed.",
        });
      return mintSession(ctx, superAdmin);
    }),

  adminSetupStatus: publicProcedure.query(async () => {
    if (
      !adminEmail() ||
      !process.env.KAZIFLOW_ADMIN_BOOTSTRAP_TOKEN ||
      !sessionReady()
    )
      return {
        available: false,
        adminEmailConfigured: Boolean(adminEmail()),
        sessionReady: sessionReady(),
      };
    const db = await getDb();
    if (!db)
      return {
        available: false,
        adminEmailConfigured: true,
        sessionReady: sessionReady(),
      };
    const [marker, existing] = await Promise.all([
      db
        .select({ settingKey: appSettings.settingKey })
        .from(appSettings)
        .where(eq(appSettings.settingKey, "primary_super_admin_bootstrapped"))
        .limit(1),
      db
        .select({ id: users.id })
        .from(users)
        .where(
          or(
            eq(users.role, "super_admin"),
            eq(users.emailNormalized, adminEmail())
          )
        )
        .limit(1),
    ]);
    return {
      available: marker.length === 0 && existing.length === 0,
      adminEmailConfigured: true,
      sessionReady: sessionReady(),
    };
  }),
});
