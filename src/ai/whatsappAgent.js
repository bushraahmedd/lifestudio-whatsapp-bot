const { chat, isReachable } = require("./ollamaClient");
const config = require("../config");

const VALID_INTENTS = new Set([
  "book",
  "cancel",
  "pay",
  "track",
  "pricing",
  "chat",
  "human",
  "greeting",
]);

const VALID_CATEGORIES = new Set([
  "wedding",
  "graduation",
  "birthday",
  "family",
  "studio_rental",
  "equipment",
  "pets",
  "hall",
]);

const SYSTEM_PROMPT = `أنت مساعد محادثة ذكي لاستوديو تصوير "لايف استوديو" في ليبيا — أسلوبك قريب من ChatGPT: طبيعي، ودود، واضح، ومفيد.

الشخصية:
- لهجة ليبية سلسة وحديثة (تبي، نكمّل، شنو، تمام، أهلاً بيك، يشرّفنا) بدون رسمية جامدة وبدون عامية مبالغ فيها.
- رد كأنك تكلم صديق في واتساب: دافئ، مرتب، وواضح.
- افهم الرسالة حتى لو فيها أخطاء إملائية أو اختصارات.
- اطرح سؤال متابعة ذكي واحد لما ينقصك معلومة.
- استخدم الأسطر القصيرة وعلامات *للتأكيد* sparingly مثل واتساب.

قيود مهمة:
- لا تخترع أسعار أو مواعيد أو باقات. استخدم فقط ما في سياق الباقات.
- لا تؤكد حجزاً أو دفعاً بنفسك — وجّه العميل للخطوة التالية (حجز / موظف).
- لو ما عندك معلومة: قول بصراحة واقترح تواصل مع موظف بكتابة *موظف*.

ارجع JSON فقط بهذا الشكل:
{
  "intent": "book|cancel|pay|track|pricing|chat|human|greeting",
  "categories": ["wedding"|"graduation"|"birthday"|"family"|"studio_rental"|"equipment"|"pets"|"hall"],
  "ambiguous": false,
  "reply": "رد عربي طبيعي للعميل"
}

النوايا:
- book: حجز موعد / جلسة
- cancel: إلغاء
- pay: دفع / فاتورة / إيصال
- track: متابعة الصور أو الحالة
- pricing: أسعار / باقات / نوع خدمة
- greeting: سلام فقط
- human: يريد موظف
- chat: محادثة عامة — جاوب كمساعد ذكي ثم وجّه بلطف

قواعد الرد (GPT-like):
- 2 إلى 6 جمل قصيرة، أو قائمة نقطية قصيرة للباقات
- لو pricing وفيه باقات في السياق: اذكر 2–5 باقات حقيقية مع أسعارها بأسلوب جميل، ثم اسأل أي باقة تناسبه أو تحب نكمّل الحجز
- لو book: أكّد الحماس واطلب تاريخ/وقت أو أكّد إن النظام راح يفتح المواعيد
- لو ambiguous: اسأل توضيح ودود بين خيارين فقط
- لو greeting: رحّب باسم الاستوديو واعرض المساعدة بحرية
- لا تكتب markdown code ولا تكتب غير JSON`

function mapHallCategory(cats) {
  return (cats || []).map((c) => (c === "hall" ? "wedding" : c));
}

function sanitizeAgentResult(raw, fallbackReply) {
  let parsed = raw;
  if (typeof raw === "string") {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Sometimes models wrap JSON in extra text — extract first object
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        return {
          intent: "chat",
          categories: [],
          ambiguous: false,
          reply: fallbackReply,
          source: "ollama-parse-fail",
        };
      }
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return {
          intent: "chat",
          categories: [],
          ambiguous: false,
          reply: fallbackReply,
          source: "ollama-parse-fail",
        };
      }
    }
  }

  let intent = String(parsed.intent || "chat").toLowerCase();
  if (!VALID_INTENTS.has(intent)) intent = "chat";

  let categories = Array.isArray(parsed.categories)
    ? parsed.categories
        .map((c) => String(c || "").toLowerCase().trim())
        .filter((c) => VALID_CATEGORIES.has(c))
    : [];
  categories = [...new Set(mapHallCategory(categories))];

  const reply =
    typeof parsed.reply === "string" && parsed.reply.trim()
      ? parsed.reply.trim().slice(0, 1600)
      : fallbackReply;

  return {
    intent,
    categories,
    ambiguous: Boolean(parsed.ambiguous) && categories.length > 1,
    reply,
    source: "ollama",
  };
}

