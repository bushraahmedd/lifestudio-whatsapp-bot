const { toDateKey } = require("../firestore/availability");

const AR_MONTHS = {
  يناير: 1, فبراير: 2, مارس: 3, ابريل: 4, أبريل: 4, مايو: 5, يونيو: 6,
  يوليو: 7, اغسطس: 8, أغسطس: 8, سبتمبر: 9, اكتوبر: 10, أكتوبر: 10,
  نوفمبر: 11, ديسمبر: 12,
};

const WEEKDAYS = {
  الاحد: 0, الأحد: 0, الاثنين: 1, الثلاثاء: 2, الاربعاء: 3, الأربعاء: 3,
  الخميس: 4, الجمعة: 5, السبت: 6,
};

function pad(n) {
  return String(n).padStart(2, "0");
}

/** YYYY-MM-DD → DD/MM (clients never need the year) */
function formatDisplayDate(dateStr) {
  if (!dateStr) return "—";
  const m = String(dateStr).match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${pad(m[3])}/${pad(m[2])}`;
  const m2 = String(dateStr).match(/(\d{1,2})[\/\-.](\d{1,2})/);
  if (m2) return `${pad(m2[1])}/${pad(m2[2])}`;
  return String(dateStr);
}

function resolveYear(month, day) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let y = today.getFullYear();
  const cand = new Date(y, month - 1, day);
  if (cand < today) y += 1;
  return y;
}

function parseTime(text) {
  const t = (text || "").trim().toLowerCase();
  let m = t.match(/(\d{1,2})[:.](\d{2})/);
  if (m) return `${pad(m[1])}:${m[2]}`;

  m = t.match(/(\d{1,2})\s*(صباح|ص|am|pm|مساء|م)/i);
  if (m) {
    let h = parseInt(m[1], 10);
    const part = m[2];
    if (/مساء|م|pm/i.test(part) && h < 12) h += 12;
    if (/صباح|ص|am/i.test(part) && h === 12) h = 0;
    return `${pad(h)}:00`;
  }

  // Alone hour only if message looks like a time (with ساعة / الوقت)
  if (/ساعة|الوقت|موعد/.test(t)) {
    m = t.match(/\b(\d{1,2})\b/);
    if (m) {
      const h = parseInt(m[1], 10);
      if (h >= 0 && h <= 23) return `${pad(h)}:00`;
    }
  }
  return null;
}

function parseDate(text) {
  const raw = (text || "").trim();
  const t = raw.toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (/^(اليوم|today)/.test(t)) return toDateKey(today);
  if (/^(غدا|بكرا|غداً|بكرة|tomorrow)/.test(t)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return toDateKey(d);
  }

  // Full ISO
  let m = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;

  // DD/MM/YYYY or DD-MM-YYYY
  m = raw.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    // Prefer day/month (Libya): first number is day if ≤31
    const day = a;
    const month = b;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${pad(month)}-${pad(day)}`;
    }
  }

  // DD/MM or DD-MM — year NOT required
  m = raw.match(/(?:^|[^\d])(\d{1,2})[\/\-.](\d{1,2})(?:[^\d]|$)/);
  if (!m) m = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const y = resolveYear(month, day);
      return `${y}-${pad(month)}-${pad(day)}`;
    }
  }

  for (const [name, wd] of Object.entries(WEEKDAYS)) {
    if (t.includes(name)) {
      const d = new Date(today);
      const diff = (wd - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      return toDateKey(d);
    }
  }

  for (const [name, month] of Object.entries(AR_MONTHS)) {
    if (t.includes(name)) {
      const dm = t.match(/(\d{1,2})/);
      if (dm) {
        const day = parseInt(dm[1], 10);
        const y = resolveYear(month, day);
        return `${y}-${pad(month)}-${pad(day)}`;
      }
    }
  }

  return null;
}

/**
 * @returns {{ date: string|null, time: string|null }}
 */
function parseDateTime(text) {
  return { date: parseDate(text), time: parseTime(text) };
}

module.exports = { parseDate, parseTime, parseDateTime, formatDisplayDate };
