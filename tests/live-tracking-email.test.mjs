import test from "node:test";
import assert from "node:assert/strict";
import {sendLiveTrackingEmail} from "../functions/_lib/live-tracking-email.js";

function fixture(){
 const order={id:"LH-20261101-ABCDEF12",checkoutMode:"live-inline",status:"Shipped",name:"Alex",email:"alex@example.com"};
 const payment={id:order.id,sandbox:false,quotedAt:"quote",totalCents:20000,depositCents:10000,balanceCents:10000};
 const deposit={reference:"PAYPAL-DEPOSIT",verification:"paypal-live-capture",sandbox:false,amountCents:10000};
 const balance={reference:"PAYPAL-BALANCE",verification:"paypal-live-capture",sandbox:false,amountCents:10000};
 const ledger={quotedAt:"quote",deposit,balance};
 const tracking={carrier:"DHL",number:"12345",url:"https://www.dhl.com/track"};
 const env={CF_PAGES_BRANCH:"main",PAYPAL_MODE:"live",PAYPAL_LIVE_READY:"yes",RESEND_FROM:"ATELIER HAU <orders@atelierhau.com>",RESEND_API_KEY:"dummy"};
 const fingerprint="a".repeat(32);
 return {env,order,payment,ledger,tracking,fingerprint};
}
async function expectReject(mutator){
 const f=fixture();mutator(f);
 let calls=0;const bucket={get:async()=>null,put:async()=>{calls++}};
 await assert.rejects(sendLiveTrackingEmail({...f,bucket}));
 assert.equal(calls,0,"Rejected order must not write an email event");
}
test("rejects unverified full payment",()=>expectReject(f=>{f.ledger.balance.verification="manual"}));
test("rejects unpaid balance",()=>expectReject(f=>{delete f.ledger.balance}));
test("rejects sandbox mode",()=>expectReject(f=>{f.env.CF_PAGES_BRANCH="preview"}));
test("rejects wrong quote",()=>expectReject(f=>{f.ledger.quotedAt="different"}));
test("rejects cancelled order",()=>expectReject(f=>{f.order.status="Cancelled"}));
test("rejects HTTP tracking link",()=>expectReject(f=>{f.tracking.url="http://example.com"}));
test("rejects private tracking URL",()=>expectReject(f=>{f.tracking.url="https://127.0.0.1/track"}));
test("rejects missing customer email",()=>expectReject(f=>{f.order.email=""}));
test("already recorded email does not resend",async()=>{
 const f=fixture();let writes=0;
 const bucket={get:async()=>({}),put:async()=>{writes++}};
 const result=await sendLiveTrackingEmail({...f,bucket});
 assert.equal(result.state,"already-recorded");assert.equal(writes,0);
});

test("sends one Live tracking email and records successful delivery",async()=>{
 const f=fixture();const records=new Map();let deliveries=0;
 const bucket={
   get:async key=>records.has(key)?{json:async()=>JSON.parse(records.get(key))}:null,
   put:async(key,value,options)=>{
     if(options?.onlyIf?.etagDoesNotMatch==="*"&&records.has(key))return null;
     records.set(key,value);return {key};
   }
 };
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>{
   deliveries++;
   assert.equal(url,"https://api.resend.com/emails");
   const payload=JSON.parse(opts.body);
   assert.equal(payload.to[0],f.order.email);
   assert.match(payload.html,/12345/);
   return {ok:true,status:200,json:async()=>({id:"resend-123"})};
 };
 try{
   assert.equal((await sendLiveTrackingEmail({...f,bucket})).state,"sent");
   assert.equal((await sendLiveTrackingEmail({...f,bucket})).state,"already-recorded");
   assert.equal(deliveries,1);
   const key=[...records.keys()][0];
   assert.equal(JSON.parse(records.get(key)).state,"sent");
 }finally{globalThis.fetch=originalFetch}
});
test("conditional claim prevents duplicate sends during concurrent requests",async()=>{
 const f=fixture();const records=new Map();let deliveries=0;
 const bucket={
   get:async()=>null,
   put:async(key,value,opts)=>{
     if(opts?.onlyIf?.etagDoesNotMatch==="*"&&records.has(key))return null;
     records.set(key,value);return {key};
   }
 };
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>{deliveries++;return {ok:true,status:200,json:async()=>({id:"resend-123"})}};
 try{
   const result=await Promise.all([sendLiveTrackingEmail({...f,bucket}),sendLiveTrackingEmail({...f,bucket})]);
   assert.deepEqual(result.map(x=>x.state).sort(),["already-recorded","sent"]);
   assert.equal(deliveries,1);
 }finally{globalThis.fetch=originalFetch}
});
