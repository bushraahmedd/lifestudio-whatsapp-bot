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

const SYSTEM_PROMPT = `أنت مساعد واتساب لاستوديو تصوير اسمه "لايف استوديو" في ليبيا.
تتكلم بلهجة ليبية ودودة وواضحة، قصيرة، بدون أخطاء إملائية كثيرة، وبدون رطانة رسمية.
لا تخترع أسعار أو مواعيد أو باقات غير موجودة في السياق.
لا تؤكد حجزاً أو دفعاً بنفسك — فقط وجه العميل للخطوة المناسبة.

مهمتك: افهم رسالة العميل وارجع JSON فقط بهذا الشكل:
{
  "intent": "book|cancel|pay|track|pricing|chat|human|greeting",
  "categories": ["wedding"|"graduation"|"birthday"|"family"|"studio_rental"|"equipment"|"pets"|"hall"],
  "ambiguous": false,
  "reply": "رد عربي قصير وطبيعي للعميل"
}

قواعد النوايا:
- book: يريد حجز موعد / جلسة
- cancel: إلغاء حجز
- pay: دفع / فاتورة / إيصال
- track: متابعة الصور أو حالة الجلسة
- pricing: يسأل عن أسعار أو باقات أو نوع خدمة
- greeting: سلام / مرحبا فقط
- human: يريد موظف بشري
- chat: سؤال عام أو غير واضح — جاوب بلطف ووجّهه (تخرج، عرسان، ميلاد، إيجار، حجز، موظف)

قواعد الرد:
- جملة إلى 4 جمل كحد أقصى
- لهجة ليبية طبيعية (مثلاً: تبي، نكمّل، شنو، تمام، أهلاً بيك)
- لو intent=pricing أو book وفيه فئة واضحة، خلي reply يشجّع يكمل بدون ما تخترع أرقام
- لو ambiguous=true، اسأل توضيح قصير بين خيارين فقط
- أرجع JSON فقط بدون markdown`;

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
      ? parsed.reply.trim().slice(0, 900)
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
    "",
    `رسالة العميل: ${text}`,
  ].join("\n");

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
  generateSmoothReply,
  checkOllamaHealth,
  sanitizeAgentResult,
};
