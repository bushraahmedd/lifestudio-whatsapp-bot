/** WhatsApp JID / phone helpers — avoid storing LID as client phone */

function isLidJid(jid) {
  return !!jid && String(jid).endsWith("@lid");
}

function digitsFromJid(jid) {
  if (!jid) return "";
  const user = String(jid).split("@")[0].split(":")[0];
  return user.replace(/\D/g, "");
}

/**
 * True if digits look like a real phone, not a WhatsApp LID (anonymous id).
 */
function isValidClientPhone(digits) {
  const d = String(digits || "").replace(/\D/g, "");
  if (!d) return false;
  // LIDs are often 14–18 digit opaque ids
  if (d.length > 13) return false;
  if (d.length < 8) return false;
  // Libya
  if (/^218\d{9}$/.test(d)) return true;
  if (/^09\d{8}$/.test(d)) return true;
  if (/^9\d{8}$/.test(d)) return true;
  // General international length
  return d.length >= 10 && d.length <= 13;
}

function normalizeClientPhoneInput(text) {
  let d = String(text || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00218")) d = d.slice(2);
  if (/^09\d{8}$/.test(d)) d = `218${d.slice(1)}`;
  if (/^9\d{8}$/.test(d)) d = `218${d}`;
  if (d.startsWith("0") && d.length > 10) d = d.replace(/^0+/, "");
  return d;
}

/**
 * Resolve real phone digits from a Baileys message (not LID).
 * @param {object} msg
 * @param {Map<string,string>} [lidCache] lid JID -> phone digits
 */
function resolvePhoneFromBaileysMessage(msg, lidCache = new Map()) {
  const key = msg?.key || {};

  for (const pnJid of [key.senderPn, key.participantPn]) {
    if (pnJid) {
      const d = digitsFromJid(pnJid);
      if (isValidClientPhone(d)) return d;
    }
  }

  const chatId = key.remoteJid || "";

  if (isLidJid(chatId) && lidCache.has(chatId)) {
    const cached = lidCache.get(chatId);
    if (isValidClientPhone(cached)) return cached;
  }

  if (chatId.endsWith("@s.whatsapp.net") || chatId.endsWith("@c.us")) {
    const d = digitsFromJid(chatId);
    if (isValidClientPhone(d)) return d;
  }

  if (isLidJid(chatId)) return "";

  const fallback = digitsFromJid(chatId);
  return isValidClientPhone(fallback) ? fallback : "";
}

function cacheLidPhoneMapping(lidCache, lidJid, phoneJid) {
  if (!lidCache || !lidJid || !phoneJid) return;
  const digits = digitsFromJid(phoneJid);
  if (isValidClientPhone(digits)) {
    lidCache.set(lidJid, digits);
  }
}

module.exports = {
  isLidJid,
  digitsFromJid,
  isValidClientPhone,
  normalizeClientPhoneInput,
  resolvePhoneFromBaileysMessage,
  cacheLidPhoneMapping,
};
