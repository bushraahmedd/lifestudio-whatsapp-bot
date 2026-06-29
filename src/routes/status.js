const express = require("express");
const cors = require("cors");
const { getConnectionState } = require("../bot");
const { getBotStatus } = require("../firestore/botState");
const { ensureWhatsAppStarted } = require("../bootstrap");
const config = require("../config");

const lazyStart = process.env.WHATSAPP_LAZY_START !== "false";

function createStatusRouter() {
  const router = express.Router();

  router.get("/health", (req, res) => {
    res.json({ ok: true, service: "live-studio-whatsapp-bot" });
  });

  router.use((req, res, next) => {
    const key = req.headers["x-api-key"] || req.query.apiKey;
    if (!config.apiKey || key === config.apiKey) return next();
    return res.status(401).json({ error: "Unauthorized" });
  });

  router.get("/status", async (req, res) => {
    if (lazyStart) {
      ensureWhatsAppStarted().catch((err) => {
        console.error("[status] WhatsApp lazy start:", err.message);
      });
    }

    let remote = { connected: false, qrCode: null };
    try {
      remote = await getBotStatus();
    } catch (err) {
      remote = {
        connected: false,
        qrCode: null,
        message: `Firebase: ${err.message}`,
      };
    }

    let local = { connected: false, qrCode: null, phoneNumber: null, provider: null };
    if (!lazyStart) {
      try {
        local = getConnectionState();
      } catch {
        // bot not loaded yet
      }
    }

    res.json({
      connected: local.connected || remote.connected,
      qrCode: local.qrCode || remote.qrCode || null,
      phoneNumber: local.phoneNumber || remote.phoneNumber || null,
      provider: local.provider || remote.provider || null,
      message: remote.message || (local.connected ? "متصل" : lazyStart ? "جاري تشغيل البوت..." : "غير متصل"),
      updatedAt: remote.updatedAt || null,
    });
  });

  return router;
}

module.exports = { createStatusRouter };
