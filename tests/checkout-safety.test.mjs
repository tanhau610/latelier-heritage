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
