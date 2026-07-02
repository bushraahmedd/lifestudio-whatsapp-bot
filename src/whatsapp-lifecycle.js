const { ensureFirebase } = require("./firebase/admin");

let startPromise = null;

async function writeBotStatus(patch) {
  try {
    ensureFirebase();
    const { updateBotStatus } = require("./firestore/botState");
    await updateBotStatus(patch);
  } catch (err) {
    console.error("writeBotStatus failed:", err.message);
  }
}

async function ensureWhatsAppStarted() {
  if (startPromise) return startPromise;

  startPromise = (async () => {
    console.log("Starting WhatsApp services...");
    await writeBotStatus({
      connected: false,
      qrCode: null,
      message: "جاري تشغيل واتساب...",
    });
    ensureFirebase();
    const { startBot, getProvider } = require("./bot");
    await startBot();
    const { sendText, phoneToChatId } = getProvider();
    const { startWorkflowNotifier } = require("./listeners/workflowNotifier");
    const { startPhotographerNotifier } = require("./listeners/photographerNotifier");
    startWorkflowNotifier(sendText, phoneToChatId);
    startPhotographerNotifier(sendText, phoneToChatId);
    console.log("WhatsApp services running");
  })().catch(async (err) => {
    startPromise = null;
    console.error("WhatsApp start failed:", err.message);
    await writeBotStatus({
      connected: false,
      qrCode: null,
      phoneNumber: null,
      message: `فشل تشغيل واتساب: ${err.message}`,
    });
    throw err;
  });

  return startPromise;
}

function resetWhatsAppState() {
  startPromise = null;
}

async function reconnectWhatsApp() {
  resetWhatsAppState();
  await writeBotStatus({
    connected: false,
    qrCode: null,
    phoneNumber: null,
    provider: "baileys",
    message: "جاري إنشاء رمز QR جديد...",
  });
  ensureFirebase();
  const { restartBot, getProvider } = require("./bot");
  await restartBot();
  const { sendText, phoneToChatId } = getProvider();
  const { startWorkflowNotifier } = require("./listeners/workflowNotifier");
  const { startPhotographerNotifier } = require("./listeners/photographerNotifier");
  startWorkflowNotifier(sendText, phoneToChatId);
  startPhotographerNotifier(sendText, phoneToChatId);
}

module.exports = { ensureWhatsAppStarted, reconnectWhatsApp };
