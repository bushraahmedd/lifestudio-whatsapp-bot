const fb = require("../firebase/admin");

const DEFAULT_PACKAGES = [
  {
    category: "graduation",
    label: "باقة تخرج أساسية",
    price: 350,
    description: "جلسة تخرج في الاستوديو مع تعديل أساسي",
    includes: ["ساعة تصوير", "10 صور معدّلة", "خلفية احترافية"],
    active: true,
    sortOrder: 1,
  },
  {
    category: "graduation",
    label: "باقة تخرج VIP",
    price: 550,
    description: "تخرج فاخر مع ألبوم رقمي",
    includes: ["ساعتين تصوير", "25 صورة معدّلة", "ألبوم رقمي"],
    active: true,
    sortOrder: 2,
  },
  {
    category: "studio_rental",
    label: "إيجار استوديو — بالساعة",
    price: 80,
    hourlyRate: 80,
    description: "استوديو مجهّز للتصوير أو التصوير الذاتي",
    equipment: "إضاءة، خلفيات، رفلكتور، Wi‑Fi",
    terms: "الحد الأدنى ساعة واحدة — الحجز المسبق مطلوب",
    active: true,
    sortOrder: 1,
  },
  {
    category: "studio_rental",
    label: "إيجار استوديو — يوم كامل",
    price: 450,
    dailyRate: 450,
    description: "استوديو ليوم كامل (8 ساعات)",
    equipment: "إضاءة احترافية، خلفيات متعددة، غرفة تجهيز",
    terms: "يشمل 8 ساعات — تمديد باتفاق",
    active: true,
    sortOrder: 2,
  },
  {
    category: "wedding",
    label: "باقة زفاف فضية",
    price: 1800,
    description: "تغطية زفاف أساسية",
    includes: ["4 ساعات تصوير", "150 صورة معدّلة", "ألبوم رقمي"],
    active: true,
    sortOrder: 1,
  },
  {
    category: "wedding",
    label: "باقة زفاف ذهبية",
    price: 2800,
    description: "تغطية زفاف شاملة",
    includes: ["يوم كامل", "300+ صورة", "فيديو هايلايت", "ألبوم فاخر"],
    active: true,
    sortOrder: 2,
  },
];

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
    items = DEFAULT_PACKAGES.filter((p) => p.category === category).map((p, i) => ({
      id: `default-${category}-${i}`,
      ...p,
    }));
  }
  if (!items.length && !category) {
    items = DEFAULT_PACKAGES.map((p, i) => ({ id: `default-${i}`, ...p }));
  }

  return items.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

async function getPackageById(id) {
  if (id.startsWith("default-")) {
    const all = await getPackages({ activeOnly: false });
    return all.find((p) => p.id === id) || null;
  }
  const snap = await fb.db.collection("packages").doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

module.exports = { getPackages, getPackageById, DEFAULT_PACKAGES };
