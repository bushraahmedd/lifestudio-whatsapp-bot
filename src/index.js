const express = require("express");
const cors = require("cors");
const config = require("./config");
const { startBot, getConnectionState, getProvider } = require("./bot");
const { createStatusRouter } = require("./routes/status");
const { startWorkflowNotifier } = require("./listeners/workflowNotifier");
const { startPhotographerNotifier } = require("./listeners/photographerNotifier");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.use("/api", createStatusRouter());

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

  // Start HTTP first so Render health checks pass while Baileys connects
  app.listen(config.port, () => {
    console.log(`HTTP API on port ${config.port}`);
    console.log(`Health: http://localhost:${config.port}/api/health`);
  });

  try {
    await startBot();
    const { sendText, phoneToChatId } = getProvider();
    startWorkflowNotifier(sendText, phoneToChatId);
    startPhotographerNotifier(sendText, phoneToChatId);
    console.log("WhatsApp bot started:", getConnectionState());
  } catch (err) {
    console.error("WhatsApp bot start error (HTTP still up):", err);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
