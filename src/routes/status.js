const express = require("express");
const cors = require("cors");
const { getBotStatus } = require("../firestore/botState");
const { ensureWhatsAppStarted, reconnectWhatsApp } = require("../bootstrap");
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
    let remote = { connected: false, qrCode: null, message: "جاري التحميل..." };
    try {
      remote = await withTimeout(getBotStatus(), 5000, "Firestore");
    } catch (err) {
      remote = {
        connected: false,
        qrCode: null,
        message: err.message.includes("timeout") ? "جاري التحميل..." : `Firebase: ${err.message}`,
      };
    }

    const message = remote.message
      || (remote.connected ? "متصل" : "جاري توليد رمز QR... انتظر ثم حدّث");

    res.json({
      connected: !!remote.connected,
      qrCode: remote.qrCode || null,
      phoneNumber: remote.phoneNumber || null,
      provider: remote.provider || null,
      message,
      updatedAt: remote.updatedAt || null,
    });

    // Start WhatsApp AFTER responding — avoids blocking / timing out the admin app
    if (lazyStart) {
      setImmediate(() => {
        ensureWhatsAppStarted().catch((err) => {
          console.error("[status] WhatsApp start:", err.message);
        });
      });
    }
  });

  router.post("/reconnect", async (req, res) => {
    res.json({ ok: true, message: "جاري إنشاء رمز QR جديد..." });
    setImmediate(() => {
      reconnectWhatsApp().catch((err) => {
        console.error("[reconnect] failed:", err.message);
      });
    });
  });

  return router;
}

module.exports = { createStatusRouter };
