const express = require("express");
const cors = require("cors");
const config = require("./config");
const { getFirebaseStatus } = require("./firebase/admin");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Health check without loading Firestore / Baileys (Render needs this fast)
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
  });
});

async function main() {
  console.log("Starting Live Studio WhatsApp Bot...");
  console.log("Project:", config.firebaseProjectId);
  console.log("Provider:", config.whatsappProvider);
  console.log("Port:", config.port);

  app.listen(config.port, () => {
    console.log(`HTTP API on port ${config.port}`);
    console.log(`Health: http://localhost:${config.port}/api/health`);
  });

  try {
    const { mountApiRoutes, startServices } = require("./bootstrap");
    mountApiRoutes(app);
    await startServices();
  } catch (err) {
    console.error("Bot services failed to start (HTTP /api/health still up):", err.message);
    if (err.message.includes("Firebase credentials")) {
      console.error(
        "Render fix: Environment → add FIREBASE_SERVICE_ACCOUNT_JSON (run: npm run print-sa-env) or FIREBASE_SERVICE_ACCOUNT_B64"
      );
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
