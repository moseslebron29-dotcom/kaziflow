import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { eq } from "drizzle-orm";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { authenticatedUserFromRequest, createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { uploadedAssets } from "../../drizzle/schema";
import { getDb } from "../db";
import { storageGetSignedUrl } from "../storage";
import { processDarajaCallback } from "../payments";

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: "16mb" }));
  app.use(express.urlencoded({ limit: "16mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/evidence", async (req, res) => {
    try {
      const user = await authenticatedUserFromRequest(req);
      if (!user)
        return res.status(401).json({ error: "Sign in to access evidence." });
      const assetId = Number(req.query.id);
      if (!Number.isSafeInteger(assetId) || assetId <= 0)
        return res.status(400).json({ error: "Invalid evidence reference." });
      const db = await getDb();
      if (!db)
        return res
          .status(503)
          .json({ error: "Evidence service is unavailable." });
      const rows = await db
        .select()
        .from(uploadedAssets)
        .where(eq(uploadedAssets.id, assetId))
        .limit(1);
      const asset = rows[0];
      if (!asset || asset.purpose !== "evidence")
        return res.status(404).json({ error: "Evidence was not found." });
      const administrator = user.role === "admin" || user.role === "super_admin";
      if (!administrator && asset.userId !== user.id)
        return res
          .status(403)
          .json({ error: "You do not have access to this evidence." });
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(asset.contentType)
      )
        return res.status(415).json({ error: "Unsupported evidence type." });
      const signedUrl = await storageGetSignedUrl(asset.storageKey);
      const fileResponse = await fetch(signedUrl, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!fileResponse.ok)
        return res
          .status(502)
          .json({ error: "Evidence storage could not provide the file." });
      const content = Buffer.from(await fileResponse.arrayBuffer());
      if (!content.length || content.length > 3 * 1024 * 1024)
        return res
          .status(502)
          .json({ error: "Evidence file size is invalid." });
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
      console.error(
        "[Evidence] Private download failed:",
        error instanceof Error ? error.message : "unknown error"
      );
      return res.status(500).json({ error: "Evidence could not be loaded." });
    }
  });
  app.get("/api/platform/config.js", (_req, res) => {
    res
      .set("Cache-Control", "no-store")
      .type("application/javascript")
      .send(publicPlatformScript());
  });
  app.post("/api/daraja/callback", async (req, res) => {
    try {
      const result = await processDarajaCallback(req.body);
      if (!result.accepted)
        console.warn("[Daraja] Callback not accepted:", result.reason);
      res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    } catch (error) {
      console.error(
        "[Daraja] Callback processing failed:",
        error instanceof Error ? error.message : "unknown error"
      );
      // Responding acknowledges receipt; the durable payment row remains uncredited until verified.
      res
        .status(200)
        .json({ ResultCode: 0, ResultDesc: "Received for reconciliation" });
    }
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({ router: appRouter, createContext })
  );
  if (process.env.NODE_ENV === "development") await setupVite(app, server);
  else serveStatic(app);

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid PORT");
  server.on("error", error => {
    console.error("Server failed:", error.message);
    process.exit(1);
  });
  server.listen(port, "0.0.0.0", () =>
    console.log(`Server listening on port ${port}`)
  );
}

startServer().catch(error => {
  console.error(error);
  process.exit(1);
});
