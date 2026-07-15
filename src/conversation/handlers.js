const { STATES, MAIN_MENU_TEXT, normalizeInput, isBack } = require("./stateMachine");
const { formatBankTransfer } = require("./messages");
const { SOFT_HELP_TEXT, HUMAN_HANDOFF_TEXT, BOT_RESUMED_TEXT } = require("./messages");
const { detectIntent, isAffirmative } = require("./intent");
const { matchSinglePackage } = require("./packageMatcher");
const { buildSinglePackageReply, buildCategoryHint } = require("./packageReplies");
const { parseDateTime, formatDisplayDate } = require("./dateParser");
const {
  buildAmbiguousClarifier,
  CATEGORY_META,
} = require("./pricingMessages");
const { getPackages, getPackageById } = require("../firestore/packages");
const {
  getAvailability,
  getAvailabilityForDate,
  getNearbyAvailability,
  formatSlotsList,
  isSlotAvailable,
} = require("../firestore/availability");
const {
  createTentativeSession,
  getSessionsByPhone,
  cancelSession,
  rescheduleSession,
  confirmSession,
} = require("../firestore/sessions");
const {
  createInvoiceFromBooking,
  getInvoicesByPhone,
  markInvoicePaid,
  formatInvoiceMessage,
  getAmountDue,
} = require("../firestore/invoices");
const {
  getChatState,
  setChatState,
  clearChatState,
  getBotConfig,
  logWhatsAppEvent,
} = require("../firestore/botState");
const config = require("../config");
const { sendInvoicePdfToClient } = require("../invoices/sendInvoicePdf");
const {
  isValidClientPhone,
  normalizeClientPhoneInput,
} = require("../whatsapp/phoneUtils");

function isYes(text) {
  const t = normalizeInput(text);
  return ["نعم", "أيوه", "ايوه", "ايه", "أيه", "yes", "ok", "تأكيد", "1"].includes(t);
}

function wantsHuman(text) {
  const t = normalizeInput(text);
  return (
    t === "موظف"
    || t === "بشري"
    || t === "ايقاف"
    || t === "إيقاف"
    || t === "stop"
    || t.includes("كلم موظف")
    || t.includes("ايقاف البوت")
    || t.includes("إيقاف البوت")
    || t.includes("وقف البوت")
    || t.includes("ابي موظف")
    || t.includes("نبي موظف")
  );
}

function wantsBotResume(text) {
  const t = normalizeInput(text);
  return (
    t === "تشغيل"
    || t === "بوت"
    || t === "resume"
    || t === "start"
    || t.includes("تشغيل البوت")
    || t.includes("رجع البوت")
  );
}

const HUMAN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/** Best phone for this chat: saved in state, or resolved from WhatsApp ctx */
function resolveClientPhone(ctx, data = {}) {
  if (data.clientPhone && isValidClientPhone(data.clientPhone)) {
    return normalizeClientPhoneInput(data.clientPhone);
  }
  if (ctx.phone && isValidClientPhone(ctx.phone)) {
    return normalizeClientPhoneInput(ctx.phone);
  }
  return "";
}

async function askClientPhone(ctx, data) {
  const { chatId, send } = ctx;
  await send(
    "📱 *رقم هاتفك للتواصل؟*\n" +
    "ابعت رقمك (مثلاً *0926128650* أو *218926128650*)"
  );
  await setChatState(chatId, STATES.BOOK_CLIENT_PHONE, data);
}

async function startHumanTakeover(ctx, data = {}) {
  const { chatId, phone, send, notifyOwner } = ctx;
  await send(HUMAN_HANDOFF_TEXT);
  await setChatState(chatId, STATES.HUMAN_TAKEOVER, { ...data, humanSince: new Date().toISOString() }, HUMAN_TTL_MS);
  try {
    await notifyOwner(
      `👤 *طلب موظف — البوت متوقف*\n` +
      `📱 ${phone}\n` +
      `الدردشة: ${chatId}\n` +
      `كمّل مع العميل من واتساب. لإعادة البوت اطلب منه يكتب: تشغيل`
    );
  } catch {
    // ignore
  }
}

async function resumeBot(ctx) {
  const { chatId, send } = ctx;
  await send(BOT_RESUMED_TEXT);
  await setChatState(chatId, STATES.MAIN_MENU, {});
}

