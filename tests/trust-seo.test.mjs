import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const home=readFileSync("index.html","utf8");
const about=readFileSync("about.html","utf8");
const contact=readFileSync("contact.html","utf8");
const match=home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);

test("Home page exposes parseable, truthful store identity",()=>{
 assert.ok(match,"JSON-LD must be present");
 const data=JSON.parse(match[1]);
 assert.equal(data["@type"],"OnlineStore");
 assert.equal(data.url,"https://atelierhau.com/");
 assert.equal(data.address.addressCountry,"VN");
 assert.equal(data.address.addressLocality,"Ho Chi Minh City");
 assert.equal(data.contactPoint.email,"hello@atelierhau.com");
 assert.equal(data.hasMerchantReturnPolicy.merchantReturnLink,"https://atelierhau.com/policies.html");
 assert.ok(!("aggregateRating" in data),"Do not fabricate ratings");
});
test("Studio origin and customer contact are disclosed on visible pages",()=>{
 assert.match(about,/Ho Chi Minh City, Vietnam/);
 assert.match(contact,/Ho Chi Minh City, Vietnam/);
 assert.match(contact,/mailto:hello@atelierhau\.com/);
 assert.match(home,/Hand-painted in Vietnam/);
 assert.match(home,/mailto:hello@atelierhau\.com/);
});

test("Policies page uses current site navigation and a working studio contact",()=>{
 const policies=readFileSync("policies.html","utf8");
 assert.match(policies,/class="site-header"/);
 assert.match(policies,/mailto:hello@atelierhau\.com/);
 assert.match(policies,/Ho Chi Minh City, Vietnam/);
 assert.match(policies,/Commission approval and payment/);
 assert.match(policies,/Changes, cancellations and returns/);
 assert.doesNotMatch(policies,/class="header"/);
});

test("Checkout and policies accurately disclose shipping and review timing",()=>{
 const checkout=readFileSync("checkout.html","utf8");
 const policies=readFileSync("policies.html","utf8");
 assert.match(checkout,/Import duties, local taxes and customs fees are not included/);
 assert.match(checkout,/Payment can be taken before our studio reviews/);
 assert.match(policies,/Payment may be taken before our studio has reviewed/);
 assert.match(policies,/not guaranteed at checkout/);
 assert.match(policies,/without your agreement/);
});

test("Search and sharing metadata stays consistent on key conversion pages",()=>{
 const commission=readFileSync("commission.html","utf8");
 assert.match(home,/<meta property="og:title"/);
 assert.match(home,/<meta property="og:image"/);
 assert.match(home,/delivery to Australia/);
 assert.match(commission,/<meta property="og:title"/);
 assert.match(commission,/prices in AUD/i);
 assert.doesNotMatch(home,/aggregateRating/);
});

test("Public pages prepare optional GA4 analytics without tracking private checkout URLs",()=>{
 const pages=["index.html","about.html","gallery.html","pricing.html","commission.html","process.html","contact.html","policies.html"];
 for(const page of pages)assert.match(readFileSync(page,"utf8"),/src="assets\/analytics\.js"/,page);
 const analytics=readFileSync("assets/analytics.js","utf8");
 assert.match(analytics,/const id="G-K3D6GVK0R0"\.trim\(\)/);
 assert.match(analytics,/commission_cta_click/);
 assert.match(analytics,/studio_video_play/);
 for(const page of ["checkout.html","payment.html","studio.html","shipping.html"]){
  assert.doesNotMatch(readFileSync(page,"utf8"),/src="assets\/analytics\.js"/,page);
 }
});
test("Process page answers search intent without invented shipping deadlines",()=>{
 const process=readFileSync("process.html","utf8");
 assert.match(process,/Can you paint my dog or cat from a photograph/);
 assert.match(process,/Do you deliver original pet portraits to Australia/);
 assert.match(process,/href="policies.html"/);
 assert.match(process,/rather than promise an unverified delivery date/);
});
