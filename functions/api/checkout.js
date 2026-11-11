import {atelierSender} from "../_lib/brand-email.js";
import {sendLivePaymentEmail} from "../_lib/live-payment-email.js";
import {sendSandboxCustomerEmail} from "../_lib/sandbox-customer-email.js";
// PayPal checkout with strict server-side environment separation. Live requires explicit PAYPAL_MODE=live on main.
// All customer records and photos are private Cloudflare R2 objects; the browser receives only a bearer token.
const prices={"20x25":[229,299],"30x40":[379,469],"40x50":[499,599],"50x70":[699,829]};
const countries=new Set(["Australia","United States","United Kingdom","Canada"]);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"}});
const clean=(value,max=2500)=>typeof value==="string"?value.trim().slice(0,max+1):"";
const validId=id=>/^LH-\d{8}-[A-F0-9]{8}$/.test(id||"");
const path=(id,name)=>"enquiries/"+id+"/"+name;
const read=async(bucket,key)=>{const obj=await bucket.get(key);if(!obj)return null;try{return await obj.json();}catch{return null;}};
const put=(bucket,key,data)=>bucket.put(key,JSON.stringify(data),{httpMetadata:{contentType:"application/json"}});
const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,"0")).join("");
async function digest(value){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("");}
function same(a,b){if(typeof a!=="string"||typeof b!=="string"||a.length!==64||b.length!==64)return false;let n=0;for(let i=0;i<64;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
const fail=(message,status=400)=>json({ok:false,message},status);
function priceFor(size,pets,card){return prices[size][pets===1?0:1]+Math.max(0,pets-2)*(size==="50x70"?100:80)+(card?15:0);}
async function verifyTurnstile(request,form,env){
  const token=clean(form.get("cf-turnstile-response"),2048);
  if(!token||!env.TURNSTILE_SECRET_KEY)return false;
  const data=new URLSearchParams({secret:env.TURNSTILE_SECRET_KEY,response:token});
  const ip=request.headers.get("CF-Connecting-IP");if(ip)data.set("remoteip",ip);
  const r=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:data});
  if(!r.ok)return false;const result=await r.json();
  return result.success===true&&result.hostname===new URL(request.url).hostname;
}
async function validImage(file){
  const b=new Uint8Array(await file.slice(0,16).arrayBuffer());
  if(file.type==="image/jpeg")return b[0]===255&&b[1]===216&&b[2]===255;
  if(file.type==="image/png")return [137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v);
  if(file.type==="image/webp")return String.fromCharCode(...b.slice(0,4))==="RIFF"&&String.fromCharCode(...b.slice(8,12))==="WEBP";
  return false;
}
function checkoutMode(env){const live=env.CF_PAGES_BRANCH==="main"&&env.PAYPAL_MODE==="live"&&env.PAYPAL_LIVE_READY==="yes";return live?"live":"sandbox";}
function paypalBase(env){return checkoutMode(env)==="live"?"https://api-m.paypal.com":"https://api-m.sandbox.paypal.com";}
async function paypal(env,endpoint,method="GET",body=null,requestId=null){
  const auth=await fetch(paypalBase(env)+"/v1/oauth2/token",{method:"POST",headers:{"Authorization":"Basic "+btoa(env.PAYPAL_CLIENT_ID+":"+env.PAYPAL_CLIENT_SECRET),"Content-Type":"application/x-www-form-urlencoded"},body:"grant_type=client_credentials"});
  if(!auth.ok)throw Error("Sandbox authentication failed");
  const oauth=await auth.json();
  const headers={"Authorization":"Bearer "+oauth.access_token,"Content-Type":"application/json","Prefer":"return=representation"};
  if(requestId)headers["PayPal-Request-Id"]=requestId;
  const r=await fetch(paypalBase(env)+endpoint,{method,headers,body:body?JSON.stringify(body):undefined});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){const e=Error("PayPal Sandbox error ("+r.status+")");e.status=r.status;throw e;}
  return data;
}
// Admin-only Vietnamese notifications. Keep customer-facing checkout in English.
const aud=value=>"A$"+Number(value).toLocaleString("vi-VN",{minimumFractionDigits:2,maximumFractionDigits:2});
async function notifyStudio(env,subject,lines,id){
  if(!env.RESEND_API_KEY||!env.NOTIFICATION_EMAIL)return;
  try{
    const response=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json; charset=utf-8"},
      body:JSON.stringify({
        from:atelierSender(env),
        to:[env.NOTIFICATION_EMAIL],
        subject,text:lines.join("\n")
      })
    });
    if(!response.ok)console.error("Vietnamese studio notification failed",id,response.status);
  }catch(error){console.error("Vietnamese studio notification error",id,error);}
}
async function start(request,env){
  if(Number(request.headers.get("content-length")||0)>23*1024*1024)return fail("Photos exceed the upload limit.",413);
  let form;try{form=await request.formData();}catch{return fail("Could not read your order.");}
  if(clean(form.get("website"),200))return fail("Please try again.",400);
  let verified=false;try{verified=await verifyTurnstile(request,form,env);}catch{}
  if(!verified)return fail("Security check failed. Please try again.",403);
  const name=clean(form.get("customerName"),120),email=clean(form.get("customerEmail"),254);
  const size=clean(form.get("size"),10),pets=Number(form.get("pets")),country=clean(form.get("country"),40);
  const plan=clean(form.get("paymentPlan"),12),card=form.get("card")==="yes";
  const petName=clean(form.get("petName"),120),story=clean(form.get("story"),2500);
  if(name.length<2||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||email.length>254)return fail("Enter your full name and a valid email.");
  if(!prices[size]||![1,2,3,4].includes(pets)||!countries.has(country)||!["deposit","full"].includes(plan))return fail("Please check your portrait choices.");
  if(form.get("photoPermission")!=="yes"||form.get("terms")!=="yes")return fail("Please confirm photo permission and order terms.");
  const fields=["fullName","phone","address1","address2","city","region","postalCode"];
  const limits={fullName:120,phone:40,address1:180,address2:180,city:100,region:100,postalCode:32};
  const shipping={};
  for(const field of fields){
    const raw=form.get(field);
    if(typeof raw!=="string"||raw.length>limits[field])return fail("Please check your delivery address.");
    shipping[field]=clean(raw,limits[field]);
    if(/[<>\x00-\x08\x0b\x0c\x0e-\x1f]/.test(shipping[field]))return fail("Please remove invalid address characters.");
  }
  if(["fullName","phone","address1","city","postalCode"].some(f=>shipping[f].length<2))return fail("Please complete the required delivery fields.");
  shipping.country=country;
  const photos=form.getAll("photos").filter(f=>f instanceof File&&f.size>0);
  if(photos.length<1||photos.length>5)return fail("Upload 1 to 5 reference photographs.");
  if(photos.some(f=>f.size>8*1024*1024)||photos.reduce((sum,f)=>sum+f.size,0)>20*1024*1024)return fail("Maximum 8 MB per photo and 20 MB in total.");
  for(const file of photos)if(!(await validImage(file)))return fail("Use valid JPG, PNG or WEBP photographs.");
  const id="LH-"+new Date().toISOString().slice(0,10).replace(/-/g,"")+"-"+crypto.randomUUID().slice(0,8).toUpperCase();
  const token=randomToken(),quotedAt=new Date().toISOString(),totalCents=priceFor(size,pets,card)*100;
  const depositCents=Math.ceil(totalCents/2),balanceCents=totalCents-depositCents;
  const live=checkoutMode(env)==="live";
  const details={id,type:"commission",checkoutMode:live?"live-inline":"sandbox-inline",checkoutPlan:plan,receivedAt:quotedAt,name,email,size,pets,country,card,petName,story,estimatedPriceAUD:totalCents/100,photos:[],status:"New"};
  try{
    for(let i=0;i<photos.length;i++){
      const file=photos[i],ext={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"}[file.type];
      const key=path(id,"photos/"+String(i+1).padStart(2,"0")+"."+ext);
      await env.PORTRAIT_UPLOADS.put(key,file.stream(),{httpMetadata:{contentType:file.type},customMetadata:{enquiryId:id}});
      details.photos.push({key,originalName:clean(file.name,180),bytes:file.size});
    }
    await put(env.PORTRAIT_UPLOADS,path(id,"details.json"),details);
    await put(env.PORTRAIT_UPLOADS,path(id,"shipping.json"),{id,details:shipping,updatedAt:quotedAt});
    await put(env.PORTRAIT_UPLOADS,path(id,"payment.json"),{id,quotedAt,totalCents,depositCents,balanceCents,checkoutPlan:plan,sandbox:!live});
    await put(env.PORTRAIT_UPLOADS,path(id,"checkout-access.json"),{id,tokenHash:await digest(token),expiresAt:new Date(Date.now()+90*86400000).toISOString(),createdAt:quotedAt});
    // Register an unpaid checkout for the scheduled Worker; no email is sent at order creation.
    await put(env.PORTRAIT_UPLOADS,"pending-checkouts/"+id+".json",{id,createdAt:quotedAt,notifyAfter:new Date(Date.now()+10*60*1000).toISOString(),sandbox:!live,checkoutMode:live?"live-inline":"sandbox-inline"});
  }catch(e){console.error("Sandbox order storage failed",id,e);return fail("Could not save your order securely. Please contact the studio.",503);}
  return json({ok:true,id,token,sandbox:!live});
}
function due(order,payment,ledger){
  if(ledger?.quotedAt!==payment.quotedAt)ledger=null;
  if(order.checkoutPlan==="full")return ledger?.full?{stage:"complete",amountCents:0}:{stage:"full",amountCents:payment.totalCents};
  if(!ledger?.deposit)return {stage:"deposit",amountCents:payment.depositCents};
  if(ledger?.balance)return {stage:"complete",amountCents:0};
  if(order.status!=="Ready for balance")return {stage:"waiting",amountCents:0};
  return {stage:"balance",amountCents:payment.balanceCents};
}
async function action(request,env){
  if(Number(request.headers.get("content-length")||0)>4096)return fail("Request too large.",413);
  let input;try{input=await request.json();}catch{return fail("Invalid checkout request.");}
  const id=input?.id,action=input?.action;
  if(!validId(id)||!["view","create","capture","updateDelivery"].includes(action))return fail("Invalid order request.");
  const auth=request.headers.get("Authorization")||"";
  const token=auth.startsWith("Bearer ")?auth.slice(7):"";
  if(!/^[a-f0-9]{64}$/.test(token))return fail("Invalid checkout access.",403);
  const bucket=env.PORTRAIT_UPLOADS;
  const live=checkoutMode(env)==="live";
  const ledgerFile=live?"paypal-live-payments.json":"paypal-sandbox-payments.json";
  const [access,emailAccess,reminder3,reminder7,order,payment,ledger]=await Promise.all(["checkout-access.json","checkout-email-access.json","checkout-email-access-3d.json","checkout-email-access-7d.json","details.json","payment.json",ledgerFile].map(f=>read(bucket,path(id,f))));
  const hashedToken=await digest(token);
  const activeAccess=[access,emailAccess,reminder3,reminder7].find(a=>a?.id===id&&Date.parse(a.expiresAt)>Date.now()&&same(hashedToken,a.tokenHash));
  if(!activeAccess)return fail("Checkout access expired or invalid.",403);
  if(!order||order.id!==id||order.checkoutMode!==(live?"live-inline":"sandbox-inline")||!payment||payment.sandbox===live||payment.id!==id||payment.checkoutPlan!==order.checkoutPlan)return fail("Order not found.",404);
  const state=due(order,payment,ledger);
  // A capture may have succeeded even if the customer's network lost the response.
  // Return the existing verified result for the exact same PayPal order, without charging again.
  if(action==="capture"&&typeof input.orderID==="string"&&ledger?.quotedAt===payment.quotedAt){
    const recordedStage=["deposit","balance","full"].find(s=>ledger[s]?.paypalOrderId===input.orderID);
    if(recordedStage)return json({ok:true,paid:true,stage:recordedStage,alreadyRecorded:true,sandbox:!live});
  }
  if(action==="view"){
    const savedShipping=await read(bucket,path(id,"shipping.json"));
    return json({ok:true,id,petName:order.petName||"Pet portrait",plan:order.checkoutPlan,stage:state.stage,amount:(state.amountCents/100).toFixed(2),total:(payment.totalCents/100).toFixed(2),remaining:(payment.balanceCents/100).toFixed(2),status:order.status||"New",clientId:env.PAYPAL_CLIENT_ID,sandbox:!live,customerName:order.name,customerEmail:order.email,shipping:savedShipping?.details||null,canEditDelivery:["deposit","full"].includes(state.stage)&&order.status==="New"});
  }
  if(action==="updateDelivery"){
    // Only allow edits before the first captured payment. Never create a second order.
    if(!["deposit","full"].includes(state.stage)||order.status!=="New")return fail("Delivery details can no longer be edited online. Please contact the studio.",409);
    const data=input.delivery;
    if(!data||typeof data!=="object"||Array.isArray(data))return fail("Please check your delivery details.");
    const name=clean(data.customerName,120),email=clean(data.customerEmail,254);
    if(name.length<2||email.length>254||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return fail("Enter your full name and a valid email.");
    const fields=["fullName","phone","address1","address2","city","region","postalCode"];
    const limits={fullName:120,phone:40,address1:180,address2:180,city:100,region:100,postalCode:32};
    const shipping={};
    for(const field of fields){
      const raw=data[field];
      if(typeof raw!=="string"||raw.length>limits[field])return fail("Please check your delivery address.");
      shipping[field]=clean(raw,limits[field]);
      if(/[<>\x00-\x08\x0b\x0c\x0e-\x1f]/.test(shipping[field]))return fail("Please remove invalid address characters.");
    }
    if(["fullName","phone","address1","city","postalCode"].some(f=>shipping[f].length<2))return fail("Please complete the required delivery fields.");
    if(!countries.has(data.country))return fail("Please choose a supported delivery country.");
    shipping.country=data.country;
    // Re-check the ledger before writing in case a payment was captured in another tab.
    const latestLedger=await read(bucket,path(id,ledgerFile));
    if(latestLedger?.quotedAt===payment.quotedAt&&(latestLedger.deposit||latestLedger.full))return fail("Payment has already been made. Please contact the studio to change the delivery address.",409);
    const updatedAt=new Date().toISOString();
    await put(bucket,path(id,"shipping.json"),{id,details:shipping,updatedAt});
    await put(bucket,path(id,"details.json"),{...order,name,email,country:shipping.country});
    return json({ok:true,id,updatedAt,sandbox:!live});
  }
  if(["Cancelled","Shipped","Completed"].includes(order.status))return fail("This order is no longer payable.",409);
  if(!["deposit","balance","full"].includes(state.stage))return fail("No payment is currently due.",409);
  const stage=state.stage,amount=(state.amountCents/100).toFixed(2),reference=id+"-"+stage;
  if(action==="create"){
    const pending=await read(bucket,path(id,live?"checkout-paypal-live-order.json":"checkout-paypal-order.json"));
    if(pending?.stage===stage&&pending?.quotedAt===payment.quotedAt&&pending?.tokenHash===activeAccess.tokenHash&&pending?.paypalOrderId&&Date.parse(pending.createdAt)>Date.now()-3600000)return json({ok:true,orderID:pending.paypalOrderId,sandbox:!live});
    const orderResult=await paypal(env,"/v2/checkout/orders","POST",{
      intent:"CAPTURE",
      purchase_units:[{reference_id:reference,custom_id:reference,description:"Custom hand-painted pet portrait - "+stage,amount:{currency_code:"AUD",value:amount}}],
      application_context:{shipping_preference:"NO_SHIPPING",user_action:"PAY_NOW"}
    },"checkout-create-"+reference+"-"+payment.quotedAt.replace(/[^0-9]/g,"").slice(0,14)+"-"+Math.floor(Date.now()/3600000));
    if(!orderResult.id||orderResult.status!=="CREATED")throw Error("PayPal did not create the Sandbox order.");
    await put(bucket,path(id,live?"checkout-paypal-live-order.json":"checkout-paypal-order.json"),{id,stage,quotedAt:payment.quotedAt,tokenHash:activeAccess.tokenHash,paypalOrderId:orderResult.id,createdAt:new Date().toISOString()});
    // Give the buyer a full ten-minute window from opening the PayPal payment flow.
    try{
      const key="pending-checkouts/"+id+".json";
      const marker=await read(bucket,key);
      if(marker?.id===id){
        const later=new Date(Date.now()+10*60*1000).toISOString();
        if(Date.parse(marker.notifyAfter)<Date.parse(later))await put(bucket,key,{...marker,notifyAfter:later,paypalStartedAt:new Date().toISOString()});
      }
    }catch(error){console.error("Could not extend unpaid notification window",id,error);}


    return json({ok:true,orderID:orderResult.id,sandbox:!live});
  }
  const pending=await read(bucket,path(id,live?"checkout-paypal-live-order.json":"checkout-paypal-order.json"));
  if(!pending||pending.stage!==stage||pending.quotedAt!==payment.quotedAt||pending.tokenHash!==activeAccess.tokenHash||pending.paypalOrderId!==input.orderID)return fail("Payment session mismatch. Refresh checkout.",409);
  if(!/^[A-Za-z0-9]{8,50}$/.test(input.orderID||""))return fail("Invalid PayPal order ID.");
  let result;
  try{result=await paypal(env,"/v2/checkout/orders/"+encodeURIComponent(input.orderID)+"/capture","POST",null,"checkout-capture-"+input.orderID);}
  catch(captureError){
    // A timeout or lost response may occur AFTER PayPal has charged the buyer.
    // Query the exact order before offering another payment attempt.
    try{result=await paypal(env,"/v2/checkout/orders/"+encodeURIComponent(input.orderID));}
    catch(lookupError){console.error("PayPal capture outcome unknown; manual reconciliation required",id,input.orderID);return fail("Payment status is being verified. Please contact the studio before retrying.",503);}
    if(result.status!=="COMPLETED")return fail("Payment could not be confirmed. Please contact the studio before retrying.",409);
  }
  const units=result.purchase_units||[];
  const captures=units[0]?.payments?.captures||[];
  const matched=captures.find(c=>c.status==="COMPLETED"&&c.amount?.currency_code==="AUD"&&c.amount?.value===amount);
  // Reject extra purchase units or captures, even if one capture matches.
  if(result.id!==input.orderID||result.status!=="COMPLETED"||units.length!==1||captures.length!==1||!matched||units[0].custom_id!==reference||units[0].amount?.currency_code!=="AUD"||units[0].amount?.value!==amount)throw Error("PayPal capture could not be verified.");
  const current=await read(bucket,path(id,ledgerFile));
  if(current?.quotedAt===payment.quotedAt&&current[stage]){
    if(current[stage].paypalOrderId!==result.id||current[stage].reference!==matched.id)return fail("Payment conflict detected. Contact the studio for reconciliation.",409);
    return json({ok:true,paid:true,stage,sandbox:!live});
  }
  const latest=await read(bucket,path(id,"payment.json"));
  if(latest?.quotedAt!==payment.quotedAt)return fail("Order changed during payment. Contact the studio.",409);
  const next=current?.quotedAt===payment.quotedAt?current:{id,quotedAt:payment.quotedAt};
  next[stage]={reference:matched.id,paypalOrderId:result.id,amountCents:state.amountCents,verifiedAt:new Date().toISOString(),verification:live?"paypal-live-capture":"paypal-sandbox-capture",sandbox:!live};
  await put(bucket,path(id,ledgerFile),next);
  // A verified capture cancels the delayed unpaid email. The Worker independently re-checks this ledger.
  try{await bucket.delete("pending-checkouts/"+id+".json");}
  catch(error){console.error("Could not clear unpaid notification marker",id,error);}
  // Send only after a verified PayPal Sandbox capture has been persisted.
  // Duplicate capture requests return above without sending a second email.
  const paidLabel=stage==="deposit"?"ĐÃ THANH TOÁN CỌC 50%":stage==="balance"?"ĐÃ THANH TOÁN PHẦN CÒN LẠI":"ĐÃ THANH TOÁN TOÀN BỘ";
  const outstanding=stage==="deposit"?payment.balanceCents/100:0;
  try { await notifyStudio(env,(live?"[LIVE] ":"[SANDBOX] ")+"["+paidLabel+"] Đơn tranh "+id,[
    "ATELIER HAU — XÁC NHẬN THANH TOÁN",
    live?"GIAO DỊCH PAYPAL LIVE — TIỀN THẬT.":"CHẾ ĐỘ THỬ NGHIỆM SANDBOX — KHÔNG CÓ TIỀN THẬT.",
    "",
    "TRẠNG THÁI: "+paidLabel,
    live?"PayPal Live đã xác nhận giao dịch thành công.":"PayPal Sandbox đã xác nhận giao dịch thành công.",
    "",
    "Mã đơn: "+id,
    "Khách hàng: "+order.name,
    "Email khách: "+order.email,
    "Tên thú cưng: "+(order.petName||"Chưa cung cấp"),
    "Kích thước: "+order.size+" cm",
    "Số thú cưng: "+order.pets,
    "Giá trị đơn: "+aud(payment.totalCents/100),
    "Vừa thanh toán: "+aud(state.amountCents/100),
    "Số tiền còn lại: "+aud(outstanding),
    "Mã giao dịch PayPal: "+matched.id,
    "",
    stage==="deposit"?"Bước tiếp theo: Kiểm tra ảnh và yêu cầu trước khi bắt đầu vẽ.":"Bước tiếp theo: Kiểm tra trạng thái đơn và tiếp tục xử lý trong Studio.",
    live?"Giao dịch thật. Đối chiếu trong PayPal Business.":"Lưu ý: Đây là thanh toán thử, không phải doanh thu thực tế."
  ],id); } catch(error) { console.error("Verified capture recorded but Studio notification failed",id,String(error)); }

  // Payment is already securely recorded. Email is best-effort and cannot undo a capture.
  let emailTest="skipped";
  try {
    const notification=live?await sendLivePaymentEmail({env,bucket,order,payment,stage,captureId:matched.id}):await sendSandboxCustomerEmail({env,bucket,order,payment,event:"payment-"+stage,eventKey:"payment-"+stage});
    emailTest=notification.state;
  } catch(e) {console.error("Payment confirmation email logging failed",id,String(e));emailTest="failed";}
  return json({ok:true,paid:true,stage,sandbox:!live,emailTest});
}
export async function onRequestPost({request,env}){
  // Explicit branch guard: even accidental production deployment cannot use this checkout.
  if(!env.CF_PAGES_BRANCH)return fail("Checkout environment is not configured.",503);
  if(env.CF_PAGES_BRANCH==="main"&&(env.PAYPAL_MODE!=="live"||env.PAYPAL_LIVE_READY!=="yes"))return fail("Live checkout is not enabled.",503);
  if(env.CF_PAGES_BRANCH!=="main"&&env.PAYPAL_MODE==="live")return fail("Live payments are prohibited on preview.",403);
  if(!env.PORTRAIT_UPLOADS||!env.PAYPAL_CLIENT_ID||!env.PAYPAL_CLIENT_SECRET||!env.TURNSTILE_SECRET_KEY)return fail("Sandbox checkout is not configured for this preview.",503);
  const origin=request.headers.get("Origin");
  if(origin&&origin!==new URL(request.url).origin)return fail("Origin not allowed.",403);
  try{
    const type=request.headers.get("content-type")||"";
    if(type.includes("multipart/form-data"))return await start(request,env);
    if(type.includes("application/json"))return await action(request,env);
    return fail("Unsupported request format.",415);
  }catch(e){console.error("Sandbox checkout failed",e.message);return fail("Sandbox checkout could not be completed. Please try again or contact the studio.",502);}
}