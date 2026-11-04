// PayPal Sandbox checkout. Never enable live payments from Preview.
// Client Secret is only read server-side from Cloudflare encrypted secrets.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"}});
const validId=id=>/^LH-\d{8}-[A-F0-9]{8}$/.test(id||"");
const key=id=>`enquiries/${id}/payment.json`;
const accessKey=id=>`enquiries/${id}/payment-access.json`;
const orderKey=id=>`enquiries/${id}/paypal-sandbox-order.json`;
async function read(bucket,path){const obj=await bucket.get(path);if(!obj)return null;try{return await obj.json();}catch{return null;}}
async function digest(value){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");}
function equal(a,b){if(typeof a!=="string"||typeof b!=="string"||a.length!==64||b.length!==64)return false;let diff=0;for(let i=0;i<64;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
async function paypal(env,path,method="GET",body=null,requestId=null){
  const credentials=btoa(env.PAYPAL_CLIENT_ID+":"+env.PAYPAL_CLIENT_SECRET);
  const auth=await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token",{method:"POST",headers:{"Authorization":"Basic "+credentials,"Content-Type":"application/x-www-form-urlencoded"},body:"grant_type=client_credentials"});
  if(!auth.ok)throw Error("Sandbox PayPal authentication failed");
  const token=await auth.json();
  const headers={"Authorization":"Bearer "+token.access_token,"Content-Type":"application/json","Prefer":"return=representation"};
  if(requestId)headers["PayPal-Request-Id"]=requestId;
  const response=await fetch("https://api-m.sandbox.paypal.com"+path,{method,headers,body:body?JSON.stringify(body):undefined});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error("Sandbox PayPal request failed ("+response.status+")");
  return result;
}
export async function onRequestPost({request,env}){
  if(!env.PORTRAIT_UPLOADS||!env.PAYPAL_CLIENT_ID||!env.PAYPAL_CLIENT_SECRET)return json({ok:false,message:"Sandbox checkout is not configured."},503);
  const origin=request.headers.get("Origin");
  if(origin&&origin!==new URL(request.url).origin)return json({ok:false,message:"Invalid request origin."},403);
  if(Number(request.headers.get("content-length")||0)>2048)return json({ok:false,message:"Request too large."},413);
  let input;try{input=await request.json();}catch{return json({ok:false,message:"Invalid request."},400);}
  const {id,action}=input||{};
  if(!validId(id)||!["view","create","capture"].includes(action))return json({ok:false,message:"Invalid request."},400);
  const auth=request.headers.get("Authorization")||"";
  const token=auth.startsWith("Bearer ")?auth.slice(7):"";
  if(!/^[a-f0-9]{64}$/.test(token))return json({ok:false,message:"Invalid payment link."},403);
  try{
    const bucket=env.PORTRAIT_UPLOADS;
    const [access,payment,order]=await Promise.all([read(bucket,accessKey(id)),read(bucket,key(id)),read(bucket,`enquiries/${id}/details.json`)]);
    if(!access||access.id!==id||Date.parse(access.expiresAt)<=Date.now()||!equal(await digest(token),access.tokenHash))
      return json({ok:false,message:"This payment link has expired or was replaced. Please contact the studio."},403);
    if(!payment||!order||order.id!==id||order.type!=="commission"||["Cancelled","Shipped","Completed"].includes(order.status))
      return json({ok:false,message:"Order is not available for payment."},409);
    const stage=access.stage;
    if(!["deposit","balance"].includes(stage)||access.quotedAt!==payment.quotedAt)
      return json({ok:false,message:"The price has changed. Please request a new payment link."},409);
    if(stage==="balance"&&!payment.deposit)return json({ok:false,message:"Deposit has not been recorded yet."},409);
    const cents=stage==="deposit"?payment.depositCents:payment.balanceCents;
    if(!Number.isInteger(cents)||cents<100||cents>10000000)return json({ok:false,message:"Invalid payment amount."},409);
    const amount=(cents/100).toFixed(2);
    if(action==="view")return json({ok:true,id,petName:order.petName||"Pet portrait",stage,amount,currency:"AUD",paid:!!payment[stage],clientId:env.PAYPAL_CLIENT_ID,sandbox:true});
    if(payment[stage])return json({ok:false,message:"This instalment has already been recorded as paid."},409);
    if(action==="create"){
      const previous=await read(bucket,orderKey(id));
      if(previous?.stage===stage&&previous?.quotedAt===payment.quotedAt&&previous?.tokenHash===access.tokenHash&&previous?.paypalOrderId&&Date.parse(previous.createdAt)>Date.now()-60*60*1000)
        return json({ok:true,orderID:previous.paypalOrderId,sandbox:true});
      const result=await paypal(env,"/v2/checkout/orders","POST",{
        intent:"CAPTURE",purchase_units:[{reference_id:id+"-"+stage,custom_id:id+"-"+stage,description:"L'Atelier Heritage portrait - "+(stage==="deposit"?"50% deposit":"50% balance"),amount:{currency_code:"AUD",value:amount}}],
        application_context:{shipping_preference:"NO_SHIPPING",user_action:"PAY_NOW"}
      },"create-"+id+"-"+stage+"-"+payment.quotedAt.replace(/[^0-9]/g,"").slice(0,20));
      if(!result.id||result.status!=="CREATED")throw Error("PayPal did not create a checkout order.");
      await bucket.put(orderKey(id),JSON.stringify({id,stage,quotedAt:payment.quotedAt,tokenHash:access.tokenHash,paypalOrderId:result.id,createdAt:new Date().toISOString()}),{httpMetadata:{contentType:"application/json"}});
      return json({ok:true,orderID:result.id,sandbox:true});
    }
    const pending=await read(bucket,orderKey(id));
    if(!pending||pending.paypalOrderId!==input.orderID||pending.stage!==stage||pending.quotedAt!==payment.quotedAt||pending.tokenHash!==access.tokenHash)
      return json({ok:false,message:"Payment session mismatch. Please reload your payment link."},409);
    if(!/^[A-Za-z0-9]{8,50}$/.test(input.orderID||""))return json({ok:false,message:"Invalid PayPal order ID."},400);
    const result=await paypal(env,"/v2/checkout/orders/"+encodeURIComponent(input.orderID)+"/capture","POST",null,"capture-"+input.orderID);
    const captures=result.purchase_units?.flatMap(unit=>unit.payments?.captures||[])||[];
    const matched=captures.find(c=>c.status==="COMPLETED"&&c.amount?.currency_code==="AUD"&&c.amount?.value===amount);
    const reference=result.purchase_units?.[0]?.custom_id;
    if(result.status!=="COMPLETED"||!matched||reference!==id+"-"+stage)throw Error("PayPal capture could not be verified.");
    const latest=await read(bucket,key(id));
    if(!latest||latest.quotedAt!==payment.quotedAt)return json({ok:false,message:"Order changed during checkout. Contact the studio."},409);
    if(!latest[stage]){
      latest[stage]={reference:matched.id,paypalOrderId:result.id,amountCents:cents,verifiedAt:new Date().toISOString(),verification:"paypal-sandbox-capture",sandbox:true};
      await bucket.put(key(id),JSON.stringify(latest),{httpMetadata:{contentType:"application/json"}});
    }
    return json({ok:true,paid:true,sandbox:true,stage,amount});
  }catch(e){console.error("Sandbox checkout failed",e.message);return json({ok:false,message:"Sandbox payment could not be completed. Please retry or contact the studio."},502);}
}
