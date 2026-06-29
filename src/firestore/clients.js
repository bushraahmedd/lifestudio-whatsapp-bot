const { db, FieldValue } = require("../firebase/admin");

function clientDocId(name, phone) {
  const normalizedPhone = (phone || "").replace(/\D/g, "");
  if (normalizedPhone) return normalizedPhone;
  return `name_${(name || "").trim().toLowerCase().replace(/\s+/g, "_")}`;
}

async function upsertClientFromSession({ clientName, clientPhone, date, location, sessionId, source = "whatsapp" }) {
  const name = (clientName || "").trim();
  if (!name) return null;

  const id = clientDocId(name, clientPhone);
  const ref = db.collection("clients").doc(id);
  const snap = await ref.get();
  const existing = snap.exists ? snap.data() : {};

  const payload = {
    name,
    phone: clientPhone || existing.phone || "",
    normalizedPhone: (clientPhone || "").replace(/\D/g, "") || existing.normalizedPhone || "",
    lastSessionDate: date || existing.lastSessionDate || "",
    lastLocation: location || existing.lastLocation || "",
    source,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: existing.createdAt || FieldValue.serverTimestamp(),
  };

  if (sessionId) {
    payload.sessionIds = FieldValue.arrayUnion(sessionId);
  }

  await ref.set(payload, { merge: true });
  return id;
}

module.exports = { upsertClientFromSession, clientDocId };
