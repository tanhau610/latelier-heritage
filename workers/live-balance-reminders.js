import {balanceReminderEligibility} from "../functions/_lib/live-balance-reminder-eligibility.js";
import {atelierSender} from "../functions/_lib/brand-email.js";

// Separate Cloudflare scheduled Worker. NOT deployed by Pages automatically.
// Requires a private R2 binding PORTRAIT_UPLOADS and explicitly enabled LIVE_BALANCE_REMINDERS.
const read=async(b,k)=>{const x=await b.get(k);if(!x)return null;try{return await x.json()}catch{return null}};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const validId=id=>/^LH-\d{8}-[A-F0-9]{8}$/.test(id);
const prefix=id=>"enquiries/"+id+"/";
const sha256=async value=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,"0")).join("");
async function run(env){
  if(env.LIVE_BALANCE_REMINDERS!=="enabled"||env.PAYPAL_MODE!=="live"||env.PAYPAL_LIVE_READY!=="yes")return;
  const bucket=env.PORTRAIT_UPLOADS;
  if(!bucket||!env.RESEND_API_KEY)return;
  const sender=atelierSender(env);
  if(!/^ATELIER HAU <[a-z0-9._%+-]+@atelierhau\.com>$/i.test(sender))throw Error("Verified sender required");
  let cursor, pages=0;
  do{
    const page=await bucket.list({prefix:"enquiries/",delimiter:"/",limit:100,...(cursor?{cursor}:{})});
    for(const path of page.delimitedPrefixes||[]){
      const id=path.slice("enquiries/".length).replace(/\/$/,"");
      if(!validId(id))continue;
      try{await processOrder(env,id,sender)}catch(e){console.error("Reminder failed",id,String(e))}
    }
    cursor=page.truncated?page.cursor:null;
    pages++;
  }while(cursor&&pages<20);
}
async function processOrder(env,id,sender){
  const b=env.PORTRAIT_UPLOADS,p=prefix(id);
  const [order,payment,ledger]=await Promise.all([read(b,p+"details.json"),read(b,p+"payment.json"),read(b,p+"paypal-live-payments.json")]);
  if(!order||!payment||!ledger||order.id!==id)return;
  const depositRef=ledger.deposit?.reference;
  if(typeof depositRef!=="string"||!/^[A-Za-z0-9-]{8,100}$/.test(depositRef))return;
  const requestEvent=await read(b,p+"email-events/live-balance-request-"+depositRef+".json");
  for(const day of [3,7]){
    const check=balanceReminderEligibility({order,payment,ledger,requestEvent,day});
    if(!check.ok)continue;
    const eventKey=check.eventKey, key=p+"email-events/"+eventKey+".json";
    const existing=await read(b,key);
    if(existing)continue; // fail closed for pending, failed, and sent: manual review before retry
    // Issue a fresh, short-lived one-time checkout credential; store only its hash.
    // This uses the same authenticated checkout path as the initial balance request.
    // Re-read the ledger immediately before dispatch.
    const current=await read(b,p+"paypal-live-payments.json");
    const latestOrder=await read(b,p+"details.json");
    if(!balanceReminderEligibility({order:latestOrder,payment,ledger:current,requestEvent,day}).ok)continue;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email||""))continue;
    const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,"0")).join("");
    const expiresAt=new Date(Date.now()+14*86400000).toISOString();
    const checkoutLink="https://atelierhau.com/checkout#"+new URLSearchParams({id,token}).toString();
    await b.put(p+"checkout-email-access-"+day+"d.json",JSON.stringify({id,tokenHash:await sha256(token),expiresAt,createdAt:new Date().toISOString()}),{httpMetadata:{contentType:"application/json"}});
    const record={id,event:"live-balance-reminder",day,eventKey,state:"pending",createdAt:new Date().toISOString()};
    const claimed=await b.put(key,JSON.stringify(record),{onlyIf:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"application/json"}});
    if(!claimed)continue; // another Worker claimed this reminder
    const subject="A gentle reminder about your portrait · "+id;
    const body="Hello "+(order.name||"there")+",\n\nYour hand-painted portrait is ready. The remaining balance is A$"+(payment.balanceCents/100).toFixed(2)+". Pay the remaining balance securely here: "+checkoutLink+"\n\nOrder: "+id+"\n\nATELIER HAU";
    const html="<div style='font-family:Arial,sans-serif;max-width:580px;margin:auto'><h1 style='color:#743f48;font-family:Georgia,serif'>ATELIER HAU</h1><p>Hello "+esc(order.name||"there")+",</p><p>Your hand-painted portrait is ready. The remaining balance is <strong>A$"+(payment.balanceCents/100).toFixed(2)+"</strong>.</p><p><a href='"+esc(checkoutLink)+"' style='background:#743f48;color:white;padding:14px 22px;text-decoration:none'>Pay remaining balance</a></p><p>Order: "+esc(id)+"</p></div>";
    const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json","Idempotency-Key":"atelier-"+eventKey},body:JSON.stringify({from:sender,to:[order.email],subject,text:body,html})});
    if(!r.ok){record.state="failed";record.httpStatus=r.status;await b.put(key,JSON.stringify(record));continue}
    const result=await r.json().catch(()=>({}));
    record.state="sent";record.sentAt=new Date().toISOString();record.resendId=result.id||null;
    await b.put(key,JSON.stringify(record),{httpMetadata:{contentType:"application/json"}});
    break; // at most one reminder per order per run
  }
}
export default {async scheduled(_event,env,ctx){ctx.waitUntil(run(env))}};
