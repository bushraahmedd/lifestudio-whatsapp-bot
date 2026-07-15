const fb = require("../firebase/admin");

/**
 * Notify clients when admin updates workflowStage.
 */
function startWorkflowNotifier(sendText, phoneToChatId) {
  const prevStages = new Map();

  fb.db.collection("sessions").onSnapshot((snap) => {
    snap.docChanges().forEach(async (change) => {
      if (change.type === "removed") {
        prevStages.delete(change.doc.id);
        return;
      }
      const after = change.doc.data();
      const id = change.doc.id;
      const prev = prevStages.get(id);
      prevStages.set(id, after.workflowStage);

      if (change.type === "added") return;
      if (!after.clientPhone && !after.whatsappChatId) return;
      if (prev === after.workflowStage) return;
      if (!after.workflowStage) return;

      const labels = {
        editing: "🎨 جاري تعديل صور جلستك",
        ready: "✨ صورك جاهزة!",
        delivered: "🎁 تم تسليم جلستك",
      };
      const prefix = labels[after.workflowStage];
      if (!prefix) return;

      let text = `${prefix}\n📸 ${after.clientName}\n📅 ${after.date}`;
      if (after.workflowStage === "ready" && after.downloadUrl) {
        text += `\n\n🔗 رابط التحميل:\n${after.downloadUrl}`;
      }
      await sendText(after.whatsappChatId || phoneToChatId(after.clientPhone), text);
    });
  });
}

module.exports = { startWorkflowNotifier };
