/* ATELIER HAU — one discreet live-chat entry point, no duplicate Tawk launcher. */
(()=>{
  if(document.getElementById('ah-help-launcher'))return;
  const root=document.createElement('div');
  root.className='ah-help';
  root.innerHTML='<div class="ah-help-greeting" id="ah-help-greeting" role="status">Questions about a portrait? We’re here to help.</div><button id="ah-help-launcher" class="ah-help-launcher" type="button" aria-label="Chat with ATELIER HAU" aria-expanded="false"><span class="ah-help-dot"></span> Ask the studio <span aria-hidden="true">＋</span></button>';
  document.body.appendChild(root);
  const launcher=root.querySelector('#ah-help-launcher');
  const greeting=root.querySelector('#ah-help-greeting');
  const API=window.Tawk_API=window.Tawk_API||{};
  window.Tawk_LoadStart=new Date();
  let loaded=false, opening=false;
  const hideNative=()=>{if(typeof API.hideWidget==='function')API.hideWidget();};
  const setClosed=()=>{opening=false;launcher.setAttribute('aria-expanded','false');root.classList.remove('is-chat-open');hideNative();};
  API.onLoad=function(){loaded=true;hideNative();};
  API.onChatMaximized=function(){opening=false;launcher.setAttribute('aria-expanded','true');root.classList.add('is-chat-open');};
  API.onChatMinimized=setClosed;
  API.onChatHidden=function(){opening=false;launcher.setAttribute('aria-expanded','false');root.classList.remove('is-chat-open');};
  launcher.addEventListener('click',()=>{
    if(opening)return;
    if(!loaded||typeof API.maximize!=='function'){
      launcher.setAttribute('aria-busy','true');
      const label=launcher.innerHTML;
      launcher.textContent='Connecting to the studio…';
      setTimeout(()=>{launcher.removeAttribute('aria-busy');launcher.innerHTML=label;},1800);
      return;
    }
    opening=true;
    greeting.hidden=true;
    if(typeof API.showWidget==='function')API.showWidget();
    API.maximize();
    launcher.setAttribute('aria-expanded','true');
    root.classList.add('is-chat-open');
    setTimeout(()=>{opening=false;},1000);
  });
  const script=document.createElement('script');
  script.async=true;
  script.src='https://embed.tawk.to/6af083a868f8173c38bfc5de/1k6to4itt';
  script.charset='UTF-8';
  script.setAttribute('crossorigin','*');
  script.onerror=()=>{launcher.title='Chat is temporarily unavailable. Please use the Contact page.';};
  document.head.appendChild(script);
})();