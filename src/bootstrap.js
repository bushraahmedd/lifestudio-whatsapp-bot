const { startBot, getProvider } = require("./bot");
const { createStatusRouter } = require("./routes/status");
const { startWorkflowNotifier } = require("./listeners/workflowNotifier");
const { startPhotographerNotifier } = require("./listeners/photographerNotifier");
const { ensureFirebase } = require("./firebase/admin");

function mountApiRoutes(app) {
  app.use("/api", createStatusRouter());
}

async function startServices() {
  ensureFirebase();
  await startBot();
  const { sendText, phoneToChatId } = getProvider();
  startWorkflowNotifier(sendText, phoneToChatId);
  startPhotographerNotifier(sendText, phoneToChatId);
  const { getConnectionState } = require("./bot");
  console.log("WhatsApp bot started:", getConnectionState());
}

module.exports = { mountApiRoutes, startServices };
