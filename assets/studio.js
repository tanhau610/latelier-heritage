(() => {
  const $ = id => document.getElementById(id);
  const login = $("studio-login"), dashboard = $("studio-dashboard");
  const loginMessage = $("login-message"), message = $("studio-message");
  const list = $("order-list"), panel = $("detail-panel");
  const state = { key:"",orders:[],cursor:null,selected:null,images:[],loading:false };
  let selectionVersion=0;
  const labels = {New:"Yêu cầu mới",Confirmed:"Đã xác nhận",Painting:"Đang vẽ","Ready for balance":"Chờ thanh toán còn lại",Shipped:"Đã gửi hàng",Completed:"Hoàn thành",Cancelled:"Đã hủy"};
  const make = (tag,className,text) => {const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=String(text);return n;};
  const formatDate = iso => {const d=new Date(iso);return Number.isNaN(d.getTime())?"Không rõ ngày":d.toLocaleString("vi-VN",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Ho_Chi_Minh"});};
  const money = amount => Number.isFinite(Number(amount))?"A$"+Number(amount).toLocaleString("vi-VN"):"Chưa có dữ liệu";
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
    if(response.status===401){lock();throw Error("Mã truy cập không đúng hoặc đã hết hiệu lực. Vui lòng đăng nhập lại.");}
    if(action==="photo"&&response.ok)return response.blob();
    let result;try{result=await response.json();}catch{throw Error("Máy chủ trả về dữ liệu không hợp lệ.");}
    if(!response.ok||!result.ok)throw Error(result.message||"Không thực hiện được yêu cầu.");
    return result;
  }
  function showMessage(text){message.textContent=text||"";}
  async function load(reset=false){
    if(state.loading)return;state.loading=true;
    $("refresh").disabled=true;$("load-more").disabled=true;
    showMessage("Đang tải đơn hàng…");
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
      if(state.selected&&!state.orders.some(o=>o.id===state.selected)){state.selected=null;panel.replaceChildren(make("div","studio-empty","Chọn đơn hàng để xem chi tiết."));}
      showMessage(state.orders.length?"Dữ liệu được bảo mật. Ảnh tham khảo chỉ hiển thị sau khi đăng nhập.":"Chưa có đơn đặt tranh nào.");
    }catch(e){showMessage(e.message);}
    finally{state.loading=false;$("refresh").disabled=false;$("load-more").disabled=false;}
  }
  function renderList(){
    const q=$("search").value.trim().toLowerCase(),status=$("status-filter").value;
    const visible=state.orders.filter(o=>(!status||o.status===status)&&(!q||[o.id,o.name,o.email,o.petName].some(v=>String(v||"").toLowerCase().includes(q))));
    list.replaceChildren();$("order-count").textContent=visible.length+" / "+state.orders.length;
    if(!visible.length)list.append(make("p","studio-list-empty","Không tìm thấy đơn hàng phù hợp."));
    $("sidebar-order-count").textContent=String(state.orders.length);
    renderRecent();
    for(const o of visible){
      const button=make("button","studio-order"+(state.selected===o.id?" selected":""),undefined);
      button.type="button";button.addEventListener("click",()=>select(o.id));
      const top=make("div","studio-order-top");top.append(make("strong","",o.petName||"Tranh chân dung thú cưng"),make("span","studio-status status-"+o.status.toLowerCase(),labels[o.status]||o.status));
      button.append(top,make("div","studio-order-name",o.name||"Khách chưa có tên"),make("div","studio-order-meta",o.id+" · "+formatDate(o.receivedAt)),make("div","studio-order-price",money(o.payment?o.payment.totalCents/100:o.estimatedPriceAUD)),make("div","studio-order-meta",o.checkoutMode==="sandbox-inline"?(o.sandboxPayment?.full?"Sandbox: đã thanh toán 100%":o.sandboxPayment?.balance?"Sandbox: đã thanh toán đủ":o.sandboxPayment?.deposit?"Sandbox: đã thanh toán cọc": "Sandbox: chờ thanh toán"):(o.payment?.balance?"Đã ghi nhận đủ hai lần thanh toán":o.payment?.deposit?"Đã ghi nhận tiền cọc · còn số dư":o.payment?"Chờ thanh toán cọc 50%":"Chưa chốt báo giá")));
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
    const heading=make("div");heading.append(make("span","eyebrow","Yêu cầu đặt tranh"),make("h2","",order.petName||"Tranh chân dung thú cưng"),make("p","studio-reference",order.id));
    head.append(heading,make("span","studio-status status-"+order.status.toLowerCase(),labels[order.status]||order.status));panel.append(head);
    const info=make("dl","studio-details");
    detailRow(info,"Khách hàng",order.name);detailRow(info,"Email",order.email);detailRow(info,"Ngày nhận",formatDate(order.receivedAt));
    detailRow(info,"Kích thước tranh",order.size?order.size+" cm":"—");detailRow(info,"Số thú cưng",order.pets);detailRow(info,"Quốc gia giao hàng",order.country);
    detailRow(info,"Thiệp viết tay",order.card?"Có":"Không");detailRow(info,"Giá dự kiến",money(order.estimatedPriceAUD));
    panel.append(info);
    const emailLink=make("a","studio-email","Gửi email cho khách");emailLink.href="mailto:"+encodeURIComponent(order.email||"");panel.append(emailLink);
    panel.append(sectionHeading("Yêu cầu và lời nhắn của khách"));
    panel.append(make("p","studio-story",order.story||"Không có yêu cầu đặc biệt."));
    panel.append(sectionHeading(order.checkoutMode==="sandbox-inline"?"Thanh toán thử Sandbox · "+(order.checkoutPlan==="full"?"100%":"50 / 50"):"Thanh toán hai đợt · 50 / 50"));
    const paymentBox=make("div","studio-payment");
    const payment=order.payment;
    const paymentNote=make("p","studio-footnote","Chỉ ghi nhận thủ công. Dashboard KHÔNG tự thu tiền hoặc xác minh giao dịch PayPal. Hãy kiểm tra tiền đã nhận trong tài khoản PayPal trước khi xác nhận.");
    if(order.checkoutMode!=="sandbox-inline")paymentBox.append(paymentNote);
    const amountText=cents=>"A$"+(cents/100).toLocaleString("vi-VN",{minimumFractionDigits:2,maximumFractionDigits:2});
    if(order.checkoutMode==="sandbox-inline"){
      const sandbox=order.sandboxPayment;
      paymentBox.append(make("p","studio-footnote","CHỈ THỬ NGHIỆM SANDBOX — không có tiền thật được chuyển. Khách thanh toán trên trang đặt hàng."));
      if(payment)paymentBox.append(make("p","studio-payment-due","Tổng giá trị đơn: "+amountText(payment.totalCents)));
      paymentBox.append(make("p","studio-payment-due",sandbox?.full?"✓ Đã xác nhận thanh toán thử 100%":sandbox?.balance?"✓ Đã xác nhận đủ hai đợt thanh toán thử":sandbox?.deposit?"✓ Đã xác nhận cọc thử 50% · chờ phần còn lại": "Chờ thanh toán thử Sandbox"));
      if(sandbox?.deposit&&!sandbox?.balance&&order.status!=="Ready for balance")paymentBox.append(make("p","studio-story","Khi tranh hoàn thiện, chuyển trạng thái sang “Chờ thanh toán còn lại”. Khách sẽ thanh toán 50% còn lại qua liên kết đặt hàng riêng."));
      if(order.checkoutPlan==="full")paymentBox.append(make("p","studio-footnote","Khách đã chọn thanh toán toàn bộ khi đặt hàng."));
    }else{
    if(!payment){
      paymentBox.append(make("p","studio-story","Chưa chốt báo giá. Hãy xác nhận giá cuối cùng với khách trước khi yêu cầu đặt cọc."));
    }else{
      const summary=make("div","studio-payment-summary");
      summary.append(make("p","","Tổng giá đã chốt: "+amountText(payment.totalCents)),
        make("p","", "Tiền cọc 50%: "+amountText(payment.depositCents)+" · "+(payment.deposit?(payment.deposit.sandbox?"Đã xác nhận thử Sandbox":"Đã xác nhận thủ công"):"Chờ thanh toán")),
        make("p","", "Thanh toán còn lại 50%: "+amountText(payment.balanceCents)+" · "+(payment.balance?(payment.balance.sandbox?"Đã xác nhận thử Sandbox":"Đã xác nhận thủ công"):"Chờ thanh toán")));
      paymentBox.append(summary);
    }
    if(!payment?.deposit&&!payment?.balance&&!["Cancelled","Shipped","Completed"].includes(order.status)){
      const quoteForm=make("form","studio-payment-form");
      const quoteLabel=make("label","","Giá đã chốt (AUD)");
      const quoteInput=make("input");quoteInput.type="number";quoteInput.min="50";quoteInput.max="100000";quoteInput.step="1";quoteInput.required=true;quoteInput.value=String(payment?payment.totalCents/100:order.estimatedPriceAUD||"");
      quoteLabel.append(quoteInput);
      const quoteButton=make("button","btn outline",payment?"Cập nhật giá đã chốt":"Xác nhận giá đã chốt");quoteButton.type="submit";
      quoteForm.append(quoteLabel,quoteButton);paymentBox.append(quoteForm);
      quoteForm.addEventListener("submit",async e=>{
        e.preventDefault();quoteButton.disabled=true;
        try{
          const result=await api("payment-quote",{method:"POST",body:{id:order.id,totalAUD:Number(quoteInput.value)}});
          order.payment=result.payment;showMessage("Đã lưu giá đã chốt. Chưa thực hiện thu tiền.");select(order.id);
        }catch(error){showMessage(error.message);quoteButton.disabled=false;}
      });
    }
    if(payment&&!["Cancelled","Shipped","Completed"].includes(order.status)){
      const stage=!payment.deposit?"deposit":!payment.balance?"balance":null;
      if(stage){
        const due=stage==="deposit"?payment.depositCents:payment.balanceCents;
        paymentBox.append(make("p","studio-payment-due","Thanh toán tiếp theo: "+(stage==="deposit"?"tiền cọc 50%":"số tiền còn lại 50%")+" · "+amountText(due)));
        const paymentForm=make("form","studio-payment-form");
        const refLabel=make("label","","Mã giao dịch PayPal (trong lịch sử PayPal)");
        const refInput=make("input");refInput.type="text";refInput.minLength=6;refInput.maxLength=100;refInput.pattern="[A-Za-z0-9_-]{6,100}";refInput.required=true;refInput.placeholder="Mã giao dịch";refLabel.append(refInput);
        const verifyLabel=make("label","studio-payment-verify");
        const verifyCheck=make("input");verifyCheck.type="checkbox";verifyCheck.required=true;
        verifyLabel.append(verifyCheck,make("span","","Tôi đã kiểm tra tài khoản PayPal và xác nhận nhận đúng khoản thanh toán này."));
        const saveButton=make("button","btn","Ghi nhận đã xác minh: "+(stage==="deposit"?"tiền cọc":"số tiền còn lại"));saveButton.type="submit";
        paymentForm.append(refLabel,verifyLabel,saveButton);paymentBox.append(paymentForm);
        paymentForm.addEventListener("submit",async e=>{
          e.preventDefault();if(!verifyCheck.checked)return;saveButton.disabled=true;
          try{
            const result=await api("payment-record",{method:"POST",body:{id:order.id,stage,reference:refInput.value.trim(),verified:true}});
            order.payment=result.payment;showMessage("Đã ghi nhận xác minh thủ công: "+(stage==="deposit"?"tiền cọc":"số tiền còn lại")+"; không phát sinh khoản thu mới từ khách.");select(order.id);
          }catch(error){showMessage(error.message);saveButton.disabled=false;}
        });
      }else paymentBox.append(make("p","studio-payment-paid","Đã xác minh thủ công đủ hai đợt thanh toán. Hãy kiểm tra riêng tình trạng hoàn thiện và giao hàng."));
    }
    if(payment&&!["Cancelled","Shipped","Completed"].includes(order.status)){
      const sandbox=order.sandboxPayment;
      const sandboxStage=!sandbox?.deposit?"deposit":!sandbox?.balance?"balance":null;
      const sandboxNotice=make("p","studio-footnote","CHỈ THỬ NGHIỆM SANDBOX — không có tiền thật. Giao dịch thử được lưu riêng, không tính vào doanh thu.");
      paymentBox.append(sandboxNotice);
      paymentBox.append(make("p","studio-payment-due","Trạng thái Sandbox: "+(sandbox?.deposit?"đã thử thanh toán cọc":"chưa thử thanh toán cọc")+" · "+(sandbox?.balance?"đã thử thanh toán còn lại":"chưa thử thanh toán còn lại")));
      if(sandboxStage){
        const sandboxButton=make("button","btn outline","Tạo liên kết Sandbox: "+(sandboxStage==="deposit"?"tiền cọc":"số tiền còn lại"));sandboxButton.type="button";
        const sandboxResult=make("div","studio-shipping-link");
        sandboxButton.addEventListener("click",async()=>{
          sandboxButton.disabled=true;sandboxResult.replaceChildren();
          try{
            const result=await api("payment-link",{method:"POST",body:{id:order.id,stage:sandboxStage}});
            const field=make("textarea","studio-link-field");field.readOnly=true;field.rows=3;field.value=result.url;
            const copy=make("button","btn outline","Sao chép liên kết thử");copy.type="button";
            copy.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(result.url);copy.textContent="Đã sao chép!";}catch{field.select();showMessage("Không sao chép tự động được. Hãy chọn và sao chép liên kết thủ công.");}});
            sandboxResult.append(make("p","studio-footnote","Liên kết Sandbox riêng tư. Tạo liên kết mới sẽ vô hiệu hóa liên kết cũ. Hết hạn: "+formatDate(result.expiresAt)+"."),copy,field);
          }catch(e){showMessage(e.message);}
          finally{sandboxButton.disabled=false;}
        });
        paymentBox.append(sandboxButton,sandboxResult);
      }
    }
    }
    panel.append(paymentBox);
    panel.append(sectionHeading("Địa chỉ giao hàng"));
    const shippingBox=make("div","studio-shipping");
    if(order.shipping){
      const sh=order.shipping;
      const address=[sh.fullName,sh.phone,sh.address1,sh.address2,sh.city,sh.region,sh.postalCode,sh.country].filter(Boolean).join("\n");
      shippingBox.append(make("p","studio-shipping-address",address));
      if(order.shippingUpdatedAt)shippingBox.append(make("p","studio-footnote","Khách cập nhật: "+formatDate(order.shippingUpdatedAt)));
    }else shippingBox.append(make("p","studio-story","Khách chưa cung cấp địa chỉ giao hàng."));
    if(order.checkoutMode==="sandbox-inline"){
      shippingBox.append(make("p","studio-footnote","Địa chỉ giao hàng đã được nhận khi đặt hàng, không cần tạo liên kết khác."));
    }else{
    const linkHelp=make("p","studio-footnote","Tạo liên kết riêng để khách nhập địa chỉ nhận tranh. Liên kết hết hạn sau 14 ngày; liên kết mới sẽ thay thế liên kết cũ.");
    const linkButton=make("button","btn","Tạo liên kết nhập địa chỉ");linkButton.type="button";
    const linkResult=make("div","studio-shipping-link");
    linkButton.addEventListener("click",async()=>{
      linkButton.disabled=true;linkButton.textContent="Đang tạo…";linkResult.replaceChildren();
      try{
        const result=await api("shipping-link",{method:"POST",body:{id:order.id}});
        const label=make("p","studio-footnote","Đã tạo liên kết riêng. Sao chép và gửi email cho khách. Hết hạn: "+formatDate(result.expiresAt)+".");
        const copy=make("button","btn outline","Sao chép liên kết riêng");copy.type="button";
        copy.addEventListener("click",async()=>{
          try{await navigator.clipboard.writeText(result.url);copy.textContent="Đã sao chép!";}catch{showMessage("Không thể sao chép tự động. Hãy chọn liên kết trong ô và sao chép.");}
        });
        const field=make("textarea","studio-link-field");field.readOnly=true;field.rows=3;field.value=result.url;
        const mail=make("a","studio-email","Soạn email gửi khách");
        mail.href="mailto:"+encodeURIComponent(order.email||"")+"?subject="+encodeURIComponent("Delivery details for your L’Atelier Heritage portrait "+order.id)+"&body="+encodeURIComponent("Hello "+order.name+",\n\nPlease use this secure link to confirm the delivery address for your portrait:\n"+result.url+"\n\nThis link expires in 14 days.\n\nKind regards,\nL’Atelier Heritage");
        linkResult.append(label,copy,field,mail);
      }catch(e){showMessage(e.message);}
      finally{linkButton.disabled=false;linkButton.textContent="Tạo liên kết nhập địa chỉ";}
    });
    shippingBox.append(linkHelp,linkButton,linkResult);
    }
    panel.append(shippingBox);
    panel.append(sectionHeading("Ảnh tham khảo"));
    const gallery=make("div","studio-photo-grid");panel.append(gallery);
    if(!order.photos?.length)gallery.append(make("p","studio-story","Chưa có ảnh tham khảo."));
    for(const photo of order.photos||[]){
      const figure=make("figure","studio-photo");const holder=make("div","studio-photo-holder","Đang tải ảnh…");
      const caption=make("figcaption","",photo.name||"Ảnh tham khảo");figure.append(holder,caption);gallery.append(figure);
      try{
        const blob=await api("photo",{id:order.id,index:photo.index});
        if(state.selected!==id||currentVersion!==selectionVersion)return;
        const url=URL.createObjectURL(blob);state.images.push(url);
        if(state.selected!==id||currentVersion!==selectionVersion){URL.revokeObjectURL(url);state.images=state.images.filter(x=>x!==url);return;}
        const a=make("a","studio-photo-link");a.href=url;a.target="_blank";a.rel="noopener noreferrer";a.title="Mở ảnh tham khảo riêng tư";
        const img=make("img");img.src=url;img.alt= "Ảnh tham khảo: "+(photo.name||"Pet");img.loading="lazy";a.append(img);holder.replaceChildren(a);
      }catch(e){if(state.selected!==id||currentVersion!==selectionVersion)return;holder.textContent="Không tải được ảnh";if(!state.key)return;}
    }
    if(state.selected!==id||currentVersion!==selectionVersion)return;
    panel.append(sectionHeading("Tiến độ thực hiện"));
    const form=make("form","studio-update");
    const statusLabel=make("label","", "Trạng thái");const selectEl=make("select");selectEl.required=true;
    for(const value of Object.keys(labels)){const option=make("option","",labels[value]);option.value=value;option.selected=order.status===value;selectEl.append(option);}
    statusLabel.append(selectEl);
    const noteLabel=make("label","", "Ghi chú nội bộ");const note=make("textarea");note.maxLength=1000;note.rows=3;note.placeholder="Chất liệu, yêu cầu khách hàng, lưu ý giao hàng…";note.value=order.internalNote||"";noteLabel.append(note);
    const button=make("button","btn","Lưu tiến độ");button.type="submit";
    form.append(statusLabel,noteLabel,button);panel.append(form);
    if(order.updatedAt)panel.append(make("p","studio-footnote","Cập nhật gần nhất: "+formatDate(order.updatedAt)));
    form.addEventListener("submit",async event=>{
      event.preventDefault();button.disabled=true;button.textContent="Đang lưu…";
      try{
        const result=await api("status",{method:"POST",body:{id:order.id,status:selectEl.value,internalNote:note.value}});
        order.status=selectEl.value;order.internalNote=note.value;order.updatedAt=result.updatedAt;
        showMessage("Đã lưu tiến độ cho đơn "+order.id+".");renderList();void loadAnalytics();
        const badge=head.querySelector(".studio-status");badge.className="studio-status status-"+order.status.toLowerCase();badge.textContent=labels[order.status];
      }catch(e){showMessage(e.message);}
      finally{button.disabled=false;button.textContent="Lưu tiến độ";}
    });
  }

  const fmtAUD=cents=>"A$"+(Number(cents||0)/100).toLocaleString("vi-VN",{minimumFractionDigits:0,maximumFractionDigits:2});
  let analyticsVersion=0;
  function showView(view){
    const overview=view!=="orders";
    $("studio-overview-view").hidden=!overview;
    $("studio-orders-view").hidden=overview;
    $("studio-current-view").textContent=overview?"Tổng quan":"Đơn hàng";
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
    if(!recent.length){target.append(make("p","studio-chart-empty","Chưa có đơn hàng nào."));return;}
    for(const o of recent){
      const row=make("button","studio-recent-row");row.type="button";
      const avatar=make("span","studio-recent-avatar",(o.petName||"P").slice(0,1).toUpperCase());
      const info=make("span","studio-recent-info");
      info.append(make("strong","",o.petName||"Tranh đặt vẽ"),make("small","",(o.name||"Customer")+" · "+formatDate(o.receivedAt)));
      const price=make("span","studio-recent-amount",money(o.payment?.totalCents/100||o.estimatedPriceAUD));
      row.append(avatar,info,price);
      row.addEventListener("click",()=>{showView("orders");select(o.id);});
      target.append(row);
    }
  }
  function renderTrend(data){
    const target=$("studio-chart");target.replaceChildren();
    const values=Array.isArray(data)?data:[];
    if(!values.length){target.append(make("p","studio-chart-empty","Chưa có dữ liệu thống kê."));return;}
    const ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg");
    svg.setAttribute("viewBox","0 0 800 240");svg.setAttribute("role","img");svg.setAttribute("aria-label","Yêu cầu đặt tranh theo thời gian");
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
    const rows=[["Yêu cầu mới",counts.New||0],["Confirmed",counts.Confirmed||0],["Đang vẽ",counts.Painting||0],["Chờ thanh toán còn lại",counts["Chờ thanh toán còn lại"]||0],["Đã gửi / hoàn thành",(counts.Shipped||0)+(counts.Completed||0)]];
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
    $("analytics-notice").textContent="Đang cập nhật thống kê…";
    $("refresh-analytics").disabled=true;
    try{
      const result=await api("summary",{days});
      if(version!==analyticsVersion||!state.key)return;
      const t=result.totals||{};
      $("metric-orders").textContent=(t.orders||0).toLocaleString("vi-VN");
      $("metric-revenue").textContent=fmtAUD(t.revenueCents);
      $("metric-value").textContent=fmtAUD(t.orderValueCents);
      $("metric-production").textContent=(t.inProduction||0).toLocaleString("vi-VN");
      $("studio-sandbox-caption").textContent=(t.sandboxOrders||0)+" đơn hàng thử Sandbox trong kỳ; A$"+(Number(t.sandboxTestCents||0)/100).toLocaleString("vi-VN")+" là thanh toán mô phỏng.";
      $("chart-period-caption").textContent=days+" ngày gần đây";
      renderTrend(result.daily);renderPipeline(result.statusCounts||{});
      $("analytics-notice").textContent=(result.partial?"Báo cáo chưa đầy đủ vì đã đạt giới hạn quét dữ liệu. ":"")+"Cập nhật: "+formatDate(result.asOf)+". Chỉ tính tiền đã xác minh; không tính Sandbox.";
    }catch(error){if(version===analyticsVersion)$("analytics-notice").textContent="Không tải được thống kê: "+error.message;}
    finally{if(version===analyticsVersion)$("refresh-analytics").disabled=false;}
  }
  document.querySelectorAll("[data-studio-view]").forEach(el=>el.addEventListener("click",()=>showView(el.dataset.studioView)));
  $("analytics-range").addEventListener("change",loadAnalytics);
  $("refresh-analytics").addEventListener("click",loadAnalytics);
  $("login-form").addEventListener("submit",async e=>{
    e.preventDefault();state.key=$("access-key").value;$("access-key").value="";
    loginMessage.textContent="Đang kiểm tra mã truy cập…";
    try{
      const result=await api("list");
      state.orders=result.orders||[];state.cursor=result.nextCursor||null;
      login.hidden=true;dashboard.hidden=false;document.body.classList.add("studio-unlocked");loginMessage.textContent="";
      renderList();void loadAnalytics();if(state.orders.length)select(state.orders[0].id);
      showMessage(state.orders.length?"Đăng nhập thành công.":"Đăng nhập thành công. No orders yet.");
    }catch(error){state.key="";loginMessage.textContent=error.message;}
  });
  $("logout").addEventListener("click",()=>{lock();loginMessage.textContent="Đã khóa trang quản trị.";});
  $("refresh").addEventListener("click",()=>load(true));
  $("load-more").addEventListener("click",()=>load(false));
  $("search").addEventListener("input",renderList);
  $("status-filter").addEventListener("change",renderList);
})();