async function continueBookingAfterSlot(ctx, data) {
  const { chatId, send } = ctx;
  if (data.packageId || data.selectedPackageId) {
    const pkgId = data.packageId || data.selectedPackageId;
    const pkg = data.packages?.find((p) => p.id === pkgId) || (await getPackageById(pkgId));
    await send("👤 شنو *اسمك الكامل*؟");
    await setChatState(chatId, STATES.BOOK_CLIENT_NAME, {
      ...data,
      packageId: pkgId,
      packageLabel: data.packageLabel || pkg?.label,
      totalPrice: data.totalPrice || pkg?.price || 0,
    });
    return;
  }
  const pkgs = data.packages?.length
    ? data.packages
    : await getPackages({ category: data.serviceCategory || undefined });
  if (pkgs.length === 1) {
    const pkg = pkgs[0];
    await send("👤 شنو *اسمك الكامل*؟");
    await setChatState(chatId, STATES.BOOK_CLIENT_NAME, {
      ...data,
      packageId: pkg.id,
      packageLabel: pkg.label,
      totalPrice: pkg.price || 0,
    });
    return;
  }
  const lines = pkgs.map((p, i) => `*${i + 1}* — ${p.label} (${p.price} د.ل)`);
  await send(`📦 *شنو الباقة؟*\n${lines.join("\n")}\n\nابعث رقم الباقة`);
  await setChatState(chatId, STATES.BOOK_PICK_PACKAGE, { ...data, packages: pkgs });
}

async function handleSlotRequest(ctx, date, time, data) {
  const { chatId, send } = ctx;
  const ok = await isSlotAvailable(date, time);
  if (!ok) {
    const nearby = await getNearbyAvailability(date, 4);
    await send(
      `نعتذر منك 🙏 هذا الموعد *${formatDisplayDate(date)}* الساعة *${time}* محجوز مسبقاً.\n\n` +
      `القائمة التالية تحتوي على الأوقات المتاحة في نفس اليوم أو الأيام القريبة — هل يناسبك أحدها؟\n\n` +
      `${formatSlotsList(nearby)}\n\nابعث رقم اليوم أو *0* للقائمة.`
    );
    await setChatState(chatId, STATES.BOOK_PICK_DATE, { ...data, days: nearby });
    return;
  }
  await send(`تمام! الموعد *${formatDisplayDate(date)}* الساعة *${time}* متاح ✅ نكمل معاك الحجز.`);
  await continueBookingAfterSlot(ctx, { ...data, selectedDate: date, selectedTime: time });
}

/**
 * @param {object} ctx
 * @param {string} ctx.chatId
 * @param {string} ctx.phone - sender digits
 * @param {string} ctx.body - message text
 * @param {function} ctx.send - async (text) => void
 * @param {function} ctx.notifyOwner - async (text) => void
 */
async function handleIncomingMessage(ctx) {
  const { chatId, phone, body, send, notifyOwner } = ctx;
  const text = (body || "").trim();

  if (!text) return;

  await logWhatsAppEvent({ chatId, phone, direction: "in", message: text });

  // Resume bot anytime
  if (wantsBotResume(text)) {
    return resumeBot(ctx);
  }

  let chat = await getChatState(chatId);

  // Human takeover — bot stays silent (staff finishes with client)
  if (chat?.state === STATES.HUMAN_TAKEOVER) {
    return;
  }

  // Client/staff asks to stop bot and talk to human
  if (wantsHuman(text)) {
    return startHumanTakeover(ctx, chat?.data || {});
  }

  if (isBack(text)) {
    await clearChatState(chatId);
    await send(MAIN_MENU_TEXT);
    await setChatState(chatId, STATES.MAIN_MENU, {});
    return;
  }

  if (!chat) {
    const botConfig = await getBotConfig();
    await send(`${botConfig.greeting}\n\n${MAIN_MENU_TEXT}`);
    await setChatState(chatId, STATES.MAIN_MENU, {});
    chat = { state: STATES.MAIN_MENU, data: {} };
  }

  const { state, data: rawData } = chat;
  let data = rawData || {};
  if (isValidClientPhone(phone)) {
    data = { ...data, clientPhone: normalizeClientPhoneInput(phone) };
  }

  try {
    switch (state) {
      case STATES.MAIN_MENU:
        return handleMainMenu(ctx, text, data);
      case STATES.INTENT_CLARIFY:
        return handleIntentClarify(ctx, text, data);
      case STATES.HUMAN_TAKEOVER:
        return;
      case STATES.BOOK_PICK_DATE:
        return handleBookPickDate(ctx, text, data);
      case STATES.BOOK_PICK_TIME:
        return handleBookPickTime(ctx, text, data);
      case STATES.BOOK_PICK_PACKAGE:
        return handleBookPickPackage(ctx, text, data);
      case STATES.BOOK_CLIENT_NAME:
        return handleBookClientName(ctx, text, data);
      case STATES.BOOK_CLIENT_PHONE:
        return handleBookClientPhone(ctx, text, data);
      case STATES.BOOK_LOCATION:
        return handleBookLocation(ctx, text, data);
      case STATES.BOOK_PAYMENT_TYPE:
        return handleBookPaymentType(ctx, text, data);
      case STATES.BOOK_PAY_CHANNEL:
        return handleBookPayChannel(ctx, text, data);
      case STATES.BOOK_CONFIRM:
        return handleBookConfirm(ctx, text, data, notifyOwner);
      case STATES.CANCEL_PICK:
        return handleCancelPick(ctx, text, data);
      case STATES.CANCEL_CONFIRM:
        return handleCancelConfirm(ctx, text, data, notifyOwner);
      case STATES.RESCHEDULE_PICK:
        return handleReschedulePick(ctx, text, data);
      case STATES.RESCHEDULE_DATE:
        return handleRescheduleDate(ctx, text, data);
      case STATES.RESCHEDULE_TIME:
        return handleRescheduleTime(ctx, text, data, notifyOwner);
      case STATES.PAY_PICK_INVOICE:
        return handlePayPickInvoice(ctx, text, data);
      case STATES.PAY_METHOD:
        return handlePayMethod(ctx, text, data);
      case STATES.PAY_AWAIT_RECEIPT:
        return handlePayAwaitReceipt(ctx, text, data, notifyOwner);
      case STATES.TRACK_PICK:
        return handleTrackPick(ctx, text, data);
      default:
        await clearChatState(chatId);
        await send(MAIN_MENU_TEXT);
        await setChatState(chatId, STATES.MAIN_MENU, {});
    }
  } catch (err) {
    console.error("Handler error:", err);
    await send("⚠️ صار خطأ بسيط. ابعث *0* وارجع للقائمة.");
  }
}

