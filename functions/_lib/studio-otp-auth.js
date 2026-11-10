// Private Studio OTP on Preview and Production. Never sends codes to a user-supplied destination.
const prefix='studio-auth/';
const enc=new TextEncoder();
export const otpHeaders={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
export const otpJson=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:otpHeaders});
export const tokenHex=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export async function hash(value){const d=await crypto.subtle.digest('SHA-256',enc.encode(value));return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,'0')).join('');}
export async function mac(secret,value){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const d=await crypto.subtle.sign('HMAC',key,enc.encode(value));return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,'0')).join('');}
export function constantEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
export const read=async(bucket,key)=>{const obj=await bucket.get(prefix+key);if(!obj)return null;try{return await obj.json();}catch{return null;}};
export const write=(bucket,key,data)=>bucket.put(prefix+key,JSON.stringify(data),{httpMetadata:{contentType:'application/json'}});
export async function verifyStudioSession(env,bearer){
  if(!env.CF_PAGES_BRANCH||!env.PORTRAIT_UPLOADS||typeof bearer!=='string'||!/^st_[a-f0-9]{64}$/.test(bearer))return false;
  const session=await read(env.PORTRAIT_UPLOADS,'sessions/'+await hash(bearer));
  return Boolean(session&&session.expiresAt>Date.now()&&session.purpose==='studio-admin-otp');
}
export async function revokeStudioSession(env,bearer){
  if(!env.PORTRAIT_UPLOADS||!/^st_[a-f0-9]{64}$/.test(bearer||''))return;
  await env.PORTRAIT_UPLOADS.delete(prefix+'sessions/'+await hash(bearer));
}
