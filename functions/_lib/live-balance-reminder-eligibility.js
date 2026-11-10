// Live balance reminders: pure eligibility checks, no scheduling or email side effects.
// The caller must re-read the live ledger immediately before sending.
const DAY = 86400000;
export function balanceReminderEligibility({order,payment,ledger,requestEvent,now=Date.now(),day=3}) {
  if (![3,7].includes(day)) return {ok:false,reason:"unsupported-day"};
  if (order?.checkoutMode!=="live-inline" || order.checkoutPlan!=="deposit" || order.status!=="Ready for balance")
    return {ok:false,reason:"ineligible-order"};
  if (payment?.id!==order.id || payment.sandbox!==false || ledger?.quotedAt!==payment.quotedAt)
    return {ok:false,reason:"mismatched-live-record"};
  if (ledger.full || ledger.balance || !ledger.deposit ||
      ledger.deposit.verification!=="paypal-live-capture" ||
      ledger.deposit.sandbox!==false ||
      ledger.deposit.amountCents!==payment.depositCents ||
      !ledger.deposit.reference)
    return {ok:false,reason:"unverified-or-paid"};
  if (!Number.isInteger(payment.balanceCents) || payment.balanceCents<=0 ||
      payment.depositCents+payment.balanceCents!==payment.totalCents)
    return {ok:false,reason:"invalid-amount"};
  if (requestEvent?.state!=="sent" || !Number.isFinite(Date.parse(requestEvent.sentAt)))
    return {ok:false,reason:"request-not-sent"};
  if (now-Date.parse(requestEvent.sentAt)<day*DAY) return {ok:false,reason:"not-due"};
  return {ok:true,eventKey:"live-balance-reminder-"+day+"d-"+ledger.deposit.reference};
}
