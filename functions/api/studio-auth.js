import {otpJson,tokenHex,hash,mac,constantEqual,read,write,revokeStudioSession} from '../_lib/studio-otp-auth.js';
// Only preview deployments can request email codes; the legacy long key still works.
const fail=(message,status=400)=>otpJson({ok:false,message},status);
export async function onRequestPost({request,env}){
  if(!env.CF_PAGES_BRANCH||env.CF_PAGES_BRANCH==='main')return fail('Email login is only enabled on the preview branch.',403);
  if(!env.PORTRAIT_UPLOADS||!env.STUDIO_ADMIN_KEY||env.STUDIO_ADMIN_KEY.length<32)return fail('Studio security is not configured.',503);
  const origin=request.headers.get('Origin');
  if(origin&&origin!==new URL(request.url).origin)return fail('Origin not allowed.',403);
  if(Number(request.headers.get('content-length')||0)>2048)return fail('Request too large.',413);
  let body;try{body=await request.json();}catch{return fail('Invalid request.');}
  const action=body?.action;
  if(action==='logout'){
    const auth=request.headers.get('Authorization')||'';
    const token=auth.startsWith('Bearer ')?auth.slice(7):'';
    await revokeStudioSession(env,token);
    return otpJson({ok:true});
  }
  if(!['request','verify'].includes(action))return fail('Unknown action.',404);
  const bucket=env.PORTRAIT_UPLOADS,now=Date.now();
  const adminEmail=String(env.NOTIFICATION_EMAIL||'').trim().toLowerCase();
  if(action==='request'){
    if(!env.RESEND_API_KEY||!adminEmail||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)))return fail('Email login is not configured. Use your private access key.',503);
    // The destination is fixed server-side to the existing sandbox notification inbox.
    // Never accept an email destination from the browser.
    // Claim a rate-limit slot atomically before sending. Concurrent requests cannot
    // bypass the five-per-hour limit or the 60-second cooldown.
    const rateObject=await bucket.get('studio-auth/rate');
    const rate=rateObject?await rateObject.json():{};
    const windowStart=now-(Number(rate.windowStart)||0)<3600000?rate.windowStart:now;
    const count=windowStart===rate.windowStart?(Number(rate.count)||0):0;
    if(now-(Number(rate.lastSent)||0)<60000)return fail('Please wait 60 seconds before requesting another code.',429);
    if(count>=5)return fail('Too many codes requested. Please try again in an hour.',429);
    const rateCondition=rateObject?{onlyIf:{etagMatches:rateObject.etag}}:{onlyIf:new Headers({'If-None-Match':'*'})};
    const reserved=await bucket.put('studio-auth/rate',JSON.stringify({windowStart,count:count+1,lastSent:now}),rateCondition);
    if(!reserved)return fail('Please retry your request in a moment.',429);
    const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0');
    const nonce=tokenHex();
    const record={nonce,codeHash:await mac(env.STUDIO_ADMIN_KEY,nonce+':'+code),expiresAt:now+5*60000,attempts:0};
    const challengeObject=await write(bucket,'challenge',record);
    try{
      const response=await fetch('https://api.resend.com/emails',{
        method:'POST',headers:{'Authorization':'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({from:env.RESEND_FROM||"L'Atelier Heritage <onboarding@resend.dev>",to:[adminEmail],subject:'[SANDBOX] Mã đăng nhập quản trị L’Atelier Heritage',
          text:'Mã đăng nhập trang quản trị của bạn: '+code+'\n\nMã có hiệu lực trong 5 phút và chỉ sử dụng một lần. Nếu bạn không yêu cầu đăng nhập, hãy bỏ qua email này.\n\nL’Atelier Heritage · Sandbox preview'})
      });
      if(!response.ok)throw Error('Resend delivery rejected');
    }catch(e){
      // Invalidate only the challenge this request wrote, not a newer request's code.
      await bucket.put('studio-auth/challenge',JSON.stringify({...record,used:true,expiresAt:0}),{onlyIf:{etagMatches:challengeObject.etag}});
      console.error('Studio OTP email delivery failed',String(e));
      return fail('Cannot send the login code. Use your private access key or check Resend configuration.',503);
    }
    return otpJson({ok:true,message:'Login code request accepted.',expiresInSeconds:300});
  }
  const code=typeof body.code==='string'?body.code.trim():'';
  if(!/^\d{6}$/.test(code))return fail('Enter the six-digit email code.');
  const challengeObject=await bucket.get('studio-auth/challenge');
  const record=challengeObject?await challengeObject.json():null;
  if(!record||record.used||record.expiresAt<=now||record.attempts>=5)return fail('The code is invalid or expired. Request a new code.',401);
  const candidate=await mac(env.STUDIO_ADMIN_KEY,record.nonce+':'+code);
  // Conditional writes make the attempt counter and one-time redemption atomic.
  // Only one simultaneous verification can consume the same six-digit code.
  const matched=constantEqual(candidate,record.codeHash);
  const updated={...record,attempts:record.attempts+1,...(matched?{used:true}:{})};
  const saved=await bucket.put('studio-auth/challenge',JSON.stringify(updated),{onlyIf:{etagMatches:challengeObject.etag}});
  if(!saved)return fail('The code was already used or changed. Please try again.',409);
  if(!matched)return fail('Incorrect code. Please try again.',401);
  const token='st_'+tokenHex();
  await write(bucket,'sessions/'+await hash(token),{purpose:'studio-admin-otp',createdAt:now,expiresAt:now+8*3600000});
  return otpJson({ok:true,token,expiresInSeconds:8*3600});
}
