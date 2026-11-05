// Private studio dashboard API. The admin key must be a 32+ character Cloudflare secret.
// Never embed STUDIO_ADMIN_KEY in frontend code or expose the private R2 bucket.
const statuses = new Set(["New","Confirmed","Painting","Ready for balance","Shipped","Completed","Cancelled"]);
const headers = {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const respond = (body,status=200)=>new Response(JSON.stringify(body),{status,headers});
const validId = id => /^LH-\d{8}-[A-F0-9]{8}$/.test(id||"");
const detailKey = id => `enquiries/${id}/details.json`;
const shippingKey = id => `enquiries/${id}/shipping.json`;
const accessKey = id => `enquiries/${id}/shipping-access.json`;
const paymentKey = id => `enquiries/${id}/payment.json`;
const paymentAccessKey = id => `enquiries/${id}/payment-access.json`;
const sandboxPaymentKey = id => `enquiries/${id}/paypal-sandbox-payments.json`;
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
  if(!(await sameSecret(key,env.STUDIO_ADMIN_KEY)))return respond({ok:false,message:"Incorrect access key."},401);
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
        const shipping=await readJson(bucket,shippingKey(id));
        const payment=await readJson(bucket,paymentKey(id));
        const sandboxPayment=await readJson(bucket,sandboxPaymentKey(id));
        return {checkoutMode:data.checkoutMode||null,checkoutPlan:data.checkoutPlan||null,sandboxPayment:sandboxPayment?.quotedAt===payment?.quotedAt?sandboxPayment:null,payment:payment||null,shipping:shipping?.details||null,shippingUpdatedAt:shipping?.updatedAt||null,id:data.id,receivedAt:data.receivedAt,name:data.name,email:data.email,petName:data.petName||"",size:data.size,pets:data.pets,country:data.country,card:!!data.card,story:data.story||"",estimatedPriceAUD:data.estimatedPriceAUD,status:statuses.has(data.status)?data.status:"New",internalNote:data.internalNote||"",updatedAt:data.updatedAt||null,photos:(data.photos||[]).map((p,i)=>({index:i,name:p.originalName||`Photo ${i+1}`}))};
      }))).filter(Boolean);
      orders.sort((a,b)=>String(b.receivedAt).localeCompare(String(a.receivedAt)));
      return respond({ok:true,orders,nextCursor:page.truncated?page.cursor||null:null});
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
  const denied=await guard(context);if(denied)return denied;
  const {request,env}=context;
  const action=new URL(request.url).searchParams.get("action");
  if(!["status","shipping-link","payment-quote","payment-record","payment-link"].includes(action))return respond({ok:false,message:"Unknown action."},404);
  if(Number(request.headers.get("content-length")||0)>4096)return respond({ok:false,message:"Request too large."},413);
  let payload;try{payload=await request.json();}catch{return respond({ok:false,message:"Invalid request."},400);}
  const {id,status}=payload||{};
  if(action==="shipping-link"){
    if(!validId(id))return respond({ok:false,message:"Invalid order."},400);
    try{
      const order=await getDetails(env.PORTRAIT_UPLOADS,id);
      if(!order)return respond({ok:false,message:"Order not found."},404);
      if(order.checkoutMode==="sandbox-inline")return respond({ok:false,message:"Delivery address was collected at checkout; no shipping link is required."},409);
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
      if(!order||!payment||order.checkoutMode==="sandbox-inline"||["Cancelled","Shipped","Completed"].includes(order.status))return respond({ok:false,message:"Order cannot request a legacy payment link."},409);
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
      if(order.checkoutMode==="sandbox-inline")return respond({ok:false,message:"Sandbox checkout orders cannot be manually repriced or recorded."},409);
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
    const depositVerified=checkoutPaid?Boolean(sandbox.deposit||sandbox.full):Boolean(payment?.deposit);
    const fullyVerified=checkoutPaid?Boolean(sandbox.full||(sandbox.deposit&&sandbox.balance)):Boolean(payment?.deposit&&payment?.balance);
    if(status!==data.status&&["Painting","Ready for balance"].includes(status)&&!depositVerified)return respond({ok:false,message:"Verify the deposit or full payment before starting production."},409);
    if(status!==data.status&&["Shipped","Completed"].includes(status)&&!fullyVerified)return respond({ok:false,message:"Verify full payment before shipping or completing the order."},409);
    data.status=status;data.internalNote=payload.internalNote.trim();data.updatedAt=new Date().toISOString();
    await env.PORTRAIT_UPLOADS.put(detailKey(id),JSON.stringify(data,null,2),{httpMetadata:{contentType:"application/json"}});
    return respond({ok:true,id,status,updatedAt:data.updatedAt});
  }catch(e){console.error("Studio update failed",e);return respond({ok:false,message:"Could not update order."},500);}
}
