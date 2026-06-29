const express = require("express");
const cors = require("cors");
const { getConnectionState } = require("../bot");
const { getBotStatus } = require("../firestore/botState");
const config = require("../config");

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
    const local = getConnectionState();
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
    res.json({
      connected: local.connected || remote.connected,
      qrCode: local.qrCode || remote.qrCode || null,
      phoneNumber: local.phoneNumber || remote.phoneNumber || null,
      provider: local.provider || remote.provider || null,
      message: remote.message || (local.connected ? "متصل" : "غير متصل"),
      updatedAt: remote.updatedAt || null,
    });
  });

  return router;
}

module.exports = { createStatusRouter };
