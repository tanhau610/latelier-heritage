(() => {
"use strict";
const $=id=>document.getElementById(id);
const form=$("checkout-form"),message=$("checkout-message"),button=$("submit-order"),panel=$("payment-panel");
const prices={"20x25":[229,299],"30x40":[379,469],"40x50":[499,599],"50x70":[699,829]};
const money=n=>"A$"+Number(n).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2});
const params=new URLSearchParams(location.hash.slice(1));
let id=params.get("id"),token=params.get("token"),sdk=null,turnstileStarted=false;
const stages=[...document.querySelectorAll("[data-checkout-step]")];
function goTo(step,{scroll=true}={}){
  stages.forEach(el=>{el.hidden=Number(el.dataset.checkoutStep)!==step;});
  document.querySelectorAll("[data-progress]").forEach(el=>{
    const number=Number(el.dataset.progress);
    el.classList.toggle("is-active",number===step);
    el.classList.toggle("is-complete",number<step);
    if(number===step)el.setAttribute("aria-current","step");
    else el.removeAttribute("aria-current");
  });
  if(step===3&&!turnstileStarted&&!id){turnstileStarted=true;setupTurnstile();}
  if(scroll)document.querySelector(".checkout-progress").scrollIntoView({behavior:"smooth",block:"start"});
}
function validateStep(step){
  const stage=stages.find(el=>Number(el.dataset.checkoutStep)===step);
  if(!stage)return false;
  const fields=[...stage.querySelectorAll("input,select,textarea")].filter(el=>!el.disabled&&el.type!=="hidden");
  const invalid=fields.find(el=>!el.checkValidity());
  if(invalid){
    goTo(step,{scroll:false});
    invalid.reportValidity();
    invalid.focus();
    return false;
  }
  if(step===1){
    const files=[...$("photos").files];
    const bad=files.length<1||files.length>5||files.some(f=>f.size>8*1024*1024||!["image/jpeg","image/png","image/webp"].includes(f.type))||files.reduce((s,f)=>s+f.size,0)>20*1024*1024;
    if(bad){
      $("photo-feedback").textContent="Please choose 1–5 JPG, PNG or WEBP photos (8 MB each, 20 MB total).";
      goTo(1,{scroll:false});$("photos").focus();return false;
    }
    $("photo-feedback").textContent="";
  }
  return true;
}
document.querySelectorAll("[data-next]").forEach(btn=>btn.addEventListener("click",()=>{
  const step=Number(btn.closest("[data-checkout-step]").dataset.checkoutStep);
  if(validateStep(step))goTo(Number(btn.dataset.next));
}));
document.querySelectorAll("[data-back]").forEach(btn=>btn.addEventListener("click",()=>goTo(Number(btn.dataset.back))));
function price(){
  const size=form.elements.size.value,pets=Number(form.elements.pets.value),card=form.elements.card.checked;
  const artwork=prices[size][pets===1?0:1]+Math.max(0,pets-2)*(size==="50x70"?100:80);
  const total=artwork+(card?15:0),deposit=total/2;
  $("summary-details").textContent=size.replace("x"," × ")+" cm · "+pets+(pets===1?" pet":" pets");
  $("summary-artwork").textContent=money(artwork);
  $("summary-card").textContent=money(card?15:0);
  $("summary-total").textContent=money(total);
  $("summary-due").textContent=money(form.elements.paymentPlan.value==="deposit"?deposit:total);
  $("deposit-choice").textContent=money(deposit);
  $("full-choice").textContent=money(total);
}
form.addEventListener("change",price);price();
$("photos").addEventListener("change",()=>{
  const preview=$("photo-preview");preview.replaceChildren();
  const files=Array.from($("photos").files);
  if(files.length>5||files.some(f=>f.size>8*1024*1024||!["image/jpeg","image/png","image/webp"].includes(f.type))||files.reduce((s,f)=>s+f.size,0)>20*1024*1024){
    $("photo-feedback").textContent="Choose 1–5 JPG, PNG or WEBP photos, under 8 MB each and 20 MB total.";
    $("photos").value="";return;
  }
  $("photo-feedback").textContent=files.length?files.length+" photo(s) ready for upload.":"Please add reference photos.";
  files.forEach(f=>{
    const img=document.createElement("img"),url=URL.createObjectURL(f);
    img.src=url;img.alt="Selected reference photo";img.onload=()=>URL.revokeObjectURL(url);preview.append(img);
  });
});
async function api(action,extra={}){
  const response=await fetch("/api/checkout",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({id,action,...extra}),credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer"});
  const result=await response.json().catch(()=>({ok:false,message:"Unexpected server response."}));
  if(!response.ok||!result.ok)throw Error(result.message||"Sandbox checkout request failed.");
  return result;
}
async function loadSDK(clientId){
  if(sdk)return sdk;
  sdk=new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src="https://www.paypal.com/sdk/js?client-id="+encodeURIComponent(clientId)+"&currency=AUD&intent=capture";
    script.async=true;
    script.onload=()=>resolve(window.paypal);
    script.onerror=()=>reject(Error("PayPal Sandbox checkout could not load."));
    document.head.append(script);
  });
  return sdk;
}
async function showPayment(){
  document.body.classList.add("is-paying");
  form.hidden=false;stages.forEach(el=>{el.hidden=true;});panel.hidden=false;
  document.querySelectorAll("[data-progress]").forEach(el=>{
    const number=Number(el.dataset.progress);
    el.classList.toggle("is-active",number===3);el.classList.toggle("is-complete",number<3);
    if(number===3)el.setAttribute("aria-current","step");else el.removeAttribute("aria-current");
  });
  panel.scrollIntoView({behavior:"smooth",block:"start"});
  const msg=$("payment-message"),buttons=$("paypal-buttons");buttons.replaceChildren();
  msg.textContent="Loading your secure Sandbox checkout…";
  try{
    const data=await api("view");
    $("summary-details").textContent="Saved order "+data.id+" · "+data.petName;
    $("summary-total").textContent=money(data.total);
    $("summary-due").textContent=money(data.amount);
    $("payment-reference").textContent="Order "+data.id+" · "+data.petName;
    $("payment-amount").textContent=money(data.amount);
    const stages={deposit:"50% deposit",full:"Full payment (100%)",balance:"Remaining 50% balance",waiting:"Deposit received",complete:"Sandbox payment complete"};
    $("payment-stage").textContent=stages[data.stage]||"Order payment";
    if(data.stage==="waiting"){
      $("payment-amount").textContent="A$0.00 due today";
      msg.textContent="✓ Your 50% Sandbox deposit was verified. We will notify you when your portrait is ready; the remaining "+money(data.remaining)+" can then be paid here.";
      return;
    }
    if(data.stage==="complete"){
      $("payment-amount").textContent="✓ Test payment verified";
      msg.textContent="Thank you. This Sandbox order is marked paid for testing only. No real money was transferred.";
      return;
    }
    if(!["deposit","balance","full"].includes(data.stage))throw Error("This order is not ready for payment.");
    msg.textContent="This is a PayPal Sandbox test. Sign in with a Sandbox buyer account. No real money will move.";
    const paypal=await loadSDK(data.clientId);
    if(!paypal?.Buttons)throw Error("PayPal Buttons are unavailable.");
    await paypal.Buttons({
      createOrder:async()=>{
        msg.textContent="Creating a secure Sandbox payment…";
        const result=await api("create");
        msg.textContent="Please approve your test payment in PayPal.";
        return result.orderID;
      },
      onApprove:async result=>{
        msg.textContent="Verifying your Sandbox payment with PayPal…";
        try{
          await api("capture",{orderID:result.orderID});
          msg.textContent="✓ Sandbox payment verified.";
          await showPayment();
        }catch(e){msg.textContent=e.message+" If you approved a payment, contact the studio before trying again.";}
      },
      onCancel:()=>{msg.textContent="Sandbox checkout cancelled. Your order is saved; you can retry here.";},
      onError:()=>{msg.textContent="PayPal Sandbox checkout could not complete. Please retry or contact the studio.";}
    }).render("#paypal-buttons");
  }catch(e){msg.textContent=e.message;}
}
async function setupTurnstile(){
  try{
    const r=await fetch("/api/enquiry-config",{cache:"no-store"});
    const data=await r.json();
    if(!r.ok||!data.siteKey)throw Error("Turnstile is not configured.");
    const script=document.createElement("script");
    script.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async=true;
    script.onload=()=>{
      if(window.turnstile)window.turnstile.render(form.querySelector(".turnstile-mount"),{sitekey:data.siteKey});
    };
    script.onerror=()=>{message.textContent="Security check is unavailable. Please refresh.";button.disabled=true;};
    document.head.append(script);
  }catch(e){message.textContent="Checkout is not configured for this preview. Please contact the studio.";button.disabled=true;}
}
form.addEventListener("submit",async e=>{
  e.preventDefault();
  for(const step of [1,2,3])if(!validateStep(step))return;
  button.disabled=true;button.textContent="Saving your order…";
  message.textContent="Uploading your photos and saving your delivery details securely…";
  try{
    const data=new FormData(form);
    data.set("card",form.elements.card.checked?"yes":"no");
    const response=await fetch("/api/checkout",{method:"POST",body:data,credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer"});
    const result=await response.json().catch(()=>({ok:false,message:"Unexpected server response."}));
    if(!response.ok||!result.ok)throw Error(result.message||"Could not save your order.");
    if(!/^LH-\d{8}-[A-F0-9]{8}$/.test(result.id||"")||!/^[a-f0-9]{64}$/.test(result.token||""))throw Error("Checkout session was not created.");
    id=result.id;token=result.token;
    history.replaceState(null,"",location.pathname+"#"+new URLSearchParams({id,token}).toString());
    await showPayment();
  }catch(e){
    message.textContent=e.message;
    if(window.turnstile)try{window.turnstile.reset(form.querySelector(".turnstile-mount"));}catch{}
  }finally{button.disabled=false;button.textContent="Continue to secure Sandbox payment";}
});
if(/^LH-\d{8}-[A-F0-9]{8}$/.test(id||"")&&/^[a-f0-9]{64}$/.test(token||""))showPayment();
else goTo(1,{scroll:false});
})();