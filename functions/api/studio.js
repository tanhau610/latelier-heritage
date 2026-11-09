import {sendSandboxCustomerEmail} from "../_lib/sandbox-customer-email.js";
import {verifyStudioSession} from "../_lib/studio-otp-auth.js";
import {onRequestPost as onStudioOtpRequest} from "./studio-auth.js";
// Private studio dashboard API. The admin key must be a 32+ character Cloudflare secret.
// Never embed STUDIO_ADMIN_KEY in frontend code or expose the private R2 bucket.
const statuses = new Set(["New","Confirmed","Painting","Ready for balance","Shipped","Completed","Cancelled"]);
const headers = {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const respond = (body,status=200)=>new Response(JSON.stringify(body),{status,headers});
const validId = id => /^LH-\d{8}-[A-F0-9]{8}$/.test(id||"");
const detailKey = id => `enquiries/${id}/details.json`;
const shippingKey = id => `enquiries/${id}/shipping.json`;
const trackingKey = id => `enquiries/${id}/tracking.json`;
const previewOnly = env => Boolean(env.CF_PAGES_BRANCH&&env.CF_PAGES_BRANCH!=="main");
const accessKey = id => `enquiries/${id}/shipping-access.json`;
const paymentKey = id => `enquiries/${id}/payment.json`;
const paymentAccessKey = id => `enquiries/${id}/payment-access.json`;
const sandboxPaymentKey = id => `enquiries/${id}/paypal-sandbox-payments.json`;
const livePaymentKey = id => `enquiries/${id}/paypal-live-payments.json`;
const verifiedLive = (order,payment,ledger) => order?.checkoutMode==="live-inline" && payment?.sandbox===false && ledger?.quotedAt===payment?.quotedAt ? ledger : null;
const fullyCaptured = ledger => Boolean(ledger?.full || (ledger?.deposit && ledger?.balance));
const moneyCents = aud => Math.round(aud * 100);
const validAmount = value => Number.isInteger(value) && value >= 50 && value <= 100000;
async function readJson(bucket,key){const obj=await bucket.get(key);if(!obj)return null;try{return await obj.json();}catch{return null;}}
async function sha256(value){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");}

async function sameSecret(a,b){
  if(typeof a!=="string"||typeof b!=="string"||a.length<32||b.length<32||a.length>256)return false;
  const encoder=new TextEncoder();
  const [x,y]=await Promise.all([crypto.subtle.digest("SHA-256",encoder.encode(a)),crypto.subtle.digest("SHA-256",encoder.encode(b))]);
  const left=new Uint8Array(x),right=new Uint8Array(y);
  let diff=0;for(let i=0;i<left.length;i++)diff|=left[i]^right[i];
  return diff===0;
}
async function guard({request,env}){
  if(!env.PORTRAIT_UPLOADS||!env.STUDIO_ADMIN_KEY||env.STUDIO_ADMIN_KEY.length<32)
    return respond({ok:false,message:"Studio access is not configured. Set STUDIO_ADMIN_KEY (32+ characters) in Cloudflare."},503);
  const origin=request.headers.get("Origin");
  if(origin&&origin!==new URL(request.url).origin)return respond({ok:false,message:"Origin not allowed."},403);
  const authorization=request.headers.get("Authorization")||"";
  const key=authorization.startsWith("Bearer ")?authorization.slice(7):"";
  if(!(await sameSecret(key,env.STUDIO_ADMIN_KEY))&&!(await verifyStudioSession(env,key)))return respond({ok:false,message:"Incorrect access key."},401);
  return null;
}
async function getDetails(bucket,id){
  const obj=await bucket.get(detailKey(id));
  if(!obj)return null;
  try{const data=await obj.json();return data&&data.type==="commission"&&data.id===id?data:null;}catch{return null;}
}
export async function onRequestGet(context){
  const denied=await guard(context);if(denied)return denied;
  const {request,env}=context, url=new URL(request.url), action=url.searchParams.get("action")||"list", bucket=env.PORTRAIT_UPLOADS;
  try{
    if(action==="list"){
      const cursor=url.searchParams.get("cursor")||undefined;
      if(cursor&&cursor.length>1024)return respond({ok:false,message:"Invalid cursor."},400);
      const page=await bucket.list({prefix:"enquiries/",delimiter:"/",limit:100,...(cursor?{cursor}:{})});
      const prefixes=(page.delimitedPrefixes||[]).slice(0,100);
      const orders=(await Promise.all(prefixes.map(async prefix=>{
        const id=prefix.replace(/^enquiries\//,"").replace(/\/$/,"");
        if(!validId(id))return null;
        const data=await getDetails(bucket,id);
        if(!data)return null;
        const [shipping,tracking]=await Promise.all([readJson(bucket,shippingKey(id)),readJson(bucket,trackingKey(id))]);
        const payment=await readJson(bucket,paymentKey(id));
        const sandboxPayment=await readJson(bucket,sandboxPaymentKey(id));
        const livePayment=verifiedLive(data,payment,await readJson(bucket,livePaymentKey(id)));
        return {checkoutMode:data.checkoutMode||null,checkoutPlan:data.checkoutPlan||null,sandboxPayment:sandboxPayment?.quotedAt===payment?.quotedAt?sandboxPayment:null,livePayment,payment:payment||null,shipping:shipping?.details||null,shippingUpdatedAt:shipping?.updatedAt||null,tracking:tracking?.details||null,trackingUpdatedAt:tracking?.updatedAt||null,id:data.id,receivedAt:data.receivedAt,name:data.name,email:data.email,petName:data.petName||"",size:data.size,pets:data.pets,country:data.country,card:!!data.card,story:data.story||"",estimatedPriceAUD:data.estimatedPriceAUD,status:statuses.has(data.status)?data.status:"New",internalNote:data.internalNote||"",updatedAt:data.updatedAt||null,photos:(data.photos||[]).map((p,i)=>({index:i,name:p.originalName||`Photo ${i+1}`}))};
      }))).filter(Boolean);
      orders.sort((a,b)=>String(b.receivedAt).localeCompare(String(a.receivedAt)));
      return respond({ok:true,orders,nextCursor:page.truncated?page.cursor||null:null});
    }
    if(action==="summary"){
      const days=Number(url.searchParams.get("days")||30);
      if(![7,30,90].includes(days))return respond({ok:false,message:"Unsupported reporting period."},400);
      const start=new Date();start.setUTCHours(0,0,0,0);start.setUTCDate(start.getUTCDate()-(days-1));
      const daily=new Map();
      for(let i=0;i<days;i++){const day=new Date(start);day.setUTCDate(start.getUTCDate()+i);const key=day.toISOString().slice(0,10);daily.set(key,{date:key,orders:0,revenueCents:0,sandboxCents:0});}
      const totals={orders:0,revenueCents:0,orderValueCents:0,awaitingDeposit:0,inProduction:0,readyForBalance:0,paidAwaitingDispatch:0,sandboxOrders:0,sandboxTestCents:0};
      const statusCounts={New:0,Confirmed:0,Painting:0,"Ready for balance":0,"Paid awaiting dispatch":0,Shipped:0,Completed:0,Cancelled:0};
      let cursor,more=false,pages=0,scanned=0;
      do{
        const page=await bucket.list({prefix:"enquiries/",delimiter:"/",limit:100,...(cursor?{cursor}:{})});
        const ids=(page.delimitedPrefixes||[]).map(p=>p.slice("enquiries/".length).replace(/\/$/,"")).filter(validId);
        for(let i=0;i<ids.length;i+=20){
          const chunk=await Promise.all(ids.slice(i,i+20).map(async id=>{
            const data=await getDetails(bucket,id);
            if(!data||!Number.isFinite(Date.parse(data.receivedAt)))return null;
            const day=new Date(data.receivedAt).toISOString().slice(0,10);
            const payment=await readJson(bucket,paymentKey(id));
            const sandbox=await readJson(bucket,sandboxPaymentKey(id));
            const live=verifiedLive(data,payment,await readJson(bucket,livePaymentKey(id)));
            return {data,day,payment,sandbox,live};
          }));
          for(const row of chunk){
            if(!row)continue;
            const {data,day,payment,sandbox,live}=row,point=daily.get(day);
            const inPeriod=Boolean(point);
            if(inPeriod){totals.orders++;point.orders++;}
            const status=statuses.has(data.status)?data.status:"New";
            // A verified final payment ends the waiting-for-balance phase, but does not mean the artwork was shipped.
            const sandboxFullyPaid=sandbox?.quotedAt===payment?.quotedAt&&Boolean(sandbox?.full||(sandbox?.deposit&&sandbox?.balance));
            const fullyPaid=data.checkoutMode==="sandbox-inline"?sandboxFullyPaid:data.checkoutMode==="live-inline"?fullyCaptured(live):Boolean(payment?.deposit&&payment?.balance);
            const paidAwaitingDispatch=status==="Ready for balance"&&fullyPaid;
            if(inPeriod)statusCounts[paidAwaitingDispatch?"Paid awaiting dispatch":status]++;
            const totalCents=Number.isInteger(payment?.totalCents)?payment.totalCents:Math.round(Number(data.estimatedPriceAUD||0)*100);
            if(inPeriod&&data.checkoutMode!=="sandbox-inline"&&Number.isFinite(totalCents)&&totalCents>0&&status!=="Cancelled")totals.orderValueCents+=totalCents;
            if(inPeriod&&["Painting","Confirmed"].includes(status))totals.inProduction++;
            if(inPeriod&&status==="Ready for balance"&&!paidAwaitingDispatch)totals.readyForBalance++;
            if(inPeriod&&paidAwaitingDispatch)totals.paidAwaitingDispatch++;
            // Count all Sandbox captures separately, including legacy test-payment links.
            if(sandbox && payment && typeof sandbox.quotedAt==="string" && sandbox.quotedAt===payment.quotedAt){
              const testPayments=sandbox.full?[sandbox.full]:[sandbox.deposit,sandbox.balance];
              for(const instalment of testPayments){
                const verifiedAt=instalment?.verifiedAt;
                const amount=Number(instalment?.amountCents);
                if(typeof verifiedAt!=="string"||!Number.isFinite(Date.parse(verifiedAt))||!Number.isInteger(amount)||amount<=0)continue;
                const paymentDay=new Date(verifiedAt).toISOString().slice(0,10);
                const testPoint=daily.get(paymentDay);
                if(testPoint){testPoint.sandboxCents+=amount;totals.sandboxTestCents+=amount;}
              }
            }
            if(inPeriod&&(data.checkoutMode==="sandbox-inline"||sandbox?.deposit||sandbox?.balance||sandbox?.full))totals.sandboxOrders++;
            if(data.checkoutMode!=="sandbox-inline"){
              // Recognise revenue on the verified payment date, not on the order creation date.
              // This also includes payments made this period for older orders.
              for(const instalment of (data.checkoutMode==="live-inline"?(live?.full?[live.full]:[live?.deposit,live?.balance]):[payment?.deposit,payment?.balance])){
                const verifiedAt=instalment?.verifiedAt;
                const amount=Number(instalment?.amountCents);
                if(typeof verifiedAt!=="string"||!Number.isFinite(Date.parse(verifiedAt))||!Number.isInteger(amount)||amount<=0)continue;
                const paymentDay=new Date(verifiedAt).toISOString().slice(0,10);
                const revenuePoint=daily.get(paymentDay);
                if(revenuePoint){revenuePoint.revenueCents+=amount;totals.revenueCents+=amount;}
              }
              if(inPeriod&&!(data.checkoutMode==="live-inline"?Boolean(live?.deposit||live?.full):Boolean(payment?.deposit))&&status!=="Cancelled")totals.awaitingDeposit++;
            }
          }
        }
        scanned+=ids.length;pages++;
        more=!!page.truncated;cursor=page.cursor;
      }while(more&&cursor&&pages<20);
      return respond({ok:true,days,totals,statusCounts,daily:Array.from(daily.values()),partial:more,scanned,asOf:new Date().toISOString(),revenueNote:"Verified manual and PayPal Live captures by UTC payment date. PayPal Sandbox excluded.",trafficConnected:false});
    }
    if(action==="email-history"){
      const id=url.searchParams.get("id");
      if(!validId(id)||!(await getDetails(bucket,id)))return respond({ok:false,message:"Order not found."},404);
      const page=await bucket.list({prefix:"enquiries/"+id+"/email-events/",limit:100});
      const events=(await Promise.all(page.objects.map(async item=>readJson(bucket,item.key)))).filter(Boolean);
      events.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
      return respond({ok:true,events:events.slice(0,50).map(e=>({event:e.event,state:e.state,createdAt:e.createdAt,sentAt:e.sentAt||null,testRecipient:e.testRecipient||null}))});
    }
    if(action==="photo"){
      const id=url.searchParams.get("id"), index=Number(url.searchParams.get("index"));
      if(!validId(id)||!Number.isInteger(index)||index<0||index>4)return respond({ok:false,message:"Invalid image request."},400);
      const data=await getDetails(bucket,id);
      const key=data?.photos?.[index]?.key;
      if(typeof key!=="string"||!key.startsWith(`enquiries/${id}/photos/`)||!/^enquiries\/LH-\d{8}-[A-F0-9]{8}\/photos\/\d{2}\.(jpg|png|webp)$/.test(key))return respond({ok:false,message:"Image not found."},404);
      const object=await bucket.get(key);
      if(!object)return respond({ok:false,message:"Image not found."},404);
      const type=object.httpMetadata?.contentType;
      const safeType=["image/jpeg","image/png","image/webp"].includes(type)?type:"application/octet-stream";
      return new Response(object.body,{headers:{"Content-Type":safeType,"Content-Disposition":"inline","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}});
    }
    return respond({ok:false,message:"Unknown action."},404);
  }catch(e){console.error("Studio read failed",e);return respond({ok:false,message:"Unable to load studio records."},500);}
}
export async function onRequestPost(context){
  const {request,env}=context;
  const action=new URL(request.url).searchParams.get("action");
  // Reuse the already deployed /api/studio route for OTP to avoid preview route registration issues.
  // Only these exact unauthenticated POST actions bypass the existing studio-key guard.
  if(["otp-request","otp-verify","otp-logout"].includes(action)){
    // The OTP handler reads its action from the request JSON.
    return onStudioOtpRequest(context);
  }
  const denied=await guard(context);if(denied)return denied;
  if(!["status","shipping-link","tracking-save","tracking-notify","payment-quote","payment-record","payment-link"].includes(action))return respond({ok:false,message:"Unknown action."},404);
  if(Number(request.headers.get("content-length")||0)>4096)return respond({ok:false,message:"Request too large."},413);
  let payload;try{payload=await request.json();}catch{return respond({ok:false,message:"Invalid request."},400);}
  const {id,status}=payload||{};
  if(action==="tracking-save"||action==="tracking-notify"){
    // New tracking workflows remain Preview-only, including R2 writes and email.
    if(!previewOnly(env))return respond({ok:false,message:"Tracking management is only available on Preview."},403);
    if(!validId(id))return respond({ok:false,message:"Invalid order."},400);
    try{
      const bucket=env.PORTRAIT_UPLOADS;
      const order=await getDetails(bucket,id);
      if(!order)return respond({ok:false,message:"Order not found."},404);
      if(order.status==="Cancelled")return respond({ok:false,message:"Cannot update tracking for a cancelled order."},409);
      if(action==="tracking-save"){
        const raw=payload.tracking;
        if(!raw||typeof raw!=="object"||Array.isArray(raw))return respond({ok:false,message:"Invalid tracking details."},400);
        const carrier=typeof raw.carrier==="string"?raw.carrier.trim():"";
        const number=typeof raw.number==="string"?raw.number.trim():"";
        const url=typeof raw.url==="string"?raw.url.trim():"";
        if(!carrier||carrier.length>80||!number||number.length>100||!url||url.length>500||
           /[\x00-\x1f\x7f]/.test(carrier+number+url))return respond({ok:false,message:"Enter a carrier, tracking number and tracking URL."},400);
        let parsed;
        try{parsed=new URL(url);}catch{return respond({ok:false,message:"Enter a valid HTTPS tracking URL."},400);}
        if(parsed.protocol!=="https:"||!parsed.hostname||parsed.username||parsed.password||
           /^(localhost|.*\.localhost|.*\.local)$/i.test(parsed.hostname)||
           /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(parsed.hostname)||
           parsed.hostname==="::1"||parsed.hostname.startsWith("[")||
           url.includes("\\")||/\s/.test(url))
          return respond({ok:false,message:"Enter a valid HTTPS tracking URL."},400);
        const details={carrier,number,url:parsed.toString()};
        const existing=await readJson(bucket,trackingKey(id));
        if(existing?.details?.carrier===details.carrier&&existing.details.number===details.number&&existing.details.url===details.url)
          return respond({ok:true,tracking:existing.details,updatedAt:existing.updatedAt,unchanged:true});
        const updatedAt=new Date().toISOString();
        await bucket.put(trackingKey(id),JSON.stringify({id,details,updatedAt}),{httpMetadata:{contentType:"application/json"}});
        return respond({ok:true,tracking:details,updatedAt});
      }
      if(!["Shipped","Completed"].includes(order.status))return respond({ok:false,message:"Mark the order as shipped before sending tracking."},409);
      const tracking=await readJson(bucket,trackingKey(id));
      if(!tracking?.details?.carrier||!tracking?.details?.number||!tracking?.details?.url)return respond({ok:false,message:"Save tracking details first."},409);
      const payment=await readJson(bucket,paymentKey(id));
      const sandbox=await readJson(bucket,sandboxPaymentKey(id));
      const live=verifiedLive(order,payment,await readJson(bucket,livePaymentKey(id)));
       const paid=order.checkoutMode==="live-inline"?fullyCaptured(live)
         :order.checkoutMode==="sandbox-inline"?Boolean(sandbox?.quotedAt===payment?.quotedAt&&fullyCaptured(sandbox))
         :Boolean(payment?.deposit&&payment?.balance);
      if(!paid)return respond({ok:false,message:"Verify full payment before notifying shipment."},409);
      const fingerprint=(await sha256([tracking.details.carrier,tracking.details.number,tracking.details.url].join("|"))).slice(0,32);
      const notification=await sendSandboxCustomerEmail({
        env,bucket,order,payment:payment||{totalCents:Math.round(Number(order.estimatedPriceAUD||0)*100)},
        event:"shipping-tracking",eventKey:"tracking-"+fingerprint,tracking:tracking.details,paidInFull:true
      });
      return respond({ok:true,emailTest:notification.state});
    }catch(e){console.error("Studio tracking failed",id,e);return respond({ok:false,message:"Could not save or send tracking information."},500);}
  }
  if(action==="shipping-link"){
    if(!validId(id))return respond({ok:false,message:"Invalid order."},400);
    try{
      const order=await getDetails(env.PORTRAIT_UPLOADS,id);
      if(!order)return respond({ok:false,message:"Order not found."},404);
      if(["sandbox-inline","live-inline"].includes(order.checkoutMode))return respond({ok:false,message:"Delivery address was collected at checkout; no shipping link is required."},409);
      if(["Shipped","Completed","Cancelled"].includes(order.status))return respond({ok:false,message:"This order cannot request new shipping details."},409);
      const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,"0")).join("");
      const expiresAt=new Date(Date.now()+14*24*60*60*1000).toISOString();
      await env.PORTRAIT_UPLOADS.put(accessKey(id),JSON.stringify({id,tokenHash:await sha256(token),expiresAt,createdAt:new Date().toISOString()}),{httpMetadata:{contentType:"application/json"}});
      const link=new URL("/shipping.html",request.url);
      link.hash=new URLSearchParams({id,token}).toString();
      return respond({ok:true,url:link.toString(),expiresAt});
    }catch(e){console.error("Shipping link failed",e);return respond({ok:false,message:"Could not create shipping link."},500);}
  }
  if(action==="payment-link"){
    if(!env.PAYPAL_CLIENT_ID||!env.PAYPAL_CLIENT_SECRET)return respond({ok:false,message:"Sandbox PayPal credentials are not configured in this environment."},503);
    if(!validId(id)||!["deposit","balance"].includes(payload.stage))return respond({ok:false,message:"Invalid order or instalment."},400);
    try{
      const bucket=env.PORTRAIT_UPLOADS;
      const [order,payment,sandbox]=await Promise.all([getDetails(bucket,id),readJson(bucket,paymentKey(id)),readJson(bucket,sandboxPaymentKey(id))]);
      if(!order||!payment||["sandbox-inline","live-inline"].includes(order.checkoutMode)||["Cancelled","Shipped","Completed"].includes(order.status))return respond({ok:false,message:"Order cannot request a legacy payment link."},409);
      if(sandbox?.quotedAt===payment.quotedAt&&sandbox[payload.stage])return respond({ok:false,message:"This Sandbox instalment has already been recorded."},409);
      if(payload.stage==="balance"&&!(sandbox?.quotedAt===payment.quotedAt&&sandbox.deposit))return respond({ok:false,message:"Complete the Sandbox deposit test first."},409);
      const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,"0")).join("");
      const expiresAt=new Date(Date.now()+14*24*60*60*1000).toISOString();
      await bucket.put(paymentAccessKey(id),JSON.stringify({id,stage:payload.stage,quotedAt:payment.quotedAt,tokenHash:await sha256(token),expiresAt,createdAt:new Date().toISOString()}),{httpMetadata:{contentType:"application/json"}});
      const link=new URL("/payment.html",request.url);
      link.hash=new URLSearchParams({id,token}).toString();
      return respond({ok:true,url:link.toString(),expiresAt,stage:payload.stage});
    }catch(e){console.error("Payment link creation failed",e);return respond({ok:false,message:"Could not create payment link."},500);}
  }
  if(action==="payment-quote"||action==="payment-record"){
    if(!validId(id))return respond({ok:false,message:"Invalid order."},400);
    try{
      const bucket=env.PORTRAIT_UPLOADS;
      const order=await getDetails(bucket,id);
      if(!order)return respond({ok:false,message:"Order not found."},404);
      if(["sandbox-inline","live-inline"].includes(order.checkoutMode))return respond({ok:false,message:"Online checkout orders cannot be manually repriced or recorded."},409);
      if(["Cancelled","Shipped","Completed"].includes(order.status))return respond({ok:false,message:"This order cannot be updated for payment."},409);
      const key=paymentKey(id);
      const current=await readJson(bucket,key);
      const now=new Date().toISOString();
      if(action==="payment-quote"){
        const totalAUD=payload.totalAUD;
        if(!validAmount(totalAUD))return respond({ok:false,message:"Enter a confirmed whole-AUD price between A$50 and A$100,000."},400);
        if(current?.deposit||current?.balance)return respond({ok:false,message:"A payment is already recorded. The agreed price cannot be changed here."},409);
        const totalCents=moneyCents(totalAUD);
        const record={id,currency:"AUD",totalCents,depositCents:Math.floor(totalCents/2),balanceCents:totalCents-Math.floor(totalCents/2),quotedAt:now};
        await bucket.put(key,JSON.stringify(record),{httpMetadata:{contentType:"application/json"}});
        return respond({ok:true,payment:record});
      }
      if(!current||!Number.isInteger(current.totalCents))return respond({ok:false,message:"Confirm the final price before recording a payment."},409);
      const stage=payload.stage,reference=String(payload.reference||"").trim();
      if(!["deposit","balance"].includes(stage)||!payload.verified||!/^[A-Za-z0-9_-]{6,100}$/.test(reference))
        return respond({ok:false,message:"Verify the transaction in PayPal and enter its transaction ID (6–100 letters/numbers)."},400);
      if(current[stage])return respond({ok:false,message:"This payment stage has already been recorded."},409);
      if(stage==="balance"&&!current.deposit)return respond({ok:false,message:"Record the verified deposit first."},409);
      if(stage==="balance"&&current.deposit?.reference===reference)return respond({ok:false,message:"Use the unique transaction ID for the second payment."},409);
      current[stage]={reference,amountCents:stage==="deposit"?current.depositCents:current.balanceCents,verifiedAt:now,verification:"manually-confirmed-by-studio"};
      await bucket.put(key,JSON.stringify(current),{httpMetadata:{contentType:"application/json"}});
      return respond({ok:true,payment:current});
    }catch(e){console.error("Payment tracking failed",e);return respond({ok:false,message:"Could not save payment tracking."},500);}
  }
  if(!validId(id)||!statuses.has(status))return respond({ok:false,message:"Invalid order or status."},400);
  if(typeof payload.internalNote!=="string"||payload.internalNote.length>1000)return respond({ok:false,message:"Note must be 1000 characters or fewer."},400);
  try{
    const data=await getDetails(env.PORTRAIT_UPLOADS,id);
    if(!data)return respond({ok:false,message:"Order not found."},404);
    const payment=await readJson(env.PORTRAIT_UPLOADS,paymentKey(id));
    const sandbox=await readJson(env.PORTRAIT_UPLOADS,sandboxPaymentKey(id));
    const checkoutPaid=data.checkoutMode==="sandbox-inline"&&sandbox?.quotedAt===payment?.quotedAt;
    const live=verifiedLive(data,payment,await readJson(env.PORTRAIT_UPLOADS,livePaymentKey(id)));
    const depositVerified=data.checkoutMode==="live-inline"?Boolean(live?.deposit||live?.full):checkoutPaid?Boolean(sandbox.deposit||sandbox.full):Boolean(payment?.deposit);
    const fullyVerified=data.checkoutMode==="live-inline"?fullyCaptured(live):checkoutPaid?fullyCaptured(sandbox):Boolean(payment?.deposit&&payment?.balance);
    if(status!==data.status&&["Painting","Ready for balance"].includes(status)&&!depositVerified)return respond({ok:false,message:"Verify the deposit or full payment before starting production."},409);
    if(status!==data.status&&["Shipped","Completed"].includes(status)&&!fullyVerified)return respond({ok:false,message:"Verify full payment before shipping or completing the order."},409);
    const previousStatus=data.status;
    data.status=status;data.internalNote=payload.internalNote.trim();data.updatedAt=new Date().toISOString();
    await env.PORTRAIT_UPLOADS.put(detailKey(id),JSON.stringify(data,null,2),{httpMetadata:{contentType:"application/json"}});
    // Only genuine status transitions trigger a customer-facing email preview.
    // The customer is NEVER the recipient while running on Preview/Sandbox.
    let emailTest="unchanged";
    if(previewOnly(env)&&status!==previousStatus&&status!=="New"){
      let checkoutLink=null;
      try{
        if(status==="Ready for balance"&&data.checkoutMode==="sandbox-inline"&&depositVerified&&!fullyVerified){
          const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,"0")).join("");
          const expiresAt=new Date(Date.now()+30*86400000).toISOString();
          await env.PORTRAIT_UPLOADS.put("enquiries/"+id+"/checkout-email-access.json",JSON.stringify({id,tokenHash:await sha256(token),expiresAt,createdAt:data.updatedAt}),{httpMetadata:{contentType:"application/json"}});
          const link=new URL("/checkout",request.url);link.hash=new URLSearchParams({id,token}).toString();checkoutLink=link.toString();
        }
        const tracking=status==="Shipped"?await readJson(env.PORTRAIT_UPLOADS,trackingKey(id)):null;
        const notification=await sendSandboxCustomerEmail({
          env,bucket:env.PORTRAIT_UPLOADS,order:data,
          payment:payment||{totalCents:Math.round(Number(data.estimatedPriceAUD||0)*100)},
          event:"status-"+status,eventKey:"status-"+data.updatedAt.replace(/[^0-9]/g,""),
          checkoutLink,paidInFull:fullyVerified,tracking:tracking?.details||null
        });
        emailTest=notification.state;
      }catch(e){emailTest="failed";console.error("Status email preview failed",id,String(e));}
    }
    return respond({ok:true,id,status,updatedAt:data.updatedAt,emailTest});
  }catch(e){console.error("Studio update failed",e);return respond({ok:false,message:"Could not update order."},500);}
}
