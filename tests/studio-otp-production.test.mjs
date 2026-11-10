import test from "node:test";
import assert from "node:assert/strict";
import {onRequestPost} from "../functions/api/studio-auth.js";
import {verifyStudioSession} from "../functions/_lib/studio-otp-auth.js";
const url="https://atelierhau.com/api/studio?action=otp-request";
const env={CF_PAGES_BRANCH:"main",PAYPAL_MODE:"live",PAYPAL_LIVE_READY:"yes",STUDIO_ADMIN_KEY:"x".repeat(48),NOTIFICATION_EMAIL:"admin@example.com",RESEND_API_KEY:"dummy",RESEND_FROM:"ATELIER HAU <orders@atelierhau.com>"};
const request=(body)=>new Request(url,{method:"POST",headers:{"Content-Type":"application/json","Origin":"https://atelierhau.com"},body:JSON.stringify(body)});
test("Production OTP rejects absent R2 binding without email",async()=>{
 const r=await onRequestPost({request:request({action:"request"}),env});
 assert.equal(r.status,503);
});
test("Production OTP works independently of PayPal flags while respecting rate limits",async()=>{
 const r=await onRequestPost({request:request({action:"request"}),env:{...env,PORTRAIT_UPLOADS:{get:async()=>({json:async()=>({lastSent:Date.now(),windowStart:Date.now(),count:1})})},PAYPAL_LIVE_READY:"no"}});
 assert.equal(r.status,429);
});
test("Production OTP refuses browser-supplied destination and requires fixed admin email",async()=>{
 const r=await onRequestPost({request:request({action:"request",email:"attacker@example.com"}),env:{...env,PORTRAIT_UPLOADS:{},NOTIFICATION_EMAIL:""}});
 assert.equal(r.status,503);
});
test("Production session verification rejects invalid tokens",async()=>{
 assert.equal(await verifyStudioSession({...env,PORTRAIT_UPLOADS:{}}, "bad-token"),false);
});
test("OTP rejects cross-origin requests",async()=>{
 const r=await onRequestPost({request:new Request(url,{method:"POST",headers:{Origin:"https://evil.example"},body:JSON.stringify({action:"request"})}),env:{...env,PORTRAIT_UPLOADS:{}}});
 assert.equal(r.status,403);
});
