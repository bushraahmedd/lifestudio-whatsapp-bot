const { generateInvoicePdf } = require("./pdfInvoice");

/**
 * Generate PDF and send via WhatsApp ctx.sendDocument
 */
async function sendInvoicePdfToClient(ctx, invoice, session = {}) {
  const { chatId, send, sendDocument } = ctx;
  if (!sendDocument) {
    console.warn("[invoice] sendDocument not available — text only");
    return false;
  }

  try {
    const buffer = await generateInvoicePdf(invoice, session);
    const fileName = `فاتورة_${invoice.clientName || "live-studio"}_${invoice.id?.slice(-6) || "new"}.pdf`;
    await sendDocument(buffer, fileName, {
      caption:
        `🧾 *إيصال حجز — لايف استوديو*\n` +
        `مرحباً ${invoice.clientName} 👋\n` +
        `مرفق تأكيد حجزك. نتشرّف بخدمتكم! 📸\n` +
        `رقم الحجز: #${(invoice.id || "").slice(-6).toUpperCase()}`,
    });
    return true;
  } catch (err) {
    console.error("[invoice] PDF send failed:", err.message);
    await send(
      "تم الحجز بنجاح ✅ — ملف التأكيد راح يوصلك من الاستوديو قريباً."
    );
    return false;
  }
}

module.exports = { sendInvoicePdfToClient };
