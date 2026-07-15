const fb = require("../firebase/admin");
const { getDefaultPhotographerIds } = require("./photographers");
const { upsertClientFromSession } = require("./clients");

const ACTIVE_STATUSES = ["tentative", "in_progress", "completed"];

/**
 * Create tentative session from WhatsApp bot.
 * Auto-assigns default photographers from bot_config if configured.
 */
async function createTentativeSession({
  clientName,
  clientPhone,
  whatsappChatId,
  date,
  time,
  location,
  sessionType,
  packageLabel,
  note,
  photographerIds,
  paymentMethod,
}) {
  const defaultIds = photographerIds?.length ? photographerIds : await getDefaultPhotographerIds();
  const doc = {
    clientName,
    clientPhone: clientPhone || "",
    whatsappChatId: whatsappChatId || "",
    date,
    time,
    location: location || "غير محدد",
    photographers: defaultIds,
    note: note || `حجز واتساب — ${packageLabel || sessionType || "جلسة"}`,
    status: "tentative",
    bookingSource: "whatsapp",
    sessionType: sessionType || "general",
    packageLabel: packageLabel || "",
    paymentMethod: paymentMethod || "كاش",
    createdAt: fb.FieldValue.serverTimestamp(),
    confirmedBy: [],
    declinedBy: [],
    responses: {},
    workflowStage: "booked",
    notifiedPhotographers: [],
  };
  const ref = await fb.db.collection("sessions").add(doc);
  const session = { id: ref.id, ...doc };
  await upsertClientFromSession({
    clientName,
    clientPhone,
    date,
    location: doc.location,
    sessionId: ref.id,
    source: "whatsapp",
  });
  await fb.db.collection("logs").add({
    action: `حجز واتساب جديد: ${clientName} — ${date} ${time}`,
    adminName: "بوت واتساب",
    timestamp: new Date().toLocaleString("ar-LY"),
    createdAt: fb.FieldValue.serverTimestamp(),
  });
  return session;
}

async function assignPhotographersAndConfirm(sessionId, photographerIds) {
  if (!photographerIds?.length) {
    throw new Error("At least one photographer required");
  }
  await fb.db.collection("sessions").doc(sessionId).update({
    photographers: photographerIds,
    status: "in_progress",
    workflowStage: "confirmed",
    confirmedAt: fb.FieldValue.serverTimestamp(),
    updatedAt: fb.FieldValue.serverTimestamp(),
  });
  const snap = await fb.db.collection("sessions").doc(sessionId).get();
  return { id: sessionId, ...snap.data() };
}

async function getSessionsByPhone(phone, whatsappChatId) {
  const digits = (phone || "").replace(/\D/g, "");
  const snap = await fb.db.collection("sessions").get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => {
      if (whatsappChatId && s.whatsappChatId === whatsappChatId) return true;
      const p = (s.clientPhone || "").replace(/\D/g, "");
      if (!p || !digits) return false;
      return p === digits || p.endsWith(digits.slice(-9)) || digits.endsWith(p.slice(-9));
    })
    .filter((s) => ACTIVE_STATUSES.includes(s.status) || s.status === "cancelled")
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

async function cancelSession(sessionId, reason = "إلغاء عبر واتساب") {
  await fb.db.collection("sessions").doc(sessionId).update({
    status: "cancelled",
    cancelReason: reason,
    updatedAt: fb.FieldValue.serverTimestamp(),
  });
  const snap = await fb.db.collection("sessions").doc(sessionId).get();
  return { id: sessionId, ...snap.data() };
}

async function rescheduleSession(sessionId, date, time) {
  await fb.db.collection("sessions").doc(sessionId).update({
    date,
    time,
    status: "tentative",
    updatedAt: fb.FieldValue.serverTimestamp(),
  });
  const snap = await fb.db.collection("sessions").doc(sessionId).get();
  return { id: sessionId, ...snap.data() };
}

async function confirmSession(sessionId) {
  await fb.db.collection("sessions").doc(sessionId).update({
    status: "in_progress",
    updatedAt: fb.FieldValue.serverTimestamp(),
  });
}

async function setWorkflowStage(sessionId, stage, extra = {}) {
  await fb.db.collection("sessions").doc(sessionId).update({
    workflowStage: stage,
    ...extra,
    updatedAt: fb.FieldValue.serverTimestamp(),
  });
}

module.exports = {
  createTentativeSession,
  getSessionsByPhone,
  cancelSession,
  rescheduleSession,
  confirmSession,
  assignPhotographersAndConfirm,
  setWorkflowStage,
  ACTIVE_STATUSES,
};
