/* ATELIER HAU — Tawk.to live chat on the approved Editorial V2 design. */
(()=>{
  if(document.getElementById('ah-help-launcher'))return;
  const root=document.createElement('div');
  root.className='ah-help';
  root.innerHTML='<button id="ah-help-launcher" class="ah-help-launcher" type="button" aria-label="Chat with ATELIER HAU" aria-expanded="false"><span class="ah-help-dot"></span> Ask the studio <span aria-hidden="true">＋</span></button>';
  document.body.appendChild(root);
  const launcher=root.querySelector('#ah-help-launcher');
  const API=window.Tawk_API=window.Tawk_API||{};
  window.Tawk_LoadStart=new Date();
  let loaded=false;
  API.onLoad=function(){loaded=true;if(typeof API.hideWidget==='function')API.hideWidget();};
  API.onChatMaximized=function(){launcher.setAttribute('aria-expanded','true');};
  API.onChatMinimized=function(){launcher.setAttribute('aria-expanded','false');if(typeof API.hideWidget==='function')API.hideWidget();};
  API.onChatHidden=function(){launcher.setAttribute('aria-expanded','false');};
  launcher.addEventListener('click',()=>{
    if(!loaded||typeof API.maximize!=='function'){
      launcher.setAttribute('aria-busy','true');
      const label=launcher.innerHTML;
      launcher.textContent='Connecting to the studio…';
      setTimeout(()=>{launcher.removeAttribute('aria-busy');launcher.innerHTML=label;},1800);
      return;
    }
    if(typeof API.showWidget==='function')API.showWidget();
    API.maximize();
    launcher.setAttribute('aria-expanded','true');
  });
  const script=document.createElement('script');
  script.async=true;
  script.src='https://embed.tawk.to/6af083a868f8173c38bfc5de/1k6to4itt';
  script.charset='UTF-8';
  script.setAttribute('crossorigin','*');
  script.onerror=()=>{launcher.title='Chat is temporarily unavailable. Please use the Contact page.';};
  document.head.appendChild(script);
})();