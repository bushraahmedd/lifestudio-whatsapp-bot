const { getPackages } = require("../firestore/packages");
const { formatPackageLine, CATEGORY_META } = require("./pricingMessages");

const OPENER_BY_CATEGORY = {
  wedding: "مبروك! 💍 يشرّفنا نوثّق مناسبتكم.",
  graduation: "مبروك التخرج! 🎓",
  birthday: "عيد ميلاد سعيد! 🎂",
  family: "أهلاً بيكم! 👨‍👩‍👧",
  studio_rental: "أهلاً بيك 👋",
  hall: "أهلاً بيك في الاستوديو 👋",
  pets: "أهلاً بيك 🐾",
  equipment: "تمام، بخصوص المعدات:",
};

function dedupePackages(packages) {
  const seen = new Set();
  return packages.filter((p) => {
    const key = `${(p.label || "").trim()}|${p.price}|${p.category}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function buildSinglePackageReply(pkg, category) {
  const opener = OPENER_BY_CATEGORY[category] || "يسعدنا نخدمك! 🌟";
  const line = formatPackageLine(pkg, null);
  return [
    opener,
    "",
    line,
    "",
    "تحب نكمّل الحجز؟ اكتب *نعم* أو ابعتلي التاريخ والوقت اللي يناسبك 📅",
  ].join("\n");
}

async function buildCategoryHint(category) {
  const meta = CATEGORY_META[category] || { title: category, opener: `بخصوص *${category}*:` };
  let pkgs = await getPackages({ category: category === "hall" ? "wedding" : category });
  pkgs = dedupePackages(pkgs);

  if (category === "hall" || (category === "wedding" && pkgs.some((p) => p.id === "wedding-in-studio-300"))) {
    // Prefer short choice list without dumping equipment/etc.
  }

  if (!pkgs.length) {
    return "حالياً ما عنديش تفاصيل منشورة لهالقسم — قول لي أكثر ودقيّة أكثر نساعدك.";
  }

  // Cap to unique options — never flood chat
  const lines = pkgs.slice(0, 6).map((p) => `• *${p.label}* — ${Number(p.price).toLocaleString()} د.ل`);
  return [
    meta.opener || `بخصوص *${meta.title}*:`,
    "",
    lines.join("\n"),
    "",
    "قول لي أي باقة تقصد (مثلاً VIP أو داخل الاستوديو) ونكمّل معاك.",
  ].join("\n");
}

module.exports = { buildSinglePackageReply, buildCategoryHint, dedupePackages };
