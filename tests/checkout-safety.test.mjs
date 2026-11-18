import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync("functions/api/checkout.js","utf8");

test("Production requires explicit Live opt-in and Preview rejects Live credentials",()=>{
 assert.match(source,/env\.CF_PAGES_BRANCH==="main"&&\(env\.PAYPAL_MODE!=="live"\|\|env\.PAYPAL_LIVE_READY!=="yes"\)/);
 assert.match(source,/env\.CF_PAGES_BRANCH!=="main"&&env\.PAYPAL_MODE==="live"/);
});

test("Capture verifies PayPal order, exact amount, currency and a single capture",()=>{
 assert.match(source,/result\.id!==input\.orderID/);
 assert.match(source,/result\.status!=="COMPLETED"/);
 assert.match(source,/units\.length!==1\|\|captures\.length!==1/);
 assert.match(source,/units\[0\]\.custom_id!==reference/);
 assert.match(source,/c\.amount\?\.currency_code==="AUD"&&c\.amount\?\.value===amount/);
});

test("Capture uncertainty queries PayPal instead of blindly charging again",()=>{
 assert.match(source,/catch\(captureError\)/);
 assert.match(source,/PayPal capture outcome unknown; manual reconciliation required/);
 assert.match(source,/Payment status is being verified\. Please contact the studio before retrying/);
});

test("Verified payment is stored before customer email, and Live notifications are separate",()=>{
 const ledger=source.indexOf('await put(bucket,path(id,ledgerFile),next)');
 const customer=source.indexOf('await sendLivePaymentEmail(');
 assert.ok(ledger>0&&customer>ledger);
 assert.match(source,/live\?await sendLivePaymentEmail/);
 assert.match(source,/sendSandboxCustomerEmail/);
});

test("Sandbox and Live share checkout flow but use separate PayPal endpoints and ledgers",()=>{
 assert.match(source,/function checkoutMode\(env\)/);
 assert.match(source,/return live\?"live":"sandbox"/);
 assert.match(source,/checkoutMode\(env\)==="live"\?"https:\/\/api-m\.paypal\.com":"https:\/\/api-m\.sandbox\.paypal\.com"/);
 assert.match(source,/live\?"paypal-live-payments\.json":"paypal-sandbox-payments\.json"/);
 assert.match(source,/payment\.sandbox===live/);
 assert.match(source,/verification:live\?"paypal-live-capture":"paypal-sandbox-capture"/);
 assert.match(source,/checkoutPlan:plan,sandbox:!live/);
});
test("Verified Live and Sandbox captures send their respective confirmation email only after ledger persistence",()=>{
 assert.match(source,/await put\(bucket,path\(id,ledgerFile\),next\)/);
 assert.match(source,/live\?await sendLivePaymentEmail\(/);
 assert.match(source,/:await sendSandboxCustomerEmail\(/);
 assert.match(source,/stage==="deposit"\?"ĐÃ THANH TOÁN CỌC 50%"/);
});
