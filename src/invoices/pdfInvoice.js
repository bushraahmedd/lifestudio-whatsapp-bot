const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { ar, arLine } = require("./arabicText");

const BRAND = {
  nameAr: "لايف استوديو",
  nameEn: "LIVE STUDIO FOR ARTS",
  city: "البيضاء - ليبيا",
  color: "#4dbb88",
  footer: "البيضاء - بجانب شيل بوحليمه عماره مغسله الرونق | هاتف: 0926128650 | شكراً لثقتكم في لايف استوديو",
};

const FONT_REG = [
  process.env.INVOICE_FONT_PATH,
  path.join(__dirname, "../assets/fonts/Amiri-Regular.ttf"),
  path.join(__dirname, "../../assets/fonts/Amiri-Regular.ttf"),
  path.join(__dirname, "../assets/fonts/NotoSansArabic-Regular.ttf"),
].filter(Boolean);

const FONT_BOLD = [
  path.join(__dirname, "../assets/fonts/Amiri-Bold.ttf"),
  path.join(__dirname, "../../assets/fonts/Amiri-Bold.ttf"),
].filter(Boolean);

const LOGO_CANDIDATES = [
  path.join(__dirname, "../assets/logo-120.png"),
  path.join(__dirname, "../../assets/logo-120.png"),
].filter(Boolean);

function resolveFont(candidates) {
  return candidates.find((p) => fs.existsSync(p)) || null;
}

