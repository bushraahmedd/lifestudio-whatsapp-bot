let Client;
let LocalAuth;
let MessageMedia;
try {
  ({ Client, LocalAuth, MessageMedia } = require("whatsapp-web.js"));
} catch {
  throw new Error(
    "whatsapp-web.js is not installed. Run: npm install whatsapp-web.js (or use WHATSAPP_PROVIDER=baileys)"
  );
}
const qrcode = require("qrcode");
const config = require("../config");
const { updateBotStatus, logWhatsAppEvent, getBotConfig } = require("../firestore/botState");

/**
 * @param {function} onIncomingMessage
 * @returns {import('./provider').WhatsAppProvider}
 */
function createWebJsProvider(onIncomingMessage) {
  let client = null;
  let connectionState = { connected: false, qrCode: null, phoneNumber: null, provider: "webjs" };

  function phoneToChatId(phone) {
    return `${phone.replace(/\D/g, "")}@c.us`;
  }

  async function sendText(chatId, text) {
    if (!client || !connectionState.connected) {
      console.warn("[webjs] Cannot send — disconnected");
      return;
    }
    await client.sendMessage(chatId, text);
    await logWhatsAppEvent({ chatId, direction: "out", message: text });
  }

  async function sendDocument(chatId, buffer, fileName, options = {}) {
    if (!client || !connectionState.connected) {
      console.warn("[webjs] Cannot send document — disconnected");
      return;
    }
    const media = new MessageMedia(
      options.mimetype || "application/pdf",
      buffer.toString("base64"),
      fileName || "invoice.pdf"
    );
    await client.sendMessage(chatId, media, { caption: options.caption || "" });
    await logWhatsAppEvent({
      chatId,
      direction: "out",
      message: `[PDF] ${fileName}`,
      meta: { type: "document" },
    });
  }

  async function notifyOwner(text) {
    const botConfig = await getBotConfig();
    const phones = [...new Set(
      [config.ownerPhone, botConfig.ownerPhone, ...(botConfig.bossPhones || [])]
        .map((p) => (p || "").replace(/\D/g, ""))
        .filter(Boolean)
    )];
    for (const phone of phones) {
      try {
        await sendText(phoneToChatId(phone), text);
      } catch (err) {
        console.error("[webjs] notify boss failed:", phone, err.message);
      }
    }
  }

  function getConnectionState() {
    return { ...connectionState };
  }

  async function start() {
    client = new Client({
      authStrategy: new LocalAuth({ dataPath: config.sessionDataPath }),
      puppeteer: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      },
    });

    client.on("qr", async (qr) => {
      console.log("\n[webjs] Scan QR:\n");
      console.log(await qrcode.toString(qr, { type: "terminal", small: true }));
      const dataUrl = await qrcode.toDataURL(qr);
      connectionState = { connected: false, qrCode: dataUrl, phoneNumber: null, provider: "webjs" };
      await updateBotStatus({
        connected: false,
        qrCode: dataUrl,
        phoneNumber: null,
        provider: "webjs",
        message: "امسح رمز QR — whatsapp-web.js",
      });
    });

    client.on("ready", async () => {
      const phone = client.info?.wid?.user || "";
      connectionState = { connected: true, qrCode: null, phoneNumber: phone, provider: "webjs" };
      await updateBotStatus({
        connected: true,
        qrCode: null,
        phoneNumber: phone,
        provider: "webjs",
        message: "متصل (webjs)",
        lastConnectedAt: new Date().toISOString(),
      });
      console.log("[webjs] Ready:", phone);
    });

    client.on("disconnected", async (reason) => {
      connectionState = { connected: false, qrCode: null, phoneNumber: null, provider: "webjs" };
      await updateBotStatus({ connected: false, qrCode: null, provider: "webjs", message: `انقطع: ${reason}` });
    });

    client.on("message", async (msg) => {
      try {
        if (msg.fromMe || msg.isStatus) return;
        const chatId = msg.from;
        const phone = chatId.replace("@c.us", "").replace("@lid", "");
        const body = msg.body || "";
        const hasMedia = msg.hasMedia;
        await onIncomingMessage({
          chatId,
          phone,
          body: hasMedia && !body ? "[صورة مرفقة]" : body,
          hasMedia,
          send: (text) => sendText(chatId, text),
          sendDocument: (buf, name, opts) => sendDocument(chatId, buf, name, opts),
          notifyOwner,
        });
      } catch (err) {
        console.error("[webjs] message error:", err);
      }
    });

    await client.initialize();
  }

  return {
    name: "webjs",
    start,
    getConnectionState,
    sendText,
    sendDocument,
    phoneToChatId,
    notifyOwner,
  };
}

module.exports = { createWebJsProvider };