function buildPackageContext(packages = []) {
  if (!packages.length) return "لا توجد باقات محمّلة حالياً.";
  return packages
    .slice(0, 20)
    .map((p) => {
      const price =
        p.price != null
          ? `${Number(p.price).toLocaleString()} د.ل`
          : p.hourlyRate
            ? `${p.hourlyRate} د.ل/ساعة`
            : p.dailyRate
              ? `${p.dailyRate} د.ل/يوم`
              : "—";
      return `- [${p.category || "?"}] ${p.label || p.id}: ${price}`;
    })
    .join("\n");
}

/**
 * Analyze a WhatsApp user message with Ollama.
 * Returns null if Ollama is disabled or unreachable.
 */
async function analyzeWithOllama({
  text,
  lastCategory = null,
  packages = [],
  extraContext = "",
  fallbackReply = "",
}) {
  const ai = config.ollama;
  if (!ai?.enabled) return null;

  const reachable = await isReachable(ai.baseUrl, ai.apiKey, 4000);
  if (!reachable) {
    console.warn("[ollama] not reachable at", ai.baseUrl);
    return null;
  }

  const userPrompt = [
    "سياق الاستوديو:",
    buildPackageContext(packages),
    lastCategory ? `آخر فئة اهتم بها العميل: ${lastCategory}` : "ما في فئة سابقة.",
    extraContext ? `\nمعلومات إضافية مؤكدة (استخدمها كما هي):\n${extraContext}` : "",
    "",
    `رسالة العميل: ${text}`,
  ].filter(Boolean).join("\n");

  try {
    const content = await chat({
      baseUrl: ai.baseUrl,
      apiKey: ai.apiKey,
      model: ai.model,
      temperature: ai.temperature,
      timeoutMs: ai.timeoutMs,
      format: "json",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    return sanitizeAgentResult(content, fallbackReply);
  } catch (err) {
    console.warn("[ollama] analyze failed:", err.message || err);
    return null;
  }
}

const POLISH_PROMPT = `أنت كاتب ردود واتساب لاستوديو "لايف استوديو" في ليبيا.
أعد صياغة المسودة التالية بأسلوب ChatGPT الطبيعي واللهجة الليبية الودودة.
قواعد صارمة:
- حافظ على كل الحقائق كما هي: الأسعار، التواريخ، الأوقات، الأرقام، أسماء الباقات، روابط، وخيارات 1/2/3.
- لا تضف أسعاراً أو مواعيد غير موجودة في المسودة.
- رد بنص الرسالة النهائي فقط (بدون JSON وبدون شرح).
- طول مناسب لواتساب (قصير إلى متوسط).`;

/**
 * Rewrite any outbound draft so the client only ever sees Ollama phrasing.
 * Falls back to the draft if Ollama is unavailable.
 */
async function polishOutboundReply({ userText = "", draft = "", state = "" }) {
  const ai = config.ollama;
  if (!ai?.enabled || !draft || !String(draft).trim()) return draft;

  const reachable = await isReachable(ai.baseUrl, ai.apiKey, 3000);
  if (!reachable) return draft;

  try {
    const content = await chat({
      baseUrl: ai.baseUrl,
      apiKey: ai.apiKey,
      model: ai.model,
      temperature: Math.min(0.75, (ai.temperature || 0.65) + 0.05),
      timeoutMs: ai.timeoutMs,
      messages: [
        { role: "system", content: POLISH_PROMPT },
        {
          role: "user",
          content: [
            state ? `حالة المحادثة: ${state}` : "",
            userText ? `رسالة العميل: ${userText}` : "",
            "مسودة الرد (أعد صياغتها):",
            draft,
          ].filter(Boolean).join("\n"),
        },
      ],
    });
    const polished = String(content || "").trim();
    if (!polished || polished.length < 2) return draft;
    return polished.slice(0, 2000);
  } catch (err) {
    console.warn("[ollama] polish failed:", err.message || err);
    return draft;
  }
}

/**
 * Generate a smooth free-form WhatsApp reply (no structured intent).
 */
async function generateSmoothReply({ text, lastCategory = null, packages = [], fallbackReply }) {
  const result = await analyzeWithOllama({
    text,
    lastCategory,
    packages,
    fallbackReply,
  });
  if (!result) return null;
  return result.reply || fallbackReply;
}

async function checkOllamaHealth() {
  const ai = config.ollama;
  if (!ai?.enabled) {
    return { ok: false, reason: "disabled" };
  }
  const ok = await isReachable(ai.baseUrl, ai.apiKey);
  return {
    ok,
    baseUrl: ai.baseUrl,
    model: ai.model,
    cloud: /ollama\.com/i.test(ai.baseUrl || ""),
    hasApiKey: Boolean(ai.apiKey),
    reason: ok ? "ok" : "unreachable",
  };
}

module.exports = {
  analyzeWithOllama,
  polishOutboundReply,
  generateSmoothReply,
  checkOllamaHealth,
  sanitizeAgentResult,
};
