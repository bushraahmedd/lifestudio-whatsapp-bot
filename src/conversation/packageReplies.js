const { getPackages } = require("../firestore/packages");
const { formatPackageLine, CATEGORY_META } = require("./pricingMessages");

const OPENER_BY_CATEGORY = {
  wedding: "مبروك للعرسان! 💍",
  graduation: "مبروك التخرج! 🎓",
  birthday: "عيد ميلاد سعيد! 🎂",
  family: "أهلاً بيكم! 👨‍👩‍👧",
  studio_rental: "أهلاً بيك 👋",
  hall: "أهلاً بيك في استوديونا 👋",
};

async function buildSinglePackageReply(pkg, category) {
  const opener = OPENER_BY_CATEGORY[category] || OPENER_BY_CATEGORY.hall || "يسعدنا نخدمك! 🌟";
  const line = formatPackageLine(pkg, null);
  return [
    opener,
    "",
    line,
    "",
    "تحب نحجزلك موعد لهالباقة؟ قول *نعم* أو *حجز*، أو ابعت التاريخ والوقت اللي يناسبك 📅",
    "ابعث *0* للقائمة الرئيسية.",
  ].join("\n");
}

async function buildCategoryHint(category) {
  const meta = CATEGORY_META[category] || { title: category };
  const pkgs = await getPackages({ category });
  const hints = pkgs.slice(0, 4).map((p) => `• ${p.label}`).join("\n");
  return (
    `${meta.opener || `بخصوص *${meta.title}*:`}\n\n` +
    `عندنا أكثر من خيار — قول لنا أي واحد تقصد بالضبط:\n${hints}\n\n` +
    `مثال: "VIP" أو "داخل الاستوديو" أو "باقة 800"`
  );
}

module.exports = { buildSinglePackageReply, buildCategoryHint };
