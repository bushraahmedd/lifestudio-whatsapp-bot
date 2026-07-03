const { normalizeInput } = require("./stateMachine");
const { getPackages, getPackageById } = require("../firestore/packages");

/** Keywords that map to a specific package id */
const PACKAGE_KEYWORDS = {
  "wedding-in-studio-300": [
    "داخل الاستوديو", "داخل الاستديو", "صالة", "قاعة", "hall", "خطوبة", "صباحية", "20 صورة",
  ],
  "wedding-out-1-800": ["الباقة الاولى", "الباقة الأولى", "باقة 1", "800", "40 صورة"],
  "wedding-out-2-1000": ["الباقة الثانية", "باقة 2", "1000", "دخلة العروس"],
  "wedding-out-3-1700": ["الباقة الثالثة", "باقة 3", "1700", "بالسحب"],
  "wedding-out-4-2300": ["الباقة الرابعة", "باقة 4", "2300", "ألبوم"],
  "wedding-vip-3500": ["vip", "فيب", "3500"],
  "grad-in-12-200": ["12 صورة", "200"],
  "grad-in-15-250": ["15 صورة", "250"],
  "grad-out-20-350": ["خارج", "350", "20 صورة تخرج"],
  "grad-open-1200": ["مفتوحة", "مفتوحه", "1200"],
  "grad-promo-800": ["برومو تخرج", "برومو 800"],
  "birthday-15-250": ["عيد ميلاد", "ميلاد", "اطفال", "أطفال"],
  "family-10-200": ["عائلية", "عائلة", "عائلي"],
  "rental-floor-1500": ["اجار", "إيجار", "أرضية", "ارضية", "1500"],
};

const CATEGORY_KEYWORDS = {
  wedding: ["عرسان", "عرس", "زواج", "عروس", "فرح", "wedding", "bride"],
  hall: ["صالة", "قاعة", "داخل الاستوديو", "hall"],
  graduation: ["تخرج", "خريج", "خريجة", "graduation"],
  birthday: ["ميلاد", "عيد", "birthday"],
};

function scorePackage(text, pkg) {
  const t = normalizeInput(text);
  let score = 0;
  const keys = PACKAGE_KEYWORDS[pkg.id] || [];
  for (const k of keys) {
    if (t.includes(normalizeInput(k))) score += 2;
  }
  if (t.includes(normalizeInput(pkg.label))) score += 3;
  if (pkg.description && t.includes(normalizeInput(pkg.description))) score += 2;
  if (pkg.price && t.includes(String(pkg.price))) score += 1;
  return score;
}

/**
 * @returns {Promise<{ package: object, category: string }|null>}
 */
async function matchSinglePackage(text) {
  const t = normalizeInput(text);

  let category = null;
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((w) => t.includes(normalizeInput(w)))) {
      category = cat === "hall" ? "wedding" : cat;
      break;
    }
  }

  const all = await getPackages({ category: category || undefined });
  if (!all.length) return null;

  const ranked = all
    .map((pkg) => ({ pkg, score: scorePackage(text, pkg) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    if (category === "wedding" && /صالة|قاعة|داخل/.test(t)) {
      const hall = await getPackageById("wedding-in-studio-300");
      return hall ? { package: hall, category: "wedding" } : null;
    }
    return null;
  }

  if (ranked.length > 1 && ranked[0].score === ranked[1].score) return null;
  if (ranked[0].score < 2) return null;

  const pkg = ranked[0].pkg;
  return { package: pkg, category: pkg.category };
}

module.exports = { matchSinglePackage, PACKAGE_KEYWORDS, CATEGORY_KEYWORDS };
