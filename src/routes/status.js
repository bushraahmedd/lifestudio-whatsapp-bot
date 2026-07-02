const express = require("express");
const cors = require("cors");
const { getConnectionState } = require("../bot");
const { getBotStatus } = require("../firestore/botState");
const { ensureWhatsAppStarted } = require("../bootstrap");
const config = require("../config");

const lazyStart = process.env.WHATSAPP_LAZY_START !== "false";

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    }),
  ]);
}

function createStatusRouter() {
  const router = express.Router();

  router.get("/health", (req, res) => {
    res.json({ ok: true, service: "live-studio-whatsapp-bot" });
  });

  router.get("/ping", (req, res) => {
    res.json({ ok: true, pong: true });
  });

  router.use((req, res, next) => {
    const key = req.headers["x-api-key"] || req.query.apiKey;
    if (!config.apiKey || key === config.apiKey) return next();
    return res.status(401).json({ error: "Unauthorized" });
  });

  router.get("/status", async (req, res) => {
    // Any authenticated status poll (admin app) starts WhatsApp.
    // UptimeRobot should use /api/health only — it never hits this route.
    if (lazyStart) {
      ensureWhatsAppStarted().catch((err) => {
        console.error("[status] WhatsApp start:", err.message);
      });
    }

    let remote = { connected: false, qrCode: null };
    try {
      remote = await withTimeout(getBotStatus(), 8000, "Firestore");
    } catch (err) {
      remote = {
        connected: false,
        qrCode: null,
        message: err.message.includes("timeout") ? "جاري التحميل..." : `Firebase: ${err.message}`,
      };
    }

    let local = { connected: false, qrCode: null, phoneNumber: null, provider: null };
    try {
      local = getConnectionState();
    } catch {
      // provider not loaded yet
    }

    let message = remote.message
      || local.message
      || (local.connected || remote.connected ? "متصل" : "جاري توليد رمز QR... انتظر 10–30 ثانية");

    res.json({
      connected: local.connected || remote.connected,
      qrCode: local.qrCode || remote.qrCode || null,
      phoneNumber: local.phoneNumber || remote.phoneNumber || null,
      provider: local.provider || remote.provider || null,
      message,
      updatedAt: remote.updatedAt || null,
    });
  });

  return router;
}

module.exports = { createStatusRouter };
