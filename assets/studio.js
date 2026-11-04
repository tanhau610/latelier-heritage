(() => {
  const $ = id => document.getElementById(id);
  const login = $("studio-login"), dashboard = $("studio-dashboard");
  const loginMessage = $("login-message"), message = $("studio-message");
  const list = $("order-list"), panel = $("detail-panel");
  const state = { key:"",orders:[],cursor:null,selected:null,images:[],loading:false };
  const labels = {New:"New request",Confirmed:"Confirmed",Painting:"In progress",Shipped:"Shipped",Completed:"Completed",Cancelled:"Cancelled"};
  const make = (tag,className,text) => {const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=String(text);return n;};
  const formatDate = iso => {const d=new Date(iso);return Number.isNaN(d.getTime())?"Unknown date":d.toLocaleString("en-AU",{dateStyle:"medium",timeStyle:"short"});};
  const money = amount => Number.isFinite(Number(amount))?"A$"+Number(amount).toLocaleString("en-AU"):"Not available";
  function revokeImages(){state.images.forEach(URL.revokeObjectURL);state.images=[];}
  function lock(){
    revokeImages();state.key="";state.orders=[];state.cursor=null;state.selected=null;
    dashboard.hidden=true;login.hidden=false;$("access-key").value="";$("access-key").focus();
  }
  async function api(action,{method="GET",body,cursor,id,index}={}){
    const url=new URL("/api/studio",location.origin);url.searchParams.set("action",action);
    if(cursor)url.searchParams.set("cursor",cursor);
    if(id)url.searchParams.set("id",id);
    if(index!==undefined)url.searchParams.set("index",String(index));
    const response=await fetch(url,{method,headers:{"Authorization":"Bearer "+state.key,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,cache:"no-store",credentials:"omit"});
    if(response.status===401){lock();throw Error("Access expired or incorrect. Please sign in again.");}
    if(action==="photo"&&response.ok)return response.blob();
    let result;try{result=await response.json();}catch{throw Error("Server returned an unexpected response.");}
    if(!response.ok||!result.ok)throw Error(result.message||"Request failed.");
    return result;
  }
  function showMessage(text){message.textContent=text||"";}
  async function load(reset=false){
    if(state.loading)return;state.loading=true;
    $("refresh").disabled=true;$("load-more").disabled=true;
    showMessage("Loading enquiries…");
    try{
      if(reset){state.cursor=null;state.orders=[];}
      const result=await api("list",{cursor:state.cursor});
      const known=new Set(state.orders.map(o=>o.id));
      for(const o of result.orders||[])if(!known.has(o.id))state.orders.push(o);
      state.orders.sort((a,b)=>String(b.receivedAt).localeCompare(String(a.receivedAt)));
      state.cursor=result.nextCursor||null;
      renderList();
      if(!state.selected&&state.orders.length)select(state.orders[0].id);
      else if(state.selected&&state.orders.some(o=>o.id===state.selected))select(state.selected);
      if(state.selected&&!state.orders.some(o=>o.id===state.selected)){state.selected=null;panel.replaceChildren(make("div","studio-empty","Select an enquiry to view its details."));}
      showMessage(state.orders.length?"Records are private. Reference photos load only after authentication.":"No portrait enquiries found yet.");
    }catch(e){showMessage(e.message);}
    finally{state.loading=false;$("refresh").disabled=false;$("load-more").disabled=false;}
  }
  function renderList(){
    const q=$("search").value.trim().toLowerCase(),status=$("status-filter").value;
    const visible=state.orders.filter(o=>(!status||o.status===status)&&(!q||[o.id,o.name,o.email,o.petName].some(v=>String(v||"").toLowerCase().includes(q))));
    list.replaceChildren();$("order-count").textContent=visible.length+" / "+state.orders.length;
    if(!visible.length)list.append(make("p","studio-list-empty","No matching enquiries."));
    for(const o of visible){
      const button=make("button","studio-order"+(state.selected===o.id?" selected":""),undefined);
      button.type="button";button.addEventListener("click",()=>select(o.id));
      const top=make("div","studio-order-top");top.append(make("strong","",o.petName||"Pet portrait"),make("span","studio-status status-"+o.status.toLowerCase(),labels[o.status]||o.status));
      button.append(top,make("div","studio-order-name",o.name||"Unnamed customer"),make("div","studio-order-meta",o.id+" · "+formatDate(o.receivedAt)),make("div","studio-order-price",money(o.payment?o.payment.totalCents/100:o.estimatedPriceAUD)),make("div","studio-order-meta",o.payment?.balance?"Both payments recorded":o.payment?.deposit?"Deposit recorded · balance due":o.payment?"Awaiting 50% deposit":"No agreed quote"));
      list.append(button);
    }
    $("load-more").hidden=!state.cursor;
  }
  function detailRow(parent,label,value){
    const row=make("div","studio-detail-row");row.append(make("dt","",label),make("dd","",value||"—"));parent.append(row);
  }
  function sectionHeading(text){return make("h3","studio-subheading",text);}
  async function select(id){
    const order=state.orders.find(o=>o.id===id);if(!order)return;
    state.selected=id;revokeImages();renderList();panel.replaceChildren();
    const head=make("div","studio-detail-head");
    const heading=make("div");heading.append(make("span","eyebrow","Portrait enquiry"),make("h2","",order.petName||"Pet portrait"),make("p","studio-reference",order.id));
    head.append(heading,make("span","studio-status status-"+order.status.toLowerCase(),labels[order.status]||order.status));panel.append(head);
    const info=make("dl","studio-details");
    detailRow(info,"Customer",order.name);detailRow(info,"Email",order.email);detailRow(info,"Received",formatDate(order.receivedAt));
    detailRow(info,"Canvas",order.size?order.size+" cm":"—");detailRow(info,"Pets",order.pets);detailRow(info,"Destination",order.country);
    detailRow(info,"Handwritten card",order.card?"Yes":"No");detailRow(info,"Estimated price",money(order.estimatedPriceAUD));
    panel.append(info);
    const emailLink=make("a","studio-email","Reply to customer");emailLink.href="mailto:"+encodeURIComponent(order.email||"");panel.append(emailLink);
    panel.append(sectionHeading("Customer’s story"));
    panel.append(make("p","studio-story",order.story||"No special requests."));
    panel.append(sectionHeading("Payment plan · 50 / 50"));
    const paymentBox=make("div","studio-payment");
    const payment=order.payment;
    const paymentNote=make("p","studio-footnote","Manual tracking only. This dashboard does NOT charge the customer or verify PayPal transactions automatically. Check the transaction in your own PayPal account before recording it.");
    paymentBox.append(paymentNote);
    const amountText=cents=>"A$"+(cents/100).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2});
    if(!payment){
      paymentBox.append(make("p","studio-story","No agreed quote yet. Confirm the final price with the customer before requesting a deposit."));
    }else{
      const summary=make("div","studio-payment-summary");
      summary.append(make("p","","Agreed total: "+amountText(payment.totalCents)),
        make("p","", "50% deposit: "+amountText(payment.depositCents)+" · "+(payment.deposit?(payment.deposit.sandbox?"Sandbox verified":"Verified manually"):"Awaiting payment")),
        make("p","", "50% balance: "+amountText(payment.balanceCents)+" · "+(payment.balance?(payment.balance.sandbox?"Sandbox verified":"Verified manually"):"Awaiting payment")));
      paymentBox.append(summary);
    }
    if(!payment?.deposit&&!payment?.balance&&!["Cancelled","Shipped","Completed"].includes(order.status)){
      const quoteForm=make("form","studio-payment-form");
      const quoteLabel=make("label","","Agreed total price (AUD)");
      const quoteInput=make("input");quoteInput.type="number";quoteInput.min="50";quoteInput.max="100000";quoteInput.step="1";quoteInput.required=true;quoteInput.value=String(payment?payment.totalCents/100:order.estimatedPriceAUD||"");
      quoteLabel.append(quoteInput);
      const quoteButton=make("button","btn outline",payment?"Update agreed price":"Confirm agreed price");quoteButton.type="submit";
      quoteForm.append(quoteLabel,quoteButton);paymentBox.append(quoteForm);
      quoteForm.addEventListener("submit",async e=>{
        e.preventDefault();quoteButton.disabled=true;
        try{
          const result=await api("payment-quote",{method:"POST",body:{id:order.id,totalAUD:Number(quoteInput.value)}});
          order.payment=result.payment;showMessage("Agreed price saved. No money has been charged.");select(order.id);
        }catch(error){showMessage(error.message);quoteButton.disabled=false;}
      });
    }
    if(payment&&!["Cancelled","Shipped","Completed"].includes(order.status)){
      const stage=!payment.deposit?"deposit":!payment.balance?"balance":null;
      if(stage){
        const due=stage==="deposit"?payment.depositCents:payment.balanceCents;
        paymentBox.append(make("p","studio-payment-due","Next: "+(stage==="deposit"?"50% deposit":"50% final balance")+" · "+amountText(due)));
        const sandboxNotice=make("p","studio-footnote","SANDBOX ONLY — this payment link uses test funds. Never send it to a real customer.");
        const sandboxButton=make("button","btn outline","Create Sandbox payment link");sandboxButton.type="button";
        const sandboxResult=make("div","studio-shipping-link");
        sandboxButton.addEventListener("click",async()=>{
          sandboxButton.disabled=true;sandboxResult.replaceChildren();
          try{
            const result=await api("payment-link",{method:"POST",body:{id:order.id,stage}});
            const field=make("textarea","studio-link-field");field.readOnly=true;field.rows=3;field.value=result.url;
            const copy=make("button","btn outline","Copy test link");copy.type="button";
            copy.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(result.url);copy.textContent="Copied!";}catch{field.select();showMessage("Copy the selected test link manually.");}});
            sandboxResult.append(make("p","studio-footnote","Sandbox test link. Creating another link invalidates this one. Expires "+formatDate(result.expiresAt)+"."),copy,field);
          }catch(e){showMessage(e.message);}
          finally{sandboxButton.disabled=false;}
        });
        paymentBox.append(sandboxNotice,sandboxButton,sandboxResult);
        const paymentForm=make("form","studio-payment-form");
        const refLabel=make("label","","PayPal transaction ID (from PayPal activity)");
        const refInput=make("input");refInput.type="text";refInput.minLength=6;refInput.maxLength=100;refInput.pattern="[A-Za-z0-9_-]{6,100}";refInput.required=true;refInput.placeholder="Transaction ID";refLabel.append(refInput);
        const verifyLabel=make("label","studio-payment-verify");
        const verifyCheck=make("input");verifyCheck.type="checkbox";verifyCheck.required=true;
        verifyLabel.append(verifyCheck,make("span","","I checked my PayPal account and verified this exact payment was received."));
        const saveButton=make("button","btn","Record verified "+(stage==="deposit"?"deposit":"balance"));saveButton.type="submit";
        paymentForm.append(refLabel,verifyLabel,saveButton);paymentBox.append(paymentForm);
        paymentForm.addEventListener("submit",async e=>{
          e.preventDefault();if(!verifyCheck.checked)return;saveButton.disabled=true;
          try{
            const result=await api("payment-record",{method:"POST",body:{id:order.id,stage,reference:refInput.value.trim(),verified:true}});
            order.payment=result.payment;showMessage("Manually verified "+stage+" recorded. This did not charge the customer.");select(order.id);
          }catch(error){showMessage(error.message);saveButton.disabled=false;}
        });
      }else paymentBox.append(make("p","studio-payment-paid","Both instalments recorded as manually verified. Confirm fulfilment and shipping separately."));
    }
    panel.append(paymentBox);
    panel.append(sectionHeading("Delivery address"));
    const shippingBox=make("div","studio-shipping");
    if(order.shipping){
      const sh=order.shipping;
      const address=[sh.fullName,sh.phone,sh.address1,sh.address2,sh.city,sh.region,sh.postalCode,sh.country].filter(Boolean).join("\n");
      shippingBox.append(make("p","studio-shipping-address",address));
      if(order.shippingUpdatedAt)shippingBox.append(make("p","studio-footnote","Customer updated "+formatDate(order.shippingUpdatedAt)));
    }else shippingBox.append(make("p","studio-story","No delivery address submitted yet."));
    const linkHelp=make("p","studio-footnote","Create a private link to request the customer’s delivery address. It expires in 14 days. Creating a new link cancels the previous one.");
    const linkButton=make("button","btn","Create shipping link");linkButton.type="button";
    const linkResult=make("div","studio-shipping-link");
    linkButton.addEventListener("click",async()=>{
      linkButton.disabled=true;linkButton.textContent="Creating…";linkResult.replaceChildren();
      try{
        const result=await api("shipping-link",{method:"POST",body:{id:order.id}});
        const label=make("p","studio-footnote","Private link created. Copy and email it to the customer. Expires "+formatDate(result.expiresAt)+".");
        const copy=make("button","btn outline","Copy private link");copy.type="button";
        copy.addEventListener("click",async()=>{
          try{await navigator.clipboard.writeText(result.url);copy.textContent="Copied!";}catch{showMessage("Clipboard unavailable. Select and copy the link from the box.");}
        });
        const field=make("textarea","studio-link-field");field.readOnly=true;field.rows=3;field.value=result.url;
        const mail=make("a","studio-email","Prepare email to customer");
        mail.href="mailto:"+encodeURIComponent(order.email||"")+"?subject="+encodeURIComponent("Delivery details for your L’Atelier Heritage portrait "+order.id)+"&body="+encodeURIComponent("Hello "+order.name+",\n\nPlease use this secure link to confirm the delivery address for your portrait:\n"+result.url+"\n\nThis link expires in 14 days.\n\nKind regards,\nL’Atelier Heritage");
        linkResult.append(label,copy,field,mail);
      }catch(e){showMessage(e.message);}
      finally{linkButton.disabled=false;linkButton.textContent="Create shipping link";}
    });
    shippingBox.append(linkHelp,linkButton,linkResult);
    panel.append(shippingBox);
    panel.append(sectionHeading("Reference photographs"));
    const gallery=make("div","studio-photo-grid");panel.append(gallery);
    if(!order.photos?.length)gallery.append(make("p","studio-story","No reference photographs."));
    for(const photo of order.photos||[]){
      const figure=make("figure","studio-photo");const holder=make("div","studio-photo-holder","Loading photo…");
      const caption=make("figcaption","",photo.name||"Reference photo");figure.append(holder,caption);gallery.append(figure);
      try{
        const blob=await api("photo",{id:order.id,index:photo.index});
        const url=URL.createObjectURL(blob);state.images.push(url);
        if(state.selected!==id){URL.revokeObjectURL(url);state.images=state.images.filter(x=>x!==url);return;}
        const a=make("a","studio-photo-link");a.href=url;a.target="_blank";a.rel="noopener noreferrer";a.title="Open private reference photograph";
        const img=make("img");img.src=url;img.alt="Reference photo: "+(photo.name||"Pet");img.loading="lazy";a.append(img);holder.replaceChildren(a);
      }catch(e){holder.textContent="Photo unavailable";if(!state.key)return;}
    }
    if(state.selected!==id)return;
    panel.append(sectionHeading("Production status"));
    const form=make("form","studio-update");
    const statusLabel=make("label","", "Status");const selectEl=make("select");selectEl.required=true;
    for(const value of Object.keys(labels)){const option=make("option","",labels[value]);option.value=value;option.selected=order.status===value;selectEl.append(option);}
    statusLabel.append(selectEl);
    const noteLabel=make("label","", "Private studio notes");const note=make("textarea");note.maxLength=1000;note.rows=3;note.placeholder="Materials, customer preferences, shipping follow-up…";note.value=order.internalNote||"";noteLabel.append(note);
    const button=make("button","btn","Save progress");button.type="submit";
    form.append(statusLabel,noteLabel,button);panel.append(form);
    if(order.updatedAt)panel.append(make("p","studio-footnote","Last updated "+formatDate(order.updatedAt)));
    form.addEventListener("submit",async event=>{
      event.preventDefault();button.disabled=true;button.textContent="Saving…";
      try{
        const result=await api("status",{method:"POST",body:{id:order.id,status:selectEl.value,internalNote:note.value}});
        order.status=selectEl.value;order.internalNote=note.value;order.updatedAt=result.updatedAt;
        showMessage("Saved progress for "+order.id+".");renderList();
        const badge=head.querySelector(".studio-status");badge.className="studio-status status-"+order.status.toLowerCase();badge.textContent=labels[order.status];
      }catch(e){showMessage(e.message);}
      finally{button.disabled=false;button.textContent="Save progress";}
    });
  }
  $("login-form").addEventListener("submit",async e=>{
    e.preventDefault();state.key=$("access-key").value;$("access-key").value="";
    loginMessage.textContent="Checking secure access…";
    try{
      const result=await api("list");
      state.orders=result.orders||[];state.cursor=result.nextCursor||null;
      login.hidden=true;dashboard.hidden=false;loginMessage.textContent="";
      renderList();if(state.orders.length)select(state.orders[0].id);
      showMessage(state.orders.length?"Studio unlocked.":"Studio unlocked. No orders yet.");
    }catch(error){state.key="";loginMessage.textContent=error.message;}
  });
  $("logout").addEventListener("click",()=>{lock();loginMessage.textContent="Studio locked.";});
  $("refresh").addEventListener("click",()=>load(true));
  $("load-more").addEventListener("click",()=>load(false));
  $("search").addEventListener("input",renderList);
  $("status-filter").addEventListener("change",renderList);
})();
