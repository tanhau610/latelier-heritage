(() => {
  const $ = id => document.getElementById(id);
  const login = $("studio-login"), dashboard = $("studio-dashboard");
  const loginMessage = $("login-message"), message = $("studio-message");
  const list = $("order-list"), panel = $("detail-panel");
  const state = { key:"",orders:[],cursor:null,selected:null,images:[],loading:false };
  let selectionVersion=0;
  const labels = {New:"New request",Confirmed:"Confirmed",Painting:"In progress","Ready for balance":"Ready for balance",Shipped:"Shipped",Completed:"Completed",Cancelled:"Cancelled"};
  const make = (tag,className,text) => {const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=String(text);return n;};
  const formatDate = iso => {const d=new Date(iso);return Number.isNaN(d.getTime())?"Unknown date":d.toLocaleString("en-AU",{dateStyle:"medium",timeStyle:"short"});};
  const money = amount => Number.isFinite(Number(amount))?"A$"+Number(amount).toLocaleString("en-AU"):"Not available";
  function revokeImages(){state.images.forEach(URL.revokeObjectURL);state.images=[];}
  function lock(){
    document.body.classList.remove("studio-unlocked");
    selectionVersion++;revokeImages();state.key="";state.orders=[];state.cursor=null;state.selected=null;
    dashboard.hidden=true;login.hidden=false;$("access-key").value="";$("access-key").focus();
  }
  async function api(action,{method="GET",body,cursor,id,index,days}={}){
    const url=new URL("/api/studio",location.origin);url.searchParams.set("action",action);
    if(cursor)url.searchParams.set("cursor",cursor);
    if(days)url.searchParams.set("days",String(days));
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
      if(reset)void loadAnalytics();
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
    $("sidebar-order-count").textContent=String(state.orders.length);
    renderRecent();
    for(const o of visible){
      const button=make("button","studio-order"+(state.selected===o.id?" selected":""),undefined);
      button.type="button";button.addEventListener("click",()=>select(o.id));
      const top=make("div","studio-order-top");top.append(make("strong","",o.petName||"Pet portrait"),make("span","studio-status status-"+o.status.toLowerCase(),labels[o.status]||o.status));
      button.append(top,make("div","studio-order-name",o.name||"Unnamed customer"),make("div","studio-order-meta",o.id+" · "+formatDate(o.receivedAt)),make("div","studio-order-price",money(o.payment?o.payment.totalCents/100:o.estimatedPriceAUD)),make("div","studio-order-meta",o.checkoutMode==="sandbox-inline"?(o.sandboxPayment?.full?"Sandbox: paid 100%":o.sandboxPayment?.balance?"Sandbox: paid in full":o.sandboxPayment?.deposit?"Sandbox: deposit paid": "Sandbox: awaiting payment"):(o.payment?.balance?"Both payments recorded":o.payment?.deposit?"Deposit recorded · balance due":o.payment?"Awaiting 50% deposit":"No agreed quote")));
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
    const currentVersion=++selectionVersion;
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
    panel.append(sectionHeading(order.checkoutMode==="sandbox-inline"?"Sandbox checkout · "+(order.checkoutPlan==="full"?"100%":"50 / 50"):"Payment plan · 50 / 50"));
    const paymentBox=make("div","studio-payment");
    const payment=order.payment;
    const paymentNote=make("p","studio-footnote","Manual tracking only. This dashboard does NOT charge the customer or verify PayPal transactions automatically. Check the transaction in your own PayPal account before recording it.");
    if(order.checkoutMode!=="sandbox-inline")paymentBox.append(paymentNote);
    const amountText=cents=>"A$"+(cents/100).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2});
    if(order.checkoutMode==="sandbox-inline"){
      const sandbox=order.sandboxPayment;
      paymentBox.append(make("p","studio-footnote","SANDBOX ONLY — this test has not moved real money. Customers pay on their checkout page."));
      if(payment)paymentBox.append(make("p","studio-payment-due","Order total: "+amountText(payment.totalCents)));
      paymentBox.append(make("p","studio-payment-due",sandbox?.full?"✓ 100% Sandbox payment verified":sandbox?.balance?"✓ Deposit and balance verified":sandbox?.deposit?"✓ 50% Sandbox deposit verified · awaiting final balance": "Awaiting Sandbox payment"));
      if(sandbox?.deposit&&!sandbox?.balance&&order.status!=="Ready for balance")paymentBox.append(make("p","studio-story","When the portrait is finished, change the order status to Ready for balance. The customer can then pay the remaining 50% using their saved private checkout page."));
      if(order.checkoutPlan==="full")paymentBox.append(make("p","studio-footnote","Customer selected full payment at checkout."));
    }else{
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
    if(payment&&!["Cancelled","Shipped","Completed"].includes(order.status)){
      const sandbox=order.sandboxPayment;
      const sandboxStage=!sandbox?.deposit?"deposit":!sandbox?.balance?"balance":null;
      const sandboxNotice=make("p","studio-footnote","SANDBOX TEST ONLY — no real money. Test records are stored separately and never count as customer payments.");
      paymentBox.append(sandboxNotice);
      paymentBox.append(make("p","studio-payment-due","Sandbox status: "+(sandbox?.deposit?"deposit tested":"deposit not tested")+" · "+(sandbox?.balance?"balance tested":"balance not tested")));
      if(sandboxStage){
        const sandboxButton=make("button","btn outline","Create Sandbox "+sandboxStage+" payment link");sandboxButton.type="button";
        const sandboxResult=make("div","studio-shipping-link");
        sandboxButton.addEventListener("click",async()=>{
          sandboxButton.disabled=true;sandboxResult.replaceChildren();
          try{
            const result=await api("payment-link",{method:"POST",body:{id:order.id,stage:sandboxStage}});
            const field=make("textarea","studio-link-field");field.readOnly=true;field.rows=3;field.value=result.url;
            const copy=make("button","btn outline","Copy test link");copy.type="button";
            copy.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(result.url);copy.textContent="Copied!";}catch{field.select();showMessage("Copy the selected test link manually.");}});
            sandboxResult.append(make("p","studio-footnote","Private Sandbox test link. Creating another link invalidates this one. Expires "+formatDate(result.expiresAt)+"."),copy,field);
          }catch(e){showMessage(e.message);}
          finally{sandboxButton.disabled=false;}
        });
        paymentBox.append(sandboxButton,sandboxResult);
      }
    }
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
    if(order.checkoutMode==="sandbox-inline"){
      shippingBox.append(make("p","studio-footnote","Delivery details were collected at checkout. No separate shipping link is needed."));
    }else{
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
    }
    panel.append(shippingBox);
    panel.append(sectionHeading("Reference photographs"));
    const gallery=make("div","studio-photo-grid");panel.append(gallery);
    if(!order.photos?.length)gallery.append(make("p","studio-story","No reference photographs."));
    for(const photo of order.photos||[]){
      const figure=make("figure","studio-photo");const holder=make("div","studio-photo-holder","Loading photo…");
      const caption=make("figcaption","",photo.name||"Reference photo");figure.append(holder,caption);gallery.append(figure);
      try{
        const blob=await api("photo",{id:order.id,index:photo.index});
        if(state.selected!==id||currentVersion!==selectionVersion)return;
        const url=URL.createObjectURL(blob);state.images.push(url);
        if(state.selected!==id||currentVersion!==selectionVersion){URL.revokeObjectURL(url);state.images=state.images.filter(x=>x!==url);return;}
        const a=make("a","studio-photo-link");a.href=url;a.target="_blank";a.rel="noopener noreferrer";a.title="Open private reference photograph";
        const img=make("img");img.src=url;img.alt="Reference photo: "+(photo.name||"Pet");img.loading="lazy";a.append(img);holder.replaceChildren(a);
      }catch(e){if(state.selected!==id||currentVersion!==selectionVersion)return;holder.textContent="Photo unavailable";if(!state.key)return;}
    }
    if(state.selected!==id||currentVersion!==selectionVersion)return;
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
        showMessage("Saved progress for "+order.id+".");renderList();void loadAnalytics();
        const badge=head.querySelector(".studio-status");badge.className="studio-status status-"+order.status.toLowerCase();badge.textContent=labels[order.status];
      }catch(e){showMessage(e.message);}
      finally{button.disabled=false;button.textContent="Save progress";}
    });
  }

  const fmtAUD=cents=>"A$"+(Number(cents||0)/100).toLocaleString("en-AU",{minimumFractionDigits:0,maximumFractionDigits:2});
  let analyticsVersion=0;
  function showView(view){
    const overview=view!=="orders";
    $("studio-overview-view").hidden=!overview;
    $("studio-orders-view").hidden=overview;
    $("studio-current-view").textContent=overview?"Overview":"Orders";
    document.querySelectorAll("[data-studio-view]").forEach(el=>{
      if(!el.classList.contains("studio-nav-item"))return;
      const active=el.dataset.studioView===(overview?"overview":"orders");
      el.classList.toggle("active",active);
      if(active)el.setAttribute("aria-current","page");else el.removeAttribute("aria-current");
    });
    if(view==="traffic")requestAnimationFrame(()=>$("studio-traffic-card").scrollIntoView({behavior:"smooth",block:"center"}));
    else window.scrollTo({top:0,behavior:"smooth"});
  }
  function renderRecent(){
    const target=$("studio-recent-orders");if(!target)return;
    target.replaceChildren();
    const recent=state.orders.slice(0,5);
    if(!recent.length){target.append(make("p","studio-chart-empty","No enquiries yet."));return;}
    for(const o of recent){
      const row=make("button","studio-recent-row");row.type="button";
      const avatar=make("span","studio-recent-avatar",(o.petName||"P").slice(0,1).toUpperCase());
      const info=make("span","studio-recent-info");
      info.append(make("strong","",o.petName||"Custom portrait"),make("small","",(o.name||"Customer")+" · "+formatDate(o.receivedAt)));
      const price=make("span","studio-recent-amount",money(o.payment?.totalCents/100||o.estimatedPriceAUD));
      row.append(avatar,info,price);
      row.addEventListener("click",()=>{showView("orders");select(o.id);});
      target.append(row);
    }
  }
  function renderTrend(data){
    const target=$("studio-chart");target.replaceChildren();
    const values=Array.isArray(data)?data:[];
    if(!values.length){target.append(make("p","studio-chart-empty","No reporting data."));return;}
    const ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg");
    svg.setAttribute("viewBox","0 0 800 240");svg.setAttribute("role","img");svg.setAttribute("aria-label","Portrait requests over the reporting period");
    const pad={l:28,r:12,t:12,b:31},w=800-pad.l-pad.r,h=240-pad.t-pad.b;
    const max=Math.max(1,...values.map(v=>Number(v.orders)||0));
    const line=(x1,y1,x2,y2,color,width=1,dash="")=>{
      const n=document.createElementNS(ns,"line");Object.entries({x1,y1,x2,y2,stroke:color,"stroke-width":width,...(dash?{"stroke-dasharray":dash}:{})}).forEach(([k,v])=>n.setAttribute(k,String(v)));svg.append(n);
    };
    const label=(x,y,t,anchor="start")=>{const n=document.createElementNS(ns,"text");n.setAttribute("x",x);n.setAttribute("y",y);n.setAttribute("text-anchor",anchor);n.setAttribute("font-size","11");n.setAttribute("fill","#9b8d84");n.textContent=t;svg.append(n);};
    for(let i=0;i<=4;i++){const y=pad.t+h*i/4;line(pad.l,y,800-pad.r,y,"#ede7e1",1,"4 6");label(pad.l-8,y+4,String(Math.round(max*(4-i)/4)),"end");}
    const pts=values.map((v,i)=>({x:pad.l+(values.length===1?w/2:w*i/(values.length-1)),y:pad.t+h-(Number(v.orders)||0)/max*h}));
    const path=document.createElementNS(ns,"path");path.setAttribute("d",pts.map((p,i)=>(i?"L":"M")+p.x.toFixed(2)+" "+p.y.toFixed(2)).join(" "));path.setAttribute("fill","none");path.setAttribute("stroke","#7b4d56");path.setAttribute("stroke-width","3");path.setAttribute("stroke-linecap","round");path.setAttribute("stroke-linejoin","round");svg.append(path);
    if(values.length<=30)pts.forEach((p,i)=>{if(Number(values[i].orders)<=0)return;const dot=document.createElementNS(ns,"circle");dot.setAttribute("cx",p.x);dot.setAttribute("cy",p.y);dot.setAttribute("r","4");dot.setAttribute("fill","#7b4d56");const tip=document.createElementNS(ns,"title");tip.textContent=values[i].date+": "+values[i].orders+" requests";dot.append(tip);svg.append(dot);});
    [0,Math.floor((values.length-1)/2),values.length-1].forEach((i,j)=>label(pts[i].x,234,values[i].date.slice(5),j===0?"start":j===2?"end":"middle"));
    target.append(svg);
  }
  function renderPipeline(counts){
    const target=$("studio-pipeline");target.replaceChildren();
    const rows=[["New requests",counts.New||0],["Confirmed",counts.Confirmed||0],["In progress",counts.Painting||0],["Ready for balance",counts["Ready for balance"]||0],["Shipped / completed",(counts.Shipped||0)+(counts.Completed||0)]];
    const max=Math.max(1,...rows.map(r=>r[1]));
    for(const [name,value] of rows){
      const row=make("div","studio-pipeline-row"),top=make("div","studio-pipeline-top");
      top.append(make("span","",name),make("strong","",value));
      const track=make("div","studio-pipeline-track"),fill=make("span","studio-pipeline-fill");
      fill.style.width=(value/max*100)+"%";track.append(fill);row.append(top,track);target.append(row);
    }
  }
  async function loadAnalytics(){
    if(!state.key)return;
    const version=++analyticsVersion,days=Number($("analytics-range").value);
    $("analytics-notice").textContent="Updating business overview…";
    $("refresh-analytics").disabled=true;
    try{
      const result=await api("summary",{days});
      if(version!==analyticsVersion||!state.key)return;
      const t=result.totals||{};
      $("metric-orders").textContent=(t.orders||0).toLocaleString("en-AU");
      $("metric-revenue").textContent=fmtAUD(t.revenueCents);
      $("metric-value").textContent=fmtAUD(t.orderValueCents);
      $("metric-production").textContent=(t.inProduction||0).toLocaleString("en-AU");
      $("studio-sandbox-caption").textContent=(t.sandboxOrders||0)+" Sandbox test orders in this period; A$"+(Number(t.sandboxTestCents||0)/100).toLocaleString("en-AU")+" in simulated payments.";
      $("chart-period-caption").textContent="Last "+days+" days";
      renderTrend(result.daily);renderPipeline(result.statusCounts||{});
      $("analytics-notice").textContent=(result.partial?"Partial report: storage scan limit reached. ":"")+"Updated "+formatDate(result.asOf)+". Verified payments only; Sandbox excluded.";
    }catch(error){if(version===analyticsVersion)$("analytics-notice").textContent="Analytics unavailable: "+error.message;}
    finally{if(version===analyticsVersion)$("refresh-analytics").disabled=false;}
  }
  document.querySelectorAll("[data-studio-view]").forEach(el=>el.addEventListener("click",()=>showView(el.dataset.studioView)));
  $("analytics-range").addEventListener("change",loadAnalytics);
  $("refresh-analytics").addEventListener("click",loadAnalytics);
  $("login-form").addEventListener("submit",async e=>{
    e.preventDefault();state.key=$("access-key").value;$("access-key").value="";
    loginMessage.textContent="Checking secure access…";
    try{
      const result=await api("list");
      state.orders=result.orders||[];state.cursor=result.nextCursor||null;
      login.hidden=true;dashboard.hidden=false;document.body.classList.add("studio-unlocked");loginMessage.textContent="";
      renderList();void loadAnalytics();if(state.orders.length)select(state.orders[0].id);
      showMessage(state.orders.length?"Studio unlocked.":"Studio unlocked. No orders yet.");
    }catch(error){state.key="";loginMessage.textContent=error.message;}
  });
  $("logout").addEventListener("click",()=>{lock();loginMessage.textContent="Studio locked.";});
  $("refresh").addEventListener("click",()=>load(true));
  $("load-more").addEventListener("click",()=>load(false));
  $("search").addEventListener("input",renderList);
  $("status-filter").addEventListener("change",renderList);
})();