async function handleMainMenu(ctx, text, data) {
  const { chatId, send } = ctx;
  const choice = normalizeInput(text);
  const detected = detectIntent(text);

  const parsed = parseDateTime(text);
  if (parsed.date && parsed.time) {
    return handleSlotRequest(ctx, parsed.date, parsed.time, data);
  }
  if (parsed.date) {
    const day = await getAvailabilityForDate(parsed.date);
    if (!day.slots.length) {
      const nearby = await getNearbyAvailability(parsed.date, 4);
      await send(
        `نعتذر منك، يوم *${formatDisplayDate(parsed.date)}* محجوز بالكامل.\n\n${formatSlotsList(nearby)}\n\nابعث رقم اليوم المناسب.`
      );
      await setChatState(chatId, STATES.BOOK_PICK_DATE, { ...data, days: nearby });
      return;
    }
    const lines = day.slots.slice(0, 12).map((s, i) => `*${i + 1}* — ${s.time}`);
    await send(`مواعيد *${day.label}* (${formatDisplayDate(day.date)}):\n${lines.join("\n")}\n\nابعث رقم الوقت`);
    await setChatState(chatId, STATES.BOOK_PICK_TIME, {
      ...data,
      selectedDate: day.date,
      slots: day.slots.slice(0, 12),
    });
    return;
  }

  const matched = await matchSinglePackage(text);
  if (matched) {
    await send(await buildSinglePackageReply(matched.package, matched.category));
    await setChatState(chatId, STATES.MAIN_MENU, {
      ...data,
      lastCategory: matched.category,
      selectedPackageId: matched.package.id,
      packageLabel: matched.package.label,
      totalPrice: matched.package.price || 0,
      packages: [matched.package],
    });
    return;
  }

  if (choice === "1" || choice === "حجز") return startBookFlow(ctx, { serviceCategory: data.lastCategory, packages: data.packages });
  if (choice === "2" || choice === "الغاء" || choice === "إلغاء") return startCancelFlow(ctx);
  if (choice === "3" || choice === "تغيير") return startRescheduleFlow(ctx);
  if (choice === "4" || choice === "دفع") return startPayFlow(ctx);
  if (choice === "5" || choice === "متابعة") return startTrackFlow(ctx);

  if (/^(مرحبا|السلام|هلا|hello|hi|أهلا|اهلا|مساعدة|help)/.test(choice)) {
    const botConfig = await getBotConfig();
    await send(`${botConfig.greeting}\n\n${MAIN_MENU_TEXT}`);
    return;
  }

  if (detected.intent === "cancel") return startCancelFlow(ctx);
  if (detected.intent === "pay") return startPayFlow(ctx);
  if (detected.intent === "track") return startTrackFlow(ctx);

  if (detected.intent === "pricing") {
    if (detected.ambiguous) {
      await send(await buildAmbiguousClarifier(detected.categories));
      await setChatState(chatId, STATES.INTENT_CLARIFY, { pendingCategories: detected.categories });
      return;
    }
    const cat = detected.categories[0];
    await send(await buildCategoryHint(cat));
    await setChatState(chatId, STATES.MAIN_MENU, { lastCategory: cat });
    return;
  }

  if (detected.intent === "book" || (isAffirmative(text) && (data.lastCategory || data.selectedPackageId))) {
    const cat = detected.categories[0] || data.lastCategory || null;
    return startBookFlow(ctx, {
      serviceCategory: cat,
      packages: data.packages,
      selectedPackageId: data.selectedPackageId,
      packageLabel: data.packageLabel,
      totalPrice: data.totalPrice,
    });
  }

  if (detected.categories.length === 1) {
    await send(await buildCategoryHint(detected.categories[0]));
    await setChatState(chatId, STATES.MAIN_MENU, { lastCategory: detected.categories[0] });
    return;
  }

  await send(SOFT_HELP_TEXT);
}

