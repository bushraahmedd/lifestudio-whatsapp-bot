/** نصوص البوت — لهجة ليبية ودودة */

const MAIN_MENU_TEXT = `📸 *لايف استوديو*
أهلاً بيك 👋 اختار رقم من القائمة:

*1* — احجز جلسة تصوير
*2* — الغِ الحجز
*3* — غيّر الموعد
*4* — الدفع / الفاتورة
*5* — وين وصلت جلستي؟
*0* — القائمة الرئيسية`;

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
  GREETING_DEFAULT,
  FEES_NOTE_DEFAULT,
  formatBankTransfer,
};
