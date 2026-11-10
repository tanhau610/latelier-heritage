import test from "node:test";
import assert from "node:assert/strict";
import {processOrder} from "../workers/live-balance-reminders.js";

const id="LH-20261101-ABCDEF12";
const p="enquiries/"+id+"/";
const depositRef="PAYPAL-DEP-123456";
const eventKey="live-balance-request-"+depositRef;
const originalDate=new Date(Date.now()-8*86400000).toISOString();
function fixture({paid=false,cancelled=false,ageDays=8}={}){
 const records=new Map();
 const order={id,name:"Alex",email:"alex@example.com",checkoutMode:"live-inline",checkoutPlan:"deposit",status:cancelled?"Cancelled":"Ready for balance"};
 const payment={id,sandbox:false,quotedAt:"quote",totalCents:20000,depositCents:10000,balanceCents:10000};
 const ledger={quotedAt:"quote",deposit:{reference:depositRef,verification:"paypal-live-capture",sandbox:false,amountCents:10000},...(paid?{balance:{reference:"PAYPAL-BAL-123",verification:"paypal-live-capture",sandbox:false,amountCents:10000}}:{})};
 for(const [key,value] of Object.entries({"details.json":order,"payment.json":payment,"paypal-live-payments.json":ledger,["email-events/"+eventKey+".json"]:{state:"sent",sentAt:new Date(Date.now()-ageDays*86400000).toISOString()}}))records.set(p+key,JSON.stringify(value));
 const bucket={
   get:async key=>records.has(key)?{json:async()=>JSON.parse(records.get(key))}:null,
   put:async(key,value,options)=>{
     if(options?.onlyIf?.etagDoesNotMatch==="*"&&records.has(key))return null;
     records.set(key,String(value));return {key};
   }
 };
 const env={PORTRAIT_UPLOADS:bucket,RESEND_API_KEY:"dummy"};
 return {records,bucket,env,order,payment,ledger};
}
test("day-3 reminder sends once and keeps its own checkout token",async()=>{
 const f=fixture({ageDays:4});let sent=0;
 const original=globalThis.fetch;
 globalThis.fetch=async(_url,opts)=>{
   sent++;
   const payload=JSON.parse(opts.body);
   assert.match(payload.text,/checkout#id=/);
   assert.match(payload.text,/A\$100\.00/);
   return {ok:true,status:200,json:async()=>({id:"resend-1"})};
 };
 try{
   await processOrder(f.env,id,"ATELIER HAU <orders@atelierhau.com>");
   await processOrder(f.env,id,"ATELIER HAU <orders@atelierhau.com>");
   assert.equal(sent,1);
   assert.equal(JSON.parse(f.records.get(p+"email-events/live-balance-reminder-3d-"+depositRef+".json")).state,"sent");
   assert.ok(f.records.has(p+"checkout-email-access-3d.json"));
   assert.equal(f.records.has(p+"checkout-email-access-7d.json"),false);
 }finally{globalThis.fetch=original}
});
test("paid balance suppresses reminders",async()=>{
 const f=fixture({paid:true});let sent=0;const original=globalThis.fetch;
 globalThis.fetch=async()=>{sent++;throw Error("Should not send")};
 try{await processOrder(f.env,id,"ATELIER HAU <orders@atelierhau.com>");assert.equal(sent,0)}
 finally{globalThis.fetch=original}
});
test("cancelled order suppresses reminders",async()=>{
 const f=fixture({cancelled:true});let sent=0;const original=globalThis.fetch;
 globalThis.fetch=async()=>{sent++;throw Error("Should not send")};
 try{await processOrder(f.env,id,"ATELIER HAU <orders@atelierhau.com>");assert.equal(sent,0)}
 finally{globalThis.fetch=original}
});
test("simultaneous reminders only send once with conditional claim",async()=>{
 const f=fixture({ageDays:4});let sent=0;const original=globalThis.fetch;
 globalThis.fetch=async()=>{sent++;return {ok:true,status:200,json:async()=>({id:"resend-1"})}};
 try{
   await Promise.all([processOrder(f.env,id,"ATELIER HAU <orders@atelierhau.com>"),processOrder(f.env,id,"ATELIER HAU <orders@atelierhau.com>")]);
   assert.equal(sent,1);
 }finally{globalThis.fetch=original}
});
test("Resend failure leaves failed event and never retries automatically",async()=>{
 const f=fixture({ageDays:4});let sent=0;const original=globalThis.fetch;
 globalThis.fetch=async()=>{sent++;return {ok:false,status:429,json:async()=>({})}};
 try{
   await processOrder(f.env,id,"ATELIER HAU <orders@atelierhau.com>");
   await processOrder(f.env,id,"ATELIER HAU <orders@atelierhau.com>");
   assert.equal(sent,1);
   assert.equal(JSON.parse(f.records.get(p+"email-events/live-balance-reminder-3d-"+depositRef+".json")).state,"failed");
 }finally{globalThis.fetch=original}
});
