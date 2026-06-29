const express = require("express");
const cors = require("cors");
const { getConnectionState } = require("../bot");
const { getBotStatus } = require("../firestore/botState");
const config = require("../config");

function createStatusRouter() {
  const router = express.Router();

  router.use((req, res, next) => {
    const key = req.headers["x-api-key"] || req.query.apiKey;
    if (!config.apiKey || key === config.apiKey) return next();
    return res.status(401).json({ error: "Unauthorized" });
  });

  router.get("/status", async (req, res) => {
    const local = getConnectionState();
    const remote = await getBotStatus();
    res.json({
      connected: local.connected || remote.connected,
      qrCode: local.qrCode || remote.qrCode || null,
      phoneNumber: local.phoneNumber || remote.phoneNumber || null,
      provider: local.provider || remote.provider || null,
      message: remote.message || (local.connected ? "متصل" : "غير متصل"),
      updatedAt: remote.updatedAt || null,
    });
  });

  router.get("/health", (req, res) => {
    res.json({ ok: true, service: "live-studio-whatsapp-bot" });
  });

  return router;
}

module.exports = { createStatusRouter };
