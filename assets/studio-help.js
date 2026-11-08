/* ATELIER HAU — branded studio concierge; Tawk.to handles live messages. */
(()=>{
  if(document.getElementById('ah-help-launcher'))return;
  const css=`
  .ah-concierge{--ah-wine:#69383e;--ah-cream:#f7f2ea;--ah-ink:#302824;position:fixed;right:22px;bottom:22px;z-index:2147482000;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:var(--ah-ink)}
  .ah-help-launcher{border:1px solid #815459;border-radius:30px;background:var(--ah-wine);color:#fff;padding:14px 19px;display:flex;align-items:center;gap:11px;cursor:pointer;box-shadow:0 10px 30px #38212226;font-size:12px;letter-spacing:.025em}
  .ah-help-launcher:hover,.ah-help-launcher:focus-visible{background:#512a30;transform:translateY(-2px)}
  .ah-help-dot{width:7px;height:7px;background:#d6bd89;border-radius:50%;display:inline-block}
  .ah-help-panel{position:absolute;bottom:65px;right:0;width:min(365px,calc(100vw - 28px));max-height:min(690px,calc(100dvh - 110px));display:flex;flex-direction:column;background:var(--ah-cream);border:1px solid #d9cbc0;border-radius:17px;box-shadow:0 20px 65px #2719163d;overflow:hidden}
  .ah-help-panel[hidden]{display:none!important}
  .ah-help-head{background:var(--ah-wine);color:#fff;padding:22px 22px 20px;position:relative}
  .ah-help-kicker{font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:#e8cfb3;margin-bottom:13px}
  .ah-help-head h2{font-family:Georgia,serif;font-weight:400;font-size:29px;line-height:1.08;margin:0 30px 8px 0;color:#fff}
  .ah-help-head p{font-size:12px;line-height:1.6;color:#f1dedb;margin:0;max-width:280px}
  .ah-help-close{position:absolute;right:15px;top:14px;color:#fff;background:transparent;border:0;font-size:23px;cursor:pointer;padding:5px 9px}
  .ah-help-body{padding:16px;overflow:auto;overscroll-behavior:contain}
  .ah-help-card{background:#fff;border:1px solid #eee5db;border-radius:11px;padding:16px;margin-bottom:12px}
  .ah-help-card strong{font-family:Georgia,serif;font-size:18px;font-weight:400;color:var(--ah-wine)}
  .ah-help-card p{font-size:12px;line-height:1.6;color:#665b54;margin:8px 0 14px}
  .ah-help-chat{display:flex;align-items:center;justify-content:center;gap:9px;background:var(--ah-wine);color:#fff;border:1px solid var(--ah-wine);border-radius:7px;padding:12px 10px;width:100%;font-size:12px;cursor:pointer}
  .ah-help-chat:hover{background:#4f292e}
  .ah-help-quick{display:grid;gap:0;margin-top:12px}
  .ah-help-quick a,.ah-help-faq summary{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #eee5db;color:#493b35;text-decoration:none;font-size:12px;cursor:pointer}
  .ah-help-quick a:hover{color:var(--ah-wine)}
  .ah-help-faq summary{list-style:none}.ah-help-faq summary::-webkit-details-marker{display:none}
  .ah-help-faq p{font-size:12px;line-height:1.65;margin:9px 0;color:#665b54}
  .ah-help-footer{text-align:center;font-size:9px;letter-spacing:.1em;color:#8c7468;padding:2px 0 5px}
  @media(max-width:520px){.ah-concierge{right:12px;bottom:12px}.ah-help-panel{bottom:60px;max-height:calc(100dvh - 90px)}.ah-help-launcher{padding:13px 15px}}
  @media(prefers-reduced-motion:no-preference){.ah-help-panel:not([hidden]){animation:ah-concierge-in .2s ease-out}@keyframes ah-concierge-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}}
  `;
  const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
  const root=document.createElement('div');root.className='ah-concierge';
  root.innerHTML=`<section id="ah-help-panel" class="ah-help-panel" role="dialog" aria-label="ATELIER HAU studio assistance" hidden>
    <div class="ah-help-head"><div class="ah-help-kicker">ATELIER HAU · STUDIO CONCIERGE</div><button type="button" class="ah-help-close" aria-label="Close studio assistance">×</button><h2>How can we help?</h2><p>We're here to help you create something meaningful.</p></div>
    <div class="ah-help-body"><div class="ah-help-card"><strong>Welcome to our atelier.</strong><p>Questions about a portrait, pricing or delivery? We'd love to hear from you.</p><button type="button" class="ah-help-chat">✧ &nbsp; Start a conversation <span aria-hidden="true">↗</span></button></div>
    <div class="ah-help-card"><strong>Explore the studio</strong><nav class="ah-help-quick" aria-label="Studio assistance links">
    <a href="commission.html">Commission a portrait <span aria-hidden="true">↗</span></a>
    <a href="pricing.html">Sizes &amp; pricing <span aria-hidden="true">↗</span></a>
    <a href="process.html">Our painting process <span aria-hidden="true">↗</span></a>
    <a href="contact.html">Contact the studio <span aria-hidden="true">↗</span></a></nav></div>
    <div class="ah-help-card"><strong>Quick answers</strong>
    <details class="ah-help-faq"><summary>Can I order from my own photo? <span>+</span></summary><p>Yes. We create original oil paintings from your photographs.</p></details>
    <details class="ah-help-faq"><summary>Do you ship internationally? <span>+</span></summary><p>We welcome international enquiries. Delivery availability and any import charges are confirmed for your destination.</p></details>
    <details class="ah-help-faq"><summary>Can I see prices before ordering? <span>+</span></summary><p>Yes. Visit Sizes &amp; Pricing or the commission page to explore options.</p></details></div>
    <div class="ah-help-footer">ORIGINAL OIL PORTRAITS · MADE WITH CARE</div></div></section>
    <button id="ah-help-launcher" class="ah-help-launcher" type="button" aria-controls="ah-help-panel" aria-expanded="false"><span class="ah-help-dot"></span> Ask the studio <span aria-hidden="true">＋</span></button>`;
  document.body.appendChild(root);
  const launcher=root.querySelector('#ah-help-launcher'),panel=root.querySelector('#ah-help-panel'),close=root.querySelector('.ah-help-close'),chat=root.querySelector('.ah-help-chat');
  function setOpen(open){panel.hidden=!open;launcher.setAttribute('aria-expanded',String(open));if(open)close.focus();else launcher.focus();}
  launcher.addEventListener('click',()=>setOpen(panel.hidden));
  close.addEventListener('click',()=>setOpen(false));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden)setOpen(false)});
  document.addEventListener('pointerdown',e=>{if(!panel.hidden&&!root.contains(e.target))setOpen(false)});
  const api=window.Tawk_API=window.Tawk_API||{};
  window.Tawk_LoadStart=new Date();
  let ready=false,pending=false;
  api.onLoad=function(){ready=true;if(typeof api.hideWidget==='function')api.hideWidget();if(pending)openLiveChat()};
  function openLiveChat(){if(!ready||typeof api.maximize!=='function')return;pending=false;chat.disabled=false;chat.textContent='✧   Start a conversation ↗';panel.hidden=true;launcher.setAttribute('aria-expanded','false');if(typeof api.showWidget==='function')api.showWidget();api.maximize();}
  chat.addEventListener('click',()=>{if(ready)openLiveChat();else{pending=true;chat.disabled=true;chat.textContent='Connecting to the studio…';}});
  const script=document.createElement('script');script.async=true;script.src='https://embed.tawk.to/6af083a868f8173c38bfc5de/1k6to4itt';script.charset='UTF-8';script.setAttribute('crossorigin','*');document.head.appendChild(script);
})();