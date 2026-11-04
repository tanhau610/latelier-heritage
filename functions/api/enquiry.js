// Cloudflare Pages Function. Keep credentials in Cloudflare encrypted secrets, never in GitHub.
const prices = { "20x25":[229,299], "30x40":[379,469], "40x50":[499,599], "50x70":[699,829] };
const destinations = new Set(["Australia","United States","United Kingdom","Canada"]);
const json = (data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const clean = (value,max=2500)=>String(value||"").trim().slice(0,max);
const fail = (message,status=400)=>json({ok:false,message},status);
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length<=254;
const priceFor = (size,pets,card)=>prices[size][pets===1?0:1]+Math.max(0,pets-2)*(size==="50x70"?100:80)+(card?15:0);
async function verifyTurnstile(request,form,env){
  const token=clean(form.get("cf-turnstile-response"),2048);
  if(!token || !env.TURNSTILE_SECRET_KEY) return false;
  const data=new URLSearchParams({secret:env.TURNSTILE_SECRET_KEY,response:token});
  const ip=request.headers.get("CF-Connecting-IP"); if(ip)data.set("remoteip",ip);
  const response=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:data});
  if(!response.ok)return false;
  const result=await response.json();
  return result.success===true && result.hostname===new URL(request.url).hostname;
}
async function fileIsImage(file){
  const b=new Uint8Array(await file.slice(0,16).arrayBuffer());
  if(file.type==="image/jpeg")return b[0]===255&&b[1]===216&&b[2]===255;
  if(file.type==="image/png")return [137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x);
  if(file.type==="image/webp")return String.fromCharCode(...b.slice(0,4))==="RIFF"&&String.fromCharCode(...b.slice(8,12))==="WEBP";
  return false;
}
export async function onRequestPost({request,env}){
  const origin=request.headers.get("Origin");
  if(origin && origin!==new URL(request.url).origin)return fail("Invalid request origin.",403);
  const length=Number(request.headers.get("content-length")||0);
  if(length>23*1024*1024)return fail("Upload is too large. Maximum combined photo size is 20 MB.",413);
  if(!env.RESEND_API_KEY||!env.NOTIFICATION_EMAIL||!env.TURNSTILE_SECRET_KEY||!env.TURNSTILE_SITE_KEY)return fail("Enquiries are not available yet. Please try again later.",503);
  let form;try{form=await request.formData()}catch{return fail("Could not read the form. Please try again.");}
  // Honeypot: return a harmless response without sending or storing spam.
  if(clean(form.get("website")))return json({ok:true,message:"Thank you."});
  let verified=false;try{verified=await verifyTurnstile(request,form,env)}catch{}
  if(!verified)return fail("Security check expired or failed. Please try again.",403);
  const type=clean(form.get("type"),20);
  if(!["commission","contact"].includes(type))return fail("Invalid enquiry type.");
  const name=clean(form.get("name"),120), email=clean(form.get("email"),254);
  if(name.length<2||!validEmail(email))return fail("Please provide your name and a valid email address.");
  const id="LH-"+new Date().toISOString().slice(0,10).replace(/-/g,"")+"-"+crypto.randomUUID().slice(0,8).toUpperCase();
  let details, files=[];
  if(type==="commission"){
    if(!env.PORTRAIT_UPLOADS)return fail("Portrait photo uploads are not configured yet.",503);
    const size=clean(form.get("size"),10),pets=Number(form.get("pets")),country=clean(form.get("country"),40);
    const card=form.get("card")==="yes",petName=clean(form.get("petName"),120),story=clean(form.get("story"),2500);
    if(!prices[size]||![1,2,3,4].includes(pets)||!destinations.has(country))return fail("Please check your portrait options.");
    files=form.getAll("photos").filter(f=>f instanceof File && f.size>0);
    if(files.length<1||files.length>5)return fail("Please select between 1 and 5 reference photographs.");
    if(files.some(f=>f.size>8*1024*1024)||files.reduce((sum,f)=>sum+f.size,0)>20*1024*1024)return fail("Photos must be under 8 MB each and 20 MB combined.");
    for(const f of files)if(!(await fileIsImage(f)))return fail("Only valid JPG, PNG and WEBP photographs are accepted.");
    if(form.get("photoPermission")!=="yes")return fail("Please confirm you have permission to use the photos.");
    details={id,type,receivedAt:new Date().toISOString(),name,email,size,pets,country,card,petName,story,estimatedPriceAUD:priceFor(size,pets,card),photos:[]};
    try{
      for(let i=0;i<files.length;i++){
        const f=files[i],extension={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"}[f.type];
        const key=`enquiries/${id}/photos/${String(i+1).padStart(2,"0")}.${extension}`;
        await env.PORTRAIT_UPLOADS.put(key,f.stream(),{httpMetadata:{contentType:f.type},customMetadata:{enquiryId:id}});
        details.photos.push({key,originalName:clean(f.name,180),bytes:f.size});
      }
      await env.PORTRAIT_UPLOADS.put(`enquiries/${id}/details.json`,JSON.stringify(details,null,2),{httpMetadata:{contentType:"application/json"}});
    }catch(error){console.error("R2 storage failed",id,error);return fail("Could not securely save your photos. Please try again later.",503);}
  }else{
    const topic=clean(form.get("topic"),80),message=clean(form.get("message"),2500);
    if(message.length<5)return fail("Please enter a message.");
    details={id,type,receivedAt:new Date().toISOString(),name,email,topic,message};
  }
  const lines=type==="commission"?
    [`New portrait enquiry: ${id}`,`Name: ${name}`,`Customer email: ${email}`,`Pet: ${details.petName||"Not provided"}`,`Size: ${details.size} cm`,`Pets: ${details.pets}`,`Country: ${details.country}`,`Handwritten card: ${details.card?"Yes":"No"}`,`Estimated AUD: ${details.estimatedPriceAUD}`,`Story: ${details.story||"Not provided"}`,`Private photo storage: Cloudflare R2 bucket / enquiries/${id}/photos/ (${details.photos.length} images)`,`Order details: enquiries/${id}/details.json`]:
    [`New contact enquiry: ${id}`,`Name: ${name}`,`Customer email: ${email}`,`Topic: ${details.topic}`,`Message: ${details.message}`];
  // No automatic customer email is sent. The private Gmail is a recipient only.
  let delivered=false;
  try{
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":`Bearer ${env.RESEND_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({from:env.RESEND_FROM||"L'Atelier Heritage <onboarding@resend.dev>",to:[env.NOTIFICATION_EMAIL],subject:`[L'Atelier Heritage] ${type==="commission"?"New portrait request":"New contact message"} ${id}`,text:lines.join("\n")})});
    delivered=response.ok;
    if(!delivered)console.error("Resend delivery rejected",id,response.status);
  }catch(error){console.error("Resend request failed",id,error);}
  if(!delivered)return fail("We could not confirm your enquiry. Please contact the studio before submitting again.",502);
  return json({ok:true,id,message:"Your enquiry has been received. Our studio will review it before discussing payment."});
}
