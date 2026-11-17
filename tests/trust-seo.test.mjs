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
 assert.equal(data.contactPoint.email,"orders@atelierhau.com");
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
