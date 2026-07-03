const fb = require("../firebase/admin");
const config = require("../config");

function pad(n) {
  return String(n).padStart(2, "0");
}

function toDateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function generateTimeSlots() {
  const { workStartHour, workEndHour, slotMinutes } = config.scheduling;
  const slots = [];
  for (let h = workStartHour; h < workEndHour; h++) {
    for (let m = 0; m < 60; m += slotMinutes) {
      slots.push(`${pad(h)}:${pad(m)}`);
    }
  }
  return slots;
}

function timesOverlap(t1, t2, durationMin) {
  const [h1, m1] = t1.split(":").map(Number);
  const [h2, m2] = t2.split(":").map(Number);
  const a1 = h1 * 60 + m1;
  const a2 = h2 * 60 + m2;
  const dur = durationMin || config.scheduling.sessionDurationMinutes;
  return Math.abs(a1 - a2) < dur;
}

/**
 * Load booked sessions for a date range (excludes cancelled).
 */
async function getBookedSessions(fromDate, toDate) {
  const snap = await fb.db
    .collection("sessions")
    .where("date", ">=", fromDate)
    .where("date", "<=", toDate)
    .get();

  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => s.status !== "cancelled");
}

/**
 * Returns [{ date, label, slots: [{ time, available }] }]
 */
async function getAvailability(daysAhead = config.scheduling.daysAhead) {
  const today = new Date();
  const allSlots = generateTimeSlots();
  const from = toDateKey(today);
  const end = new Date(today);
  end.setDate(end.getDate() + daysAhead);
  const to = toDateKey(end);

  const booked = await getBookedSessions(from, to);
  const byDate = {};
  booked.forEach((s) => {
    if (!byDate[s.date]) byDate[s.date] = [];
    byDate[s.date].push(s.time || "09:00");
  });

  const result = [];
  for (let i = 0; i <= daysAhead; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateKey = toDateKey(d);
    const taken = byDate[dateKey] || [];
    const slots = allSlots.map((time) => ({
      time,
      available: !taken.some((t) => timesOverlap(t, time, config.scheduling.sessionDurationMinutes)),
    }));
    const openCount = slots.filter((s) => s.available).length;
    if (openCount === 0) continue;
    result.push({
      date: dateKey,
      label: formatArabicDate(d),
      slots: slots.filter((s) => s.available),
    });
  }
  return result;
}

function formatArabicDate(d) {
  return d.toLocaleDateString("ar-LY", { weekday: "short", day: "numeric", month: "short" });
}

async function isSlotAvailable(date, time) {
  const booked = await getBookedSessions(date, date);
  return !booked.some(
    (s) => s.time && timesOverlap(s.time, time, config.scheduling.sessionDurationMinutes)
  );
}

/**
 * Returns open slots for one date (or empty slots array if fully booked).
 */
async function getAvailabilityForDate(dateKey) {
  const allSlots = generateTimeSlots();
  const booked = await getBookedSessions(dateKey, dateKey);
  const taken = booked.map((s) => s.time || "09:00");
  const slots = allSlots
    .map((time) => ({
      time,
      available: !taken.some((t) => timesOverlap(t, time, config.scheduling.sessionDurationMinutes)),
    }))
    .filter((s) => s.available);
  const d = new Date(`${dateKey}T12:00:00`);
  return {
    date: dateKey,
    label: formatArabicDate(d),
    slots,
  };
}

/**
 * Same day first, then nearby days with open slots.
 */
async function getNearbyAvailability(targetDate, radiusDays = 3) {
  const all = await getAvailability(config.scheduling.daysAhead);
  const sameDay = all.find((d) => d.date === targetDate);
  const ordered = [];
  if (sameDay?.slots?.length) ordered.push(sameDay);

  const target = new Date(`${targetDate}T12:00:00`);
  const rest = all
    .filter((d) => d.date !== targetDate)
    .map((d) => ({
      ...d,
      dist: Math.abs(new Date(`${d.date}T12:00:00`) - target),
    }))
    .sort((a, b) => a.dist - b.dist);

  for (const d of rest) {
    if (ordered.length >= radiusDays + 1) break;
    ordered.push(d);
  }
  return ordered.slice(0, 8);
}

function formatSlotsList(days) {
  if (!days.length) return "للأسف ما لقيناش مواعيد قريبة — تواصل مع الاستوديو مباشرة 🙏";
  return days
    .slice(0, 6)
    .map((d, i) => {
      const times = d.slots.slice(0, 6).map((s) => s.time).join("، ");
      return `*${i + 1}* — ${d.label} (${d.date})\n   ${times}`;
    })
    .join("\n\n");
}

module.exports = {
  getAvailability,
  getAvailabilityForDate,
  getNearbyAvailability,
  formatSlotsList,
  isSlotAvailable,
  getBookedSessions,
  toDateKey,
};
