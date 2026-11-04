import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { and, eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { authenticatedUserFromRequest, createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { uploadedAssets } from "../../drizzle/schema";
import { getDb } from "../db";
import { storageRead } from "../storage";
import { processDarajaCallback } from "../payments";
import { processB2cResult } from "../payouts";
import { callbackTokenValid } from "../daraja";
import { limitRequest } from "../security";
import { appSessionReady } from "./app-session";

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Render terminates TLS at its proxy; trust one hop so req.ip is the real client.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (process.env.NODE_ENV === "production")
      res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    next();
  });
  app.use(express.json({ limit: "16mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  app.get("/api/health", async (_req, res) => {
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ status: "no-database" });
      await db.execute(sql`select 1`);
      return res.json({ status: "ok", session: appSessionReady() });
    } catch {
      return res.status(503).json({ status: "database-unreachable" });
    }
  });

  // Public campaign and announcement media. Evidence is never served here.
  app.get(/^\/api\/media\/(.+)$/, async (req, res) => {
    try {
      const key = String(req.params[0] ?? "");
      const db = await getDb();
      if (!db) return res.status(503).end();
      const rows = await db
        .select()
        .from(uploadedAssets)
        .where(and(eq(uploadedAssets.storageKey, key), inArray(uploadedAssets.purpose, ["campaign", "announcement"])))
        .limit(1);
      const asset = rows[0];
      if (!asset) return res.status(404).json({ error: "Media not found." });
      const content = await storageRead(asset.storageKey);
      return res
        .status(200)
        .set({
          "Content-Type": asset.contentType,
          "Content-Length": String(content.length),
          "Cache-Control": "public, max-age=86400",
          "X-Content-Type-Options": "nosniff",
        })
        .send(content);
    } catch (error) {
      console.error("[Media] Read failed:", error instanceof Error ? error.message : "unknown error");
      return res.status(404).json({ error: "Media not available." });
    }
  });

  // Private evidence: only the uploader and administrators may download it.
  app.get("/api/evidence", async (req, res) => {
    try {
      const user = await authenticatedUserFromRequest(req);
      if (!user) return res.status(401).json({ error: "Sign in to access evidence." });
      const assetId = Number(req.query.id);
      if (!Number.isSafeInteger(assetId) || assetId <= 0)
        return res.status(400).json({ error: "Invalid evidence reference." });
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Evidence service is unavailable." });
      const rows = await db.select().from(uploadedAssets).where(eq(uploadedAssets.id, assetId)).limit(1);
      const asset = rows[0];
      if (!asset || asset.purpose !== "evidence") return res.status(404).json({ error: "Evidence was not found." });
      const administrator = user.role === "admin" || user.role === "super_admin";
      if (!administrator && asset.userId !== user.id)
        return res.status(403).json({ error: "You do not have access to this evidence." });
      if (!["image/jpeg", "image/png", "image/webp"].includes(asset.contentType))
        return res.status(415).json({ error: "Unsupported evidence type." });
      const content = await storageRead(asset.storageKey);
      return res
        .status(200)
        .set({
          "Content-Type": asset.contentType,
          "Content-Length": String(content.length),
          "Content-Disposition": "inline",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
        })
        .send(content);
    } catch (error) {
      console.error("[Evidence] Private download failed:", error instanceof Error ? error.message : "unknown error");
      return res.status(500).json({ error: "Evidence could not be loaded." });
    }
  });

  // Safaricom STK Push result. Credit happens only after server-side STK Query confirms it.
  app.post("/api/daraja/callback", async (req, res) => {
    try {
      if (!callbackTokenValid(req.query.token, process.env.NODE_ENV === "production")) {
        console.warn("[Daraja] Callback rejected: token mismatch");
        return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
      }
      const result = await processDarajaCallback(req.body);
      if (!result.accepted) console.warn("[Daraja] Callback not accepted:", result.reason);
      res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    } catch (error) {
      console.error("[Daraja] Callback processing failed:", error instanceof Error ? error.message : "unknown error");
      res.status(200).json({ ResultCode: 0, ResultDesc: "Received for reconciliation" });
    }
  });

  // Safaricom B2C payout result / timeout for withdrawals.
  app.post(["/api/daraja/b2c/result", "/api/daraja/b2c/timeout"], async (req, res) => {
    try {
      if (!callbackTokenValid(req.query.token, true)) {
        console.warn("[Daraja B2C] Result rejected: token mismatch");
        return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
      }
      const timeout = req.path.endsWith("/timeout");
      const result = await processB2cResult(req.body, timeout);
      if (!result.accepted) console.warn("[Daraja B2C] Result not accepted:", result.reason);
      res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    } catch (error) {
      console.error("[Daraja B2C] Result processing failed:", error instanceof Error ? error.message : "unknown error");
      res.status(200).json({ ResultCode: 0, ResultDesc: "Received for reconciliation" });
    }
  });

  // Coarse per-IP ceiling for the whole API on top of per-action limits.
  app.use("/api/trpc", (req, res, next) => {
    try {
      limitRequest(req, "api", 600, 60_000);
      next();
    } catch {
      res.status(429).json({ error: "Too many requests. Please slow down." });
    }
  });
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  if (process.env.NODE_ENV === "development") await setupVite(app, server);
  else serveStatic(app);

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", error => {
    console.error("Server failed:", error.message);
    process.exit(1);
  });
  if (!appSessionReady()) console.warn("[Config] KAZIFLOW_SESSION_SECRET is missing or shorter than 32 characters; sign-in is disabled.");
  server.listen(port, "0.0.0.0", () => console.log(`KaziFlow listening on port ${port}`));
}

startServer().catch(error => {
  console.error(error);
  process.exit(1);
});
