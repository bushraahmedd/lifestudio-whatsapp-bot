const { getPackages } = require("../firestore/packages");

const CATEGORY_META = {
  graduation: {
    title: "تخرج",
    opener: "مبروك التخرج! 🎓 فرحتنا فيكم، وهذي باقات التخرج:",
    tone: "warm",
  },
  studio_rental: {
    title: "إيجار الاستوديو",
    opener: "أهلاً بيك 👋 هذي تفاصيل إيجار أرضية الاستوديو:",
    tone: "professional",
  },
  hall: {
    title: "تصوير صالة / داخل الاستوديو",
    opener: "أهلاً بيك في استوديونا 👋 هذي باقة التصوير داخل الصالة:",
    tone: "warm",
  },
  equipment: {
    title: "معدات وتأثيرات",
    opener: "🩷 أسعار المعدات والتأثيرات الإضافية:",
    tone: "professional",
  },
  pets: {
    title: "جلسات البتات",
    opener: "🐾 هذي باقات تصوير البتات:",
    tone: "warm",
  },
  birthday: {
    title: "أعياد ميلاد",
    opener: "🎂 هذي باقات أعياد ميلاد الأطفال:",
    tone: "warm",
  },
  family: {
    title: "جلسات عائلية",
    opener: "👨‍👩‍👧 هذي باقات الجلسات العائلية:",
    tone: "warm",
  },
};

function formatPackageLine(pkg, index) {
  const n = index != null ? `*${index + 1}* — ` : "• ";
  let line = `${n}*${pkg.label}*`;
  if (pkg.hourlyRate) line += ` — ${pkg.hourlyRate} د.ل / ساعة`;
  else if (pkg.dailyRate) line += ` — ${pkg.dailyRate} د.ل / يوم`;
  else if (pkg.price) line += ` — *${Number(pkg.price).toLocaleString()} د.ل*`;
  if (pkg.description) line += `\n   ${pkg.description}`;
  if (pkg.includes?.length) line += `\n   يشمل: ${pkg.includes.join("، ")}`;
  if (pkg.equipment) line += `\n   التجهيزات: ${pkg.equipment}`;
  if (pkg.terms) line += `\n   الشروط: ${pkg.terms}`;
  return line;
}

async function buildPricingReply(category) {
  const meta = CATEGORY_META[category];
  if (!meta) return null;

  const packages = await getPackages({ category });
  if (!packages.length) {
    return "حالياً ما عندناش باقات منشورة لهالقسم — تواصل مع الاستوديو وراح نخدمك بكل سرور 🙏";
  }

  const lines = packages.map((p, i) => formatPackageLine(p, i));
  return [
    meta.opener,
    "",
    lines.join("\n\n"),
    "",
    "تحب نحجزلك موعد؟ قول *نعم* أو *حجز*، أو اسألنا أي سؤال ثاني 😊",
    "ابعث *0* للقائمة الرئيسية.",
  ].join("\n");
}

async function buildAmbiguousClarifier(categories) {
  const names = categories.map((c) => CATEGORY_META[c]?.title || c).join(" ولا ");
  return (
    `يسعدنا نخدمك! 🌟\n\n` +
    `تبي *${names}*؟\n\n` +
    `اكتب نوع الخدمة اللي تبيها (مثلاً: تخرج، زفاف، إيجار استوديو) ` +
    `أو قول *حجز* مباشرة ونكمل معاك خطوة بخطوة.`
  );
}

async function buildMultiCategoryPricing(categories) {
  const parts = [];
  for (const cat of categories.slice(0, 2)) {
    parts.push(await buildPricingReply(cat));
  }
  return parts.join("\n\n—\n\n");
}

module.exports = {
  buildPricingReply,
  buildAmbiguousClarifier,
  buildMultiCategoryPricing,
  formatPackageLine,
  CATEGORY_META,
};
