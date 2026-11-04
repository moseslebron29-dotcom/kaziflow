import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { appSettings, referrals, users, wallets } from "../drizzle/schema";
import { getDb, isUniqueViolation, type Db } from "./db";
import { appSessionReady, createAppSession, clearAppSession, setAppSession } from "./_core/app-session";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { normalizeKenyanPhone, darajaReady } from "./daraja";
import { mailerReady, notify, sendEmail, templates } from "./mailer";
import { issueOtp, OtpError, verifyOtp, type OtpPurpose } from "./otp";
import { audit, hashPassword, limitRequest, normalizeEmail, publicUser, settingValue, verifyPassword, verifySecret } from "./security";
import { KENYA_COUNTIES } from "../shared/counties";

const emailSchema = z.string().trim().email().max(320);
const passwordSchema = z
  .string()
  .min(8, "Password must have at least 8 characters.")
  .max(128)
  .refine(v => /[A-Za-z]/.test(v) && /\d/.test(v), "Use at least one letter and one number.");
const validName = z.string().trim().min(2).max(120);
const countySchema = z
  .string()
  .trim()
  .refine(v => (KENYA_COUNTIES as readonly string[]).includes(v), "Choose your county from the list.");
const adminEmail = () => process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "";

const mintSession = async (ctx: { res: any }, user: typeof users.$inferSelect) => {
  setAppSession(ctx.res, await createAppSession(user.id, user.sessionVersion));
  return publicUser(user);
};
const dbRequired = async () => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Account services are temporarily unavailable." });
  return db;
};
const guardRate = (req: Parameters<typeof limitRequest>[0], action: string, maximum = 8, windowMs = 15 * 60_000) => {
  try {
    limitRequest(req, action, maximum, windowMs);
  } catch {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many attempts. Please wait and try again." });
  }
};
const requireSession = () => {
  if (!appSessionReady())
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Account sign-in is not configured yet. Please contact support." });
};
const otpTrpcError = (error: unknown): never => {
  if (error instanceof OtpError)
    throw new TRPCError({
      code: error.reason === "cooldown" || error.reason === "hourly_limit" ? "TOO_MANY_REQUESTS" : "BAD_REQUEST",
      message: error.message,
    });
  throw error;
};

/** Issues and emails a code. Mail failures are reported without revealing the code. */
async function sendCode(db: Db, user: typeof users.$inferSelect, purpose: OtpPurpose) {
  if (!mailerReady())
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Email delivery is not configured yet. Please contact support." });
  const code = await issueOtp(db, user.id, purpose).catch(otpTrpcError);
  const t = templates.otp(user.name ?? "", code, purpose);
  try {
    await sendEmail({ to: user.email!, userId: user.id, ...t });
  } catch (error) {
    console.error("[Mail] Code delivery failed:", error instanceof Error ? error.message : "unknown error");
    throw new TRPCError({ code: "BAD_GATEWAY", message: "We could not send the email right now. Please try again shortly." });
  }
}

async function createAccount(
  input: {
    name: string;
    email: string;
    phone: string;
    county: string;
    password: string;
    accountType: "member" | "advertiser";
    businessName?: string;
    referralCode?: string;
  },
  dbOverride?: any,
  role: "user" | "admin" | "super_admin" = "user"
) {
  const db = dbOverride ?? (await dbRequired());
  const emailNormalized = normalizeEmail(input.email);
  let phone: string;
  try {
    phone = normalizeKenyanPhone(input.phone);
  } catch (error) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid phone number." });
  }
  const exists = await db.select({ id: users.id }).from(users).where(eq(users.emailNormalized, emailNormalized)).limit(1);
  if (exists.length) throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists." });
  if (input.accountType === "member") {
    const phoneTaken = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.phone, phone), eq(users.accountType, "member")))
      .limit(1);
    if (phoneTaken.length) throw new TRPCError({ code: "CONFLICT", message: "This phone number is already registered to a member account." });
  }
  let referredById: number | null = null;
  if (input.referralCode && input.accountType === "member") {
    const referrer = await db
      .select({ id: users.id, emailNormalized: users.emailNormalized, phone: users.phone, mpesaPhone: users.mpesaPhone, accountType: users.accountType })
      .from(users)
      .where(eq(users.referralCode, input.referralCode.trim().toUpperCase()))
      .limit(1);
    const r = referrer[0];
    if (r && (r.emailNormalized === emailNormalized || r.phone === phone || r.mpesaPhone === phone))
      throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot refer yourself." });
    if (r && r.accountType === "member") referredById = r.id;
  }
  const passHash = await hashPassword(input.password);
  const inserted = await db
    .insert(users)
    .values({
      openId: randomBytes(20).toString("hex"),
      name: input.name.trim(),
      email: input.email.trim(),
      emailNormalized,
      loginMethod: "password",
      role,
      accountType: input.accountType,
      phone,
      county: input.county.trim(),
      businessName: input.businessName?.trim() || null,
      passwordHash: passHash,
      sessionVersion: 0,
      mpesaPhone: phone,
      referralCode: randomBytes(4).toString("hex").toUpperCase(),
      referredById,
    })
    .returning();
  const created = inserted[0];
  if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Account creation failed. Please try again." });
  await db.insert(wallets).values({ userId: created.id, availableMinor: 0, pendingMinor: 0, lifetimeMinor: 0 });
  if (referredById) await db.insert(referrals).values({ referrerId: referredById, referredUserId: created.id, commissionMinor: 0, status: "pending" });
  return created as typeof users.$inferSelect;
}

