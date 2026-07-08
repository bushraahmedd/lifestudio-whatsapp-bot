const { normalizeInput } = require("./stateMachine");
const { getPackages, getPackageById } = require("../firestore/packages");

/**
 * Phrase keywords only — never bare numbers (they mix wedding/grad/birthday prices).
 */
const PACKAGE_KEYWORDS = {
  "wedding-in-studio-300": [
    "داخل الاستوديو", "داخل الاستديو", "صالة", "قاعة", "hall", "خطوبة", "صباحية",
  ],
  "wedding-out-1-800": ["الباقة الاولى", "الباقة الأولى", "باقة اولى", "40 صورة بدون سحب"],
  "wedding-out-2-1000": ["الباقة الثانية", "باقة ثانية", "دخلة العروس"],
  "wedding-out-3-1700": ["الباقة الثالثة", "باقة ثالثة", "بالسحب مع برومو"],
  "wedding-out-4-2300": ["الباقة الرابعة", "باقة رابعة", "البوم", "ألبوم"],
  "wedding-vip-3500": ["vip", "فيب", "في اي بي"],
  "grad-in-12-200": ["12 صورة", "اثنا عشر صورة"],
  "grad-in-15-250": ["15 صورة", "خمسة عشر صورة"],
  "grad-out-20-350": ["تخرج خارج", "خارج الاستوديو تخرج"],
  "grad-open-1200": ["باقة مفتوحة", "مفتوحة", "مفتوحه"],
  "grad-promo-800": ["برومو تخرج"],
  "birthday-15-250": ["عيد ميلاد", "ميلاد اطفال", "ميلاد أطفال"],
  "family-10-200": ["جلسة عائلية", "عائلية", "عائلة"],
  "rental-floor-1500": ["اجار ارضية", "إيجار أرضية", "أرضية الاستوديو", "ارضية الاستوديو"],
  "pets-30-800": ["بتات", "جلسة بت", "حيوانات"],
  "pets-promo-1200": ["برومو بتات"],
};

const CATEGORY_KEYWORDS = {
  wedding: ["عرسان", "عرس", "زواج", "عروس", "فرح", "wedding", "bride", "خطوبة", "صباحية"],
  hall: ["صالة", "قاعة", "داخل الاستوديو", "داخل الاستديو", "hall"],
  graduation: ["تخرج", "خريج", "خريجة", "خريجات", "graduation"],
  birthday: ["ميلاد", "عيد ميلاد", "birthday"],
  family: ["عائلية", "عائلة", "family"],
  pets: ["بت", "بتات", "pet"],
  studio_rental: ["اجار", "إيجار", "ارضية", "أرضية"],
  equipment: ["ميش", "معدات", "اضاءة", "إضاءة", "بخار", "فقعات"],
};

function scorePackage(text, pkg) {
  const t = normalizeInput(text);
  let score = 0;
  const keys = PACKAGE_KEYWORDS[pkg.id] || [];
  for (const k of keys) {
    const key = normalizeInput(k);
    if (key.length >= 3 && t.includes(key)) score += key.length >= 8 ? 4 : 2;
  }
  const label = normalizeInput(pkg.label || "");
  if (label && t.includes(label)) score += 5;
  return score;
}

function detectCategory(text) {
  const t = normalizeInput(text);
  let best = null;
  let bestScore = 0;
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    let s = 0;
    for (const w of words) {
      if (t.includes(normalizeInput(w))) s += 1;
    }
    if (s > bestScore) {
      bestScore = s;
      best = cat;
    }
  }
  if (!best) return null;
  if (best === "hall") return "wedding";
  return best;
}

/**
 * @returns {Promise<{ package: object, category: string }|null>}
 */
async function matchSinglePackage(text) {
  const t = normalizeInput(text);
  const category = detectCategory(text);

  // Hall / inside studio → exact package, no mix with outdoor wedding packages
  if (/صالة|قاعة|داخل الاستوديو|داخل الاستديو/.test(t) && !/خارج/.test(t)) {
    const hall = await getPackageById("wedding-in-studio-300");
    if (hall) return { package: hall, category: "wedding" };
  }

  if (/vip|فيب/.test(t)) {
    const vip = await getPackageById("wedding-vip-3500");
    if (vip) return { package: vip, category: "wedding" };
  }

  const all = await getPackages({ category: category || undefined });
  if (!all.length) return null;

  // Deduplicate identical label+price
  const seen = new Set();
  const unique = all.filter((p) => {
    const key = `${p.label}|${p.price}|${p.category}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const ranked = unique
    .map((pkg) => ({ pkg, score: scorePackage(text, pkg) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) return null;
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) return null;
  if (ranked[0].score < 2) return null;

  return { package: ranked[0].pkg, category: ranked[0].pkg.category };
}

module.exports = { matchSinglePackage, PACKAGE_KEYWORDS, CATEGORY_KEYWORDS, detectCategory };
