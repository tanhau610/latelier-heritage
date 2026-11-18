import {verifyStudioSession} from "../_lib/studio-otp-auth.js";
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
async function validKey(a,b){
 if(typeof a!=="string"||typeof b!=="string"||a.length<32||b.length<32||a.length>256)return false;
 const enc=new TextEncoder(),[x,y]=await Promise.all([crypto.subtle.digest("SHA-256",enc.encode(a)),crypto.subtle.digest("SHA-256",enc.encode(b))]);
 const left=new Uint8Array(x),right=new Uint8Array(y);let diff=0;
 for(let i=0;i<left.length;i++)diff|=left[i]^right[i];
 return diff===0;
}
export async function onRequestGet({request,env}){
 const url=new URL(request.url),origin=request.headers.get("Origin");
 if(origin&&origin!==url.origin)return json({ok:false,message:"Origin not allowed."},403);
 if(!env.STUDIO_ADMIN_KEY||env.STUDIO_ADMIN_KEY.length<32)return json({ok:false,message:"Studio access is not configured."},503);
 const auth=request.headers.get("Authorization")||"",key=auth.startsWith("Bearer ")?auth.slice(7):"";
 if(!(await validKey(key,env.STUDIO_ADMIN_KEY))&&!(await verifyStudioSession(env,key)))return json({ok:false,message:"Incorrect access key."},401);
 const days=Number(url.searchParams.get("days")||30);
 if(![7,30,90].includes(days))return json({ok:false,message:"Unsupported reporting period."},400);
 const token=env.CF_ANALYTICS_TOKEN,account=env.CF_ANALYTICS_ACCOUNT_ID;
 if(!token||!account)return json({ok:true,configured:false,message:"Chưa kết nối Cloudflare Analytics. Cần CF_ANALYTICS_TOKEN và CF_ANALYTICS_ACCOUNT_ID trong Cloudflare Secrets."});
 if(!/^[a-f0-9]{32}$/i.test(account))return json({ok:false,message:"Cloudflare Account ID không hợp lệ."},503);
 const end=new Date(),start=new Date(end.getTime()-(days*86400000));
 const query=`query Traffic($account: String!, $from: Time!, $to: Time!) {
   viewer { accounts(filter:{accountTag:$account}) {
     rumPageloadEventsAdaptiveGroups(limit:10000,filter:{datetime_geq:$from,datetime_leq:$to}) {
       count
       dimensions { date }
       sum { visits }
     }
   } }
 }`;
 try{
  const response=await fetch("https://api.cloudflare.com/client/v4/graphql",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({query,variables:{account,from:start.toISOString(),to:end.toISOString()}})});
  const payload=await response.json();
  if(!response.ok||payload.errors?.length)return json({ok:false,message:"Không lấy được dữ liệu Cloudflare Web Analytics. Kiểm tra quyền token, Account ID và dataset Web Analytics.",detail:payload.errors?.[0]?.message||"HTTP "+response.status},502);
  const groups=payload.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups;
  if(!Array.isArray(groups))return json({ok:false,message:"Cloudflare chưa trả về dữ liệu Web Analytics cho tài khoản này."},502);
  const daily=groups.map(x=>({date:x.dimensions?.date||"",pageViews:Number(x.count)||0,visits:Number(x.sum?.visits)||0})).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date)).sort((a,b)=>a.date.localeCompare(b.date));
  return json({ok:true,configured:true,days,totals:{pageViews:daily.reduce((n,x)=>n+x.pageViews,0),visits:daily.reduce((n,x)=>n+x.visits,0)},daily,source:"Cloudflare Web Analytics",note:"Visits là lượt truy cập ước tính theo Cloudflare, không phải số người duy nhất; không bao gồm sự kiện đặt tranh."});
 }catch{return json({ok:false,message:"Không kết nối được Cloudflare Analytics. Thử lại sau."},502);}
}
