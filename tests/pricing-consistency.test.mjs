import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const pricing=readFileSync("pricing.html","utf8");
const checkout=readFileSync("assets/checkout.js","utf8");
const commission=readFileSync("assets/site.js","utf8");

test("Public pricing table agrees with checkout prices for one and two pets",()=>{
 const matrix=[["20x25",229,299],["30x40",379,469],["40x50",499,599],["50x70",699,829]];
 for(const [size,one,two] of matrix){
  const [w,h]=size.split("x");
  assert.ok(pricing.includes(`<td>${w} × ${h} cm</td><td>A$${one}</td><td>A$${two}</td>`),`Pricing page mismatch for ${size}`);
  assert.ok(checkout.includes(`"${size}":[${one},${two}]`),`Checkout mismatch for ${size}`);
 }
});
test("Checkout continues to disclose AUD and optional 50 percent deposit",()=>{
 assert.match(checkout,/toLocaleString\("en-AU"/);
 assert.match(checkout,/total\/2/);
});
