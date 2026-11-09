import test from "node:test";
import assert from "node:assert/strict";
import {balanceReminderEligibility as eligible} from "../functions/_lib/live-balance-reminder-eligibility.js";

const now=Date.parse("2026-11-09T00:00:00Z");
function fixture(){
 const order={id:"LH-20261101-ABCDEF12",checkoutMode:"live-inline",checkoutPlan:"deposit",status:"Ready for balance"};
 const payment={id:order.id,sandbox:false,quotedAt:"q1",totalCents:20000,depositCents:10000,balanceCents:10000};
 const ledger={quotedAt:"q1",deposit:{verification:"paypal-live-capture",sandbox:false,amountCents:10000,reference:"PAYPAL12345"}};
 const requestEvent={state:"sent",sentAt:new Date(now-4*86400000).toISOString()};
 return {order,payment,ledger,requestEvent,now,day:3};
}
test("due after 3 days with verified live deposit",()=>assert.equal(eligible(fixture()).ok,true));
test("not due before 3 days",()=>{const x=fixture();x.requestEvent.sentAt=new Date(now-2*86400000).toISOString();assert.equal(eligible(x).reason,"not-due")});
test("7 day reminder not sent early",()=>{const x=fixture();x.day=7;assert.equal(eligible(x).reason,"not-due")});
test("full balance paid suppresses reminder",()=>{const x=fixture();x.ledger.balance={reference:"PAID"};assert.equal(eligible(x).ok,false)});
test("cancelled order suppresses reminder",()=>{const x=fixture();x.order.status="Cancelled";assert.equal(eligible(x).ok,false)});
test("sandbox suppresses reminder",()=>{const x=fixture();x.payment.sandbox=true;assert.equal(eligible(x).ok,false)});
test("full payment plan suppresses reminder",()=>{const x=fixture();x.order.checkoutPlan="full";assert.equal(eligible(x).ok,false)});
test("unverified deposit suppresses reminder",()=>{const x=fixture();x.ledger.deposit.verification="manual";assert.equal(eligible(x).ok,false)});
test("mismatched quote suppresses reminder",()=>{const x=fixture();x.ledger.quotedAt="q2";assert.equal(eligible(x).ok,false)});
test("request email must have sent timestamp",()=>{const x=fixture();x.requestEvent.state="failed";assert.equal(eligible(x).ok,false)});
test("reject unsupported reminder day",()=>{const x=fixture();x.day=1;assert.equal(eligible(x).ok,false)});
