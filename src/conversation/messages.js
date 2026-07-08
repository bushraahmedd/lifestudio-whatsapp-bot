/** نصوص البوت — لهجة ليبية ودودة — محادثة مستمرة بدون قوائم جامدة */

const MAIN_MENU_TEXT = `📸 *لايف استوديو*
أهلاً بيك 👋 اكتب لي بحرية زي ما تبي:

مثلاً: تخرج، عرسان، صالة، عيد ميلاد، إيجار، أو ابعت تاريخ ووقت للحجز
لو تبي مساعدة قول *مساعدة*`;

const SOFT_HELP_TEXT =
  "حاضر 😊 قولي شنو تبي بالضبط — " +
  "تخرج، زفاف، صالة، عيد ميلاد، إيجار، أو نحجز موعد — " +
  "ونمشي معاك خطوة بخطوة بدون استعجال.";

const GREETING_DEFAULT = "أهلاً بيك في *لايف استوديو* للتصوير 📸";

const FEES_NOTE_DEFAULT = "";

function formatBankTransfer(bank) {
  const lines = [
    "🏦 *بيانات التحويل*",
    `المصرف: ${bank.name || "—"}`,
    `اسم الحساب: ${bank.accountName || "—"}`,
  ];
  if (bank.accountNumber) lines.push(`رقم الحساب: ${bank.accountNumber}`);
  if (bank.iban) lines.push(`IBAN: ${bank.iban}`);
  if (bank.iban2) lines.push(`IBAN (حساب ثاني): ${bank.iban2}`);
  lines.push(bank.note || "بعد التحويل ابعث صورة الإيصال هنا.");
  return lines.join("\n");
}

module.exports = {
  MAIN_MENU_TEXT,
  SOFT_HELP_TEXT,
  GREETING_DEFAULT,
  FEES_NOTE_DEFAULT,
  formatBankTransfer,
};
