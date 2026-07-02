const { startBot, restartBot, getProvider } = require("./bot");
const { createStatusRouter } = require("./routes/status");
const { startWorkflowNotifier } = require("./listeners/workflowNotifier");
const { startPhotographerNotifier } = require("./listeners/photographerNotifier");
const { ensureFirebase } = require("./firebase/admin");

let startPromise = null;
let started = false;

function mountApiRoutes(app) {
  app.use("/api", createStatusRouter());
}

async function ensureWhatsAppStarted() {
  if (started) return;
  if (startPromise) return startPromise;

  startPromise = (async () => {
    console.log("Starting WhatsApp services...");
    ensureFirebase();
    await startBot();
    const { sendText, phoneToChatId } = getProvider();
    startWorkflowNotifier(sendText, phoneToChatId);
    startPhotographerNotifier(sendText, phoneToChatId);
    const { getConnectionState } = require("./bot");
    console.log("WhatsApp bot started:", getConnectionState());
    started = true;
  })().catch((err) => {
    startPromise = null;
    console.error("WhatsApp start failed:", err.message);
    try {
      const { updateBotStatus } = require("./firestore/botState");
      updateBotStatus({
        connected: false,
        qrCode: null,
        message: `فشل تشغيل واتساب: ${err.message}`,
      }).catch(() => {});
    } catch {
      // ignore
    }
    throw err;
  });

  return startPromise;
}

function resetWhatsAppState() {
  started = false;
  startPromise = null;
}

async function reconnectWhatsApp() {
  resetWhatsAppState();
  ensureFirebase();
  await restartBot();
  const { sendText, phoneToChatId } = getProvider();
  startWorkflowNotifier(sendText, phoneToChatId);
  startPhotographerNotifier(sendText, phoneToChatId);
  started = true;
}

/** @deprecated use ensureWhatsAppStarted */
async function startServices() {
  return ensureWhatsAppStarted();
}

module.exports = { mountApiRoutes, ensureWhatsAppStarted, reconnectWhatsApp, startServices };
