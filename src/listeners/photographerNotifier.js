const fb = require("../firebase/admin");

const APP_URL = process.env.APP_URL || "https://lifestudio-abf4b.web.app";

async function getPhotographerPhones(photographerIds) {
  const phones = [];
  for (const pid of photographerIds || []) {
    const snap = await fb.db.collection("users").doc(String(pid)).get();
    if (!snap.exists) continue;
    const data = snap.data();
    const phone = (data.phone || "").replace(/\D/g, "");
    if (phone) phones.push({ id: pid, name: data.name || "مصور", phone });
  }
  return phones;
}

function buildPhotographerMissionMessage(session) {
  return (
    `📸 *مهمة تصوير جديدة — لايف استوديو*\n\n` +
    `👤 *العميل:* ${session.clientName}\n` +
    `${session.clientPhone ? `📱 *هاتف:* ${session.clientPhone}\n` : ""}` +
    `📅 *التاريخ:* ${session.date}\n` +
    `⏰ *الوقت:* ${session.time || "—"}\n` +
    `📍 *الموقع:* ${session.location || "—"}\n\n` +
    `🔗 افتح التطبيق للقبول:\n${APP_URL}/`
  );
}

/**
 * When tentative WhatsApp booking is confirmed (status → in_progress + photographers),
 * notify each photographer via WhatsApp.
 */
function startPhotographerNotifier(sendText, phoneToChatId) {
  const prevById = new Map();

  fb.db.collection("sessions").onSnapshot((snap) => {
    snap.docChanges().forEach(async (change) => {
      const id = change.doc.id;
      const after = change.doc.data();

      if (change.type === "removed") {
        prevById.delete(id);
        return;
      }

      const before = prevById.get(id) || {};
      prevById.set(id, {
        status: after.status,
        photographers: [...(after.photographers || [])],
        notifiedPhotographers: [...(after.notifiedPhotographers || [])],
      });

      if (change.type === "added") {
        // Auto-notify if created with photographers (default assignment)
        if (
          after.status === "in_progress"
          && (after.photographers || []).length > 0
          && after.bookingSource === "whatsapp"
        ) {
          await notifyNewPhotographers(after, id, [], sendText, phoneToChatId);
        }
        return;
      }

      const wasTentative = before.status === "tentative";
      const nowActive = after.status === "in_progress";
      const photographersAdded = (after.photographers || []).length > (before.photographers || []).length;

      if ((wasTentative && nowActive) || (nowActive && photographersAdded)) {
        await notifyNewPhotographers(
          after,
          id,
          before.notifiedPhotographers || [],
          sendText,
          phoneToChatId
        );
      }
    });
  });
}

async function notifyNewPhotographers(session, sessionId, alreadyNotified, sendText, phoneToChatId) {
  const pids = session.photographers || [];
  const newPids = pids.filter((p) => !alreadyNotified.includes(p));
  if (!newPids.length) return;

  const photographers = await getPhotographerPhones(newPids);
  const message = buildPhotographerMissionMessage(session);
  const sent = [...alreadyNotified];

  for (const p of photographers) {
    try {
      await sendText(phoneToChatId(p.phone), message);
      sent.push(p.id);
      console.log(`[photographer-notify] Sent to ${p.name} (${p.phone})`);
    } catch (err) {
      console.error(`[photographer-notify] Failed for ${p.id}:`, err.message);
    }
  }

  if (sent.length > alreadyNotified.length) {
    await fb.db.collection("sessions").doc(sessionId).update({
      notifiedPhotographers: sent,
    });
  }
}

module.exports = {
  startPhotographerNotifier,
  getPhotographerPhones,
  buildPhotographerMissionMessage,
};
