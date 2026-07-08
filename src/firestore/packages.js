const fb = require("../firebase/admin");

/** Official Live Studio packages — synced to Firestore via npm run seed-packages -- --force */
const DEFAULT_PACKAGES = [
  // ——— زفاف / عرسان / خطوبة ———
  {
    id: "wedding-in-studio-300",
    category: "wedding",
    label: "داخل الاستوديو — 20 صورة",
    price: 300,
    description: "خطوبة / صباحية / عرسان",
    includes: ["20 صورة معدّلة", "داخل الاستوديو"],
    active: true,
    sortOrder: 1,
  },
  {
    id: "wedding-out-1-800",
    category: "wedding",
    label: "خارج الاستوديو — الباقة الأولى",
    price: 800,
    description: "40 صورة بدون سحب",
    active: true,
    sortOrder: 2,
  },
  {
    id: "wedding-out-2-1000",
    category: "wedding",
    label: "خارج الاستوديو — الباقة الثانية ❤️",
    price: 1000,
    description: "20 صورة بدون سحب + برومو دخلة العروس",
    active: true,
    sortOrder: 3,
  },
  {
    id: "wedding-out-3-1700",
    category: "wedding",
    label: "خارج الاستوديو — الباقة الثالثة ❤️",
    price: 1700,
    description: "30 صورة بالسحب مع برومو",
    active: true,
    sortOrder: 4,
  },
  {
    id: "wedding-out-4-2300",
    category: "wedding",
    label: "خارج الاستوديو — الباقة الرابعة ❤️",
    price: 2300,
    description: "30 صورة بالسحب مع ألبوم + برومو دخلة العروس والعريس",
    active: true,
    sortOrder: 5,
  },
  {
    id: "wedding-vip-3500",
    category: "wedding",
    label: "VIP 1 ❤️",
    price: 3500,
    description: "30 صورة سحب + ألبوم + برومو دخلة عروس وعريس + 10 صور تفاصيل + برومو تفاصيل",
    active: true,
    sortOrder: 6,
  },

  // ——— معدات إضافية ———
  {
    id: "eq-mesh-basic-100",
    category: "equipment",
    label: "ميش عادي — طرفين (60 ثانية)",
    price: 100,
    active: true,
    sortOrder: 1,
  },
  {
    id: "eq-mesh-electronic-250",
    category: "equipment",
    label: "ميش إلكتروني — يولّع 3 مرات طرفين",
    price: 250,
    active: true,
    sortOrder: 2,
  },
  {
    id: "eq-mesh-rotary-200",
    category: "equipment",
    label: "ميش دوار عادي — 60 ثانية طرفين",
    price: 200,
    active: true,
    sortOrder: 3,
  },
  {
    id: "eq-mesh-dual-rotary-450",
    category: "equipment",
    label: "ميش ثنائي إلكتروني دوار — طرفين",
    price: 450,
    active: true,
    sortOrder: 4,
  },
  {
    id: "eq-light-small-100",
    category: "equipment",
    label: "إضاءة مسلّطة صغيرة",
    price: 100,
    active: true,
    sortOrder: 10,
  },
  {
    id: "eq-light-large-150",
    category: "equipment",
    label: "إضاءة مسلّطة حجم كبير",
    price: 150,
    active: true,
    sortOrder: 11,
  },
  {
    id: "eq-fire-150",
    category: "equipment",
    label: "نار طرفين",
    price: 150,
    active: true,
    sortOrder: 12,
  },
  {
    id: "eq-laser-flame-100",
    category: "equipment",
    label: "لهب ليزري طرفين",
    price: 100,
    active: true,
    sortOrder: 13,
  },
  {
    id: "eq-bubbles-100",
    category: "equipment",
    label: "فقعات",
    price: 100,
    active: true,
    sortOrder: 14,
  },
  {
    id: "eq-steam-100",
    category: "equipment",
    label: "بخار عادي",
    price: 100,
    active: true,
    sortOrder: 15,
  },
  {
    id: "eq-fog-200",
    category: "equipment",
    label: "سحاب كثيف",
    price: 200,
    active: true,
    sortOrder: 16,
  },
  {
    id: "eq-disney-light-350",
    category: "equipment",
    label: "إضاءة دزني أو سندريلا",
    price: 350,
    active: true,
    sortOrder: 17,
  },

  // ——— تخرج ———
  {
    id: "grad-in-12-200",
    category: "graduation",
    label: "تخرج داخل الاستوديو — 12 صورة + تفاصيل",
    price: 200,
    active: true,
    sortOrder: 1,
  },
  {
    id: "grad-in-15-250",
    category: "graduation",
    label: "تخرج داخل الاستوديو — 15 صورة + تفاصيل",
    price: 250,
    active: true,
    sortOrder: 2,
  },
  {
    id: "grad-out-20-350",
    category: "graduation",
    label: "تخرج خارج الاستوديو — 20 صورة",
    price: 350,
    description: "إضافة 50 د.ل للمشاوير البعيدة (مواصلات)",
    active: true,
    sortOrder: 3,
  },
  {
    id: "grad-open-1200",
    category: "graduation",
    label: "باقة تخرج مفتوحة",
    price: 1200,
    active: true,
    sortOrder: 4,
  },
  {
    id: "grad-promo-800",
    category: "graduation",
    label: "برومو تخرج",
    price: 800,
    active: true,
    sortOrder: 5,
  },

  // ——— إيجار ———
  {
    id: "rental-floor-1500",
    category: "studio_rental",
    label: "إيجار أرضية الاستوديو",
    price: 1500,
    description: "إيجار كامل لأرضية الاستوديو",
    active: true,
    sortOrder: 1,
  },

  // ——— بتات ———
  {
    id: "pets-30-800",
    category: "pets",
    label: "جلسة بتات — 30 صورة",
    price: 800,
    active: true,
    sortOrder: 1,
  },
  {
    id: "pets-promo-1200",
    category: "pets",
    label: "برومو بتات",
    price: 1200,
    active: true,
    sortOrder: 2,
  },

  // ——— أعياد ميلاد ———
  {
    id: "birthday-15-250",
    category: "birthday",
    label: "أعياد ميلاد الأطفال — 15 صورة",
    price: 250,
    active: true,
    sortOrder: 1,
  },

  // ——— عائلة ———
  {
    id: "family-10-200",
    category: "family",
    label: "جلسة عائلية — 10 صور",
    price: 200,
    active: true,
    sortOrder: 1,
  },
];

