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

app.get("/api/health", async (req, res) => {
  let ollama = { enabled: config.ollama.enabled, ok: false };
  try {
    const { checkOllamaHealth } = require("./ai/whatsappAgent");
    ollama = { enabled: config.ollama.enabled, ...(await checkOllamaHealth()) };
  } catch (err) {
    ollama = { enabled: config.ollama.enabled, ok: false, reason: err.message };
  }
  res.json({
    ok: true,
    service: "live-studio-whatsapp-bot",
    firebase: getFirebaseStatus(),
    ollama,
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
  console.log(
    "Ollama:",
    config.ollama.enabled
      ? `${config.ollama.model} @ ${config.ollama.baseUrl}${config.ollama.apiKey ? " (api key set)" : ""}`
      : "disabled"
  );

  if (config.ollama.enabled) {
    const { checkOllamaHealth } = require("./ai/whatsappAgent");
    const health = await checkOllamaHealth();
    if (health.ok) {
      console.log("Ollama: reachable ✅");
    } else if (!config.ollama.apiKey && /ollama\.com/i.test(config.ollama.baseUrl)) {
      console.warn(
        "Ollama Cloud: set OLLAMA_API_KEY from https://ollama.com/settings/keys — until then keyword replies are used."
      );
    } else {
      console.warn(
        "Ollama: unreachable — bot will use keyword replies.",
        config.ollama.baseUrl
      );
    }
  }

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
