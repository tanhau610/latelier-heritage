// ATELIER HAU — Live unpaid-order alerts. Cloudflare Worker, cron only.
// Required: PORTRAIT_UPLOADS (R2), RESEND_API_KEY (secret),
// NOTIFICATION_EMAIL (secret), RESEND_FROM (text: ATELIER HAU <orders@atelierhau.com>).
// Schedule: */1 * * * * . Never attach a public route.
const PREFIX="pending-checkouts/";
const ORDER_PREFIX="enquiries/";
const VALID_ID=/^LH-[0-9]{8}-[A-F0-9]{8}$/;
const DELAY_MS=10*60*1000;
const money=n=>"A$"+(n/100).toFixed(2);
async function read(bucket,key){
  const obj=await bucket.get(key);
  if(!obj)return null;
  try{return await obj.json();}catch{return null;}
}
function validSender(from){
  return typeof from==="string"&&/^ATELIER HAU <[a-z0-9._%+-]+@atelierhau\.com>$/i.test(from);
}
async function handleMarker(env,key,now){
  const bucket=env.PORTRAIT_UPLOADS;
  const marker=await read(bucket,key);
  if(!marker)return "missing";
  const id=marker.id;
  if(!VALID_ID.test(id||"")||key!==PREFIX+id+".json")throw Error("Invalid pending-checkout marker");
  // Strict isolation: never consume or alter Sandbox markers.
  if(marker.sandbox!==false||marker.checkoutMode!=="live-inline")return "not-live";
  const due=Date.parse(marker.notifyAfter),created=Date.parse(marker.createdAt);
  if(!Number.isFinite(due)||!Number.isFinite(created)||due<created+DELAY_MS||now<due)return "not-due";
  const base=ORDER_PREFIX+id+"/";
  const [order,payment,ledger]=await Promise.all([
    read(bucket,base+"details.json"),
    read(bucket,base+"payment.json"),
    read(bucket,base+"paypal-live-payments.json")
  ]);
  if(!order||!payment||order.id!==id||payment.id!==id||
     order.checkoutMode!=="live-inline"||payment.sandbox!==false||
     !Number.isInteger(payment.totalCents)||payment.totalCents<=0||
     payment.quotedAt!==marker.createdAt){
    // Retain marker for investigation rather than alerting on inconsistent data.
    throw Error("Live order data missing or inconsistent: "+id);
  }
  // A verified capture wins even if checkout could not delete its marker.
  if(ledger?.quotedAt===payment.quotedAt&&(ledger.deposit||ledger.full||ledger.balance)){
    await bucket.delete(key);
    return "paid";
  }
  const eventKey=base+"email-events/live-unpaid-alert.json";
  const prior=await read(bucket,eventKey);
  if(prior?.state==="sent"){
    await bucket.delete(key);
    return "already-sent";
  }
  if(!env.RESEND_API_KEY||!env.NOTIFICATION_EMAIL||!validSender(env.RESEND_FROM))throw Error("Live email settings missing or unverified");
  const subject="[LIVE][CHƯA THANH TOÁN SAU 10 PHÚT] Đơn tranh "+id;
  const lines=[
    "ATELIER HAU — ĐƠN LIVE CHƯA XÁC NHẬN THANH TOÁN",
    "Mã đơn: "+id,
    "Khách hàng: "+String(order.name||""),
    "Email khách: "+String(order.email||""),
    "Thú cưng: "+String(order.petName||""),
    "Kích thước: "+String(order.size||""),
    "Số thú cưng: "+String(order.pets||""),
    "Quốc gia: "+String(order.country||""),
    "Tổng giá trị: "+money(payment.totalCents),
    "Hình thức: "+(order.checkoutPlan==="deposit"?"Đặt cọc 50%":"Thanh toán 100%"),
    "Trạng thái: Chưa tìm thấy giao dịch đã xác minh trong sổ thanh toán Live.",
    "Lưu ý: Đây KHÔNG phải xác nhận PayPal chưa trừ tiền; kiểm tra PayPal trước khi liên hệ khách."
  ];
  // Resend idempotency protects retries after an ambiguous response.
  const response=await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{
      Authorization:"Bearer "+env.RESEND_API_KEY,
      "Content-Type":"application/json",
      "Idempotency-Key":"atelier-live-unpaid-"+id
    },
    body:JSON.stringify({from:env.RESEND_FROM,to:[env.NOTIFICATION_EMAIL],subject,text:lines.join("\n")})
  });
  if(!response.ok)throw Error("Resend rejected Live unpaid alert: HTTP "+response.status);
  const result=await response.json().catch(()=>({}));
  await bucket.put(eventKey,JSON.stringify({id,state:"sent",resendId:result.id||null,sentAt:new Date().toISOString()}),{httpMetadata:{contentType:"application/json"}});
  await bucket.delete(key);
  return "sent";
}
export default {
  async scheduled(_event,env,ctx){
    ctx.waitUntil((async()=>{
      if(!env.PORTRAIT_UPLOADS)throw Error("PORTRAIT_UPLOADS binding missing");
      const now=Date.now();
      let cursor,scanned=0,sent=0;
      do{
        const page=await env.PORTRAIT_UPLOADS.list({prefix:PREFIX,limit:100,cursor});
        for(const item of page.objects){
          try{const result=await handleMarker(env,item.key,now);if(result==="sent")sent++;}
          catch(error){console.error("Live unpaid alert failed for marker",item.key,String(error));}
          scanned++;
        }
        cursor=page.truncated?page.cursor:undefined;
      }while(cursor&&scanned<1000);
      console.log("Live unpaid scan completed",JSON.stringify({scanned,sent,more:!!cursor}));
    })());
  }
};
