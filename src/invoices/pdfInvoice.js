const fs = require("fs");
const path = require("path");
const pdfmake = require("pdfmake");
const { ar } = require("./arabicText");

const BRAND = {
  nameAr: "لايف استوديو",
  nameEn: "LIVE STUDIO FOR ARTS",
  city: "البيضاء - ليبيا",
  color: "#4dbb88",
  footer: "البيضاء - بجانب شيل بوحليمه عماره مغسله الرونق | هاتف: 0926128650 | شكراً لثقتكم في لايف استوديو",
};

const FONT_CANDIDATES = [
  process.env.INVOICE_FONT_PATH,
  path.join(__dirname, "../assets/fonts/NotoSansArabic-Regular.ttf"),
  path.join(__dirname, "../../assets/fonts/NotoSansArabic-Regular.ttf"),
].filter(Boolean);

const LOGO_CANDIDATES = [
  path.join(__dirname, "../assets/logo-120.png"),
  path.join(__dirname, "../../assets/logo-120.png"),
].filter(Boolean);

let fontsReady = false;

function ensureFonts() {
  if (fontsReady) return;
  const fontPath = FONT_CANDIDATES.find((p) => fs.existsSync(p));
  if (!fontPath) {
    throw new Error("Arabic font missing — add NotoSansArabic-Regular.ttf to src/assets/fonts/");
  }
  pdfmake.setFonts({
    Arabic: { normal: fontPath, bold: fontPath, italics: fontPath, bolditalics: fontPath },
  });
  pdfmake.setLocalAccessPolicy(() => true);
  fontsReady = true;
}

function logoImage() {
  const p = LOGO_CANDIDATES.find((x) => fs.existsSync(x));
  return p ? p : null;
}

function t(text) {
  return ar(text == null ? "" : String(text));
}

/**
 * @returns {Promise<Buffer>}
 */
