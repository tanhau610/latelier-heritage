// Private shipping intake. A long random token is delivered in a URL fragment,
// never in the URL sent to the server. Only its SHA-256 digest is stored in private R2.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"}});
const validId=id=>/^LH-\d{8}-[A-F0-9]{8}$/.test(id||"");
const clean=(v,max)=>typeof v==="string"?v.trim().slice(0,max+1):"";
const shippingKey=id=>`enquiries/${id}/shipping.json`;
const accessKey=id=>`enquiries/${id}/shipping-access.json`;
async function sha256(value){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");}
function equal(a,b){if(typeof a!=="string"||typeof b!=="string"||a.length!==64||b.length!==64)return false;let diff=0;for(let i=0;i<64;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
async function read(bucket,key){const obj=await bucket.get(key);if(!obj)return null;try{return await obj.json();}catch{return null;}}
export async function onRequestPost({request,env}){
  if(!env.PORTRAIT_UPLOADS)return json({ok:false,message:"Shipping is unavailable."},503);
  const origin=request.headers.get("Origin");
  if(origin&&origin!==new URL(request.url).origin)return json({ok:false,message:"Invalid request origin."},403);
  if(Number(request.headers.get("content-length")||0)>4096)return json({ok:false,message:"Request too large."},413);
  let data;try{data=await request.json();}catch{return json({ok:false,message:"Invalid request."},400);}
  const id=data?.id,action=data?.action;
  if(!validId(id)||!["view","save"].includes(action))return json({ok:false,message:"Invalid request."},400);
  const auth=request.headers.get("Authorization")||"";
  const token=auth.startsWith("Bearer ")?auth.slice(7):"";
  if(!/^[0-9a-f]{64}$/.test(token))return json({ok:false,message:"Invalid or expired shipping link."},403);
  try{
    const bucket=env.PORTRAIT_UPLOADS;
    const access=await read(bucket,accessKey(id));
    if(!access||access.id!==id||typeof access.expiresAt!=="string"||Date.parse(access.expiresAt)<=Date.now()||!equal(await sha256(token),access.tokenHash))
      return json({ok:false,message:"This shipping link has expired or was replaced. Please ask the studio for a new link."},403);
    const order=await read(bucket,`enquiries/${id}/details.json`);
    if(!order||order.type!=="commission"||order.id!==id)return json({ok:false,message:"Order not found."},404);
    const previous=await read(bucket,shippingKey(id));
    if(action==="view")return json({ok:true,id,petName:order.petName||"Pet portrait",country:order.country,shipping:previous?.details||null,editable:!["Shipped","Completed","Cancelled"].includes(order.status)});
    if(["Shipped","Completed","Cancelled"].includes(order.status))return json({ok:false,message:"Shipping details can no longer be changed online. Please contact the studio."},409);
    const fields=["fullName","phone","address1","address2","city","region","postalCode"];
    const limits={fullName:120,phone:40,address1:180,address2:180,city:100,region:100,postalCode:32};
    const details={};
    for(const field of fields){const raw=data?.[field];if(typeof raw!=="string"||raw.length>limits[field])return json({ok:false,message:"Please check your shipping details."},400);details[field]=clean(raw,limits[field]);}
    if(["fullName","phone","address1","city","postalCode"].some(field=>details[field].length<2))
      return json({ok:false,message:"Please complete the required fields."},400);
    if(fields.some(field=>/[<>\x00-\x08\x0b\x0c\x0e-\x1f]/.test(details[field])))return json({ok:false,message:"Please remove invalid characters."},400);
    details.country=order.country;
    const record={id,details,updatedAt:new Date().toISOString()};
    await bucket.put(shippingKey(id),JSON.stringify(record),{httpMetadata:{contentType:"application/json"}});
    return json({ok:true,message:"Your delivery details have been saved securely. The studio will confirm shipping before dispatch."});
  }catch(e){console.error("Shipping request failed",e);return json({ok:false,message:"Could not process shipping details. Please try again."},500);}
}
