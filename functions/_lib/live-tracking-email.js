import {atelierSender} from "./brand-email.js";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export async function sendLiveTrackingEmail({env,bucket,order,payment,ledger,tracking,fingerprint}){
  if(env.CF_PAGES_BRANCH!=="main"||env.PAYPAL_MODE!=="live"||env.PAYPAL_LIVE_READY!=="yes")throw Error("Live shipping email disabled");
  if(order?.checkoutMode!=="live-inline"||!["Shipped","Completed"].includes(order.status)||payment?.id!==order.id||payment.sandbox!==false||ledger?.quotedAt!==payment.quotedAt)throw Error("Invalid Live order");
  const verified=x=>x?.verification==="paypal-live-capture"&&x.sandbox===false&&typeof x.reference==="string";
  const paid=verified(ledger.full)&&ledger.full.amountCents===payment.totalCents ||
    verified(ledger.deposit)&&verified(ledger.balance)&&ledger.deposit.amountCents===payment.depositCents&&ledger.balance.amountCents===payment.balanceCents;
  if(!paid)throw Error("Full PayPal Live payment not verified");
  if(!/^[a-f0-9]{32}$/.test(fingerprint)||!tracking?.carrier||!tracking?.number)throw Error("Invalid tracking");
  const url=new URL(tracking.url);
  if(url.protocol!=="https:"||url.username||url.password||!url.hostname||url.hostname==="localhost"||url.hostname.startsWith("[")||/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname))throw Error("Invalid tracking URL");
  const sender=atelierSender(env);
  if(!/^ATELIER HAU <[a-z0-9._%+-]+@atelierhau\.com>$/i.test(sender)||!env.RESEND_API_KEY||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email||""))throw Error("Email not configured");
  const eventKey="live-tracking-"+fingerprint,key="enquiries/"+order.id+"/email-events/"+eventKey+".json";
  const prev=await bucket.get(key);
  if(prev)return {state:"already-recorded"};
  const record={id:order.id,event:"live-tracking",eventKey,state:"pending",createdAt:new Date().toISOString()};
  const claimed=await bucket.put(key,JSON.stringify(record),{onlyIf:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"application/json"}});
  if(!claimed)return {state:"already-recorded"};
  const subject="Your portrait has shipped · "+order.id;
  const lines=["Hello "+(order.name||"there")+",","Your original oil portrait is on its way.","Order: "+order.id,"Carrier: "+tracking.carrier,"Tracking number: "+tracking.number,"Track your parcel: "+url.toString(),"Thank you for choosing ATELIER HAU."];
  const html="<div style='font-family:Arial,sans-serif;max-width:580px;margin:auto;padding:30px'><h1 style='font-family:Georgia,serif;color:#743f48'>ATELIER HAU</h1><h2>Your portrait is on its way</h2><p>Hello "+esc(order.name||"there")+",</p><p>Your original oil portrait has shipped.</p><p><strong>Order:</strong> "+esc(order.id)+"</p><p><strong>Carrier:</strong> "+esc(tracking.carrier)+"</p><p><strong>Tracking number:</strong> "+esc(tracking.number)+"</p><p><a href='"+esc(url.toString())+"'>Track your parcel</a></p></div>";
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json","Idempotency-Key":"atelier-"+order.id+"-"+eventKey},body:JSON.stringify({from:sender,to:[order.email],subject,html,text:lines.join("\n")})});
  const result=await response.json().catch(()=>({}));
  record.state=response.ok?"sent":"failed";record.httpStatus=response.status;record.sentAt=response.ok?new Date().toISOString():null;record.resendId=result.id||null;
  await bucket.put(key,JSON.stringify(record),{httpMetadata:{contentType:"application/json"}});
  if(!response.ok)throw Error("Resend rejected tracking email");
  return {state:"sent"};
}
