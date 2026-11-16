import test from "node:test";
import assert from "node:assert/strict";
import {sendLiveStatusEmail} from "../functions/_lib/live-status-email.js";
const id="LH-20261116-ABCDEF12";
function fixture(status="Painting"){
 const records=new Map(),env={CF_PAGES_BRANCH:"main",PAYPAL_MODE:"live",PAYPAL_LIVE_READY:"yes",RESEND_API_KEY:"dummy",RESEND_FROM:"ATELIER HAU <orders@atelierhau.com>"};
 const bucket={get:async k=>records.has(k)?{json:async()=>JSON.parse(records.get(k))}:null,put:async(k,v,o)=>{if(o?.onlyIf?.etagDoesNotMatch==="*"&&records.has(k))return null;records.set(k,String(v));return {key:k}}};
 const order={id,name:"Customer",email:"customer@example.com",checkoutMode:"live-inline",status};
 const payment={id,sandbox:false,quotedAt:"quote",depositCents:10000,totalCents:20000};
 const ledger={quotedAt:"quote",deposit:{reference:"CAPTURE-12345678",verification:"paypal-live-capture",sandbox:false,amountCents:10000}};
 return {records,env,bucket,order,payment,ledger,status,transitionId:"20261116153000000"};
}
test("verified status sends exactly once and logs sent",async()=>{
 const f=fixture();let count=0;const original=globalThis.fetch;
 globalThis.fetch=async(_url,opts)=>{count++;const data=JSON.parse(opts.body);assert.equal(data.to[0],f.order.email);assert.match(data.subject,/being painted/);return {ok:true,status:200,json:async()=>({id:"resend-123"})}};
 try{assert.deepEqual(await sendLiveStatusEmail(f),{state:"sent"});assert.deepEqual(await sendLiveStatusEmail(f),{state:"already-recorded"});assert.equal(count,1)}finally{globalThis.fetch=original}
});
test("unverified and sandbox orders never send",async()=>{
 const f=fixture("Confirmed");f.ledger.deposit.verification="paypal-sandbox-capture";let count=0;const original=globalThis.fetch;globalThis.fetch=async()=>{count++;throw Error("must not send")};
 try{await assert.rejects(sendLiveStatusEmail(f),/No verified Live payment/);assert.equal(count,0)}finally{globalThis.fetch=original}
});
test("Resend failure is logged and does not automatically resend",async()=>{
 const f=fixture("Completed");let count=0;const original=globalThis.fetch;globalThis.fetch=async()=>{count++;return {ok:false,status:429,json:async()=>({})}};
 try{await assert.rejects(sendLiveStatusEmail(f),/Resend rejected/);assert.deepEqual(await sendLiveStatusEmail(f),{state:"already-recorded"});assert.equal(count,1)}finally{globalThis.fetch=original}
});
test("no generic status email for balance or shipped",async()=>{
 for(const status of ["Ready for balance","Shipped"]){const f=fixture(status);await assert.rejects(sendLiveStatusEmail(f),/not supported/)}
});