async function handleIntentClarify(ctx, text, data) {
  const { chatId, send } = ctx;
  const detected = detectIntent(text);

  const matched = await matchSinglePackage(text);
  if (matched) {
    await send(await buildSinglePackageReply(matched.package, matched.category));
    await setChatState(chatId, STATES.MAIN_MENU, {
      ...data,
      lastCategory: matched.category,
      selectedPackageId: matched.package.id,
      packageLabel: matched.package.label,
      totalPrice: matched.package.price || 0,
      packages: [matched.package],
    });
    return;
  }

  if (detected.intent === "book" || isAffirmative(text)) {
    const cat = detected.categories[0] || data.pendingCategories?.[0] || null;
    return startBookFlow(ctx, { serviceCategory: cat, packages: data.packages });
  }

  if (detected.categories.length === 1) {
    await send(await buildCategoryHint(detected.categories[0]));
    await setChatState(chatId, STATES.MAIN_MENU, { lastCategory: detected.categories[0] });
    return;
  }

  await send(await buildAmbiguousClarifier(
    detected.categories.length ? detected.categories : ["wedding", "graduation", "birthday"]
  ));
}

async function startBookFlow(ctx, opts = {}) {
  const { chatId, send } = ctx;
  const {
    serviceCategory,
    packages,
    selectedPackageId,
    packageLabel,
    totalPrice,
  } = opts;
  const days = await getAvailability();
  if (!days.length) {
    await send("معذرة، ما فيش مواعيد فاضية هالفترة. تواصل مع الاستوديو على الطبيعة 🙏");
    return;
  }
  const catLabel = serviceCategory ? CATEGORY_META[serviceCategory]?.title : null;
  const intro = catLabel
    ? `📅 *حجز ${catLabel}* — اختار اليوم أو ابعت التاريخ والوقت مباشرة:`
    : "📅 *المواعيد الفاضية* — اختار اليوم أو ابعت التاريخ:";
  const lines = days.slice(0, 10).map((d, i) => `*${i + 1}* — ${d.label} (${formatDisplayDate(d.date)}) — ${d.slots.length} موعد`);
  await send(`${intro}\n${lines.join("\n")}\n\nابعث رقم اليوم، أو *0* للرجوع`);
  await setChatState(chatId, STATES.BOOK_PICK_DATE, {
    days: days.slice(0, 10),
    serviceCategory: serviceCategory || null,
    packages: packages || null,
    selectedPackageId: selectedPackageId || null,
    packageLabel: packageLabel || null,
    totalPrice: totalPrice || null,
  });
}

async function handleBookPickDate(ctx, text, data) {
  const { chatId, send } = ctx;
  let day;
  const idx = parseInt(text, 10) - 1;
  if (!Number.isNaN(idx) && data.days?.[idx]) {
    day = data.days[idx];
  } else {
    const parsed = parseDateTime(text);
    if (parsed.date) {
      day = await getAvailabilityForDate(parsed.date);
      if (!day.slots.length) {
        const nearby = await getNearbyAvailability(parsed.date, 4);
        await send(
          `نعتذر منك، يوم *${formatDisplayDate(parsed.date)}* محجوز.\n\n${formatSlotsList(nearby)}\n\nاختار يوماً من القائمة.`
        );
        await setChatState(chatId, STATES.BOOK_PICK_DATE, { ...data, days: nearby });
        return;
      }
    }
  }
  if (!day) {
    await send("الرقم أو التاريخ مو صحيح. ابعث رقم اليوم من القائمة أو تاريخ مثل 15/6.");
    return;
  }
  const slots = day.slots.slice(0, 12);
  const lines = slots.map((s, i) => `*${i + 1}* — ${s.time}`);
  await send(`⏰ مواعيد *${day.label}*\n${lines.join("\n")}\n\nابعث رقم الوقت أو اكتب الساعة (مثلاً 10:00)`);
  await setChatState(chatId, STATES.BOOK_PICK_TIME, { ...data, selectedDate: day.date, slots });
}