/** Format YYYY-MM-DD → DD/MM (no year for client display) */
function formatDisplayDate(dateStr) {
  if (!dateStr) return "—";
  const m = String(dateStr).match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[3].padStart(2, "0")}/${m[2].padStart(2, "0")}`;
  const m2 = String(dateStr).match(/(\d{1,2})[\/\-.](\d{1,2})/);
  if (m2) return `${m2[1].padStart(2, "0")}/${m2[2].padStart(2, "0")}`;
  return String(dateStr);
}

function money(n) {
  return `${Number(n || 0).toLocaleString("en-US")} د.ل`;
}

/**
 * Official Live Studio invoice PDF — Amiri font + Arabic reshape (no □□□).
 * @returns {Promise<Buffer>}
 */
function generateInvoicePdf(invoice, session = {}) {
  return new Promise((resolve, reject) => {
    const fontReg = resolveFont(FONT_REG);
    const fontBold = resolveFont(FONT_BOLD) || fontReg;
    if (!fontReg) {
      reject(new Error("Arabic font missing (Amiri-Regular.ttf)"));
      return;
    }

    const doc = new PDFDocument({ size: "A4", margin: 40, autoFirstPage: true });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("Ar", fontReg);
    doc.registerFont("ArBold", fontBold);

    const total = Number(invoice.totalPrice) || 0;
    const paid = Number(invoice.deposit) || 0;
    const fullyPaid = paid > 0 && paid >= total;
    const invNo = `#INV-${(invoice.id || "").slice(-8).toUpperCase() || "--------"}`;
    const pageW = doc.page.width;
    const margin = 40;
    const contentW = pageW - margin * 2;

    // Double green border like admin template
    doc.lineWidth(2).strokeColor(BRAND.color)
      .rect(margin - 4, margin - 4, contentW + 8, doc.page.height - margin * 2 + 8).stroke();
    doc.lineWidth(1)
      .rect(margin, margin, contentW, doc.page.height - margin * 2).stroke();

    let y = margin + 20;
    const rightX = margin + 20;
    const textW = contentW - 40;

    // Header: logo left, brand right
    const logoPath = LOGO_CANDIDATES.find((p) => fs.existsSync(p));
    if (logoPath) {
      try {
        doc.image(logoPath, margin + 16, y, { width: 80 });
      } catch {
        // ignore logo errors
      }
    }

    doc.font("ArBold").fontSize(26).fillColor(BRAND.color)
      .text(ar(BRAND.nameAr), rightX, y, { width: textW, align: "right" });
    doc.font("Ar").fontSize(11).fillColor("#666666")
      .text(BRAND.nameEn, rightX, y + 32, { width: textW, align: "right" });
    doc.fontSize(11).fillColor("#333333")
      .text(ar(BRAND.city), rightX, y + 48, { width: textW, align: "right" });

    y += 90;
    doc.moveTo(margin + 16, y).lineTo(pageW - margin - 16, y)
      .strokeColor(BRAND.color).lineWidth(2).stroke();
    y += 20;

    // Client grid
    const colW = (textW - 20) / 2;
    const leftColX = margin + 20;
    const rightColX = margin + 20 + colW + 20;
    const displayDate = formatDisplayDate(invoice.date || session.date);

    doc.font("Ar").fontSize(11).fillColor("#222222");
    doc.text(arLine("العميل:", invoice.clientName || "—"), rightColX, y, { width: colW, align: "right" });
    doc.text(arLine("اسم الجلسة:", invoice.sessionName || "تصوير احترافي"), rightColX, y + 20, { width: colW, align: "right" });
    doc.text(arLine("موقع التصوير:", invoice.location || session.location || "—"), rightColX, y + 40, { width: colW, align: "right" });

    doc.text(arLine("تاريخ الحجز:", displayDate), leftColX, y, { width: colW, align: "right" });
    doc.text(arLine("رقم الفاتورة:", invNo), leftColX, y + 20, { width: colW, align: "right" });
    if (session.time) {
      doc.text(arLine("الوقت:", session.time), leftColX, y + 40, { width: colW, align: "right" });
    }

    y += 80;

    // Table header
    const tableX = margin + 16;
    const tableW = contentW - 32;
    const valueColW = 110;
    const detailColW = tableW - valueColW;

    doc.rect(tableX, y, tableW, 28).fill("#f4f4f4");
    doc.moveTo(tableX, y + 28).lineTo(tableX + tableW, y + 28)
      .strokeColor(BRAND.color).lineWidth(2).stroke();
    doc.font("ArBold").fontSize(11).fillColor("#222");
    doc.text(ar("تفاصيل الجلسة والمعدات"), tableX + 8, y + 7, { width: detailColW - 16, align: "right" });
    doc.text(ar("القيمة"), tableX + detailColW, y + 7, { width: valueColW - 8, align: "left" });
    y += 36;

    // Package row
    const pkgLabel = invoice.package || invoice.sessionName || "الباقة المختارة";
    doc.font("ArBold").fontSize(13).fillColor(BRAND.color)
      .text(ar(pkgLabel), tableX + 8, y, { width: detailColW - 16, align: "right" });
    doc.font("ArBold").fontSize(14).fillColor("#111")
      .text(ar(money(total)), tableX + detailColW, y, { width: valueColW - 8, align: "left" });
    y += 24;

    if (invoice.sessionContent) {
      doc.font("ArBold").fontSize(10).fillColor("#555")
        .text(ar("محتويات الجلسة:"), tableX + 8, y, { width: detailColW - 16, align: "right" });
      y += 16;
      doc.font("Ar").fontSize(10).fillColor("#777")
        .text(ar(invoice.sessionContent), tableX + 8, y, { width: detailColW - 16, align: "right" });
      y += 20;
    }
    if (invoice.equipment) {
      doc.font("ArBold").fontSize(10).fillColor("#555")
        .text(ar("المعدات المستخدمة:"), tableX + 8, y, { width: detailColW - 16, align: "right" });
      y += 16;
      doc.font("Ar").fontSize(10).fillColor("#777")
        .text(ar(invoice.equipment), tableX + 8, y, { width: detailColW - 16, align: "right" });
      y += 20;
    }

    y += 10;
    doc.moveTo(tableX, y).lineTo(tableX + tableW, y).strokeColor("#eeeeee").lineWidth(1).stroke();
    y += 24;

    // Payment summary (right side) — no unpaid remaining for clients
    const boxW = 240;
    const boxX = pageW - margin - 20 - boxW;
    doc.font("Ar").fontSize(11).fillColor("#666");
    doc.text(ar("السعر:"), boxX, y, { width: boxW / 2, align: "right" });
    doc.fillColor("#111").text(ar(money(total)), boxX + boxW / 2, y, { width: boxW / 2, align: "left" });
    y += 22;

    if (paid > 0 && paid < total) {
      doc.fillColor("#27ae60").font("ArBold");
      doc.text(ar("العربون المسجّل:"), boxX, y, { width: boxW / 2, align: "right" });
      doc.text(ar(money(paid)), boxX + boxW / 2, y, { width: boxW / 2, align: "left" });
      y += 22;
    }

    y += 8;
    if (fullyPaid) {
      doc.roundedRect(boxX, y, boxW, 36, 8).fill("#27ae60");
      doc.font("ArBold").fontSize(13).fillColor("#ffffff")
        .text(ar("تم الدفع بالكامل"), boxX, y + 10, { width: boxW, align: "center" });
    } else {
      doc.roundedRect(boxX, y, boxW, 36, 8).fill(BRAND.color);
      doc.font("ArBold").fontSize(12).fillColor("#ffffff")
        .text(ar("تم تسجيل الحجز — شكراً لثقتكم"), boxX, y + 10, { width: boxW, align: "center" });
    }
    y += 50;

    if (invoice.notes) {
      doc.roundedRect(margin + 16, y, contentW - 32, 50, 8).fill("#f8fafc");
      doc.font("ArBold").fontSize(11).fillColor(BRAND.color)
        .text(ar("ملاحظات:"), margin + 26, y + 8, { width: contentW - 52, align: "right" });
      doc.font("Ar").fontSize(10).fillColor("#555")
        .text(ar(invoice.notes), margin + 26, y + 26, { width: contentW - 52, align: "right" });
      y += 66;
    }

    // Signatures
    y = Math.max(y + 30, doc.page.height - 140);
    const sigW = 140;
    const sig1X = margin + 50;
    const sig2X = pageW - margin - 50 - sigW;
    doc.font("Ar").fontSize(11).fillColor("#333")
      .text(ar("توقيع المستلم"), sig1X, y, { width: sigW, align: "center" });
    doc.text(ar("ختم وتوقيع الإدارة"), sig2X, y, { width: sigW, align: "center" });
    doc.moveTo(sig1X, y + 45).lineTo(sig1X + sigW, y + 45).strokeColor("#cccccc").stroke();
    doc.moveTo(sig2X, y + 45).lineTo(sig2X + sigW, y + 45).strokeColor("#cccccc").stroke();

    // Footer
    doc.font("Ar").fontSize(8).fillColor("#aaaaaa")
      .text(ar(BRAND.footer), margin + 16, doc.page.height - margin - 18, {
        width: contentW - 32,
        align: "center",
      });

    doc.end();
  });
}

module.exports = { generateInvoicePdf, formatDisplayDate };
