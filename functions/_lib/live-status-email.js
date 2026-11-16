import {atelierSender} from "./brand-email.js";
const messages={
 Confirmed:["Your portrait order is confirmed","Your order has been confirmed by our studio."],
 Painting:["Your portrait is being painted","Our artist has started painting your original oil portrait."],
 Completed:["Your portrait order is complete","Your portrait order has been marked complete. Thank you for choosing ATELIER HAU."],
 Cancelled:["An update about your portrait order","Your portrait order has been marked cancelled. Please contact our studio if this is unexpected."]
};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const verified=(x,cents)=>x?.verification==="paypal-live-capture"&&x.sandbox===false&&Number.isInteger(cents)&&cents>0&&x.amountCents===cents&&/^[A-Za-z0-9-]{8,100}$/.test(x.reference||"");
export async function sendLiveStatusEmail({env,bucket,order,payment,ledger,status,transitionId}){
 if(!Object.hasOwn(messages,status))throw Error("Status email not supported");
 if(env.CF_PAGES_BRANCH!=="main"||env.PAYPAL_MODE!=="live"||env.PAYPAL_LIVE_READY!=="yes")throw Error("Live status email disabled");
 if(order?.checkoutMode!=="live-inline"||order.status!==status||payment?.id!==order.id||payment.sandbox!==false||ledger?.quotedAt!==payment.quotedAt)throw Error("Not a verified Live checkout");
 if(!verified(ledger.deposit,payment.depositCents)&&!verified(ledger.full,payment.totalCents))throw Error("No verified Live payment");
 if(!/^[0-9]{14,20}$/.test(transitionId))throw Error("Invalid transition");
 const sender=atelierSender(env);
 if(!/^ATELIER HAU <[a-z0-9._%+-]+@atelierhau\.com>$/i.test(sender)||!env.RESEND_API_KEY||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email||""))throw Error("Verified sender required");
 const eventKey="live-status-"+status.toLowerCase().replace(/[^a-z]+/g,"-")+"-"+transitionId;
 const key="enquiries/"+order.id+"/email-events/"+eventKey+".json";
 if(await bucket.get(key))return {state:"already-recorded"};
 const record={id:order.id,event:"live-status",status,eventKey,state:"pending",createdAt:new Date().toISOString()};
 if(!await bucket.put(key,JSON.stringify(record),{onlyIf:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"application/json"}}))return {state:"already-recorded"};
 const [subject,body]=messages[status];
 const text=["Hello "+(order.name||"there")+",",body,"Order: "+order.id,"Portrait: "+(order.petName||"Custom oil portrait"),"ATELIER HAU"].join("\n\n");
 try{
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json","Idempotency-Key":"atelier-"+order.id+"-"+eventKey},body:JSON.stringify({from:sender,to:[order.email],subject:subject+" · "+order.id,text,html:"<div style='font-family:Arial,sans-serif;max-width:580px;margin:auto;padding:30px'><h1 style='font-family:Georgia,serif;color:#743f48'>ATELIER HAU</h1><h2>"+esc(subject)+"</h2><p>Hello "+esc(order.name||"there")+",</p><p>"+esc(body)+"</p><p>Order: "+esc(order.id)+"</p></div>"})});
  const result=await response.json().catch(()=>({}));
  record.state=response.ok?"sent":"failed";record.httpStatus=response.status;record.sentAt=response.ok?new Date().toISOString():null;record.resendId=result.id||null;
  await bucket.put(key,JSON.stringify(record),{httpMetadata:{contentType:"application/json"}});
  if(!response.ok)throw Error("Resend rejected Live status email");
  return {state:"sent"};
 }catch(error){if(record.state==="pending"){record.state="failed";await bucket.put(key,JSON.stringify(record),{httpMetadata:{contentType:"application/json"}})}throw error}
}