async function handleBookPickTime(ctx, text, data) {
  const { chatId, send } = ctx;
  let slot;
  const idx = parseInt(text, 10) - 1;
  if (!Number.isNaN(idx) && data.slots?.[idx]) {
    slot = data.slots[idx];
  } else {
    const parsed = parseDateTime(text);
    if (parsed.time) {
      slot = { time: parsed.time };
    }
  }
  if (!slot?.time) {
    await send("رقم أو وقت غير صحيح. ابعث رقم الوقت أو مثلاً *14:00*.");
    return;
  }
  return handleSlotRequest(ctx, data.selectedDate, slot.time, data);
}

async function handleBookPickPackage(ctx, text, data) {
  const { chatId, send } = ctx;
  const idx = parseInt(text, 10) - 1;
  const pkg = data.packages?.[idx];
  if (!pkg) {
    await send("رقم غير صحيح.");
    return;
  }
  await send("👤 شنو *اسمك الكامل*؟");
  await setChatState(chatId, STATES.BOOK_CLIENT_NAME, {
    ...data,
    packageId: pkg.id,
    packageLabel: pkg.label,
    totalPrice: pkg.price || pkg.hourlyRate || pkg.dailyRate || 0,
  });
}

async function handleBookClientName(ctx, text, data) {
  const { chatId, send } = ctx;
  if (text.length < 2) {
    await send("اكتب اسم صحيح لو سمحت.");
    return;
  }
  const next = { ...data, clientName: text };
  if (!resolveClientPhone(ctx, next)) {
    return askClientPhone(ctx, next);
  }
  await send("📍 وين *مكان الجلسة*؟ (القاعة / المدينة / العنوان)");
  await setChatState(chatId, STATES.BOOK_LOCATION, next);
}

async function handleBookClientPhone(ctx, text, data) {
  const { chatId, send } = ctx;
  const normalized = normalizeClientPhoneInput(text);
  if (!isValidClientPhone(normalized)) {
    await send("رقم غير صحيح. ابعت رقم هاتفك (مثلاً *0926128650*).");
    return;
  }
  const next = { ...data, clientPhone: normalized };
  await send("📍 وين *مكان الجلسة*؟ (القاعة / المدينة / العنوان)");
  await setChatState(chatId, STATES.BOOK_LOCATION, next);
}

async function handleBookLocation(ctx, text, data) {
  const { chatId, send } = ctx;
  const dep = Math.round(data.totalPrice * (config.pricing.depositPercent / 100));
  await send(
    `💰 *شنو نوع الدفع؟*\n*1* — عربون (${dep} د.ل تقريباً)\n*2* — دفع كامل\n*3* — حجز وندفع بعدين`
  );
  await setChatState(chatId, STATES.BOOK_PAYMENT_TYPE, { ...data, location: text });
}

async function handleBookPaymentType(ctx, text, data) {
  const { chatId, send } = ctx;
  const map = { "1": "deposit", "2": "full", "3": "booking" };
  const paymentType = map[normalizeInput(text)];
  if (!paymentType) {
    await send("اختار 1 أو 2 أو 3");
    return;
  }
  const deposit =
    paymentType === "full"
      ? data.totalPrice
      : paymentType === "deposit"
        ? Math.round(data.totalPrice * (config.pricing.depositPercent / 100))
        : 0;

  await send("💳 *كاش ولا تحويل بنكي؟*\n*1* — كاش (في الاستوديو)\n*2* — تحويل بنكي");
  await setChatState(chatId, STATES.BOOK_PAY_CHANNEL, { ...data, paymentType, deposit });
}

