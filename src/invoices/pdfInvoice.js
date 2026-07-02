const fs = require("fs");
const path = require("path");
const pdfmake = require("pdfmake");

const BRAND = {
  nameAr: "لايف استوديو",
  nameEn: "LIVE STUDIO FOR ARTS",
  city: "البيضاء - ليبيا",
  color: "#4dbb88",
};

const FONT_CANDIDATES = [
  process.env.INVOICE_FONT_PATH,
  path.join(__dirname, "../assets/fonts/NotoSansArabic-Regular.ttf"),
  path.join(__dirname, "../../assets/fonts/NotoSansArabic-Regular.ttf"),
].filter(Boolean);

let fontsReady = false;

function ensureFonts() {
  if (fontsReady) return;
  const fontPath = FONT_CANDIDATES.find((p) => fs.existsSync(p));
  if (!fontPath) {
    throw new Error(
      "Arabic font missing for invoice PDF. Expected NotoSansArabic-Regular.ttf in src/assets/fonts/"
    );
  }
  pdfmake.setFonts({
    Arabic: {
      normal: fontPath,
      bold: fontPath,
      italics: fontPath,
      bolditalics: fontPath,
    },
  });
  pdfmake.setLocalAccessPolicy(() => true);
  fontsReady = true;
}

function infoRow(label, value) {
  return {
    columns: [
      { text: String(value ?? "—"), width: "*", alignment: "left" },
      { text: `${label}:`, width: "auto", alignment: "right" },
    ],
    margin: [0, 3, 0, 3],
  };
}

/**
 * @returns {Promise<Buffer>}
 */
async function generateInvoicePdf(invoice, session = {}) {
  ensureFonts();

  const total = Number(invoice.totalPrice) || 0;
  const paid = Number(invoice.deposit) || 0;
  const due = Math.max(0, total - paid);
  const isDeposit = invoice.paymentType === "deposit" || (paid > 0 && paid < total);
  const invNo = `#INV-${(invoice.id || "").slice(-8).toUpperCase() || "--------"}`;

  const paymentBlock = [
    { text: `الباقة: ${invoice.package || invoice.sessionName || "—"}`, margin: [0, 2, 0, 2] },
    { text: `السعر: ${total.toLocaleString()} د.ل`, margin: [0, 2, 0, 2] },
  ];
  if (paid > 0) {
    paymentBlock.push({ text: `المدفوع: ${paid.toLocaleString()} د.ل`, margin: [0, 2, 0, 2] });
  }
  if (isDeposit && due > 0) {
    paymentBlock.push({
      text: `المبلغ المستحق: ${due.toLocaleString()} د.ل`,
      bold: true,
      margin: [0, 2, 0, 2],
    });
  }
  paymentBlock.push(
    { text: `طريقة الدفع: ${invoice.paymentMethod || "—"}`, margin: [0, 2, 0, 2] },
    { text: `الحالة: ${invoice.paymentStatus || invoice.status || "—"}`, margin: [0, 2, 0, 2] }
  );

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [50, 50, 50, 50],
    defaultStyle: { font: "Arabic", fontSize: 11, alignment: "right" },
    content: [
      { text: BRAND.nameAr, fontSize: 22, color: BRAND.color, alignment: "right" },
      { text: BRAND.nameEn, fontSize: 10, color: "#666666", alignment: "right" },
      { text: BRAND.city, fontSize: 10, color: "#666666", alignment: "right", margin: [0, 0, 0, 10] },
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 2, lineColor: BRAND.color }],
        margin: [0, 0, 0, 16],
      },
      { text: "فاتورة رسمية / Official Invoice", fontSize: 16, alignment: "center", margin: [0, 0, 0, 16] },
      infoRow("العميل / Client", invoice.clientName),
      infoRow("الجلسة / Service", invoice.sessionName || invoice.package),
      infoRow("التاريخ / Date", invoice.date || session.date),
      infoRow("الوقت / Time", session.time),
      infoRow("الموقع / Location", invoice.location || session.location),
      infoRow("رقم الفاتورة", invNo),
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 1, lineColor: "#dddddd" }],
        margin: [0, 12, 0, 12],
      },
      { text: "تفاصيل الدفع / Payment Summary", fontSize: 12, color: BRAND.color, margin: [0, 0, 0, 8] },
      ...paymentBlock,
      ...(invoice.notes
        ? [{ text: `ملاحظات: ${invoice.notes}`, fontSize: 10, color: "#666666", margin: [0, 12, 0, 0] }]
        : []),
      {
        text: "شكراً لثقتكم في لايف استوديو — نتمنى لكم تجربة تصوير رائعة",
        fontSize: 10,
        color: "#888888",
        alignment: "center",
        margin: [0, 28, 0, 0],
      },
    ],
  };

  return pdfmake.createPdf(docDefinition).getBuffer();
}

module.exports = { generateInvoicePdf };
