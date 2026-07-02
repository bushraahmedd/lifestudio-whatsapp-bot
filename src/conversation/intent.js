const { normalizeInput } = require("./stateMachine");

const KEYWORDS = {
  graduation: [
    "graduate", "graduation", "grad", "تخرج", "خريج", "خريجة", "تخرجت", "تخرجي",
    "شهادة", "جامعة", "ثانوية",
  ],
  studio_rental: [
    "rent", "rental", "studio rental", "أجار", "ايجار", "إيجار", "استوديو", "استديو",
    "قاعة", "space", "hourly",
  ],
  wedding: [
    "wedding", "bride", "groom", "عرس", "عرسان", "عروس", "عروسة", "زواج", "فرح",
    "كوشة", "engagement", "خطوبة",
  ],
  book: [
    "book", "booking", "reserve", "حجز", "احجز", "ابي احجز", "نبي نحجز", "موعد", "appointment",
  ],
  cancel: ["cancel", "الغاء", "إلغاء", "الغي"],
  pay: ["pay", "payment", "دفع", "ادفع", "فاتورة", "invoice"],
  track: ["track", "status", "متابعة", "وين صور", "جاهز", "status"],
  pricing: ["price", "prices", "سعر", "اسعار", "أسعار", "كم", "بكم", "تكلفة", "باقات"],
};

function scoreKeywords(text, words) {
  const t = normalizeInput(text);
  let score = 0;
  for (const w of words) {
    if (t.includes(normalizeInput(w))) score += 1;
  }
  return score;
}

/**
 * @returns {{ intent: string|null, categories: string[], ambiguous: boolean, scores: object }}
 */
function detectIntent(text) {
  const scores = {
    graduation: scoreKeywords(text, KEYWORDS.graduation),
    studio_rental: scoreKeywords(text, KEYWORDS.studio_rental),
    wedding: scoreKeywords(text, KEYWORDS.wedding),
    book: scoreKeywords(text, KEYWORDS.book),
    cancel: scoreKeywords(text, KEYWORDS.cancel),
    pay: scoreKeywords(text, KEYWORDS.pay),
    track: scoreKeywords(text, KEYWORDS.track),
    pricing: scoreKeywords(text, KEYWORDS.pricing),
  };

  const serviceCats = ["graduation", "studio_rental", "wedding"]
    .filter((c) => scores[c] > 0)
    .sort((a, b) => scores[b] - scores[a]);

  if (scores.cancel >= 1) return { intent: "cancel", categories: [], ambiguous: false, scores };
  if (scores.pay >= 1) return { intent: "pay", categories: [], ambiguous: false, scores };
  if (scores.track >= 1) return { intent: "track", categories: [], ambiguous: false, scores };

  if (scores.book >= 1) {
    const cat = serviceCats[0] || null;
    return { intent: "book", categories: cat ? [cat] : [], ambiguous: false, scores };
  }

  if (serviceCats.length > 1 && scores[serviceCats[0]] === scores[serviceCats[1]]) {
    return { intent: "pricing", categories: serviceCats.slice(0, 2), ambiguous: true, scores };
  }

  if (serviceCats.length >= 1 || scores.pricing >= 1) {
    return {
      intent: "pricing",
      categories: serviceCats.length ? serviceCats : ["graduation", "studio_rental", "wedding"],
      ambiguous: serviceCats.length > 1,
      scores,
    };
  }

  return { intent: null, categories: [], ambiguous: false, scores };
}

function isAffirmative(text) {
  const t = normalizeInput(text);
  return ["نعم", "أيوه", "ايوه", "ايه", "أيه", "yes", "ok", "تمام", "حجز", "احجز", "نحجز", "book"].includes(t)
    || t.includes("حجز");
}

module.exports = { detectIntent, isAffirmative, KEYWORDS };
