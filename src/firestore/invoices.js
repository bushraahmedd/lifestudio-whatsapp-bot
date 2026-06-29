const { db, FieldValue } = require("../firebase/admin");
const config = require("../config");

const INVOICE_STATUSES = {
  confirmed: "مؤكد",
  awaiting_payment: "إيصال صادر",
  deposit: "عربون مستلم",
  paid: "مسدد بالكامل",
  cancelled: "ملغى",
};

function resolveInvoiceStatus(inv) {
  if (inv.status && INVOICE_STATUSES[inv.status]) return inv.status;
  if (inv.paymentStatus === "كامل" || Number(inv.remainingAmount) === 0) return "paid";
  if (Number(inv.deposit) > 0) return "deposit";
  return "confirmed";
}

function financeSessionLabel(clientName, sessionName) {
  const s = (sessionName || "").trim();
  return s ? `${clientName} — ${s}` : clientName;
}

function buildFinanceRow(inv, invoiceId) {
  const total = Number(inv.totalPrice) || 0;
  const status = resolveInvoiceStatus(inv);
  const isFullyPaid = status === "paid";
  const deposit = isFullyPaid ? total : Number(inv.deposit) || 0;
  const remaining = isFullyPaid ? 0 : Math.max(0, total - deposit);
  return {
    sessionName: financeSessionLabel(inv.clientName, inv.sessionName),
    clientName: inv.clientName,
    invoiceSessionName: inv.sessionName || "",
    date: inv.date || new Date().toISOString().split("T")[0],
    fullPrice: total,
    deposit,
    netStudioProfit: isFullyPaid ? total : deposit,
    remaining,
    isFullyPaid,
    paymentType: isFullyPaid
      ? "دفع كامل"
      : deposit > 0
        ? "عربون"
        : inv.paymentType === "booking"
          ? "حجز بدون دفع"
          : "مؤكد",
    invoiceId,
  };
}

async function syncFinanceForInvoice(invoiceId, inv) {
  const financeRow = buildFinanceRow(inv, invoiceId);
  let snap = await db.collection("finance").where("invoiceId", "==", invoiceId).get();
  if (snap.empty) {
    snap = await db.collection("finance").where("sessionName", "==", financeRow.sessionName).get();
  }
  if (snap.empty) {
    await db.collection("finance").add({
      ...financeRow,
      createdAt: FieldValue.serverTimestamp(),
    });
  } else {
    for (const fd of snap.docs) {
      await fd.ref.update({
        ...financeRow,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
}

/**
 * Create invoice + finance row from WhatsApp booking.
 */
async function createInvoiceFromBooking({
  sessionId,
  clientName,
  clientPhone,
  sessionName,
  date,
  location,
  packageLabel,
  totalPrice,
  paymentType,
  deposit,
  paymentMethod,
}) {
  const total = Number(totalPrice) || config.pricing.defaultPrice;
  let dep = Number(deposit);
  let status = "confirmed";
  let paymentStatus = "مؤكد";

  if (paymentType === "full") {
    dep = total;
    status = "paid";
    paymentStatus = "كامل";
  } else if (paymentType === "deposit") {
    if (!dep) dep = Math.round(total * (config.pricing.depositPercent / 100));
    status = "deposit";
    paymentStatus = "جزئي";
  } else if (paymentType === "booking") {
    dep = 0;
    status = "awaiting_payment";
    paymentStatus = "حجز";
  }

  const remaining = status === "paid" ? 0 : Math.max(0, total - dep);
  const inv = {
    clientName,
    clientPhone: clientPhone || "",
    sessionName: sessionName || packageLabel || "جلسة تصوير",
    location: location || "",
    date,
    totalPrice: total,
    deposit: dep,
    remainingAmount: remaining,
    package: packageLabel || "",
    equipment: "",
    sessionContent: "",
    paymentMethod: paymentMethod || "كاش",
    paymentType: paymentType || "deposit",
    signatureType: "default",
    notes: "صادرة تلقائياً من بوت واتساب",
    status,
    paymentStatus,
    sessionId,
    bookingSource: "whatsapp",
    createdAt: FieldValue.serverTimestamp(),
  };

  const ref = await db.collection("invoices").add(inv);
  const saved = { id: ref.id, ...inv };
  await syncFinanceForInvoice(ref.id, saved);
  return saved;
}

async function getInvoicesByPhone(phone) {
  const digits = phone.replace(/\D/g, "");
  const snap = await db.collection("invoices").get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((inv) => {
      const p = (inv.clientPhone || "").replace(/\D/g, "");
      return !p || p === digits || p.endsWith(digits.slice(-9));
    });
}

function getAmountDue(inv) {
  const total = Number(inv.totalPrice) || 0;
  const status = resolveInvoiceStatus(inv);
  if (status === "paid" || status === "cancelled") return 0;
  if (inv.remainingAmount != null && inv.remainingAmount !== "") {
    return Math.max(0, Number(inv.remainingAmount));
  }
  return Math.max(0, total - (Number(inv.deposit) || 0));
}

async function markInvoicePaid(invoiceId, partialAmount) {
  const ref = db.collection("invoices").doc(invoiceId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Invoice not found");
  const inv = { id: invoiceId, ...snap.data() };
  const total = Number(inv.totalPrice) || 0;
  const newDeposit = partialAmount != null ? Number(partialAmount) : total;
  const status = newDeposit >= total ? "paid" : "deposit";
  const updated = {
    ...inv,
    deposit: newDeposit,
    remainingAmount: Math.max(0, total - newDeposit),
    status,
    paymentStatus: status === "paid" ? "كامل" : "جزئي",
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.update({
    deposit: updated.deposit,
    remainingAmount: updated.remainingAmount,
    status: updated.status,
    paymentStatus: updated.paymentStatus,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await syncFinanceForInvoice(invoiceId, updated);
  return updated;
}

function formatInvoiceMessage(inv) {
  const due = getAmountDue(inv);
  const lines = [
    "🧾 *فاتورة لايف استوديو*",
    `رقم: #${inv.id.slice(-6).toUpperCase()}`,
    `العميل: ${inv.clientName}`,
    `الجلسة: ${inv.sessionName || "—"}`,
    `التاريخ: ${inv.date}`,
    `الإجمالي: *${Number(inv.totalPrice).toLocaleString()} د.ل*`,
    `المدفوع: ${Number(inv.deposit || 0).toLocaleString()} د.ل`,
    due > 0 ? `المستحق: *${due.toLocaleString()} د.ل*` : "✅ مسددة بالكامل",
    `الحالة: ${INVOICE_STATUSES[resolveInvoiceStatus(inv)] || inv.status}`,
  ];
  return lines.join("\n");
}

module.exports = {
  createInvoiceFromBooking,
  getInvoicesByPhone,
  markInvoicePaid,
  formatInvoiceMessage,
  getAmountDue,
  syncFinanceForInvoice,
};
