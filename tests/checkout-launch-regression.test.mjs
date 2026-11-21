import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const checkout=readFileSync(new URL("../assets/checkout.js",import.meta.url),"utf8");
const page=readFileSync(new URL("../checkout.html",import.meta.url),"utf8");
const api=readFileSync(new URL("../functions/api/checkout.js",import.meta.url),"utf8");

test("Checkout provides English required-field messages even when browser language is Vietnamese",()=>{
 assert.match(page,/<html lang="en">/);
 assert.match(checkout,/form\.addEventListener\("invalid"/);
 assert.match(checkout,/Please enter a postcode or ZIP code\./);
 assert.match(checkout,/Please enter a valid email address\./);
 assert.match(checkout,/field\.setCustomValidity\(message\)/);
 assert.match(checkout,/form\.addEventListener\("input"/);
});

test("Address validation runs on the server before accepting a new checkout",()=>{
 assert.match(api,/import \{addressError\} from "\.\.\/_lib\/address-validation\.js"/);
 assert.match(api,/const deliveryError=addressError\(shipping\)/);
 assert.match(api,/if\(deliveryError\)return fail\(deliveryError\)/);
});

test("Live checkout requires explicit production flags and verified PayPal capture",()=>{
 assert.match(api,/env\.CF_PAGES_BRANCH==="main"&&\(env\.PAYPAL_MODE!=="live"\|\|env\.PAYPAL_LIVE_READY!=="yes"\)/);
 assert.match(api,/result\.status!=="COMPLETED"/);
 assert.match(api,/c\.amount\?\.currency_code==="AUD"&&c\.amount\?\.value===amount/);
 assert.match(api,/await put\(bucket,path\(id,ledgerFile\),next\)/);
});