async function handleBookPayChannel(ctx, text, data) {
  const { chatId, send } = ctx;
  const botConfig = await getBotConfig();
  const bank = { ...config.bank, ...(botConfig.bank || {}) };
  let paymentMethod;
  if (normalizeInput(text) === "1") paymentMethod = "كاش";
  else if (normalizeInput(text) === "2") paymentMethod = "تحويل";
  else {
    await send("اختار *1* كاش أو *2* تحويل");
    return;
  }

  const payLabel =
    data.paymentType === "full"
      ? "دفع كامل"
      : data.paymentType === "deposit"
        ? `عربون ${data.deposit} د.ل`
        : "حجز وندفع بعدين";

  const summary = [
    "✅ *ملخص الحجز*",
    `الاسم: ${data.clientName}`,
    `التاريخ: ${formatDisplayDate(data.selectedDate)}`,
    `الوقت: ${data.selectedTime}`,
    `المكان: ${data.location}`,
    `الباقة: ${data.packageLabel} — ${data.totalPrice} د.ل`,
    `الدفع: ${payLabel}`,
    `الطريقة: ${paymentMethod}`,
    "",
    "اكتب *أيوه* للتأكيد أو *0* للإلغاء",
  ].join("\n");

  await send(summary);

  if (paymentMethod === "تحويل") {
    if (!bank.accountNumber && !bank.iban) {
      await send("🏦 التحويل مختار — بيانات الحساب راح تتبعتلك من الإدارة بعد التأكيد.");
    } else {
      await send(formatBankTransfer(bank));
    }
  }

  await setChatState(chatId, STATES.BOOK_CONFIRM, { ...data, paymentMethod });
}

async function handleBookConfirm(ctx, text, data, notifyOwner) {
  const { chatId, send } = ctx;
  if (!isYes(text)) {
    await send("تم الإلغاء. ابعث *0* للقائمة.");
    await clearChatState(chatId);
    return;
  }

  const clientPhone = resolveClientPhone(ctx, data);
  if (!clientPhone) {
    await send("📱 قبل التأكيد نحتاج رقم هاتفك للتواصل.");
    return askClientPhone(ctx, data);
  }

  const session = await createTentativeSession({
    clientName: data.clientName,
    clientPhone,
    whatsappChatId: chatId,
    date: data.selectedDate,
    time: data.selectedTime,
    location: data.location,
    sessionType: data.packageId,
    packageLabel: data.packageLabel,
    paymentMethod: data.paymentMethod || "كاش",
  });

  const invoice = await createInvoiceFromBooking({
    sessionId: session.id,
    clientName: data.clientName,
    clientPhone,
    sessionName: data.packageLabel,
    date: data.selectedDate,
    location: data.location,
    packageLabel: data.packageLabel,
    totalPrice: data.totalPrice,
    paymentType: data.paymentType,
    deposit: data.deposit,
    paymentMethod: data.paymentMethod || "كاش",
  });

  await send(
    `🎉 *تم الحجز بنجاح!*\nرقم الجلسة: ${session.id.slice(-6).toUpperCase()}\n\n${formatInvoiceMessage(invoice)}`
  );

  await sendInvoicePdfToClient(ctx, invoice, {
    date: data.selectedDate,
    time: data.selectedTime,
    location: data.location,
  });

  if (data.paymentMethod === "تحويل") {
    await send("لو حولت، ابعت صورة الإيصال هنا متى ما تبي 🙏");
  }

  if (data.paymentType === "full" && session.photographers?.length > 0) {
    await confirmSession(session.id);
    await send("✅ تم تأكيد الحجز. المصورين اتنبّهوا.");
  } else if (data.paymentType === "full") {
    await send("✅ تم تسجيل الدفع. الإدارة راح تعيّن المصورين.");
  }

  const payInfo =
    data.paymentType === "full"
      ? "دفع كامل"
      : data.paymentType === "deposit"
        ? `عربون ${data.deposit} د.ل`
        : "حجز بدون دفع";

  await notifyOwner(
    `🔔 *حجز جديد — واتساب*\n` +
    `👤 العميل: ${data.clientName}\n📱 ${clientPhone}\n` +
    `📅 ${formatDisplayDate(data.selectedDate)} — ${data.selectedTime}\n` +
    `📍 ${data.location}\n` +
    `📦 ${data.packageLabel} (${data.totalPrice} د.ل)\n` +
    `💳 ${payInfo} — ${data.paymentMethod || "كاش"}\n` +
    `🆔 جلسة: ${session.id.slice(-6).toUpperCase()}\n` +
    (session.photographers?.length
      ? `📸 مصورين معيّنين: ${session.photographers.length}`
      : `⚠️ لازم تأكيد وتعيين مصور من لوحة الإدارة`)
  );

  await send("هل تحتاج أي شيء ثاني؟ تقدر تسألني عن باقة أو موعد آخر في أي وقت 😊");
  await setChatState(chatId, STATES.MAIN_MENU, {});
}

