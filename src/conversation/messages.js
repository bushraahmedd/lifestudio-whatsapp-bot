/** نصوص البوت — لهجة ليبية ودودة */

const MAIN_MENU_TEXT = `📸 *لايف استوديو*
أهلاً بيك 👋 أنا مساعد الاستوديو — تقدر تكتبلي بحرية:

• "بكم جلسة التخرج؟" أو "نبي نحجز زفاف"
• "إيجار الاستوديو" أو "أسعاركم"

أو اكتب باختصار:
*حجز* — موعد جديد  |  *إلغاء* — إلغاء حجز
*دفع* — فاتورة/عربون  |  *متابعة* — وين وصلت جلستي؟
*تغيير* — تعديل الموعد

ابعث *0* للقائمة الرئيسية`;

const SOFT_HELP_TEXT =
  "يسعدنا نخدمك! 🌟\n" +
  "قول لنا شنو تبي بالضبط (تخرج، زفاف، إيجار استوديو، حجز، دفع...) " +
  "أو اكتب *حجز* ونمشي معاك خطوة بخطوة.";

const GREETING_DEFAULT = "أهلاً بيك في *لايف استوديو* للتصوير 📸";

const FEES_NOTE_DEFAULT = "_ملاحظة: الأسعار الرسمية والباقات الجديدة قريباً — الحجز حالياً حسب القائمة أدناه._";

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
