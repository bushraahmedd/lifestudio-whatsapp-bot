const { db, FieldValue } = require("../firebase/admin");
const { getDefaultPhotographerIds } = require("./photographers");

const ACTIVE_STATUSES = ["tentative", "in_progress", "completed"];

/**
 * Create tentative session from WhatsApp bot.
 * Auto-assigns default photographers from bot_config if configured.
 */
async function createTentativeSession({
  clientName,
  clientPhone,
  date,
  time,
  location,
  sessionType,
  packageLabel,
  note,
  photographerIds,
}) {
  const defaultIds = photographerIds?.length ? photographerIds : await getDefaultPhotographerIds();
  const doc = {
    clientName,
    clientPhone: clientPhone || "",
    date,
    time,
    location: location || "غير محدد",
    photographers: defaultIds,
    note: note || `حجز واتساب — ${packageLabel || sessionType || "جلسة"}`,
    status: "tentative",
    bookingSource: "whatsapp",
    sessionType: sessionType || "general",
    packageLabel: packageLabel || "",
    createdAt: FieldValue.serverTimestamp(),
    confirmedBy: [],
    declinedBy: [],
    responses: {},
    workflowStage: "booked",
    notifiedPhotographers: [],
  };
  const ref = await db.collection("sessions").add(doc);
  return { id: ref.id, ...doc };
}

async function assignPhotographersAndConfirm(sessionId, photographerIds) {
  if (!photographerIds?.length) {
    throw new Error("At least one photographer required");
  }
  await db.collection("sessions").doc(sessionId).update({
    photographers: photographerIds,
    status: "in_progress",
    workflowStage: "confirmed",
    confirmedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const snap = await db.collection("sessions").doc(sessionId).get();
  return { id: sessionId, ...snap.data() };
}

async function getSessionsByPhone(phone) {
  const digits = phone.replace(/\D/g, "");
  const snap = await db.collection("sessions").get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => {
      const p = (s.clientPhone || "").replace(/\D/g, "");
      return p && (p === digits || p.endsWith(digits.slice(-9)) || digits.endsWith(p.slice(-9)));
    })
    .filter((s) => ACTIVE_STATUSES.includes(s.status) || s.status === "cancelled")
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

async function cancelSession(sessionId, reason = "إلغاء عبر واتساب") {
  await db.collection("sessions").doc(sessionId).update({
    status: "cancelled",
    cancelReason: reason,
    updatedAt: FieldValue.serverTimestamp(),
  });
  const snap = await db.collection("sessions").doc(sessionId).get();
  return { id: sessionId, ...snap.data() };
}

async function rescheduleSession(sessionId, date, time) {
  await db.collection("sessions").doc(sessionId).update({
    date,
    time,
    status: "tentative",
    updatedAt: FieldValue.serverTimestamp(),
  });
  const snap = await db.collection("sessions").doc(sessionId).get();
  return { id: sessionId, ...snap.data() };
}

async function confirmSession(sessionId) {
  await db.collection("sessions").doc(sessionId).update({
    status: "in_progress",
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function setWorkflowStage(sessionId, stage, extra = {}) {
  await db.collection("sessions").doc(sessionId).update({
    workflowStage: stage,
    ...extra,
    updatedAt: FieldValue.serverTimestamp(),
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