async function startCancelFlow(ctx) {
  const { chatId, phone, send } = ctx;
  const list = (await getSessionsByPhone(phone, chatId)).filter((s) => s.status !== "cancelled");
  if (!list.length) {
    await send("لا توجد حجوزات نشطة مرتبطة برقمك.");
    return;
  }
  const lines = list.slice(0, 8).map(
    (s, i) => `*${i + 1}* — ${s.clientName} | ${s.date} ${s.time || ""} | ${s.status}`
  );
  await send(`❌ *إلغاء حجز*\n${lines.join("\n")}\n\nأرسل رقم الحجز`);
  await setChatState(chatId, STATES.CANCEL_PICK, { sessions: list.slice(0, 8) });
}

async function handleCancelPick(ctx, text, data) {
  const { chatId, send } = ctx;
  const idx = parseInt(text, 10) - 1;
  const session = data.sessions?.[idx];
  if (!session) {
    await send("رقم غير صحيح.");
    return;
  }
  await send(`هل تريد إلغاء حجز *${session.date} ${session.time}*؟\nأرسل *نعم* للتأكيد`);
  await setChatState(chatId, STATES.CANCEL_CONFIRM, { sessionId: session.id, session });
}

async function handleCancelConfirm(ctx, text, data, notifyOwner) {
  const { chatId, send } = ctx;
  if (!["نعم", "yes", "1"].includes(normalizeInput(text))) {
    await send("لم يتم الإلغاء.");
    await clearChatState(chatId);
    return;
  }
  await cancelSession(data.sessionId);
  await send("✅ تم إلغاء الحجز.");
  await notifyOwner(
    `⚠️ *إلغاء حجز*\n👤 ${data.session.clientName}\n📅 ${data.session.date} ${data.session.time}\nعبر واتساب`
  );
  await send("تقدر تكتب لي أي شيء ثاني متى ما تبي 😊");
  await setChatState(chatId, STATES.MAIN_MENU, {});
}

async function startRescheduleFlow(ctx) {
  const { chatId, phone, send } = ctx;
  const list = (await getSessionsByPhone(phone, chatId)).filter((s) => s.status !== "cancelled");
  if (!list.length) {
    await send("لا توجد حجوزات لتعديلها.");
    return;
  }
  const lines = list.slice(0, 8).map((s, i) => `*${i + 1}* — ${s.date} ${s.time}`);
  await send(`🔄 *تغيير الموعد*\n${lines.join("\n")}`);
  await setChatState(chatId, STATES.RESCHEDULE_PICK, { sessions: list.slice(0, 8) });
}

async function handleReschedulePick(ctx, text, data) {
  const { chatId, send } = ctx;
  const idx = parseInt(text, 10) - 1;
  const session = data.sessions?.[idx];
  if (!session) {
    await send("رقم غير صحيح.");
    return;
  }
  const days = await getAvailability();
  const lines = days.slice(0, 10).map((d, i) => `*${i + 1}* — ${d.label}`);
  await send(`📅 اختر التاريخ الجديد:\n${lines.join("\n")}`);
  await setChatState(chatId, STATES.RESCHEDULE_DATE, { sessionId: session.id, session, days: days.slice(0, 10) });
}

async function handleRescheduleDate(ctx, text, data) {
  const { chatId, send } = ctx;
  const idx = parseInt(text, 10) - 1;
  const day = data.days?.[idx];
  if (!day) {
    await send("رقم غير صحيح.");
    return;
  }
  const lines = day.slots.slice(0, 12).map((s, i) => `*${i + 1}* — ${s.time}`);
  await send(`⏰ اختر الوقت:\n${lines.join("\n")}`);
  await setChatState(chatId, STATES.RESCHEDULE_TIME, {
    ...data,
    newDate: day.date,
    slots: day.slots.slice(0, 12),
  });
}

async function handleRescheduleTime(ctx, text, data, notifyOwner) {
  const { chatId, send } = ctx;
  const idx = parseInt(text, 10) - 1;
  const slot = data.slots?.[idx];
  if (!slot) {
    await send("رقم غير صحيح.");
    return;
  }
  const ok = await isSlotAvailable(data.newDate, slot.time);
  if (!ok) {
    await send("الموعد غير متاح. أرسل *0* للبدء من جديد.");
    return;
  }
  await rescheduleSession(data.sessionId, data.newDate, slot.time);
  await send(`✅ تم تحديث الموعد إلى ${data.newDate} الساعة ${slot.time}\nتقدر تسألني أي شيء ثاني متى ما تبي 😊`);
  await notifyOwner(
    `🔄 *تغيير موعد*\n👤 ${data.session.clientName}\n📅 ${data.newDate} ${slot.time}`
  );
  await setChatState(chatId, STATES.MAIN_MENU, {});
}

