(() => {
  const $ = id => document.getElementById(id);
  const message = $("shipping-message");
  const form = $("shipping-form");
  const button = $("save-shipping");
  const success = $("shipping-success");
  const editButton = $("edit-shipping");
  const params = new URLSearchParams(location.hash.slice(1));
  const id = params.get("id"), token = params.get("token");
  const fields = ["fullName","phone","address1","address2","city","region","postalCode"];
  let editable = false;

  function showConfirmation(){
    $("saved-order-reference").textContent = id;
    form.hidden = true;
    message.hidden = true;
    success.hidden = false;
    success.focus({preventScroll:true});
    success.scrollIntoView({behavior:"smooth",block:"center"});
  }
  function showForm(){
    success.hidden = true;
    form.hidden = false;
    message.hidden = true;
    form.scrollIntoView({behavior:"smooth",block:"start"});
  }
  editButton.addEventListener("click",()=>{
    if(editable)showForm();
  });

  if(!/^LH-\d{8}-[A-F0-9]{8}$/.test(id||"") || !/^[0-9a-f]{64}$/.test(token||"")){
    message.textContent = "This page requires a private shipping link from the studio. Please check your email or contact us.";
    return;
  }

  async function request(action,details={}){
    const response = await fetch("/api/shipping",{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
      body:JSON.stringify({action,id,...details}),
      credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer"
    });
    const result = await response.json().catch(()=>({ok:false,message:"Unexpected server response."}));
    if(!response.ok || !result.ok)throw Error(result.message||"Could not save your details.");
    return result;
  }

  async function start(){
    try{
      const result = await request("view");
      $("order-reference").textContent = result.id;
      $("order-pet").textContent = result.petName;
      $("shipping-country").value = result.country;
      for(const name of fields)form.elements[name].value = result.shipping?.[name]||"";
      editable = result.editable;
      if(!editable){
        form.hidden = false;
        button.disabled = true;
        message.textContent = "This order is already in its final stage. Please contact the studio if your delivery address needs to change.";
      }else if(result.shipping){
        showConfirmation();
      }else{
        form.hidden = false;
        message.textContent = "Please enter your delivery details below.";
      }
    }catch(e){message.textContent = e.message;}
  }

  form.addEventListener("submit",async event=>{
    event.preventDefault();
    if(!form.reportValidity())return;
    const details = Object.fromEntries(fields.map(name=>[name,form.elements[name].value.trim()]));
    button.disabled = true;
    button.textContent = "Saving…";
    message.hidden = false;
    message.textContent = "Saving your address securely…";
    try{
      await request("save",details);
      button.textContent = "Save delivery details";
      showConfirmation();
    }catch(e){
      message.textContent = e.message;
      button.textContent = "Save delivery details";
    }finally{
      button.disabled = false;
    }
  });
  start();
})();