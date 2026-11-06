// Sandbox-only transactional email previews. Never send to customer addresses from this module.
// All recipient addresses are forced to NOTIFICATION_EMAIL until a verified sending domain and live rollout are approved.
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const aud = cents => "A$" + (Number(cents || 0) / 100).toFixed(2);
const labels = {
  Confirmed: ["Your portrait order is confirmed", "We've confirmed your order and will prepare your portrait for painting."],
  Painting: ["Your portrait is being painted", "Our artist has started hand-painting your portrait with care."],
  "Ready for balance": ["Your portrait is ready", "Your portrait is ready. If you paid a deposit, the remaining balance is now due before dispatch."],
  Shipped: ["Your portrait has been dispatched", "Your finished portrait has been dispatched. We'll share tracking details separately when available."],
  Completed: ["Thank you for your order", "Your portrait order is complete. Thank you for trusting L'Atelier Heritage."],
  Cancelled: ["Update on your portrait order", "Your portrait order has been marked cancelled. Please contact us if this is unexpected."]
};
function copyFor(event, order, payment, link, paidInFull, tracking) {
  const pet = order.petName || "your pet";
  const total = aud(payment?.totalCents);
  if (event === "payment-deposit") return {
    subject:"Deposit received for " + pet,
    heading:"Your deposit is confirmed.",
    body:"We've received your 50% test deposit for your custom portrait. Your order is safely recorded.",
    details:["Order: " + order.id, "Portrait: " + pet, "Total: " + total, "Deposit received: " + aud(payment?.depositCents), "Remaining balance: " + aud(payment?.balanceCents)],
    link:null
  };
  if (event === "payment-full" || event === "payment-balance") return {
    subject:"Payment confirmed for " + pet,
    heading:"Your payment is confirmed.",
    body:event === "payment-full" ? "We've received your full test payment for your portrait." : "We've received the remaining 50% test balance. Your portrait is now paid in full.",
    details:["Order: " + order.id, "Portrait: " + pet, "Total paid: " + total, "Outstanding balance: A$0.00"],
    link:null
  };
  if(event==="shipping-tracking"){
    if(!tracking?.carrier||!tracking?.number||!tracking?.url)throw Error("Missing shipment tracking");
    return {subject:"Tracking details for your portrait",heading:"Track your portrait delivery.",
      body:"Your hand-painted portrait is on its way. You can follow its journey using the details below.",
      details:["Order: "+order.id,"Portrait: "+pet,"Shipping carrier: "+tracking.carrier,"Tracking number: "+tracking.number],
      link:tracking.url,linkLabel:"Track your parcel"};
  }
  if (event.startsWith("status-")) {
    const status=event.slice(7);
    const [subject, body] = labels[status] || ["Portrait order update", "There's an update to your portrait order."];
    const needsBalance = status === "Ready for balance" && order.checkoutPlan !== "full" && !paidInFull;
    const details=["Order: " + order.id, "Portrait: " + pet, "Order total: " + total];
    if(needsBalance) details.push("Remaining balance: " + aud(payment?.balanceCents));
    if(status==="Shipped"&&tracking?.carrier&&tracking?.number&&tracking?.url){
      details.push("Shipping carrier: "+tracking.carrier,"Tracking number: "+tracking.number);
    }
    const shipmentLink=status==="Shipped"&&tracking?.carrier&&tracking?.number&&tracking?.url?tracking.url:null;
    return {subject,heading:subject + ".",body:status==="Ready for balance"&&paidInFull?"Your portrait is ready, and your payment is complete. We will prepare your artwork for dispatch.":status==="Shipped"&&shipmentLink?"Your finished portrait has been dispatched. Follow its journey with the tracking details below.":body,details,link:needsBalance?link:shipmentLink,linkLabel:shipmentLink?"Track your parcel":"Pay remaining balance (Sandbox)"};
  }
  throw Error("Unsupported customer email event");
}
export async function sendSandboxCustomerEmail({env,bucket,order,payment,event,eventKey,checkoutLink=null,paidInFull=false,tracking=null}) {
  const key="enquiries/" + order.id + "/email-events/" + eventKey + ".json";
  const existing=await bucket.get(key);
  if(existing) {
    try {const saved=await existing.json();if(saved.state==="sent")return {state:"already-sent"};} catch {}
  }
  const now=new Date().toISOString();
  const record={id:order.id,event,eventKey,intendedCustomerEmail:order.email||"",testRecipient:env.NOTIFICATION_EMAIL||"",createdAt:now,state:"skipped",resendId:null};
  // Hard safety gate: only Cloudflare Preview, and ONLY the studio's configured test inbox.
  if(!env.CF_PAGES_BRANCH || env.CF_PAGES_BRANCH==="main" || !env.RESEND_API_KEY || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.NOTIFICATION_EMAIL||"")) {
    record.reason="Preview email or test inbox not configured";
    await bucket.put(key,JSON.stringify(record),{httpMetadata:{contentType:"application/json"}});
    return {state:"skipped"};
  }
  try {
    const copy=copyFor(event,order,payment,checkoutLink,paidInFull,tracking);
    const intro="SANDBOX EMAIL PREVIEW — NO REAL PAYMENT. This email is sent only to the studio test inbox, not the customer.";
    const detailHtml=copy.details.map(line=>"<li style=\"padding:4px 0\">"+escapeHtml(line)+"</li>").join("");
    const actionHtml=copy.link?"<p style=\"margin:28px 0\"><a href=\""+escapeHtml(copy.link)+"\" style=\"background:#743f48;color:#fff;text-decoration:none;padding:14px 22px;border-radius:5px\">"+escapeHtml(copy.linkLabel||"Pay remaining balance (Sandbox)")+"</a></p>":"";
    const html="<div style=\"background:#f7f3ef;padding:28px 14px;font-family:Arial,sans-serif;color:#332b29\"><div style=\"max-width:580px;margin:auto;background:#fff;border:1px solid #e6ddd5;padding:32px\"><div style=\"font-family:Georgia,serif;font-size:26px;color:#743f48\">L’Atelier Heritage</div><p style=\"font-size:11px;letter-spacing:1px;color:#9b6757\">"+escapeHtml(intro)+"</p><h1 style=\"font-family:Georgia,serif;font-size:29px;font-weight:normal\">"+escapeHtml(copy.heading)+"</h1><p>Hello "+escapeHtml(order.name||"there")+",</p><p style=\"line-height:1.7\">"+escapeHtml(copy.body)+"</p><ul style=\"padding-left:20px;line-height:1.5\">"+detailHtml+"</ul>"+actionHtml+"<p style=\"font-size:12px;color:#776d68\">Hand-painted with care. This is a test notification, not a real order confirmation.</p></div></div>";
    const text=[intro,"",copy.heading,"Hello "+(order.name||"there")+",",copy.body,...copy.details,copy.link?(copy.linkLabel||"Link")+": "+copy.link:"","This is a test notification."].filter(Boolean).join("\n\n");
    const response=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json","Idempotency-Key":"lh-sandbox-"+order.id+"-"+eventKey},
      body:JSON.stringify({from:env.RESEND_FROM||"L'Atelier Heritage <onboarding@resend.dev>",to:[env.NOTIFICATION_EMAIL],subject:"[SANDBOX TEST] "+copy.subject+" · "+order.id,html,text})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error("Resend HTTP "+response.status+" "+String(result.message||"").slice(0,100));
    record.state="sent";record.resendId=result.id||null;record.sentAt=new Date().toISOString();
  } catch(e) {
    record.state="failed";record.reason=String(e.message||e).slice(0,200);
    console.error("Sandbox customer email failed",order.id,event,record.reason);
  }
  await bucket.put(key,JSON.stringify(record),{httpMetadata:{contentType:"application/json"}});
  return {state:record.state};
}