const SERVICE_CATEGORIES = [
  "wedding",
  "graduation",
  "studio_rental",
  "equipment",
  "pets",
  "birthday",
  "family",
];

function dedupePackageList(items) {
  const seen = new Set();
  return items.filter((p) => {
    const key = `${(p.label || "").trim().toLowerCase()}|${Number(p.price) || 0}|${p.category || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function getPackages({ category, activeOnly = true } = {}) {
  let snap;
  if (category) {
    snap = await fb.db.collection("packages").where("category", "==", category).get();
  } else {
    snap = await fb.db.collection("packages").get();
  }
  let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (activeOnly) items = items.filter((p) => p.active !== false);

  if (!items.length && category) {
    items = DEFAULT_PACKAGES.filter((p) => p.category === category).map((p) => ({ ...p }));
  }
  if (!items.length && !category) {
    items = DEFAULT_PACKAGES.map((p) => ({ ...p }));
  }

  return dedupePackageList(items).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

async function getPackageById(id) {
  if (id.startsWith("default-") || DEFAULT_PACKAGES.some((p) => p.id === id)) {
    const fromDefaults = DEFAULT_PACKAGES.find((p) => p.id === id);
    if (fromDefaults) return { ...fromDefaults };
    const all = await getPackages({ activeOnly: false });
    return all.find((p) => p.id === id) || null;
  }
  const snap = await fb.db.collection("packages").doc(id).get();
  if (snap.exists) return { id: snap.id, ...snap.data() };
  const fallback = DEFAULT_PACKAGES.find((p) => p.id === id);
  return fallback ? { ...fallback } : null;
}

module.exports = { getPackages, getPackageById, DEFAULT_PACKAGES, SERVICE_CATEGORIES };
