const { ArabicShaper } = require("arabic-persian-reshaper");
const bidiFactory = require("bidi-js");

const bidi = bidiFactory();

/**
 * Shape + reorder Arabic for PDFKit (no HarfBuzz).
 * Returns visual-order string safe for right-aligned PDF text.
 */
function ar(text) {
  if (text == null || text === "") return "";
  const raw = String(text);
  if (!/[\u0600-\u06FF]/.test(raw)) return raw;
  try {
    const shaped = ArabicShaper.convertArabic(raw);
    const levels = bidi.getEmbeddingLevels(shaped, "rtl");
    return bidi.getReorderedString(shaped, levels);
  } catch {
    try {
      return ArabicShaper.convertArabic(raw);
    } catch {
      return raw;
    }
  }
}

/** Mix Arabic + Latin/digits safely for one PDF line */
function arLine(...parts) {
  return ar(parts.filter((p) => p != null && p !== "").join(" "));
}

module.exports = { ar, arLine };
