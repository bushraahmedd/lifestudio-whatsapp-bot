const { db, FieldValue, Timestamp } = require("../firebase/admin");
const config = require("../config");

const BOT_STATUS_DOC = "whatsapp_bot/status";

async function updateBotStatus(patch) {
  await db.doc(BOT_STATUS_DOC).set(
    { ...patch, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

async function getBotStatus() {
  const snap = await db.doc(BOT_STATUS_DOC).get();
  return snap.exists ? snap.data() : { connected: false, qrCode: null };
}

/** Per-chat conversation state */
async function getChatState(chatId) {
  const snap = await db.collection("whatsapp_chats").doc(chatId).get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (data.expiresAt?.toDate?.() < new Date()) {
    await clearChatState(chatId);
    return null;
  }
  return data;
}

async function setChatState(chatId, state, data = {}) {
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 30 * 60 * 1000));
  await db.collection("whatsapp_chats").doc(chatId).set({
    state,
    data,
    expiresAt,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function clearChatState(chatId) {
  await db.collection("whatsapp_chats").doc(chatId).delete();
}

async function getBotConfig() {
  const snap = await db.doc("bot_config/settings").get();
  const defaults = {
    ownerPhone: config.ownerPhone,
    bank: config.bank,
    defaultPhotographerIds: [],
    packages: [
      { id: "wedding", label: "زفاف", price: 2500 },
      { id: "portrait", label: "بورتريه", price: 800 },
      { id: "event", label: "مناسبة", price: 1500 },
    ],
    greeting: "مرحباً بك في *لايف استوديو* للتصوير 📸",
  };
  return snap.exists ? { ...defaults, ...snap.data() } : defaults;
}

async function logWhatsAppEvent({ chatId, phone, direction, message, meta = {} }) {
  await db.collection("whatsapp_logs").add({
    chatId,
    phone: phone || null,
    direction,
    message: (message || "").slice(0, 2000),
    meta,
    createdAt: FieldValue.serverTimestamp(),
  });
}

module.exports = {
  updateBotStatus,
  getBotStatus,
  getChatState,
  setChatState,
  clearChatState,
  getBotConfig,
  logWhatsAppEvent,
};
