export async function onRequestGet({env}){
  return new Response(JSON.stringify({siteKey:env.TURNSTILE_SITE_KEY||null,ready:Boolean(env.TURNSTILE_SITE_KEY&&env.TURNSTILE_SECRET_KEY&&env.RESEND_API_KEY&&env.NOTIFICATION_EMAIL&&env.PORTRAIT_UPLOADS)}),{headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
}
