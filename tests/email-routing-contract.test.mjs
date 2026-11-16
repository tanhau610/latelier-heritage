import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(path,"utf8");
const customerFlows=[
 "functions/_lib/live-payment-email.js",
 "functions/_lib/live-status-email.js",
 "functions/_lib/live-tracking-email.js",
 "functions/_lib/live-balance-request.js",
 "workers/live-balance-reminders.js"
];
test("Every customer-facing Live email uses the verified studio reply address",()=>{
 for(const path of customerFlows){
  const source=read(path);
  assert.match(source,/reply_to:\s*['"]hello@atelierhau\.com['"]/,path+" missing Reply-To");
  assert.match(source,/to:\s*\[order\.email\]/,path+" must address the customer");
 }
});
test("Public contact points to the support inbox and does not reveal private Gmail",()=>{
 const contact=read("contact.html"),home=read("index.html");
 for(const [path,html] of [["contact.html",contact],["index.html",home]]){
  assert.match(html,/mailto:hello@atelierhau\.com/,path);
  assert.doesNotMatch(html,/@gmail\.com/i,path+" exposes a private address");
 }
});
test("Payment capture still validates live payment before sending a receipt",()=>{
 const checkout=read("functions/api/checkout.js");
 const ledger=checkout.indexOf('await put(bucket,path(id,ledgerFile),next)');
 const receipt=checkout.indexOf('await sendLivePaymentEmail(');
 assert.ok(ledger>=0&&receipt>ledger,"Verified ledger must be persisted before customer receipt");
});
