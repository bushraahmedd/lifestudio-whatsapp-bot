const { handleIncomingMessage } = require("./conversation/handlers");
const { createProvider } = require("./whatsapp/provider");

let provider = null;

function getProvider() {
  if (!provider) {
    provider = createProvider(handleIncomingMessage);
  }
  return provider;
}

async function startBot() {
  const p = getProvider();
  console.log(`Starting WhatsApp provider: ${p.name}`);
  await p.start();
}

async function restartBot() {
  const p = getProvider();
  if (typeof p.restart === "function") {
    console.log("Restarting WhatsApp provider...");
    await p.restart();
  } else {
    await p.start();
  }
}

function getConnectionState() {
  return getProvider().getConnectionState();
}

function sendText(chatId, text) {
  return getProvider().sendText(chatId, text);
}

function notifyOwner(text) {
  return getProvider().notifyOwner(text);
}

function phoneToChatId(phone) {
  return getProvider().phoneToChatId(phone);
}

module.exports = {
  startBot,
  restartBot,
  getConnectionState,
  sendText,
  notifyOwner,
  phoneToChatId,
  getProvider,
};
