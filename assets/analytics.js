/* ATELIER HAU analytics: no tracking is activated without a valid, owner-supplied GA4 ID.
   No names, email addresses, photos, order IDs or checkout URLs are sent as event parameters. */
(()=>{
 // Enter the owner-controlled GA4 Measurement ID once (example format: G-XXXXXXXXXX).
 const id="G-K3D6GVK0R0".trim();
 if(!/^G-[A-Z0-9]{6,16}$/.test(id))return;
 if(window.__atelierAnalyticsReady)return;
 window.__atelierAnalyticsReady=true;
 window.dataLayer=window.dataLayer||[];
 window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};
 window.gtag("js",new Date());
 window.gtag("config",id,{send_page_view:true,allow_google_signals:false});
 const tag=document.createElement("script");
 tag.async=true;tag.src="https://www.googletagmanager.com/gtag/js?id="+encodeURIComponent(id);
 document.head.appendChild(tag);
 const emit=(name,params={})=>window.gtag("event",name,params);
 document.addEventListener("click",event=>{
  const link=event.target.closest("a[href]");
  if(!link)return;
  const href=link.getAttribute("href")||"";
  if(/^mailto:hello@atelierhau\.com$/i.test(href))emit("contact_click",{contact_method:"email"});
  else if(/(?:^|\/)commission\.html(?:[?#]|$)/i.test(href))emit("commission_cta_click",{source_page:location.pathname.replace(/[^a-zA-Z0-9/_-]/g,"").slice(0,80)});
  else if(/(?:^|\/)pricing\.html(?:[?#]|$)/i.test(href))emit("pricing_link_click");
 });
 document.addEventListener("play",event=>{
  if(event.target?.id==="atelier-film-video")emit("studio_video_play");
 },true);
})();
