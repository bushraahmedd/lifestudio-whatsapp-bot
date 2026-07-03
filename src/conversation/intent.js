const { normalizeInput } = require("./stateMachine");

const KEYWORDS = {
  graduation: [
    "graduate", "graduation", "grad", "تخرج", "خريج", "خريجة", "تخرجت", "تخرجي",
    "شهادة", "جامعة", "ثانوية", "خريجات",
  ],
  studio_rental: [
    "rent", "rental", "أجار", "ايجار", "إيجار", "اجار", "أرضية", "ارضية",
  ],
  wedding: [
    "wedding", "bride", "groom", "عرس", "عرسان", "عروس", "عروسة", "زواج", "فرح",
    "كوشة", "engagement", "خطوبة", "صباحية", "vip",
  ],
  hall: ["صالة", "قاعة", "داخل الاستوديو", "داخل الاستديو", "hall", "studio photo"],
  equipment: [
    "معدات", "ميش", "اضاءه", "إضاءة", "اضاءة", "نار", "بخار", "فقعات", "سحاب",
    "دزني", "سندريلا", "ليزر",
  ],
  pets: ["بت", "بتات", "حيوان", "حيوانات", "pet", "pets"],
  birthday: ["ميلاد", "عيد", "اطفال", "أطفال", "birthday"],
  family: ["عائلية", "عائلة", "عائلي", "family"],
  book: [
    "book", "booking", "reserve", "حجز", "احجز", "ابي احجز", "نبي نحجز", "موعد", "appointment",
  ],
  cancel: ["cancel", "الغاء", "إلغاء", "الغي"],
  pay: ["pay", "payment", "دفع", "ادفع", "فاتورة", "invoice"],
  track: ["track", "status", "متابعة", "وين صور", "جاهز"],
  pricing: ["price", "prices", "سعر", "اسعار", "أسعار", "كم", "بكم", "تكلفة", "باقات", "باقة"],
};

function scoreKeywords(text, words) {
  const t = normalizeInput(text);
  let score = 0;
  for (const w of words) {
    if (t.includes(normalizeInput(w))) score += 1;
  }
  return score;
}

function detectIntent(text) {
  const scores = {
    graduation: scoreKeywords(text, KEYWORDS.graduation),
    studio_rental: scoreKeywords(text, KEYWORDS.studio_rental),
    wedding: scoreKeywords(text, KEYWORDS.wedding),
    hall: scoreKeywords(text, KEYWORDS.hall),
    equipment: scoreKeywords(text, KEYWORDS.equipment),
    pets: scoreKeywords(text, KEYWORDS.pets),
    birthday: scoreKeywords(text, KEYWORDS.birthday),
    family: scoreKeywords(text, KEYWORDS.family),
    book: scoreKeywords(text, KEYWORDS.book),
    cancel: scoreKeywords(text, KEYWORDS.cancel),
    pay: scoreKeywords(text, KEYWORDS.pay),
    track: scoreKeywords(text, KEYWORDS.track),
    pricing: scoreKeywords(text, KEYWORDS.pricing),
  };

  // "استوديو" alone → pricing (inside studio packages), not rental
  const t = normalizeInput(text);
  if (t.includes("استوديو") || t.includes("استديو")) {
    if (!scores.studio_rental) scores.wedding += 1;
  }
  if (t.includes("ايجار") || t.includes("إيجار") || t.includes("أرضية")) {
    scores.studio_rental += 2;
  }

  const serviceCats = ["wedding", "hall", "graduation", "studio_rental", "equipment", "pets", "birthday", "family"]
    .filter((c) => scores[c] > 0)
    .sort((a, b) => scores[b] - scores[a]);

  // map hall → wedding package flow
  const primaryCat = serviceCats[0] === "hall" ? "wedding" : serviceCats[0];

  if (scores.cancel >= 1) return { intent: "cancel", categories: [], ambiguous: false, scores };
  if (scores.pay >= 1) return { intent: "pay", categories: [], ambiguous: false, scores };
  if (scores.track >= 1) return { intent: "track", categories: [], ambiguous: false, scores };

  if (scores.book >= 1) {
    const cat = primaryCat || (serviceCats[0] === "hall" ? "wedding" : serviceCats[0]) || null;
    return { intent: "book", categories: cat ? [cat] : [], ambiguous: false, scores, hall: scores.hall > 0 };
  }

  if (serviceCats.length > 1 && scores[serviceCats[0]] === scores[serviceCats[1]]) {
    return { intent: "pricing", categories: serviceCats.slice(0, 2).map((c) => (c === "hall" ? "wedding" : c)), ambiguous: true, scores };
  }

  if (serviceCats.length >= 1 || scores.pricing >= 1) {
    const cats = serviceCats.length
      ? serviceCats.map((c) => (c === "hall" ? "wedding" : c))
      : ["wedding", "graduation", "birthday"];
    return {
      intent: "pricing",
      categories: cats,
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
