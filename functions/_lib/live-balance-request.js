import {atelierSender} from "./brand-email.js";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=c=>"A$"+(c/100).toFixed(2);
// Only verified Live deposits can produce a customer-facing balance request.
export async function sendLiveBalanceRequest({env,bucket,order,payment,ledger,checkoutLink}){
  if(env.CF_PAGES_BRANCH!=="main"||env.PAYPAL_MODE!=="live"||env.PAYPAL_LIVE_READY!=="yes")throw Error("Live balance email not authorized");
  if(order.checkoutMode!=="live-inline"||order.checkoutPlan==="full"||order.status!=="Ready for balance"||payment?.sandbox!==false||ledger?.quotedAt!==payment?.quotedAt||!ledger.deposit||ledger.balance||ledger.full)throw Error("Order is not awaiting a verified Live balance");
  if(ledger.deposit.verification!=="paypal-live-capture"||ledger.deposit.sandbox!==false||ledger.deposit.amountCents!==payment.depositCents||!ledger.deposit.reference)throw Error("Unverified Live deposit");
  if(!Number.isInteger(payment.balanceCents)||payment.balanceCents<=0||payment.depositCents+payment.balanceCents!==payment.totalCents)throw Error("Invalid balance");
  const sender=atelierSender(env);
  if(!/^ATELIER HAU <[a-z0-9._%+-]+@atelierhau\.com>$/i.test(sender)||!env.RESEND_API_KEY||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email||""))throw Error("Verified sender and customer email required");
  const link=new URL(checkoutLink);
  if(link.protocol!=="https:"||link.hostname!=="atelierhau.com"||link.pathname!=="/checkout"||!link.hash.includes("token="))throw Error("Invalid secure balance checkout link");
  const eventKey="live-balance-request-"+ledger.deposit.reference;
  const key="enquiries/"+order.id+"/email-events/"+eventKey+".json";
  const prior=await bucket.get(key);
  if(prior){try{if((await prior.json()).state==="sent")return {state:"already-sent"};}catch{}}
  const subject="Your portrait is ready — remaining balance · "+order.id;
  const heading="Your portrait is ready.";
  const description="Your hand-painted portrait is ready. Please complete the remaining balance before we arrange dispatch.";
  const details=["Order: "+order.id,"Portrait: "+(order.petName||"Custom pet portrait"),"Order total: "+money(payment.totalCents),"Deposit received: "+money(payment.depositCents),"Remaining balance: "+money(payment.balanceCents)];
  const html="<div style='background:#f7f3ef;padding:28px 14px;font-family:Arial,sans-serif;color:#332b29'><div style='max-width:580px;margin:auto;background:#fff;border:1px solid #e6ddd5;padding:32px'><h1 style='font-family:Georgia,serif;color:#743f48'>ATELIER HAU</h1><h2>"+esc(heading)+"</h2><p>Hello "+esc(order.name)+",</p><p>"+esc(description)+"</p><ul>"+details.map(x=>"<li>"+esc(x)+"</li>").join("")+"</ul><p style='margin:28px 0'><a style='background:#743f48;color:white;text-decoration:none;padding:14px 22px' href='"+esc(checkoutLink)+"'>Pay remaining balance</a></p><p>If you have already paid, please contact us before paying again.</p></div></div>";
  const record={id:order.id,event:"live-balance-request",eventKey,state:"pending",createdAt:new Date().toISOString()};
  await bucket.put(key,JSON.stringify(record),{httpMetadata:{contentType:"application/json"}});
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json","Idempotency-Key":"atelier-"+order.id+"-"+eventKey},body:JSON.stringify({from:sender,to:[order.email],subject,html,text:[heading,"Hello "+(order.name||"there"),description,...details,"Pay remaining balance: "+checkoutLink].join("\n\n")})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok){record.state="failed";record.httpStatus=response.status;await bucket.put(key,JSON.stringify(record),{httpMetadata:{contentType:"application/json"}});throw Error("Resend rejected Live balance request");}
  record.state="sent";record.resendId=result.id||null;record.sentAt=new Date().toISOString();
  await bucket.put(key,JSON.stringify(record),{httpMetadata:{contentType:"application/json"}});
  return {state:"sent"};
}
