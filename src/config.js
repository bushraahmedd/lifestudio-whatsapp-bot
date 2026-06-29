require("dotenv").config();

module.exports = {
  port: Number(process.env.PORT) || 8080,
  apiKey: process.env.BOT_API_KEY || "",
  ownerPhone: (process.env.OWNER_PHONE || "218926128650").replace(/\D/g, ""),
  /** `baileys` (recommended) | `webjs` */
  whatsappProvider: (process.env.WHATSAPP_PROVIDER || "baileys").toLowerCase(),
  bank: {
    name: process.env.BANK_NAME || "مصرف",
    accountName: process.env.BANK_ACCOUNT_NAME || "لايف استوديو",
    accountNumber: process.env.BANK_ACCOUNT_NUMBER || "",
    note: process.env.BANK_TRANSFER_NOTE || "أرسل صورة الإيصال بعد التحويل",
  },
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
};
