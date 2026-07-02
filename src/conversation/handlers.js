const { STATES, MAIN_MENU_TEXT, normalizeInput, isBack } = require("./stateMachine");
const { FEES_NOTE_DEFAULT, SOFT_HELP_TEXT, formatBankTransfer } = require("./messages");
const { detectIntent, isAffirmative } = require("./intent");
const {
  buildPricingReply,
  buildAmbiguousClarifier,
  CATEGORY_META,
} = require("./pricingMessages");
const { getPackages } = require("../firestore/packages");
const { getAvailability, isSlotAvailable } = require("../firestore/availability");
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

function isYes(text) {
  const t = normalizeInput(text);
  return ["نعم", "أيوه", "ايوه", "ايه", "أيه", "yes", "ok", "تأكيد", "1"].includes(t);
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

  if (isBack(text)) {
    await clearChatState(chatId);
    await send(MAIN_MENU_TEXT);
    await setChatState(chatId, STATES.MAIN_MENU, {});
    return;
  }

  let chat = await getChatState(chatId);
  if (!chat) {
    const botConfig = await getBotConfig();
    await send(`${botConfig.greeting}\n\n${MAIN_MENU_TEXT}`);
    await setChatState(chatId, STATES.MAIN_MENU, {});
    chat = { state: STATES.MAIN_MENU, data: {} };
  }

  const { state, data } = chat;

  try {
    switch (state) {
      case STATES.MAIN_MENU:
        return handleMainMenu(ctx, text, data);
      case STATES.INTENT_CLARIFY:
        return handleIntentClarify(ctx, text, data);
      case STATES.BOOK_PICK_DATE:
        return handleBookPickDate(ctx, text, data);
      case STATES.BOOK_PICK_TIME:
        return handleBookPickTime(ctx, text, data);
      case STATES.BOOK_PICK_PACKAGE:
        return handleBookPickPackage(ctx, text, data);
      case STATES.BOOK_CLIENT_NAME:
        return handleBookClientName(ctx, text, data);
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

  if (choice === "1" || choice === "حجز") return startBookFlow(ctx, { serviceCategory: data.lastCategory });
  if (choice === "2" || choice === "الغاء" || choice === "إلغاء") return startCancelFlow(ctx);
  if (choice === "3" || choice === "تغيير") return startRescheduleFlow(ctx);
  if (choice === "4" || choice === "دفع") return startPayFlow(ctx);
  if (choice === "5" || choice === "متابعة") return startTrackFlow(ctx);

  if (/^(مرحبا|السلام|هلا|hello|hi|أهلا|اهلا)/.test(choice)) {
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
    await send(await buildPricingReply(cat));
    await setChatState(chatId, STATES.MAIN_MENU, { lastCategory: cat });
    return;
  }

  if (detected.intent === "book" || (isAffirmative(text) && data.lastCategory)) {
    const cat = detected.categories[0] || data.lastCategory || null;
    return startBookFlow(ctx, { serviceCategory: cat });
  }

  if (detected.categories.length === 1) {
    await send(await buildPricingReply(detected.categories[0]));
    await setChatState(chatId, STATES.MAIN_MENU, { lastCategory: detected.categories[0] });
    return;
  }

  await send(SOFT_HELP_TEXT);
}

async function handleIntentClarify(ctx, text, data) {
  const { chatId, send } = ctx;
  const detected = detectIntent(text);

  if (detected.intent === "book" || isAffirmative(text)) {
    const cat = detected.categories[0] || data.pendingCategories?.[0] || null;
    return startBookFlow(ctx, { serviceCategory: cat });
  }

  if (detected.categories.length === 1) {
    const cat = detected.categories[0];
    await send(await buildPricingReply(cat));
    await setChatState(chatId, STATES.MAIN_MENU, { lastCategory: cat });
    return;
  }

  if (detected.intent === "pricing" && !detected.ambiguous && detected.categories[0]) {
    await send(await buildPricingReply(detected.categories[0]));
    await setChatState(chatId, STATES.MAIN_MENU, { lastCategory: detected.categories[0] });
    return;
  }

  await send(await buildAmbiguousClarifier(
    detected.categories.length ? detected.categories : ["graduation", "studio_rental", "wedding"]
  ));
}

async function startBookFlow(ctx, { serviceCategory } = {}) {
  const { chatId, send } = ctx;
  const days = await getAvailability();
  if (!days.length) {
    await send("معذرة، ما فيش مواعيد فاضية هالفترة. تواصل مع الاستوديو على الطبيعة 🙏");
    return;
  }
  const catLabel = serviceCategory ? CATEGORY_META[serviceCategory]?.title : null;
  const intro = catLabel
    ? `📅 *حجز ${catLabel}* — اختار اليوم اللي يناسبك:`
    : "📅 *المواعيد الفاضية* — اختار اليوم:";
  const lines = days.slice(0, 10).map((d, i) => `*${i + 1}* — ${d.label} (${d.date}) — ${d.slots.length} موعد`);
  await send(`${intro}\n${lines.join("\n")}\n\nابعث رقم اليوم، أو *0* للرجوع`);
  await setChatState(chatId, STATES.BOOK_PICK_DATE, {
    days: days.slice(0, 10),
    serviceCategory: serviceCategory || null,
  });
}

async function handleBookPickDate(ctx, text, data) {
  const { chatId, send } = ctx;
  const idx = parseInt(text, 10) - 1;
  const day = data.days?.[idx];
  if (!day) {
    await send("الرقم مو صحيح. ابعث رقم اليوم من القائمة.");
    return;
  }
  const slots = day.slots.slice(0, 12);
  const lines = slots.map((s, i) => `*${i + 1}* — ${s.time}`);
  await send(`⏰ مواعيد *${day.label}*\n${lines.join("\n")}\n\nابعث رقم الوقت`);
  await setChatState(chatId, STATES.BOOK_PICK_TIME, { ...data, selectedDate: day.date, slots });
}

async function handleBookPickTime(ctx, text, data) {
  const { chatId, send } = ctx;
  const idx = parseInt(text, 10) - 1;
  const slot = data.slots?.[idx];
  if (!slot) {
    await send("رقم غير صحيح.");
    return;
  }
  const ok = await isSlotAvailable(data.selectedDate, slot.time);
  if (!ok) {
    await send("⚠️ للأسف الموعد انحجز توا. ابعث *0* واختار موعد ثاني.");
    return;
  }
  const botConfig = await getBotConfig();
  const feesNote = botConfig.feesNote || FEES_NOTE_DEFAULT;
  const pkgs = await getPackages({
    category: data.serviceCategory || undefined,
  });
  if (!pkgs.length) {
    await send("ما لقيناش باقات منشورة لهالنوع — تواصل مع الاستوديو أو ابعث *0*.");
    return;
  }
  const lines = pkgs.map((p, i) => {
    let line = `*${i + 1}* — ${p.label}`;
    if (p.hourlyRate) line += ` (${p.hourlyRate} د.ل/ساعة)`;
    else if (p.dailyRate) line += ` (${p.dailyRate} د.ل/يوم)`;
    else if (p.price) line += ` (${p.price} د.ل)`;
    return line;
  });
  await send(`📦 *شنو الباقة اللي تناسبك؟*\n${lines.join("\n")}\n\n${feesNote}\n\nابعث رقم الباقة`);
  await setChatState(chatId, STATES.BOOK_PICK_PACKAGE, {
    ...data,
    selectedTime: slot.time,
    packages: pkgs,
  });
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
  await send("📍 وين *مكان الجلسة*؟ (القاعة / المدينة / العنوان)");
  await setChatState(chatId, STATES.BOOK_LOCATION, { ...data, clientName: text });
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
    `التاريخ: ${data.selectedDate}`,
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
  const { chatId, phone, send } = ctx;
  if (!isYes(text)) {
    await send("تم الإلغاء. ابعث *0* للقائمة.");
    await clearChatState(chatId);
    return;
  }

  const session = await createTentativeSession({
    clientName: data.clientName,
    clientPhone: phone,
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
    clientPhone: phone,
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
    `🎉 *تم الحجز في النظام!*\nرقم الجلسة: ${session.id.slice(-6).toUpperCase()}\nالحالة: *مبدئي — مستنّين تأكيد الاستوديو*\n\n${formatInvoiceMessage(invoice)}`
  );

  await sendInvoicePdfToClient(ctx, invoice, {
    date: data.selectedDate,
    time: data.selectedTime,
    location: data.location,
  });

  if (data.paymentMethod === "تحويل") {
    await send("لو حولت، ابعث صورة الإيصال هنا أو اكتب *دفع*.");
  } else if (data.paymentType !== "full") {
    await send("للدفع اكتب *دفع* في أي وقت.");
  }

  if (data.paymentType === "full" && session.photographers?.length > 0) {
    await confirmSession(session.id);
    await send("✅ تم تأكيد الحجز بعد الدفع الكامل. المصورين اتنبّهوا.");
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
    `👤 العميل: ${data.clientName}\n📱 ${phone}\n` +
    `📅 ${data.selectedDate} — ${data.selectedTime}\n` +
    `📍 ${data.location}\n` +
    `📦 ${data.packageLabel} (${data.totalPrice} د.ل)\n` +
    `💳 ${payInfo} — ${data.paymentMethod || "كاش"}\n` +
    `🆔 جلسة: ${session.id.slice(-6).toUpperCase()}\n` +
    (session.photographers?.length
      ? `📸 مصورين معيّنين: ${session.photographers.length}`
      : `⚠️ لازم تأكيد وتعيين مصور من لوحة الإدارة`)
  );

  if (session.photographers?.length > 0) {
    await send("📌 المصورين معيّنين — الإدارة راح تأكد الحجز من النظام.");
  } else {
    await send("📌 حجزك *مبدئي*. الاستوديو راح يتواصل معاك قريباً ✅");
  }

  await clearChatState(chatId);
  await send(MAIN_MENU_TEXT);
  await setChatState(chatId, STATES.MAIN_MENU, {});
}

async function startCancelFlow(ctx) {
  const { chatId, phone, send } = ctx;
  const list = (await getSessionsByPhone(phone)).filter((s) => s.status !== "cancelled");
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
  await clearChatState(chatId);
  await send(MAIN_MENU_TEXT);
  await setChatState(chatId, STATES.MAIN_MENU, {});
}

async function startRescheduleFlow(ctx) {
  const { chatId, phone, send } = ctx;
  const list = (await getSessionsByPhone(phone)).filter((s) => s.status !== "cancelled");
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
  await send(`✅ تم تحديث الموعد إلى ${data.newDate} الساعة ${slot.time}`);
  await notifyOwner(
    `🔄 *تغيير موعد*\n👤 ${data.session.clientName}\n📅 ${data.newDate} ${slot.time}`
  );
  await clearChatState(chatId);
  await send(MAIN_MENU_TEXT);
  await setChatState(chatId, STATES.MAIN_MENU, {});
}

async function startPayFlow(ctx) {
  const { chatId, phone, send } = ctx;
  const invoices = (await getInvoicesByPhone(phone)).filter((i) => getAmountDue(i) > 0);
  if (!invoices.length) {
    await send("لا توجد فواتير مستحقة على رقمك.");
    return;
  }
  const lines = invoices.slice(0, 8).map((inv, i) => {
    const due = getAmountDue(inv);
    return `*${i + 1}* — ${inv.sessionName} | مستحق ${due} د.ل`;
  });
  await send(`💰 *الدفع*\n${lines.join("\n")}`);
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
    await clearChatState(chatId);
    await send(MAIN_MENU_TEXT);
    await setChatState(chatId, STATES.MAIN_MENU, {});
    return;
  }
  await send("أرسل صورة الإيصال أو اكتب *تم الدفع*");
}

async function startTrackFlow(ctx) {
  const { chatId, phone, send } = ctx;
  const list = (await getSessionsByPhone(phone)).filter((s) => s.status !== "cancelled");
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
