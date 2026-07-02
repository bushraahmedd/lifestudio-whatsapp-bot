const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const fs = require("fs");
const qrcode = require("qrcode");
const pino = require("pino");
const config = require("../config");
const { updateBotStatus, logWhatsAppEvent, getBotConfig } = require("../firestore/botState");

function extractMessageText(msg) {
  const m = msg.message;
  if (!m) return "";
  return (
    m.conversation
    || m.extendedTextMessage?.text
    || m.imageMessage?.caption
    || m.documentMessage?.caption
    || ""
  );
}

function hasMediaMessage(msg) {
  const m = msg.message;
  if (!m) return false;
  return !!(m.imageMessage || m.documentMessage || m.videoMessage || m.audioMessage);
}

/**
 * @param {function} onIncomingMessage
 * @returns {import('./provider').WhatsAppProvider}
 */
function createBaileysProvider(onIncomingMessage) {
  let sock = null;
  let connectionState = { connected: false, qrCode: null, phoneNumber: null, provider: "baileys" };
  let starting = false;

  function phoneToChatId(phone) {
    const digits = phone.replace(/\D/g, "");
    return `${digits}@s.whatsapp.net`;
  }

  async function sendText(chatId, text) {
    if (!sock || !connectionState.connected) {
      console.warn("[baileys] Cannot send — disconnected");
      return;
    }
    const jid = chatId.includes("@") ? chatId : phoneToChatId(chatId);
    await sock.sendMessage(jid, { text });
    await logWhatsAppEvent({ chatId: jid, direction: "out", message: text });
  }

  async function sendDocument(chatId, buffer, fileName, options = {}) {
    if (!sock || !connectionState.connected) {
      console.warn("[baileys] Cannot send document — disconnected");
      return;
    }
    const jid = chatId.includes("@") ? chatId : phoneToChatId(chatId);
    await sock.sendMessage(jid, {
      document: buffer,
      mimetype: options.mimetype || "application/pdf",
      fileName: fileName || "invoice.pdf",
      caption: options.caption || "",
    });
    await logWhatsAppEvent({
      chatId: jid,
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
        console.error("[baileys] notify boss failed:", phone, err.message);
      }
    }
  }

  function getConnectionState() {
    return { ...connectionState };
  }

  function clearAuthDir() {
    try {
      fs.rmSync(config.baileysAuthPath, { recursive: true, force: true });
    } catch (err) {
      console.warn("[baileys] clear auth:", err.message);
    }
  }

  async function restart() {
    starting = false;
    if (sock) {
      try {
        sock.end(undefined);
      } catch {
        // ignore
      }
      sock = null;
    }
    clearAuthDir();
    connectionState = { connected: false, qrCode: null, phoneNumber: null, provider: "baileys" };
    await updateBotStatus({
      connected: false,
      qrCode: null,
      phoneNumber: null,
      provider: "baileys",
      message: "جاري توليد رمز QR جديد...",
    });
    await start();
  }

  async function start() {
    if (starting) return;
    starting = true;

    if (sock) {
      try {
        sock.end(undefined);
      } catch {
        // ignore
      }
      sock = null;
    }

    const { state, saveCreds } = await useMultiFileAuthState(config.baileysAuthPath);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
    });

    setTimeout(() => {
      if (starting && !connectionState.connected && !connectionState.qrCode) {
        console.warn("[baileys] no QR after 90s — retrying");
        starting = false;
        start().catch(console.error);
      }
    }, 90000);

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log("\n[baileys] Scan QR:\n");
        console.log(await qrcode.toString(qr, { type: "terminal", small: true }));
        const dataUrl = await qrcode.toDataURL(qr);
        connectionState = { connected: false, qrCode: dataUrl, phoneNumber: null, provider: "baileys" };
        await updateBotStatus({
          connected: false,
          qrCode: dataUrl,
          phoneNumber: null,
          provider: "baileys",
          message: "امسح رمز QR — Baileys",
        });
      }

      if (connection === "open") {
        const phone = (sock.user?.id || "").split(":")[0].split("@")[0];
        connectionState = { connected: true, qrCode: null, phoneNumber: phone, provider: "baileys" };
        await updateBotStatus({
          connected: true,
          qrCode: null,
          phoneNumber: phone,
          provider: "baileys",
          message: "متصل (Baileys)",
          lastConnectedAt: new Date().toISOString(),
        });
        console.log("[baileys] Ready:", phone);
        starting = false;
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        connectionState = { connected: false, qrCode: null, phoneNumber: null, provider: "baileys" };
        await updateBotStatus({
          connected: false,
          qrCode: null,
          provider: "baileys",
          message: loggedOut ? "تم تسجيل الخروج — امسح QR مجدداً" : "إعادة الاتصال...",
        });
        starting = false;
        if (loggedOut) {
          clearAuthDir();
          setTimeout(() => start().catch(console.error), 3000);
        } else {
          setTimeout(() => start().catch(console.error), 5000);
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        try {
          if (msg.key.fromMe) continue;
          if (!msg.key.remoteJid || msg.key.remoteJid === "status@broadcast") continue;

          const chatId = msg.key.remoteJid;
          const phone = chatId.split("@")[0];
          const body = extractMessageText(msg);
          const hasMedia = hasMediaMessage(msg);

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
          console.error("[baileys] message error:", err);
        }
      }
    });
  }

  return {
    name: "baileys",
    start,
    restart,
    getConnectionState,
    sendText,
    sendDocument,
    phoneToChatId,
    notifyOwner,
  };
}

module.exports = { createBaileysProvider };
