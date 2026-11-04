(() => {
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.hash.slice(1));
const id=params.get("id"),token=params.get("token");
const message=$("payment-message");
if(!/^LH-\d{8}-[A-F0-9]{8}$/.test(id||"")||!/^[a-f0-9]{64}$/.test(token||"")){
  message.textContent="This page requires a private payment link from the studio.";return;
}
async function api(action,extra={}){
  const response=await fetch("/api/payment",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({action,id,...extra}),credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer"});
  const result=await response.json().catch(()=>({ok:false,message:"Unexpected response from the studio."}));
  if(!response.ok||!result.ok)throw Error(result.message||"Payment request failed.");
  return result;
}
function loadSDK(clientId){
  return new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src="https://www.paypal.com/sdk/js?client-id="+encodeURIComponent(clientId)+"&currency=AUD&intent=capture";
    script.async=true;script.onload=resolve;script.onerror=()=>reject(Error("PayPal checkout could not be loaded."));
    document.head.append(script);
  });
}
async function start(){
  try{
    const data=await api("view");
    $("payment-reference").textContent="Order "+data.id+" · "+data.petName;
    $("payment-stage").textContent=data.stage==="deposit"?"50% deposit":"50% final balance";
    $("payment-amount").textContent="A$"+data.amount+" AUD";
    if(data.paid){message.textContent="This instalment has already been paid in the Sandbox. Thank you.";return;}
    message.textContent="Use a PayPal Sandbox buyer account to test. This checkout does not move real money.";
    await loadSDK(data.clientId);
    if(!window.paypal?.Buttons)throw Error("PayPal checkout is unavailable.");
    window.paypal.Buttons({
      createOrder:async()=>{message.textContent="Creating a secure Sandbox order…";const result=await api("create");message.textContent="Please complete your test payment in PayPal.";return result.orderID;},
      onApprove:async data=>{message.textContent="Verifying payment with PayPal Sandbox…";const result=await api("capture",{orderID:data.orderID});if(result.paid){$("paypal-buttons").replaceChildren();message.textContent="✓ Sandbox test payment completed and verified. The studio dashboard will show the test result after Refresh.";}},
      onCancel:()=>{message.textContent="Test checkout cancelled. No payment recorded.";},
      onError:()=>{message.textContent="PayPal checkout could not be completed. Please try again or contact the studio.";}
    }).render("#paypal-buttons");
  }catch(e){message.textContent=e.message;}
}
start();
})();