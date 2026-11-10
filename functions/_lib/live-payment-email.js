import {atelierSender} from "./brand-email.js";
// Live payment confirmation: invoked only after a PayPal COMPLETED capture is persisted.
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=c=>"A$"+(Number(c)/100).toFixed(2);
export async function sendLivePaymentEmail({env,bucket,order,payment,stage,captureId}){
  if(env.CF_PAGES_BRANCH!=="main"||env.PAYPAL_MODE!=="live"||env.PAYPAL_LIVE_READY!=="yes")throw Error("Live email environment not authorized");
  const sender=atelierSender(env);
  if(!/^ATELIER HAU <[a-z0-9._%+-]+@atelierhau\.com>$/i.test(sender))throw Error("Verified atelierhau.com sender required for live customer email");
  if(!["deposit","balance","full"].includes(stage)||typeof captureId!=="string"||!/^[A-Za-z0-9-]{8,100}$/.test(captureId))throw Error("Invalid verified payment email event");
  if(!order?.id||payment?.id!==order.id||!Number.isInteger(payment.totalCents)||payment.totalCents<=0||!Number.isInteger(payment.depositCents)||!Number.isInteger(payment.balanceCents)||payment.depositCents+payment.balanceCents!==payment.totalCents)throw Error("Invalid verified payment record");
  if(!env.RESEND_API_KEY||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email||""))throw Error("Live email configuration invalid");
  const key="enquiries/"+order.id+"/email-events/live-payment-"+stage+".json";
  const prev=await bucket.get(key);
  if(prev)return {state:"already-recorded"}; // failed/pending require manual review to avoid duplicates
  const label=stage==="deposit"?"50% deposit":stage==="balance"?"remaining balance":"full payment";
  const paid=stage==="deposit"?payment.depositCents:stage==="balance"?payment.balanceCents:payment.totalCents;
  const remaining=stage==="deposit"?payment.balanceCents:0;
  const subject="Payment received — ATELIER HAU · "+order.id;
  const lines=["ATELIER HAU","Your "+label+" has been received.","Order: "+order.id,"Portrait: "+(order.petName||"Custom pet portrait"),"Payment received: "+money(paid),"Remaining balance: "+money(remaining),"PayPal transaction: "+captureId,"We will contact you about the next steps."];
  const html="<div style='font-family:Arial,sans-serif;color:#302a29;max-width:580px;margin:auto;padding:32px'><h1 style='font-family:Georgia,serif;color:#743f48'>ATELIER HAU</h1><h2>Payment received</h2><p>Hello "+esc(order.name)+",</p><p>Thank you. Your "+esc(label)+" for your original oil portrait has been confirmed.</p><ul>"+lines.slice(2,8).map(x=>"<li>"+esc(x)+"</li>").join("")+"</ul><p>We will contact you about the next steps.</p></div>";
  const record={id:order.id,stage,captureId,state:"pending",createdAt:new Date().toISOString()};
  const claimed=await bucket.put(key,JSON.stringify(record),{onlyIf:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"application/json"}});
  if(!claimed)return {state:"already-recorded"};
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json","Idempotency-Key":"atelier-live-"+captureId+"-"+stage},body:JSON.stringify({from:sender,to:[order.email],subject,html,text:lines.join("\n")})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok){record.state="failed";record.httpStatus=response.status;await bucket.put(key,JSON.stringify(record),{httpMetadata:{contentType:"application/json"}});throw Error("Live email provider rejected message");}
  record.state="sent";record.resendId=result.id||null;record.sentAt=new Date().toISOString();
  await bucket.put(key,JSON.stringify(record),{httpMetadata:{contentType:"application/json"}});
  return {state:"sent"};
}
