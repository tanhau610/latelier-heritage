/* ATELIER HAU — branded launcher for Tawk.to live chat */
(()=>{
  if(document.querySelector('#ah-help-launcher')) return;
  const root=document.createElement('div');
  root.className='ah-help';
  root.innerHTML='<button id="ah-help-launcher" class="ah-help-launcher" type="button" aria-label="Chat with ATELIER HAU"><span class="ah-help-dot"></span> Ask the studio <span aria-hidden="true">＋</span></button>';
  document.body.appendChild(root);
  const launcher=root.querySelector('#ah-help-launcher');
  const API=window.Tawk_API=window.Tawk_API||{};
  window.Tawk_LoadStart=new Date();
  let ready=false;
  const hideNativeLauncher=()=>{
    hideNativeLauncher();
  };
  API.onLoad=function(){
    ready=true;
    if(typeof API.hideWidget==='function') API.hideWidget();
  };
  API.onChatMaximized=function(){launcher.setAttribute('aria-expanded','true');};
  API.onChatMinimized=function(){launcher.setAttribute('aria-expanded','false');hideNativeLauncher();};
  API.onChatHidden=function(){launcher.setAttribute('aria-expanded','false');};
  API.onChatEnded=function(){launcher.setAttribute('aria-expanded','false');hideNativeLauncher();};
  launcher.setAttribute('aria-expanded','false');
  launcher.addEventListener('click',()=>{
    if(!ready || typeof API.maximize!=='function'){
      launcher.disabled=true;
      launcher.setAttribute('aria-busy','true');
      const original=launcher.innerHTML;
      launcher.textContent='Connecting to the studio…';
      setTimeout(()=>{launcher.disabled=false;launcher.removeAttribute('aria-busy');launcher.innerHTML=original;},1600);
      return;
    }
    if(typeof API.showWidget==='function') API.showWidget();
    API.maximize();
    launcher.setAttribute('aria-expanded','true');
  });
  const script=document.createElement('script');
  script.async=true;
  script.src='https://embed.tawk.to/6af083a868f8173c38bfc5de/1k6to4itt';
  script.charset='UTF-8';
  script.setAttribute('crossorigin','*');
  document.head.appendChild(script);
})();