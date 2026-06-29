const express = require("express");
const cors = require("cors");
const config = require("./config");
const { getFirebaseStatus } = require("./firebase/admin");
const { mountApiRoutes } = require("./bootstrap");

process.on("uncaughtException", (err) => {
  console.error("uncaughtException (keeping HTTP alive):", err);
});
process.on("unhandledRejection", (err) => {
  console.error("unhandledRejection (keeping HTTP alive):", err);
});

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "live-studio-whatsapp-bot",
    firebase: getFirebaseStatus(),
  });
});

app.get("/", (req, res) => {
  res.json({
    service: "live-studio-whatsapp-bot",
    provider: config.whatsappProvider,
    docs: "/api/health",
    status: "/api/status",
  });
});

mountApiRoutes(app);

async function main() {
  console.log("Starting Live Studio WhatsApp Bot...");
  console.log("Project:", config.firebaseProjectId);
  console.log("Provider:", config.whatsappProvider);
  console.log("Port:", config.port);
  console.log("Lazy WhatsApp start:", process.env.WHATSAPP_LAZY_START !== "false");

  app.listen(config.port, "0.0.0.0", () => {
    console.log(`HTTP API on 0.0.0.0:${config.port}`);
    console.log(`Health: http://localhost:${config.port}/api/health`);
  });

  if (process.env.WHATSAPP_LAZY_START === "false") {
    const { ensureWhatsAppStarted } = require("./bootstrap");
    ensureWhatsAppStarted().catch((err) => {
      console.error("WhatsApp auto-start failed (HTTP still up):", err.message);
    });
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
