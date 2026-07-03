const { ArabicShaper } = require("arabic-persian-reshaper");

/**
 * Shape Arabic glyphs for PDF engines without full HarfBuzz (pdfmake/pdfkit).
 */
function ar(text) {
  if (text == null || text === "") return "";
  const raw = String(text);
  if (!/[\u0600-\u06FF]/.test(raw)) return raw;
  try {
    return ArabicShaper.convertArabic(raw);
  } catch {
    return raw;
  }
}

module.exports = { ar };