const findByEmail = async (db: Db, email: string) =>
  (await db.select().from(users).where(eq(users.emailNormalized, normalizeEmail(email))).limit(1))[0];

export const authRouter = router({
  status: publicProcedure.query(async () => ({
    sessionReady: appSessionReady(),
    darajaReady: darajaReady(),
    mailerReady: mailerReady(),
    activationFeeKes: Math.max(1, Number(await settingValue("activationFeeMinor", "10000")) / 100 || 100),
    announcement: await settingValue("announcement", ""),
  })),

  me: publicProcedure.query(({ ctx }) => (ctx.user ? publicUser(ctx.user) : null)),

  register: publicProcedure
    .input(
      z.object({
        name: validName,
        email: emailSchema,
        phone: z.string().trim().min(8).max(24),
        county: countySchema,
        password: passwordSchema,
        accountType: z.enum(["member", "advertiser"]).default("member"),
        businessName: z.string().trim().max(160).optional(),
        referralCode: z.string().trim().max(24).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      guardRate(ctx.req, "register", 5);
      requireSession();
      if (adminEmail() && normalizeEmail(input.email) === adminEmail())
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This email is reserved for secure administrator setup." });
      if (input.accountType === "advertiser" && !input.businessName?.trim())
        throw new TRPCError({ code: "BAD_REQUEST", message: "Enter your business or brand name." });
      let user: typeof users.$inferSelect;
      try {
        user = await createAccount(input);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (isUniqueViolation(error)) throw new TRPCError({ code: "CONFLICT", message: "An account with these details already exists." });
        throw error;
      }
      const db = await dbRequired();
      let codeSent = false;
      try {
        await sendCode(db, user, "email_verify");
        codeSent = true;
      } catch (error) {
        console.error("[Auth] Verification code not sent at registration:", error instanceof Error ? error.message : "unknown");
      }
      await audit(user.id, "account_registered", "user", user.id, { accountType: user.accountType, referred: Boolean(user.referredById) });
      return { user: await mintSession(ctx, user), codeSent };
    }),

  login: publicProcedure
    .input(z.object({ email: emailSchema, password: z.string().min(1).max(128) }))
    .mutation(async ({ ctx, input }) => {
      guardRate(ctx.req, "login", 10);
      requireSession();
      const db = await dbRequired();
      const user = await findByEmail(db, input.email);
      const valid = await verifyPassword(input.password, user?.passwordHash ?? null);
      if (!user || !valid || user.suspendedAt)
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Email or password is incorrect, or the account is unavailable." });
      await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
      return mintSession(ctx, { ...user, lastSignedIn: new Date() });
    }),

  adminLogin: publicProcedure
    .input(z.object({ email: emailSchema, password: z.string().min(1).max(128) }))
    .mutation(async ({ ctx, input }) => {
      guardRate(ctx.req, "admin-login", 8);
      requireSession();
      const db = await dbRequired();
      const user = await findByEmail(db, input.email);
      const valid = await verifyPassword(input.password, user?.passwordHash ?? null);
      const roleAllowed = user?.role === "admin" || (user?.role === "super_admin" && adminEmail() === user.emailNormalized);
      if (!user || !roleAllowed || !valid || user.suspendedAt)
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Administrator email or password is incorrect, or the account is unavailable." });
      await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
      await audit(user.id, "admin_signed_in", "user", user.id);
      return mintSession(ctx, { ...user, lastSignedIn: new Date() });
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    clearAppSession(ctx.res);
    return { success: true };
  }),

  /** Resend the six-digit email verification code (60-second cooldown). */
  sendVerificationCode: protectedProcedure.mutation(async ({ ctx }) => {
    guardRate(ctx.req, `otp-send:${ctx.user.id}`, 8, 60 * 60_000);
    if (ctx.user.emailVerifiedAt) return { sent: false, alreadyVerified: true };
    const db = await dbRequired();
    await sendCode(db, ctx.user, "email_verify");
    return { sent: true, alreadyVerified: false };
  }),

  verifyEmailCode: protectedProcedure.input(z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the six-digit code.") })).mutation(async ({ ctx, input }) => {
    guardRate(ctx.req, `otp-verify:${ctx.user.id}`, 20);
    if (ctx.user.emailVerifiedAt) return { verified: true };
    const db = await dbRequired();
    const result = await verifyOtp(db, ctx.user.id, "email_verify", input.code).catch(otpTrpcError);
    if (!result.ok)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: result.attemptsLeft > 0 ? `That code is not correct. ${result.attemptsLeft} attempt(s) left.` : "Too many wrong attempts. Request a new code.",
      });
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, ctx.user.id));
    await audit(ctx.user.id, "email_verified", "user", ctx.user.id);
    if (ctx.user.email) notify({ to: ctx.user.email, userId: ctx.user.id, ...templates.welcome(ctx.user.name ?? "") });
    return { verified: true };
  }),

  forgotPassword: publicProcedure.input(z.object({ email: emailSchema })).mutation(async ({ ctx, input }) => {
    guardRate(ctx.req, "forgot-password", 5);
    if (!mailerReady())
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Password reset email is not configured. Please contact support." });
    const db = await dbRequired();
    const user = await findByEmail(db, input.email);
    if (user && !user.suspendedAt) {
      try {
        await sendCode(db, user, "password_reset");
      } catch (error) {
        // Same response either way so the form never reveals whether an email is registered.
        if (!(error instanceof TRPCError && error.code === "TOO_MANY_REQUESTS"))
          console.error("[Auth] Reset code not sent:", error instanceof Error ? error.message : "unknown");
      }
    }
    return { accepted: true, message: "If the email belongs to an account, we have sent a six-digit reset code." };
  }),

  resetPassword: publicProcedure
    .input(z.object({ email: emailSchema, code: z.string().trim().regex(/^\d{6}$/, "Enter the six-digit code."), password: passwordSchema }))
    .mutation(async ({ ctx, input }) => {
      guardRate(ctx.req, "reset-password", 10);
      const db = await dbRequired();
      const user = await findByEmail(db, input.email);
      if (!user) throw new TRPCError({ code: "BAD_REQUEST", message: "This code is invalid or expired." });
      const result = await verifyOtp(db, user.id, "password_reset", input.code).catch(otpTrpcError);
      if (!result.ok)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.attemptsLeft > 0 ? `That code is not correct. ${result.attemptsLeft} attempt(s) left.` : "Too many wrong attempts. Request a new code.",
        });
      const passwordHash = await hashPassword(input.password);
      // Reset proves inbox ownership, so it also verifies the email.
      await db
        .update(users)
        .set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1`, emailVerifiedAt: user.emailVerifiedAt ?? new Date() })
        .where(eq(users.id, user.id));
      await audit(user.id, "password_reset", "user", user.id);
      return { success: true };
    }),

  changePassword: protectedProcedure
    .input(z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema }))
    .mutation(async ({ ctx, input }) => {
      guardRate(ctx.req, `change-password:${ctx.user.id}`, 5);
      const ok = await verifyPassword(input.currentPassword, ctx.user.passwordHash ?? null);
      if (!ok) throw new TRPCError({ code: "BAD_REQUEST", message: "Your current password is not correct." });
      const db = await dbRequired();
      const passwordHash = await hashPassword(input.newPassword);
      const updated = await db
        .update(users)
        .set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1` })
        .where(eq(users.id, ctx.user.id))
        .returning();
      await audit(ctx.user.id, "password_changed", "user", ctx.user.id);
      return mintSession(ctx, updated[0]!);
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: validName,
        phone: z.string().trim().min(8).max(24),
        county: countySchema,
        mpesaPhone: z.string().trim().min(8).max(24),
        businessName: z.string().trim().max(160).optional(),
        marketingOptIn: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let phone: string, mpesaPhone: string;
      try {
        phone = normalizeKenyanPhone(input.phone);
        mpesaPhone = normalizeKenyanPhone(input.mpesaPhone);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid phone number." });
      }
      const db = await dbRequired();
      if (ctx.user.accountType === "member" && phone !== ctx.user.phone) {
        const taken = await db.select({ id: users.id }).from(users).where(and(eq(users.phone, phone), eq(users.accountType, "member"))).limit(1);
        if (taken.length && taken[0]!.id !== ctx.user.id)
          throw new TRPCError({ code: "CONFLICT", message: "This phone number is already registered to another member." });
      }
      const updated = await db
        .update(users)
        .set({
          name: input.name.trim(),
          phone,
          county: input.county.trim(),
          mpesaPhone,
          businessName: input.businessName?.trim() || ctx.user.businessName,
          marketingOptIn: input.marketingOptIn ?? ctx.user.marketingOptIn,
        })
        .where(eq(users.id, ctx.user.id))
        .returning();
      if (!updated[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found." });
      return publicUser(updated[0]);
    }),

  bootstrapAdmin: publicProcedure
    .input(
      z.object({
        name: validName,
        email: emailSchema,
        phone: z.string().trim().min(8).max(24),
        county: countySchema,
        password: passwordSchema,
        setupToken: z.string().min(20).max(256),
      })
    )
    .mutation(async ({ ctx, input }) => {
      guardRate(ctx.req, "admin-bootstrap", 3);
      const expected = process.env.KAZIFLOW_ADMIN_BOOTSTRAP_TOKEN;
      const primaryEmail = adminEmail();
      if (!primaryEmail || normalizeEmail(input.email) !== primaryEmail)
        throw new TRPCError({ code: "FORBIDDEN", message: "Use the configured primary administrator email for initial setup." });
      if (!expected || expected.length < 32 || !verifySecret(input.setupToken, expected))
        throw new TRPCError({ code: "FORBIDDEN", message: "Secure administrator setup is not available." });
      requireSession();
      const db = await dbRequired();
      let superAdmin: typeof users.$inferSelect | undefined;
      try {
        await db.transaction(async tx => {
          await tx.insert(appSettings).values({ settingKey: "primary_super_admin_bootstrapped", valueText: "reserved", updatedById: null });
          const existing = await tx
            .select({ id: users.id })
            .from(users)
            .where(or(eq(users.role, "super_admin"), eq(users.emailNormalized, primaryEmail)))
            .limit(1)
            .for("update");
          if (existing.length)
            throw new TRPCError({ code: "CONFLICT", message: "The primary administrator account already exists." });
          const createdAdmin = await createAccount({ ...input, accountType: "member" }, tx, "super_admin");
          await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, createdAdmin.id));
          superAdmin = { ...createdAdmin, emailVerifiedAt: new Date() };
          await tx
            .update(appSettings)
            .set({ valueText: "complete", updatedById: createdAdmin.id })
            .where(eq(appSettings.settingKey, "primary_super_admin_bootstrapped"));
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new TRPCError({ code: "CONFLICT", message: "Initial administrator setup has already been completed." });
        throw error;
      }
      if (!superAdmin) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Administrator account creation failed." });
      await audit(superAdmin.id, "super_admin_bootstrapped", "user", superAdmin.id);
      return mintSession(ctx, superAdmin);
    }),

  adminSetupStatus: publicProcedure.query(async () => {
    const tokenOk = (process.env.KAZIFLOW_ADMIN_BOOTSTRAP_TOKEN?.length ?? 0) >= 32;
    if (!adminEmail() || !tokenOk || !appSessionReady())
      return { available: false, adminEmailConfigured: Boolean(adminEmail()), sessionReady: appSessionReady() };
    const db = await getDb();
    if (!db) return { available: false, adminEmailConfigured: true, sessionReady: appSessionReady() };
    const [marker, existing] = await Promise.all([
      db.select({ settingKey: appSettings.settingKey }).from(appSettings).where(eq(appSettings.settingKey, "primary_super_admin_bootstrapped")).limit(1),
      db.select({ id: users.id }).from(users).where(or(eq(users.role, "super_admin"), eq(users.emailNormalized, adminEmail()))).limit(1),
    ]);
    return { available: marker.length === 0 && existing.length === 0, adminEmailConfigured: true, sessionReady: appSessionReady() };
  }),
});
