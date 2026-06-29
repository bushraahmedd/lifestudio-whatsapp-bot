const config = require("../config");

/**
 * Unified WhatsApp provider interface.
 * @typedef {object} WhatsAppProvider
 * @property {() => Promise<void>} start
 * @property {() => object} getConnectionState
 * @property {(chatId: string, text: string) => Promise<void>} sendText
 * @property {(phone: string) => string} phoneToChatId
 * @property {(text: string) => Promise<void>} notifyOwner
 * @property {string} name
 */

function createProvider(onIncomingMessage) {
  const name = config.whatsappProvider === "webjs" ? "webjs" : "baileys";
  if (name === "webjs") {
    return require("./webjsProvider").createWebJsProvider(onIncomingMessage);
  }
  return require("./baileysProvider").createBaileysProvider(onIncomingMessage);
}

module.exports = { createProvider };
