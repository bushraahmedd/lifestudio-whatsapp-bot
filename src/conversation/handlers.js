const { STATES, MAIN_MENU_TEXT, normalizeInput, isBack } = require("./stateMachine");
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
    await send("⚠️ حدث خطأ مؤقت. أرسل *0* للعودة للقائمة الرئيسية.");
  }
}

async function handleMainMenu(ctx, text, data) {
  const { chatId, send } = ctx;
  const choice = normalizeInput(text);

  if (choice === "1") {
    const days = await getAvailability();
    if (!days.length) {
      await send("عذراً، لا توجد مواعيد متاحة حالياً. تواصل مع الاستوديو مباشرة.");
      return;
    }
    const lines = days.slice(0, 10).map((d, i) => `*${i + 1}* — ${d.label} (${d.date}) — ${d.slots.length} موعد`);
    await send(`📅 *المواعيد المتاحة*\n${lines.join("\n")}\n\nأرسل رقم اليوم أو *0* للرجوع`);
    await setChatState(chatId, STATES.BOOK_PICK_DATE, { days: days.slice(0, 10) });
    return;
  }
  if (choice === "2") return startCancelFlow(ctx);
  if (choice === "3") return startRescheduleFlow(ctx);
  if (choice === "4") return startPayFlow(ctx);
  if (choice === "5") return startTrackFlow(ctx);

  await send("اختر رقماً من 1 إلى 5، أو *0* للقائمة.");
}

async function handleBookPickDate(ctx, text, data) {
  const { chatId, send } = ctx;
  const idx = parseInt(text, 10) - 1;
  const day = data.days?.[idx];
  if (!day) {
    await send("رقم غير صحيح. أرسل رقم اليوم من القائمة.");
    return;
  }
  const slots = day.slots.slice(0, 12);
  const lines = slots.map((s, i) => `*${i + 1}* — ${s.time}`);
  await send(`⏰ مواعيد *${day.label}*\n${lines.join("\n")}\n\nأرسل رقم الوقت`);
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
    await send("⚠️ هذا الموعد أصبح محجوزاً للتو. أرسل *0* لاختيار موعد آخر.");
    return;
  }
  const botConfig = await getBotConfig();
  const pkgs = botConfig.packages || [];
  const lines = pkgs.map((p, i) => `*${i + 1}* — ${p.label} (${p.price} د.ل)`);
  await send(`📦 *نوع الجلسة*\n${lines.join("\n")}\n\nأرسل رقم الباقة`);
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
  await send("👤 ما *اسمك الكامل*؟");
  await setChatState(chatId, STATES.BOOK_CLIENT_NAME, {
    ...data,
    packageId: pkg.id,
    packageLabel: pkg.label,
    totalPrice: pkg.price,
  });
}

async function handleBookClientName(ctx, text, data) {
  const { chatId, send } = ctx;
  if (text.length < 2) {
    await send("يرجى إدخال اسم صحيح.");
    return;
  }
  await send("📍 *موقع الجلسة* (القاعة / المدينة):");
  await setChatState(chatId, STATES.BOOK_LOCATION, { ...data, clientName: text });
}

async function handleBookLocation(ctx, text, data) {
  const { chatId, send } = ctx;
  await send(
    `💳 *طريقة الدفع*\n*1* — عربون (${Math.round(data.totalPrice * 0.3)} د.ل تقريباً)\n*2* — دفع كامل\n*3* — حجز بدون دفع الآن (فاتورة مستحقة)`
  );
  await setChatState(chatId, STATES.BOOK_PAYMENT_TYPE, { ...data, location: text });
}

