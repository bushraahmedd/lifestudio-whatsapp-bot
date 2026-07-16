require("dotenv").config();

module.exports = {
  port: Number(process.env.PORT) || 8080,
  apiKey: process.env.BOT_API_KEY || "",
  ownerPhone: (process.env.OWNER_PHONE || "218926128650").replace(/\D/g, ""),
  /** `baileys` (recommended) | `webjs` */
  whatsappProvider: (process.env.WHATSAPP_PROVIDER || "baileys").toLowerCase(),
  bank: {
    name: process.env.BANK_NAME || "مصرف ليبيا المركزي",
    accountName: process.env.BANK_ACCOUNT_NAME || "لايف استوديو",
    accountNumber: process.env.BANK_ACCOUNT_NUMBER || "",
    iban: process.env.BANK_IBAN || "",
    iban2: process.env.BANK_IBAN_2 || "",
    note: process.env.BANK_TRANSFER_NOTE || "بعد التحويل ابعث صورة الإيصال هنا.",
  },
  /** Comma-separated boss phones for WhatsApp alerts */
  bossPhones: (process.env.BOSS_PHONES || "")
    .split(",")
    .map((p) => p.replace(/\D/g, ""))
    .filter(Boolean),
  scheduling: {
    workStartHour: Number(process.env.WORK_START_HOUR) || 9,
    workEndHour: Number(process.env.WORK_END_HOUR) || 21,
    slotMinutes: Number(process.env.SLOT_INTERVAL_MINUTES) || 60,
    sessionDurationMinutes: Number(process.env.DEFAULT_SESSION_DURATION_MINUTES) || 120,
    daysAhead: Number(process.env.AVAILABILITY_DAYS_AHEAD) || 14,
  },
  pricing: {
    defaultPrice: Number(process.env.DEFAULT_PACKAGE_PRICE) || 1500,
    depositPercent: Number(process.env.DEFAULT_DEPOSIT_PERCENT) || 30,
  },
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || "lifestudio-abf4b",
  sessionDataPath: process.env.WWEBJS_DATA_PATH || ".wwebjs_auth",
  baileysAuthPath: process.env.BAILEYS_AUTH_PATH || ".baileys_auth",
  /**
   * Ollama LLM for smoother WhatsApp NLU + free-form replies.
   * Prefer Ollama Cloud (no local install): set OLLAMA_API_KEY from https://ollama.com/settings/keys
   * Or point OLLAMA_BASE_URL at any remote Ollama host.
   */
  ollama: (() => {
    const apiKey = (process.env.OLLAMA_API_KEY || "").trim();
    const explicitUrl = (process.env.OLLAMA_BASE_URL || "").trim();
    // If an API key is set and no URL override, use Ollama Cloud
    const baseUrl =
      explicitUrl
      || (apiKey ? "https://ollama.com" : "http://127.0.0.1:11434");
    const isCloud = /ollama\.com$/i.test(baseUrl.replace(/\/+$/, "").replace(/\/api$/i, ""));
    return {
      enabled: String(process.env.OLLAMA_ENABLED || "true").toLowerCase() !== "false",
      apiKey,
      baseUrl,
      // Cloud models are hosted; local default stays small
      model:
        process.env.OLLAMA_MODEL
        || (isCloud || apiKey ? "gpt-oss:120b" : "qwen2.5:7b"),
      temperature: Number(process.env.OLLAMA_TEMPERATURE) || 0.35,
      timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS) || (isCloud || apiKey ? 60000 : 45000),
    };
  })(),
};
