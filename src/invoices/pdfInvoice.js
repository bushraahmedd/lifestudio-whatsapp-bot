const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const FONT_PATH = process.env.INVOICE_FONT_PATH
  || path.join(__dirname, "../../assets/fonts/NotoSansArabic-Regular.ttf");

const BRAND = {
  nameAr: "لايف استوديو",
  nameEn: "LIVE STUDIO FOR ARTS",
  city: "البيضاء - ليبيا",
  color: "#4dbb88",
};

function resolveFont(doc) {
  if (fs.existsSync(FONT_PATH)) {
    doc.registerFont("Arabic", FONT_PATH);
    return "Arabic";
  }
  return "Helvetica";
}

/**
 * @returns {Promise<Buffer>}
 */
function generateInvoicePdf(invoice, session = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const font = resolveFont(doc);
    const total = Number(invoice.totalPrice) || 0;
    const paid = Number(invoice.deposit) || 0;
    const due = Math.max(0, total - paid);
    const isDeposit = invoice.paymentType === "deposit" || (paid > 0 && paid < total);
    const invNo = `#INV-${(invoice.id || "").slice(-8).toUpperCase() || "--------"}`;

    doc.font(font).fontSize(22).fillColor(BRAND.color).text(BRAND.nameAr, { align: "right" });
    doc.fontSize(11).fillColor("#666").text(BRAND.nameEn, { align: "right" });
    doc.text(BRAND.city, { align: "right" });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(BRAND.color).lineWidth(2).stroke();
    doc.moveDown(1);

    doc.fontSize(16).fillColor("#111").text("فاتورة رسمية / Official Invoice", { align: "center" });
    doc.moveDown(1);

    const leftX = 50;
    const rightX = 320;
    let y = doc.y;

    doc.fontSize(11).fillColor("#333");
    const fields = [
      ["العميل / Client", invoice.clientName || "—"],
      ["الجلسة / Service", invoice.sessionName || invoice.package || "—"],
      ["التاريخ / Date", invoice.date || session.date || "—"],
      ["الوقت / Time", session.time || "—"],
      ["الموقع / Location", invoice.location || session.location || "—"],
      ["رقم الفاتورة", invNo],
    ];

    for (const [label, value] of fields) {
      doc.font(font).text(`${label}:`, leftX, y, { width: 240, align: "right" });
      doc.text(String(value), rightX, y, { width: 220, align: "left" });
      y += 22;
    }

    doc.y = y + 10;
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#ddd").stroke();
    doc.moveDown(1);

    doc.fontSize(12).fillColor(BRAND.color).text("تفاصيل الدفع / Payment Summary", { align: "right" });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor("#333");
    doc.text(`الباقة: ${invoice.package || invoice.sessionName || "—"}`, { align: "right" });
    doc.text(`السعر: ${total.toLocaleString()} د.ل`, { align: "right" });
    if (paid > 0) {
      doc.text(`المدفوع: ${paid.toLocaleString()} د.ل`, { align: "right" });
    }
    if (isDeposit && due > 0) {
      doc.text(`المبلغ المستحق: ${due.toLocaleString()} د.ل`, { align: "right" });
    }
    doc.text(`طريقة الدفع: ${invoice.paymentMethod || "—"}`, { align: "right" });
    doc.text(`الحالة: ${invoice.paymentStatus || invoice.status || "—"}`, { align: "right" });

    if (invoice.notes) {
      doc.moveDown(1);
      doc.fontSize(10).fillColor("#666").text(`ملاحظات: ${invoice.notes}`, { align: "right" });
    }

    doc.moveDown(2);
    doc.fontSize(10).fillColor("#888").text(
      "شكراً لثقتكم في لايف استوديو — نتمنى لكم تجربة تصوير رائعة 📸",
      { align: "center" }
    );

    doc.end();
  });
}

module.exports = { generateInvoicePdf };