async function startPayFlow(ctx) {
  const { chatId, send } = ctx;
  const chat = await getChatState(chatId);
  const clientPhone = resolveClientPhone(ctx, chat?.data || {});
  const invoices = (await getInvoicesByPhone(clientPhone)).filter((i) => getAmountDue(i) > 0);
  if (!invoices.length) {
    await send("ما عندناش حجز يحتاج دفع مرتبط برقمك حالياً. لو تبي تحجز جديد قول لي 😊");
    return;
  }
  const lines = invoices.slice(0, 8).map((inv, i) => {
    const total = Number(inv.totalPrice) || 0;
    return `*${i + 1}* — ${inv.sessionName || "جلسة"} | ${inv.date || ""} | السعر ${total} د.ل`;
  });
  await send(`💰 *الدفع / العربون*\n${lines.join("\n")}\n\nابعث رقم الحجز اللي تبي تدفع عليه`);
  await setChatState(chatId, STATES.PAY_PICK_INVOICE, { invoices: invoices.slice(0, 8) });
}

async function handlePayPickInvoice(ctx, text, data) {
  const { chatId, send } = ctx;
  const idx = parseInt(text, 10) - 1;
  const inv = data.invoices?.[idx];
  if (!inv) {
    await send("رقم غير صحيح.");
    return;
  }
  await send(formatInvoiceMessage(inv));
  await send("*1* — تحويل بنكي\n*2* — كاش في الاستوديو");
  await setChatState(chatId, STATES.PAY_METHOD, { invoiceId: inv.id, invoice: inv });
}

async function handlePayMethod(ctx, text, data) {
  const { chatId, send } = ctx;
  const botConfig = await getBotConfig();
  const bank = botConfig.bank || config.bank;

  if (normalizeInput(text) === "1") {
    const msg = formatBankTransfer(bank);
    await send(msg);
    await setChatState(chatId, STATES.PAY_AWAIT_RECEIPT, data);
    return;
  }
  if (normalizeInput(text) === "2") {
    await send("تمام 👍 لما تجي الاستوديو نحدّث الفاتورة.");
    await clearChatState(chatId);
    return;
  }
  await send("اختر 1 أو 2");
}

async function handlePayAwaitReceipt(ctx, text, data, notifyOwner) {
  const { chatId, send, hasMedia } = ctx;
  if (hasMedia || ["تم الدفع", "دفعت", "paid"].includes(normalizeInput(text))) {
    await markInvoicePaid(data.invoiceId);
    await send("✅ شكراً! تم تسجيل الدفع وسيتم مراجعته من الإدارة.");
    await notifyOwner(
      `💵 *إثبات دفع واتساب*\nفاتورة #${data.invoiceId.slice(-6)}\nالعميل: ${data.invoice.clientName}\n${hasMedia ? "(مرفق صورة)" : text}`
    );
    await send("تقدر تسألني عن أي شيء ثاني في أي وقت 😊");
    await setChatState(chatId, STATES.MAIN_MENU, {});
    return;
  }
  await send("أرسل صورة الإيصال أو اكتب *تم الدفع*");
}

async function startTrackFlow(ctx) {
  const { chatId, phone, send } = ctx;
  const list = (await getSessionsByPhone(phone, chatId)).filter((s) => s.status !== "cancelled");
  if (!list.length) {
    await send("لا توجد جلسات لمتابعتها.");
    return;
  }
  const lines = list.slice(0, 8).map((s, i) => `*${i + 1}* — ${s.date} | ${s.workflowStage || s.status}`);
  await send(`📋 *متابعة الجلسة*\n${lines.join("\n")}`);
  await setChatState(chatId, STATES.TRACK_PICK, { sessions: list.slice(0, 8) });
}

const STAGE_LABELS = {
  booked: "تم الحجز — بانتظار التأكيد",
  confirmed: "تم تأكيد الموعد",
  shooting: "جاري التصوير",
  editing: "جاري تعديل الصور",
  ready: "الصور جاهزة للتسليم",
  delivered: "تم التسليم",
};

async function handleTrackPick(ctx, text, data) {
  const { send } = ctx;
  const idx = parseInt(text, 10) - 1;
  const s = data.sessions?.[idx];
  if (!s) {
    await send("رقم غير صحيح.");
    return;
  }
  const stage = STAGE_LABELS[s.workflowStage] || s.status;
  let msg = `📸 *${s.clientName}*\n📅 ${s.date} ${s.time || ""}\n📍 ${s.location || "—"}\nالحالة: *${stage}*`;
  if (s.downloadUrl) msg += `\n\n🔗 رابط التحميل:\n${s.downloadUrl}`;
  if (s.report) msg += `\n\n📝 تقرير المصور: ${s.report}`;
  await send(msg);
}

module.exports = { handleIncomingMessage, STAGE_LABELS };