async function handleBookPaymentType(ctx, text, data) {
  const { chatId, send } = ctx;
  const map = { "1": "deposit", "2": "full", "3": "booking" };
  const paymentType = map[normalizeInput(text)];
  if (!paymentType) {
    await send("اختر 1 أو 2 أو 3");
    return;
  }
  const deposit =
    paymentType === "full"
      ? data.totalPrice
      : paymentType === "deposit"
        ? Math.round(data.totalPrice * (config.pricing.depositPercent / 100))
        : 0;

  const summary = [
    "✅ *ملخص الحجز*",
    `الاسم: ${data.clientName}`,
    `التاريخ: ${data.selectedDate}`,
    `الوقت: ${data.selectedTime}`,
    `الموقع: ${data.location}`,
    `الباقة: ${data.packageLabel} — ${data.totalPrice} د.ل`,
    paymentType === "full"
      ? "الدفع: كامل المبلغ"
      : paymentType === "deposit"
        ? `الدفع: عربون ${deposit} د.ل`
        : "الدفع: لاحقاً (فاتورة مستحقة)",
    "",
    "أرسل *نعم* للتأكيد أو *0* للإلغاء",
  ].join("\n");
  await send(summary);
  await setChatState(chatId, STATES.BOOK_CONFIRM, { ...data, paymentType, deposit });
}

async function handleBookConfirm(ctx, text, data, notifyOwner) {
  const { chatId, phone, send } = ctx;
  const yes = ["نعم", "yes", "ok", "تأكيد", "1"].includes(normalizeInput(text));
  if (!yes) {
    await send("تم إلغاء الحجز. أرسل *0* للقائمة.");
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
  });

  await send(
    `🎉 *تم تسجيل حجزك!*\nرقم الجلسة: ${session.id.slice(-6).toUpperCase()}\nالحالة: *مبدئي / بانتظار التأكيد*\n\n${formatInvoiceMessage(invoice)}`
  );

  if (data.paymentType !== "full") {
    await send("لإتمام الدفع أرسل *4* من القائمة الرئيسية (*0* ثم *4*).");
  } else if (session.photographers?.length > 0) {
    await confirmSession(session.id);
    await send("✅ تم تأكيد الحجز بعد استلام الدفع الكامل. تم إخطار المصورين.");
  } else {
    await send("✅ تم استلام الدفع. بانتظار تعيين المصورين من الإدارة.");
  }

  await notifyOwner(
    `🔔 *حجز جديد عبر واتساب*\n👤 ${data.clientName}\n📅 ${data.selectedDate} ${data.selectedTime}\n📍 ${data.location}\n📦 ${data.packageLabel}\n📱 ${phone}` +
    (session.photographers?.length ? `\n📸 مصورون معيّنون: ${session.photographers.length}` : `\n⚠️ بانتظار تعيين المصورين من لوحة الإدارة`)
  );

  if (session.photographers?.length > 0) {
    await send(`📌 تم تعيين المصورين. سيتم إرسال التفاصيل لهم بعد تأكيد الإدارة من لوحة التحكم.`);
  } else {
    await send(`📌 حجزك *مبدئي*. سيتواصل معك الاستوديو قريباً لتأكيد الموعد.`);
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
  await send("*1* — تحويل بنكي\n*2* — سأدفع كاش في الاستوديو");
  await setChatState(chatId, STATES.PAY_METHOD, { invoiceId: inv.id, invoice: inv });
}

async function handlePayMethod(ctx, text, data) {
  const { chatId, send } = ctx;
  const botConfig = await getBotConfig();
  const bank = botConfig.bank || config.bank;

  if (normalizeInput(text) === "1") {
    const msg = [
      "🏦 *بيانات التحويل*",
      `المصرف: ${bank.name}`,
      `اسم الحساب: ${bank.accountName}`,
      `رقم الحساب: ${bank.accountNumber}`,
      bank.note,
      "",
      "بعد التحويل أرسل *صورة الإيصال* هنا أو اكتب *تم الدفع*",
    ].join("\n");
    await send(msg);
    await setChatState(chatId, STATES.PAY_AWAIT_RECEIPT, data);
    return;
  }
  if (normalizeInput(text) === "2") {
    await send("حسناً. عند زيارة الاستوديو سيتم تحديث الفاتورة يدوياً.");
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