async function generateInvoicePdf(invoice, session = {}) {
  ensureFonts();

  const total = Number(invoice.totalPrice) || 0;
  const paid = Number(invoice.deposit) || 0;
  const due = Math.max(0, total - paid);
  const showDue = due > 0 && (invoice.paymentType === "deposit" || invoice.paymentType === "booking" || paid < total);
  const invNo = `#INV-${(invoice.id || "").slice(-8).toUpperCase() || "--------"}`;
  const logo = logoImage();

  const headerBlock = {
    columns: [
      {
        width: logo ? 90 : 0,
        stack: logo ? [{ image: logo, width: 90 }] : [],
        alignment: "left",
      },
      {
        width: "*",
        stack: [
          { text: t(BRAND.nameAr), fontSize: 26, color: BRAND.color, alignment: "right", bold: true },
          { text: BRAND.nameEn, fontSize: 11, color: "#666666", alignment: "right" },
          { text: t(BRAND.city), fontSize: 11, color: "#333333", alignment: "right", margin: [0, 4, 0, 0] },
        ],
      },
    ],
    margin: [0, 0, 0, 16],
  };

  const clientGrid = {
    columns: [
      {
        width: "*",
        stack: [
          { text: `${t("العميل")}: ${t(invoice.clientName || "—")}`, fontSize: 11, margin: [0, 2, 0, 2] },
          { text: `${t("اسم الجلسة")}: ${t(invoice.sessionName || "تصوير احترافي")}`, fontSize: 11, margin: [0, 2, 0, 2] },
          { text: `${t("موقع التصوير")}: ${t(invoice.location || session.location || "—")}`, fontSize: 11, margin: [0, 2, 0, 2] },
        ],
      },
      {
        width: "*",
        stack: [
          { text: `${t("تاريخ الحجز")}: ${invoice.date || session.date || "—"}`, fontSize: 11, alignment: "left", margin: [0, 2, 0, 2] },
          { text: `${t("رقم الفاتورة")}: ${invNo}`, fontSize: 11, alignment: "left", margin: [0, 2, 0, 2] },
          ...(session.time
            ? [{ text: `${t("الوقت")}: ${session.time}`, fontSize: 11, alignment: "left", margin: [0, 2, 0, 2] }]
            : []),
        ],
      },
    ],
    margin: [0, 0, 0, 20],
  };

  const detailsCell = [
    { text: t(invoice.package || invoice.sessionName || "الباقة المختارة"), fontSize: 14, color: BRAND.color, bold: true, margin: [0, 0, 0, 8] },
  ];
  if (invoice.sessionContent) {
    detailsCell.push(
      { text: t("محتويات الجلسة:"), fontSize: 10, color: "#555555", bold: true },
      { text: t(invoice.sessionContent), fontSize: 10, color: "#777777", margin: [0, 4, 16, 8] }
    );
  }
  if (invoice.equipment) {
    detailsCell.push(
      { text: t("المعدات المستخدمة:"), fontSize: 10, color: "#555555", bold: true },
      { text: t(invoice.equipment), fontSize: 10, color: "#777777", margin: [0, 4, 16, 0] }
    );
  }

  const table = {
    table: {
      widths: ["*", 100],
      body: [
        [
          { text: t("تفاصيل الجلسة والمعدات"), fillColor: "#f4f4f4", bold: true, alignment: "right" },
          { text: t("القيمة"), fillColor: "#f4f4f4", bold: true, alignment: "left" },
        ],
        [
          { stack: detailsCell, margin: [8, 10, 8, 10] },
          { text: `${total.toLocaleString()} ${t("د.ل")}`, bold: true, fontSize: 14, alignment: "left", margin: [8, 10, 8, 10] },
        ],
      ],
    },
    layout: {
      hLineWidth: (i) => (i === 1 ? 1 : 0),
      vLineWidth: () => 0,
      hLineColor: () => "#eeeeee",
      paddingLeft: () => 0,
      paddingRight: () => 0,
    },
    margin: [0, 0, 0, 24],
  };

  const paymentSummary = {
    width: 260,
    alignment: "right",
    stack: [
      {
        columns: [
          { text: `${total.toLocaleString()} ${t("د.ل")}`, alignment: "left", width: "*" },
          { text: t("إجمالي القيمة:"), color: "#666666", width: "auto" },
        ],
        margin: [0, 4, 0, 4],
      },
      ...(paid > 0
        ? [{
            columns: [
              { text: `${paid.toLocaleString()} ${t("د.ل")}`, alignment: "left", width: "*", bold: true, color: "#27ae60" },
              { text: t("المبلغ المدفوع:"), bold: true, color: "#27ae60", width: "auto" },
            ],
            margin: [0, 4, 0, 4],
          }]
        : []),
      showDue
        ? {
            table: {
              widths: ["*", "auto"],
              body: [[
                { text: `${due.toLocaleString()} ${t("د.ل")}`, bold: true, fontSize: 14, color: "#ffffff", alignment: "left" },
                { text: t("المبلغ المستحق:"), bold: true, fontSize: 14, color: "#ffffff", alignment: "right" },
              ]],
            },
            layout: "noBorders",
            fillColor: BRAND.color,
            margin: [0, 8, 0, 0],
          }
        : {
            text: t("تم الدفع بالكامل"),
            alignment: "center",
            bold: true,
            fontSize: 14,
            color: "#ffffff",
            fillColor: "#27ae60",
            margin: [0, 8, 0, 0],
          },
    ],
  };

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 50],
    defaultStyle: { font: "Arabic", fontSize: 11, alignment: "right" },
    content: [
      {
        canvas: [
          { type: "rect", x: 0, y: 0, w: 515, h: 762, lineWidth: 2, lineColor: BRAND.color },
          { type: "rect", x: 4, y: 4, w: 507, h: 754, lineWidth: 1, lineColor: BRAND.color },
        ],
        absolutePosition: { x: 40, y: 40 },
      },
      { margin: [16, 16, 16, 0], stack: [
        headerBlock,
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 483, y2: 0, lineWidth: 2, lineColor: BRAND.color }], margin: [0, 0, 0, 16] },
        clientGrid,
        table,
        paymentSummary,
        ...(invoice.notes
          ? [{
              margin: [0, 20, 0, 0],
              table: {
                widths: ["*"],
                body: [[{
                  stack: [
                    { text: t("ملاحظات:"), color: BRAND.color, bold: true, fontSize: 11 },
                    { text: t(invoice.notes), color: "#555555", fontSize: 10, margin: [0, 6, 0, 0] },
                  ],
                  fillColor: "#f8fafc",
                  margin: [10, 10, 10, 10],
                }]],
              },
              layout: { hLineWidth: () => 0, vLineWidth: () => 0 },
            }]
          : []),
        {
          columns: [
            { width: "*", stack: [{ text: t("توقيع المستلم"), alignment: "center", margin: [0, 50, 0, 4] }, { canvas: [{ type: "line", x1: 0, y1: 0, x2: 120, y2: 0, lineWidth: 1, lineColor: "#cccccc" }] }] },
            { width: "*", stack: [{ text: t("ختم وتوقيع الإدارة"), alignment: "center", margin: [0, 50, 0, 4] }, { canvas: [{ type: "line", x1: 0, y1: 0, x2: 120, y2: 0, lineWidth: 1, lineColor: "#cccccc" }] }] },
          ],
          margin: [0, 30, 0, 0],
        },
      ]},
      { text: t(BRAND.footer), fontSize: 8, color: "#aaaaaa", alignment: "center", margin: [16, 0, 16, 16], absolutePosition: { x: 56, y: 780 } },
    ],
  };

  return pdfmake.createPdf(docDefinition).getBuffer();
}

module.exports = { generateInvoicePdf };
