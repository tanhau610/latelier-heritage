import test from "node:test";
import assert from "node:assert/strict";
import {sendLivePaymentEmail} from "../functions/_lib/live-payment-email.js";
function fixture(){
 const data=new Map(),bucket={
  get:async key=>data.has(key)?{json:async()=>JSON.parse(data.get(key))}:null,
  put:async(key,value,opts)=>{
   if(opts?.onlyIf?.etagDoesNotMatch==="*"&&data.has(key))return null;
   data.set(key,value);return {key};
  }
 };
 return {data,bucket,env:{CF_PAGES_BRANCH:"main",PAYPAL_MODE:"live",PAYPAL_LIVE_READY:"yes",RESEND_FROM:"ATELIER HAU <orders@atelierhau.com>",RESEND_API_KEY:"test"},order:{id:"LH-20261110-ABCDEF12",name:"Alex",email:"alex@example.com"},payment:{id:"LH-20261110-ABCDEF12",totalCents:20000,depositCents:10000,balanceCents:10000},stage:"deposit",captureId:"PAYPAL-CAPTURE-123456"};
}
test("successful Live payment confirmation sends once and records event",async()=>{
 const f=fixture();let calls=0;const original=globalThis.fetch;
 globalThis.fetch=async()=>{calls++;return {ok:true,status:200,json:async()=>({id:"resend-id"})}};
 try{
  assert.equal((await sendLivePaymentEmail(f)).state,"sent");
  assert.equal((await sendLivePaymentEmail(f)).state,"already-recorded");
  assert.equal(calls,1);
  const record=JSON.parse([...f.data.values()][0]);assert.equal(record.state,"sent");
 }finally{globalThis.fetch=original}
});
test("concurrent payment email requests cannot send twice",async()=>{
 const f=fixture();let calls=0;const original=globalThis.fetch;
 globalThis.fetch=async()=>{calls++;return {ok:true,status:200,json:async()=>({id:"resend-id"})}};
 try{
  const states=(await Promise.all([sendLivePaymentEmail(f),sendLivePaymentEmail(f)])).map(x=>x.state).sort();
  assert.deepEqual(states,["already-recorded","sent"]);assert.equal(calls,1);
 }finally{globalThis.fetch=original}
});
test("failed Resend request is not retried automatically",async()=>{
 const f=fixture();let calls=0;const original=globalThis.fetch;
 globalThis.fetch=async()=>{calls++;return {ok:false,status:429,json:async()=>({})}};
 try{
  await assert.rejects(sendLivePaymentEmail(f),/rejected/);
  assert.equal((await sendLivePaymentEmail(f)).state,"already-recorded");
  assert.equal(calls,1);
  assert.equal(JSON.parse([...f.data.values()][0]).state,"failed");
 }finally{globalThis.fetch=original}
});
test("Sandbox cannot send Live confirmation",async()=>{
 const f=fixture();f.env.CF_PAGES_BRANCH="preview";
 await assert.rejects(sendLivePaymentEmail(f),/not authorized/);
});
