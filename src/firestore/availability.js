const { db } = require("../firebase/admin");
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
  const snap = await db
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

module.exports = {
  getAvailability,
  isSlotAvailable,
  getBookedSessions,
  toDateKey,
};
