(function(){
"use strict";

const UI_KEY="cimco.inspection.ui.v1";
const DELIVERY_KEY="cimco.office-delivery.config.v1";
const OFFICE_SENDER="cimcomngmt1@gmail.com";
const OFFICE_RECIPIENT="cimcomngmt@gmail.com";
const DEFAULT_PREFS={autoCollapse:true,backups:{}};
let prefs=loadPrefs(), dashFilter="all", dashSort="recent";
let dialogResolve=null, dialogReturnFocus=null, dialogHideTimer=null, photoBusy=false, retakePhotoId="";
let captionTimer=null, pwaInstallEvent=null, pwaWaiting=null, applyingUpdate=false;
let deliveryBusy=false;
let pwaState={tone:"checking",title:"Checking offline readiness",detail:"The app is checking its local field kit."};

function loadPrefs(){
  try{
    const saved=JSON.parse(localStorage.getItem(UI_KEY)||"{}");
    return Object.assign({},DEFAULT_PREFS,saved,{backups:Object.assign({},DEFAULT_PREFS.backups,saved.backups||{})});
  }catch(e){ return JSON.parse(JSON.stringify(DEFAULT_PREFS)); }
}
function savePrefs(){ try{ localStorage.setItem(UI_KEY,JSON.stringify(prefs)); }catch(e){} }
function smoothBehavior(){ return matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"; }
function formatBytes(value){
  const n=Number(value)||0;
  if(n<1024) return n+" B";
  if(n<1048576) return (n/1024).toFixed(n<10240?1:0)+" KB";
  if(n<1073741824) return (n/1048576).toFixed(n<10485760?1:0)+" MB";
  return (n/1073741824).toFixed(1)+" GB";
}
function relativeTime(ts){
  const diff=Math.max(0,Date.now()-(Number(ts)||0));
  if(diff<60000) return "just now";
  if(diff<3600000) return Math.floor(diff/60000)+"m ago";
  if(diff<86400000) return Math.floor(diff/3600000)+"h ago";
  if(diff<604800000) return Math.floor(diff/86400000)+"d ago";
  return fmtDate(new Date(ts).toISOString().slice(0,10));
}
function isBackedUp(rec){ return Number(prefs.backups[rec.id]||0)>=Number(rec.updated||0); }
function markBackedUp(records){
  records.forEach(rec=>{ prefs.backups[rec.id]=Date.now(); });
  savePrefs();
  if(document.body.dataset.view==="home") renderHome();
}

function loadDeliveryConfig(){
  try{
    const saved=JSON.parse(localStorage.getItem(DELIVERY_KEY)||"{}");
    return {endpoint:String(saved.endpoint||""),token:String(saved.token||"")};
  }catch(e){ return {endpoint:"",token:""}; }
}
function validDeliveryEndpoint(value){
  try{
    const url=new URL(String(value||"").trim());
    return url.protocol==="https:"&&url.hostname==="script.google.com"&&/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)?url.href:"";
  }catch(e){ return ""; }
}
function deliveryConfigured(){ const config=loadDeliveryConfig(); return !!(validDeliveryEndpoint(config.endpoint)&&config.token); }
function setDeliveryStatus(message,tone){
  const status=document.getElementById("deliveryStatus");
  if(!status) return;
  status.textContent=message||"";
  status.className="delivery-status "+(tone||"");
}
function updateDeliveryPanel(){
  const panel=document.getElementById("finishCard"); if(!panel||!cur) return;
  const s=stats(cur), left=Math.max(0,s.total-s.done), sent=cur.officeDelivery&&Number(cur.officeDelivery.sentAt||0);
  document.getElementById("finishReadiness").textContent=left?left+" checklist line"+(left===1?" is":"s are")+" still unreviewed":s.flags?s.flags+" item"+(s.flags===1?" needs":"s need")+" office attention":"Every checklist line is reviewed";
  document.getElementById("finishReadiness").className="finish-readiness "+(left?"pending":s.flags?"attention":"complete");
  const send=document.getElementById("sendOfficePdf"), setup=document.getElementById("deliverySetup");
  send.disabled=deliveryBusy; send.textContent=deliveryBusy?"Creating and sending PDF…":"Send PDF to main office";
  setup.disabled=deliveryBusy; setup.textContent=deliveryConfigured()?"Delivery settings":"Connect office delivery";
  if(sent&&!deliveryBusy) setDeliveryStatus("Last sent to "+OFFICE_RECIPIENT+" "+relativeTime(sent)+".","sent");
  else if(!deliveryConfigured()&&!deliveryBusy) setDeliveryStatus("One-time connection required before the first send.","setup");
}

function ensureShell(){
  if(!document.getElementById("appDialog")){
    document.body.insertAdjacentHTML("beforeend",`
      <div class="app-dialog-backdrop" id="appDialog" hidden>
        <form class="app-dialog" id="appDialogForm" role="dialog" aria-modal="true" aria-labelledby="appDialogTitle">
          <button class="dialog-close" type="button" data-dialog-cancel aria-label="Close dialog">×</button>
          <div class="eyebrow" id="appDialogEyebrow">Inspection app</div>
          <h2 id="appDialogTitle">Confirm</h2>
          <div class="dialog-copy" id="appDialogCopy"></div>
          <label class="dialog-field" id="appDialogField" hidden><span id="appDialogLabel">Name</span><input class="in" id="appDialogInput" maxlength="120" autocomplete="off"></label>
          <div class="dialog-actions"><button class="act ghost" type="button" data-dialog-cancel>Cancel</button><button class="act solid" id="appDialogConfirm" type="submit">Continue</button></div>
        </form>
      </div>`);
  }
  const pulse=document.getElementById("fieldPulse");
  if(pulse && !document.getElementById("walkTools")){
    pulse.insertAdjacentHTML("afterend",`
      <div class="walk-tools noprint" id="walkTools">
        <button class="walk-next" id="nextUnreviewed" type="button"><span>Next unreviewed</span><b id="remainingCount">0 left</b></button>
        <button class="walk-pref" id="collapseToggle" type="button" aria-pressed="true"><i aria-hidden="true"></i><span>Auto-collapse passed rooms</span></button>
      </div>`);
  }
  const search=document.getElementById("search");
  if(search && !document.getElementById("dashboardTools")){
    search.parentElement.insertAdjacentHTML("afterend",`
      <div class="dashboard-tools" id="dashboardTools">
        <div class="dashboard-filters" aria-label="Filter saved inspections">
          <button type="button" class="on" data-dash-filter="all">All</button>
          <button type="button" data-dash-filter="progress">In progress</button>
          <button type="button" data-dash-filter="attention">Needs work</button>
          <button type="button" data-dash-filter="complete">Complete</button>
        </div>
        <label class="dashboard-sort"><span>Sort</span><select id="dashboardSort"><option value="recent">Recently updated</option><option value="address">Property address</option><option value="progress">Progress</option><option value="type">Inspection type</option></select></label>
      </div>`);
  }
  const exportButton=document.getElementById("expAll");
  const backupCard=exportButton&&exportButton.closest(".card");
  if(backupCard && !document.getElementById("healthGrid")){
    backupCard.insertAdjacentHTML("beforeend",`
      <div class="health-grid" id="healthGrid">
        <article class="health-item"><span class="health-icon" aria-hidden="true">▰</span><div><b id="storageTitle">Storage check</b><small id="storageDetail">Calculating local usage…</small><i class="health-meter"><em id="storageMeter"></em></i></div></article>
        <article class="health-item"><span class="health-icon" aria-hidden="true">↥</span><div><b id="backupTitle">Backup check</b><small id="backupDetail">Checking saved inspections…</small></div></article>
        <article class="health-item" id="pwaHealth"><span class="health-dot checking" id="pwaDot" aria-hidden="true"></span><div><b id="pwaTitle">Checking offline readiness</b><small id="pwaDetail">The app is checking its local field kit.</small><button class="health-action" id="pwaAction" type="button" hidden></button></div></article>
      </div>`);
  }
  const signCard=document.querySelector(".signCard");
  if(signCard && !document.getElementById("finishCard")){
    signCard.insertAdjacentHTML("afterend",`
      <section class="card finish-card noprint" id="finishCard" aria-labelledby="finishTitle">
        <div class="finish-copy">
          <div class="eyebrow">Finish &amp; deliver</div>
          <h2 id="finishTitle">Send the inspection to the office</h2>
          <p>Creates the final PDF with its checklist, notes, photos, pricing, and signatures, then sends it directly to <b>${OFFICE_RECIPIENT}</b>.</p>
        </div>
        <div class="finish-readiness pending" id="finishReadiness">Checking inspection progress…</div>
        <div class="finish-actions">
          <button class="act solid send-office" id="sendOfficePdf" type="button">Send PDF to main office</button>
          <button class="act ghost" id="deliverySetup" type="button">Connect office delivery</button>
        </div>
        <div class="delivery-status setup" id="deliveryStatus" role="status" aria-live="polite">One-time connection required before the first send.</div>
        <small class="finish-privacy">Sent securely from ${OFFICE_SENDER}. The private connection stays only on this device and is never included in inspection exports.</small>
      </section>`);
  }
  const lightbox=document.getElementById("lb");
  if(lightbox && !document.getElementById("photoPanel")){
    const row=lightbox.querySelector(".row");
    row.insertAdjacentHTML("beforebegin",`
      <div class="photo-panel" id="photoPanel">
        <div><span class="eyebrow" id="photoItemLabel">Inspection photo</span><b id="photoItemTitle">Photo details</b></div>
        <label><span>Caption <em>(optional)</em></span><input class="in" id="photoCaption" maxlength="180" placeholder="Add a useful detail for the report"></label>
        <button class="act ghost" id="lbRetake" type="button">Retake photo</button>
      </div>`);
  }
  if(!document.getElementById("photoProgress")){
    document.body.insertAdjacentHTML("beforeend",`<div class="photo-progress" id="photoProgress" role="status" aria-live="polite" hidden><span class="photo-spinner" aria-hidden="true"></span><div><b id="photoProgressTitle">Preparing photos</b><small id="photoProgressDetail">Optimizing for offline storage…</small><i><em id="photoProgressFill"></em></i></div></div>`);
  }
}

function openDialog(options){
  const shell=document.getElementById("appDialog"), form=document.getElementById("appDialogForm");
  if(dialogResolve) closeDialog(null);
  clearTimeout(dialogHideTimer); dialogHideTimer=null;
  dialogReturnFocus=document.activeElement;
  document.getElementById("appDialogEyebrow").textContent=options.eyebrow||"Inspection app";
  document.getElementById("appDialogTitle").textContent=options.title||"Confirm";
  const copy=document.getElementById("appDialogCopy");
  if(options.html) copy.innerHTML=options.html; else copy.textContent=options.message||"";
  const field=document.getElementById("appDialogField"), input=document.getElementById("appDialogInput");
  field.hidden=!options.field;
  input.type=options.inputType||"text";
  input.inputMode=options.inputMode||"text";
  input.value=options.value||"";
  input.placeholder=options.placeholder||"";
  input.required=!!options.required;
  document.getElementById("appDialogLabel").textContent=options.label||"Name";
  const confirm=document.getElementById("appDialogConfirm");
  confirm.textContent=options.confirmLabel||"Continue";
  confirm.classList.toggle("danger",!!options.danger);
  shell.hidden=false;
  requestAnimationFrame(()=>shell.classList.add("on"));
  document.body.classList.add("dialog-open");
  return new Promise(resolve=>{
    dialogResolve=resolve;
    setTimeout(()=>{ (options.field?input:confirm).focus(); if(options.field) input.select(); },30);
  });
}
function closeDialog(value){
  const shell=document.getElementById("appDialog");
  shell.classList.remove("on");
  document.body.classList.remove("dialog-open");
  clearTimeout(dialogHideTimer);
  dialogHideTimer=setTimeout(()=>{ shell.hidden=true; dialogHideTimer=null; },160);
  const resolve=dialogResolve; dialogResolve=null;
  if(resolve) resolve(value);
  if(dialogReturnFocus&&dialogReturnFocus.focus) dialogReturnFocus.focus();
  dialogReturnFocus=null;
}

async function configureDelivery(){
  const current=loadDeliveryConfig();
  const endpoint=await openDialog({
    eyebrow:"Office delivery",title:"Connect automatic PDF delivery",field:true,required:true,
    label:"Google Apps Script web app URL",inputType:"url",inputMode:"url",value:current.endpoint,
    placeholder:"https://script.google.com/macros/s/…/exec",confirmLabel:"Continue",
    message:"Use the deployment URL created while signed in as "+OFFICE_SENDER+"."
  });
  if(endpoint===null) return null;
  const cleanEndpoint=validDeliveryEndpoint(endpoint);
  if(!cleanEndpoint){ toast("Use the complete Google Apps Script /exec URL"); return null; }
  const enteredToken=await openDialog({
    eyebrow:"Office delivery",title:"Enter the private pairing key",field:true,required:!current.token,
    label:"Pairing key",inputType:"password",value:"",
    placeholder:current.token?"Leave blank to keep the saved key":"Paste the key from Apps Script",confirmLabel:"Save connection",
    message:"The key stays in this browser only and is never added to reports or backups."
  });
  if(enteredToken===null) return null;
  const token=String(enteredToken||current.token||"").trim();
  if(!token){ toast("A pairing key is required"); return null; }
  const config={endpoint:cleanEndpoint,token};
  try{ localStorage.setItem(DELIVERY_KEY,JSON.stringify(config)); }
  catch(e){ toast("This browser could not save the office connection"); return null; }
  setDeliveryStatus("Office delivery is connected and ready.","sent");
  updateDeliveryPanel();
  toast("Office delivery connected");
  return config;
}

function base64UrlUtf8(value){
  const bytes=new TextEncoder().encode(String(value||""));
  let binary="";
  for(let i=0;i<bytes.length;i+=32768) binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"" );
}
function deliveryPayload(rec,html,requestId){
  const s=stats(rec);
  return {
    token:loadDeliveryConfig().token,
    request_id:requestId,
    report_b64:base64UrlUtf8(html),
    file_name:slug(rec).replace(/\.json$/,".pdf"),
    property:title(rec),inspection_type:modeTitle(rec),reviewed:String(s.done),total:String(s.total),flags:String(s.flags),
    submitted_at:new Date().toISOString(),app_version:APP_VERSION
  };
}
function postOfficeDelivery(config,payload){
  return new Promise((resolve,reject)=>{
    const frame=document.createElement("iframe"), form=document.createElement("form"), frameName="cimcoDelivery"+Date.now();
    let settled=false;
    frame.name=frameName; frame.hidden=true; frame.setAttribute("title","Office delivery response");
    form.hidden=true; form.method="post"; form.action=config.endpoint; form.target=frameName; form.acceptCharset="UTF-8";
    Object.entries(payload).forEach(([name,value])=>{ const field=document.createElement("textarea"); field.name=name; field.value=String(value); form.appendChild(field); });
    const cleanup=()=>{ removeEventListener("message",onMessage); clearTimeout(timer); form.remove(); frame.remove(); };
    const finish=(fn,value)=>{ if(settled) return; settled=true; cleanup(); fn(value); };
    const onMessage=event=>{
      if(event.source!==frame.contentWindow) return;
      const data=event.data;
      if(!data||data.type!=="cimco-report-delivery"||data.requestId!==payload.request_id) return;
      if(data.ok) finish(resolve,data); else finish(reject,new Error(data.error||"The office email service could not send this report."));
    };
    const timer=setTimeout(()=>finish(reject,new Error("The office did not confirm delivery. Check the connection and try again.")),75000);
    addEventListener("message",onMessage);
    document.body.append(frame,form);
    try{ form.submit(); }catch(error){ finish(reject,error); }
  });
}
async function sendOfficeReport(){
  if(!cur||deliveryBusy) return;
  if(!navigator.onLine){ setDeliveryStatus("An internet connection is required to send the PDF.","error"); toast("Connect to the internet, then try again"); return; }
  let config=loadDeliveryConfig();
  if(!deliveryConfigured()){ config=await configureDelivery(); if(!config) return; }
  const s=stats(cur), remaining=Math.max(0,s.total-s.done);
  if(remaining){
    const proceed=await openDialog({eyebrow:"Incomplete inspection",title:"Send with "+remaining+" unreviewed line"+(remaining===1?"?":"s?"),message:"The PDF will clearly show the current progress. You can finish the inspection and send an updated copy later.",confirmLabel:"Send anyway"});
    if(!proceed) return;
  }
  deliveryBusy=true; updateDeliveryPanel(); setDeliveryStatus("Building the PDF and sending it securely…","busy");
  try{
    await ensureReportLogo();
    const html=reportHTML(cur), size=new Blob([html]).size;
    if(size>18*1024*1024) throw new Error("This report is too large to email. Reduce the number or size of its photos, then try again.");
    const requestId=uid()+"-"+Date.now();
    await postOfficeDelivery(config,deliveryPayload(cur,html,requestId));
    cur.officeDelivery={sentAt:Date.now(),sender:OFFICE_SENDER,recipient:OFFICE_RECIPIENT};
    save(); markBackedUp([cur]);
    setDeliveryStatus("PDF sent successfully to "+OFFICE_RECIPIENT+".","sent");
    toast("Inspection PDF sent to the main office");
  }catch(error){
    setDeliveryStatus(error&&error.message?error.message:"The report could not be sent. Try again.","error");
    toast("Office delivery failed");
  }finally{ deliveryBusy=false; updateDeliveryPanel(); }
}

function decorateSpaces(){
  if(!cur) return;
  document.querySelectorAll(".thumbs img[data-ph]").forEach(img=>{
    const photo=findPhoto(img.dataset.ph); img.dataset.hasCaption=String(!!(photo&&String(photo.caption||"").trim()));
  });
  activeSpaces(cur).forEach(sp=>{
    const details=document.querySelector('details[data-sp="'+sp.id+'"]');
    if(!details) return;
    const s={done:0,flags:0};
    sp.items.forEach(it=>{ if(it.s) s.done++; if(FLAGS.indexOf(it.s)>=0) s.flags++; });
    const complete=!!sp.items.length&&s.done===sp.items.length;
    details.classList.toggle("is-complete",complete&&!s.flags);
    details.classList.toggle("has-flags",!!s.flags);
    details.classList.toggle("is-pending",!complete&&!s.flags);
    let state=details.querySelector(".room-state");
    if(!state){ state=document.createElement("span"); state.className="room-state"; details.querySelector("summary .count").before(state); }
    state.className="room-state "+(s.flags?"attention":complete?"complete":"pending");
    state.textContent=s.flags?"Review":complete?"Complete":"Open";
  });
}
function collapsePassedRoom(spaceId){
  if(!prefs.autoCollapse||!cur) return;
  const sp=activeSpaces(cur).find(x=>x.id===spaceId);
  if(!sp) return;
  const complete=sp.items.length&&sp.items.every(it=>!!it.s), flags=sp.items.some(it=>FLAGS.indexOf(it.s)>=0);
  if(!complete||flags) return;
  const details=document.querySelector('details[data-sp="'+spaceId+'"]');
  if(!details||!details.open) return;
  sectionFinish(spaceId);
  setTimeout(()=>{
    if(!prefs.autoCollapse) return;
    details.open=false;
    const next=nextBlankAfter(spaceId);
    if(next) setActiveSpace(next.sp.id);
  },420);
}
function nextBlankAfter(spaceId){
  const spaces=activeSpaces(cur), start=Math.max(0,spaces.findIndex(sp=>sp.id===spaceId));
  for(let pass=0;pass<2;pass++){
    const from=pass?0:start;
    const to=pass?start:spaces.length;
    for(let i=from;i<to;i++){
      const index=spaces[i].items.findIndex(it=>!it.s);
      if(index>=0) return {sp:spaces[i],index};
    }
  }
  return null;
}
function jumpNextUnreviewed(){
  if(!cur) return;
  const target=nextBlankAfter(ACTIVE_SPACE_ID);
  if(!target){ toast("Every checklist line is reviewed"); return; }
  const details=document.querySelector('details[data-sp="'+target.sp.id+'"]');
  if(details) details.open=true;
  setActiveSpace(target.sp.id);
  const item=document.querySelector('.item[data-key="'+target.sp.id+':'+target.index+'"]');
  if(item){
    item.scrollIntoView({behavior:smoothBehavior(),block:"center"});
    item.classList.add("next-target");
    setTimeout(()=>item.classList.remove("next-target"),900);
    const button=item.querySelector(".k"); if(button) setTimeout(()=>button.focus({preventScroll:true}),250);
  }
}
function updateWalkTools(){
  const tools=document.getElementById("walkTools");
  if(!tools||!cur) return;
  const s=stats(cur), left=Math.max(0,s.total-s.done);
  document.getElementById("remainingCount").textContent=left?left+" left":"Complete";
  document.getElementById("nextUnreviewed").disabled=!left;
  const toggle=document.getElementById("collapseToggle");
  toggle.setAttribute("aria-pressed",String(!!prefs.autoCollapse));
  toggle.classList.toggle("on",!!prefs.autoCollapse);
}

function dashboardRow(rec){
  const s=stats(rec), name=title(rec), backed=isBackedUp(rec);
  const badge=rec.mode==="out"?"OUT":rec.mode==="ready"?"READY":rec.mode==="routine"?"ROUTINE":"IN";
  const state=s.flags?s.flags+" need work":s.pct===100?"Complete":s.done?"In progress":"Not started";
  return `<div class="recrow enhanced-record" data-record="${rec.id}"><button class="rec" data-open="${rec.id}" aria-label="Open ${esc(name)}">
    <span class="badge ${rec.mode}">${badge}</span><span class="rt"><b>${esc(name)}</b><span>${MODE_LABEL[rec.mode]||rec.mode} · ${fmtDate(rec.meta.date)} · Updated ${relativeTime(rec.updated)}</span>
    <i class="record-progress"><em style="width:${s.pct}%"></em></i></span><span class="record-side"><b>${s.pct}%</b><small class="${s.flags?"attention":s.pct===100?"complete":""}">${state}</small><small class="backup-mark ${backed?"done":""}">${backed?"Backed up":"Not backed up"}</small></span></button>
    <button class="recdelete" data-delhome="${rec.id}" aria-label="Delete ${esc(name)}">Delete</button></div>`;
}
function renderDashboard(){
  const list=document.getElementById("list"), search=document.getElementById("search");
  if(!list||!search) return;
  const q=(search.value||"").trim().toLowerCase();
  let rows=LIST.filter(rec=>{
    const s=stats(rec), matches=!q||(title(rec)+" "+(rec.meta.tenant||"")+" "+(rec.meta.inspector||"")).toLowerCase().includes(q);
    if(!matches) return false;
    if(dashFilter==="progress") return s.done>0&&s.pct<100;
    if(dashFilter==="attention") return s.flags>0;
    if(dashFilter==="complete") return s.pct===100;
    return true;
  });
  rows.sort((a,b)=>{
    if(dashSort==="address") return title(a).localeCompare(title(b));
    if(dashSort==="progress") return stats(b).pct-stats(a).pct||b.updated-a.updated;
    if(dashSort==="type") return String(MODE_LABEL[a.mode]).localeCompare(String(MODE_LABEL[b.mode]))||b.updated-a.updated;
    return b.updated-a.updated;
  });
  list.innerHTML=rows.length?rows.map(dashboardRow).join(""):LIST.length
    ? `<div class="empty enhanced-empty"><b>No matching inspections</b><span>Try another status or search.</span></div>`
    : `<div class="empty enhanced-empty"><b>Nothing saved yet</b><span>Start an inspection above and it will stay available on this device.</span></div>`;
  document.querySelectorAll("[data-dash-filter]").forEach(button=>button.classList.toggle("on",button.dataset.dashFilter===dashFilter));
  const sort=document.getElementById("dashboardSort"); if(sort) sort.value=dashSort;
}
let healthRun=0;
async function updateHealth(){
  const run=++healthRun;
  const unbacked=LIST.filter(rec=>!isBackedUp(rec));
  const backupTitle=document.getElementById("backupTitle"), backupDetail=document.getElementById("backupDetail");
  if(backupTitle){
    backupTitle.textContent=!LIST.length?"No inspections to back up":unbacked.length?unbacked.length+" inspection"+(unbacked.length===1?" needs":"s need")+" backup":"Backups are current";
    backupDetail.textContent=!LIST.length?"Completed field records will appear here.":unbacked.length?"Export after field work so the office has a recoverable copy.":"Every saved inspection has been exported since its last change.";
  }
  let estimate=null, pictureList=[];
  try{ if(navigator.storage&&navigator.storage.estimate) estimate=await navigator.storage.estimate(); }catch(e){}
  try{ pictureList=await allPhotos(); }catch(e){}
  if(run!==healthRun) return;
  const approximate=pictureList.reduce((sum,p)=>sum+Math.round(String(p.data||"").length*.75),0);
  const usage=estimate&&Number(estimate.usage), quota=estimate&&Number(estimate.quota);
  const title=document.getElementById("storageTitle"), detail=document.getElementById("storageDetail"), meter=document.getElementById("storageMeter");
  if(title){
    const gettingFull=!!(usage&&quota&&usage/quota>.72);
    title.textContent=gettingFull?"Storage is getting full":pictureList.length+" condition photo"+(pictureList.length===1?"":"s")+" on this device";
    detail.textContent=(usage&&quota?formatBytes(usage)+" used of "+formatBytes(quota)+" browser storage":formatBytes(approximate)+" estimated photo storage")+(gettingFull?" · Export records soon.":"");
    meter.style.width=usage&&quota?Math.min(100,usage/quota*100).toFixed(1)+"%":"0%";
    meter.classList.toggle("warn",!!(usage&&quota&&usage/quota>.72));
  }
  paintPwaState();
}

function setPwaState(tone,title,detail){ pwaState={tone,title,detail}; paintPwaState(); }
function paintPwaState(){
  const title=document.getElementById("pwaTitle"); if(!title) return;
  document.getElementById("pwaDot").className="health-dot "+pwaState.tone;
  title.textContent=pwaState.title; document.getElementById("pwaDetail").textContent=pwaState.detail;
  const action=document.getElementById("pwaAction");
  if(pwaWaiting){ action.hidden=false; action.textContent="Update now"; }
  else if(pwaInstallEvent){ action.hidden=false; action.textContent="Install app"; }
  else action.hidden=true;
}
function initPwaHealth(){
  if(SELF_TEST) return;
  const online=()=>{
    if(pwaWaiting) setPwaState("update","Update available","A newer inspection app is ready to install.");
    else if(!navigator.onLine) setPwaState("offline","Working offline","Changes will continue saving on this device.");
    else if(navigator.serviceWorker&&navigator.serviceWorker.controller) setPwaState("ready","Ready for field use","Offline files are installed and this device is online.");
    else setPwaState("checking","Online · preparing offline files","Keep this page open briefly to finish installation.");
  };
  addEventListener("online",online); addEventListener("offline",online); online();
  addEventListener("beforeinstallprompt",event=>{ event.preventDefault(); pwaInstallEvent=event; paintPwaState(); });
  addEventListener("appinstalled",()=>{ pwaInstallEvent=null; setPwaState("ready","App installed","CIMCO Inspections is available from this device’s app screen."); });
  if(!("serviceWorker" in navigator)) return setPwaState("limited","Browser storage only","This browser does not support offline app installation.");
  navigator.serviceWorker.register("./service-worker.js").then(reg=>{
    if(reg.waiting){ pwaWaiting=reg.waiting; setPwaState("update","Update available","A newer inspection app is ready to install."); }
    reg.addEventListener("updatefound",()=>{
      const worker=reg.installing; if(!worker) return;
      worker.addEventListener("statechange",()=>{
        if(worker.state==="installed"&&navigator.serviceWorker.controller){ pwaWaiting=reg.waiting||worker; setPwaState("update","Update available","A newer inspection app is ready to install."); }
      });
    });
    return navigator.serviceWorker.ready;
  }).then(()=>online()).catch(()=>setPwaState("limited","Offline setup needs attention","Reload once while online to prepare the field kit."));
  navigator.serviceWorker.addEventListener("controllerchange",()=>{ if(applyingUpdate) location.reload(); });
}

function findPhoto(id){
  for(const key of Object.keys(photos)){
    const photo=(photos[key]||[]).find(item=>item.id===id);
    if(photo) return photo;
  }
  return null;
}
function showPhotoDetails(){
  const photo=findPhoto(lbCurrent); if(!photo) return;
  const at=String(photo.key||"").lastIndexOf(":"), sp=cur&&cur.spaces.find(x=>x.id===photo.key.slice(0,at)), item=sp&&sp.items[+photo.key.slice(at+1)];
  document.getElementById("photoItemLabel").textContent=sp?sp.name:"Inspection photo";
  document.getElementById("photoItemTitle").textContent=item?item.t:"Photo details";
  document.getElementById("photoCaption").value=photo.caption||"";
}
function setPhotoProgress(current,total,label){
  const panel=document.getElementById("photoProgress"), pct=total?Math.round(current/total*100):0;
  panel.hidden=false; panel.classList.add("on");
  document.getElementById("photoProgressTitle").textContent=label||"Preparing photos";
  document.getElementById("photoProgressDetail").textContent=current+" of "+total+" · optimizing for offline storage";
  document.getElementById("photoProgressFill").style.width=pct+"%";
}
function hidePhotoProgress(){ const panel=document.getElementById("photoProgress"); panel.classList.remove("on"); setTimeout(()=>{panel.hidden=true;},180); }
async function processPhotos(files){
  if(photoBusy||!files.length||!camTarget||!cur) return;
  photoBusy=true; let saved=0, firstNew=null, prior=retakePhotoId?findPhoto(retakePhotoId):null;
  try{
    for(let i=0;i<files.length;i++){
      setPhotoProgress(i,files.length,"Preparing "+files.length+" photo"+(files.length===1?"":"s"));
      const data=await shrink(files[i]); if(!data) continue;
      const rec={id:uid(),insp:cur.id,key:camTarget,data,caption:prior&&i===0?prior.caption||"":"",ts:Date.now()};
      await photoPut(rec); (photos[camTarget]=photos[camTarget]||[]).push(rec); firstNew=firstNew||rec; saved++;
      setPhotoProgress(i+1,files.length,"Saving condition photos");
    }
    if(retakePhotoId&&firstNew){
      await photoDelete(retakePhotoId).catch(()=>{});
      Object.keys(photos).forEach(key=>{ photos[key]=photos[key].filter(photo=>photo.id!==retakePhotoId); });
    }
    renderSpaces();
    toast(saved?(retakePhotoId?"Photo replaced":saved+" photo"+(saved===1?"":"s")+" saved"):"No photos could be added");
  }catch(e){ toast("Photos are not available in this browser"); }
  finally{ retakePhotoId=""; photoBusy=false; hidePhotoProgress(); updateHealth(); }
}

ensureShell();

const originalRenderHome=renderHome;
renderHome=function(){ originalRenderHome(); renderDashboard(); updateHealth(); };
const originalRenderSpaces=renderSpaces;
renderSpaces=function(){ originalRenderSpaces(); decorateSpaces(); updateWalkTools(); updateDeliveryPanel(); };
const originalRenderHead=renderHead;
renderHead=function(){ originalRenderHead(); decorateSpaces(); updateWalkTools(); updateDeliveryPanel(); };
const originalCaption=caption;
caption=function(row){ const base=originalCaption(row), extra=String((row.p&&row.p.caption)||"").trim(); return base+(extra?" — "+extra:""); };

document.getElementById("appDialogForm").addEventListener("submit",event=>{
  event.preventDefault(); const field=document.getElementById("appDialogField"), input=document.getElementById("appDialogInput");
  if(!field.hidden&&input.required&&!input.value.trim()){ input.focus(); return; }
  closeDialog(field.hidden?true:input.value.trim());
});
document.getElementById("appDialog").addEventListener("click",event=>{
  if(event.target===event.currentTarget||event.target.closest("[data-dialog-cancel]")){ event.preventDefault(); closeDialog(null); }
});
document.addEventListener("keydown",event=>{
  const shell=document.getElementById("appDialog"); if(shell.hidden) return;
  if(event.key==="Escape"){ event.preventDefault(); closeDialog(null); return; }
  if(event.key!=="Tab") return;
  const focusable=[...shell.querySelectorAll('button:not([disabled]),input:not([hidden])')].filter(el=>!el.closest("[hidden]"));
  if(!focusable.length) return;
  const first=focusable[0],last=focusable[focusable.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});

document.addEventListener("click",event=>{
  const t=event.target.closest("button,[data-delhome],[data-additem],[data-rename],[data-delsp],[data-add]"); if(!t) return;
  const intercept=t.id==="dictHelp"||t.id==="delBtn"||t.id==="lbDel"||t.id==="lbRetake"||t.id==="nextUnreviewed"||t.id==="collapseToggle"||t.id==="pwaAction"||t.id==="sendOfficePdf"||t.id==="deliverySetup"||t.hasAttribute("data-delhome")||t.hasAttribute("data-additem")||t.hasAttribute("data-rename")||t.hasAttribute("data-delsp")||(t.dataset.add==="other")||t.hasAttribute("data-dash-filter");
  if(!intercept) return;
  event.preventDefault(); event.stopImmediatePropagation();
  void (async()=>{
    if(t.id==="dictHelp"){
      await openDialog({eyebrow:"Walkthrough help",title:"What to say",confirmLabel:"Got it",html:'<div class="dialog-help"><p>Say the room, then the checklist line and condition.</p><ul><li><b>“Kitchen is clean.”</b> passes untouched kitchen lines.</li><li><b>“Fridge is not cooling.”</b> marks Needs work and keeps the reason.</li><li><b>“Utilities are off.”</b> records N/A with the explanation.</li></ul><p>Nothing is applied until you review the proposed results.</p></div>'}); return;
    }
    if(t.id==="nextUnreviewed"){ jumpNextUnreviewed(); return; }
    if(t.id==="collapseToggle"){
      prefs.autoCollapse=!prefs.autoCollapse; savePrefs(); updateWalkTools();
      if(prefs.autoCollapse) document.querySelectorAll(".sec.is-complete[open]").forEach(el=>el.open=false);
      toast(prefs.autoCollapse?"Passed rooms will collapse automatically":"Rooms will stay open"); return;
    }
    if(t.hasAttribute("data-dash-filter")){ dashFilter=t.dataset.dashFilter; renderDashboard(); return; }
    if(t.id==="pwaAction"){
      if(pwaWaiting){ applyingUpdate=true; pwaWaiting.postMessage({type:"SKIP_WAITING"}); }
      else if(pwaInstallEvent){ pwaInstallEvent.prompt(); await pwaInstallEvent.userChoice; pwaInstallEvent=null; paintPwaState(); }
      return;
    }
    if(t.id==="deliverySetup"){ await configureDelivery(); return; }
    if(t.id==="sendOfficePdf"){ await sendOfficeReport(); return; }
    if(t.id==="lbRetake"){
      const photo=findPhoto(lbCurrent); if(!photo) return;
      retakePhotoId=photo.id; camTarget=photo.key; document.getElementById("lb").classList.remove("on"); document.getElementById("camIn").click(); return;
    }
    if(t.id==="lbDel"){
      const ok=await openDialog({eyebrow:"Condition photo",title:"Delete this photo?",message:"The photo will be removed from this inspection and its exported report.",confirmLabel:"Delete photo",danger:true});
      if(!ok) return;
      clearTimeout(captionTimer); await photoDelete(lbCurrent).catch(()=>{}); Object.keys(photos).forEach(key=>{photos[key]=photos[key].filter(photo=>photo.id!==lbCurrent);});
      document.getElementById("lb").classList.remove("on"); renderSpaces(); updateHealth(); toast("Photo deleted"); return;
    }
    if(t.hasAttribute("data-delhome")){
      const rec=LIST.find(x=>x.id===t.dataset.delhome); if(!rec) return;
      const ok=await openDialog({eyebrow:"Saved inspection",title:"Delete "+title(rec)+"?",message:"The inspection and all of its condition photos will be permanently removed from this device.",confirmLabel:"Delete inspection",danger:true});
      if(!ok) return;
      LIST=LIST.filter(x=>x.id!==rec.id); delete prefs.backups[rec.id]; savePrefs(); save(); await photoDeleteInsp(rec.id); renderHome(); renderBar(); toast("Inspection deleted"); return;
    }
    if(t.id==="delBtn"){
      const ok=await openDialog({eyebrow:"Current inspection",title:"Delete this inspection?",message:"The inspection and all of its condition photos will be permanently removed from this device.",confirmLabel:"Delete inspection",danger:true});
      if(!ok) return; const id=cur.id;
      LIST=LIST.filter(rec=>rec.id!==id); delete prefs.backups[id]; savePrefs(); save(); await photoDeleteInsp(id); go("home"); toast("Inspection deleted"); return;
    }
    if(t.hasAttribute("data-additem")){
      const sp=cur.spaces.find(x=>x.id===t.dataset.additem); if(!sp) return;
      const name=await openDialog({eyebrow:"Custom checklist line",title:"Add a line to "+sp.name,label:"Checklist line",field:true,required:true,placeholder:"Example: Balcony railing",confirmLabel:"Add line"});
      if(name){ sp.items.push({t:name,s:"",n:"",base:""}); save(); renderSpaces(); renderHead(); toast("Checklist line added"); } return;
    }
    if(t.hasAttribute("data-rename")){
      const sp=cur.spaces.find(x=>x.id===t.dataset.rename); if(!sp) return;
      const name=await openDialog({eyebrow:"Room details",title:"Rename this space",label:"Room or area name",field:true,required:true,value:sp.name,confirmLabel:"Save name"});
      if(name){ sp.name=name; save(); renderSpaces(); renderHead(); } return;
    }
    if(t.hasAttribute("data-delsp")){
      const index=cur.spaces.findIndex(x=>x.id===t.dataset.delsp); if(index<0) return; const sp=cur.spaces[index];
      const ok=await openDialog({eyebrow:"Room details",title:"Remove "+sp.name+"?",message:"Every checklist result, note, and attached photo in this space will be removed.",confirmLabel:"Remove space",danger:true});
      if(ok){
        const removedId=sp.id, removedPhotos=Object.keys(photos).filter(key=>key.startsWith(removedId+":")).flatMap(key=>photos[key]||[]);
        await Promise.all(removedPhotos.map(photo=>photoDelete(photo.id).catch(()=>{}))); Object.keys(photos).filter(key=>key.startsWith(removedId+":")).forEach(key=>delete photos[key]);
        cur.spaces.splice(index,1); save(); renderSpaces(); renderHead(); updateHealth(); toast("Space removed");
      } return;
    }
    if(t.dataset.add==="other"){
      const fallback=nextSpaceName("other");
      const name=await openDialog({eyebrow:"Property layout",title:"Add another space",label:"Room or area name",field:true,required:true,value:fallback,confirmLabel:"Add space"});
      if(!name) return; const space=buildSpace("other",name); insertSpaceNearFamily(space); save(); renderSpaces(); renderHead(); jumpToSpace(space.id); toast(name+" added");
    }
  })();
},true);

document.addEventListener("click",event=>{
  const t=event.target.closest("[data-k],[data-allok],[data-ph],[data-cam],#expOne,#expAll"); if(!t) return;
  if(t.hasAttribute("data-k")){ const id=t.dataset.k.split(":")[0]; setTimeout(()=>{decorateSpaces();updateWalkTools();collapsePassedRoom(id);},0); }
  if(t.hasAttribute("data-allok")){ const id=t.dataset.allok; setTimeout(()=>{decorateSpaces();updateWalkTools();collapsePassedRoom(id);},0); }
  if(t.hasAttribute("data-ph")) setTimeout(showPhotoDetails,0);
  if(t.hasAttribute("data-cam")) retakePhotoId="";
  if(t.id==="expOne"&&cur) markBackedUp([cur]);
  if(t.id==="expAll") markBackedUp(LIST);
});
document.addEventListener("change",event=>{
  if(event.target.id==="dashboardSort"){ dashSort=event.target.value; renderDashboard(); }
},true);
document.addEventListener("input",event=>{
  if(event.target.id!=="photoCaption") return;
  const photo=findPhoto(lbCurrent); if(!photo) return;
  photo.caption=event.target.value;
  clearTimeout(captionTimer); captionTimer=setTimeout(()=>{ photoPut(photo).then(()=>showSaveNotice()).catch(()=>toast("Caption could not be saved")); },220);
});
document.addEventListener("change",event=>{
  if(event.target.id!=="camIn") return;
  event.preventDefault(); event.stopImmediatePropagation();
  const files=[...(event.target.files||[])]; event.target.value=""; if(!files.length){retakePhotoId="";return;} void processPhotos(files);
},true);

async function runSelfTests(){
  const results=[];
  const check=(name,condition)=>{ if(!condition) throw new Error(name); results.push({name,passed:true}); };
  let testPhoto="";
  try{
    localStorage.removeItem(KEY); LIST=[]; photos={};
    const rec=newInspection("in",null,{address:"100 Test Avenue",unit:"2A"}); cur=rec;
    rec.spaces[0].items[0].s="work"; rec.spaces[0].items[0].n="Test note"; rec.sig.t="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"; rec.wk[rec.spaces[0].id+":0"]={k:"dmg",c:"125.00"};
    const bed=buildSpace("bedroom","Bedroom 2"), bath=buildSpace("bathroom","Bathroom 2"); insertSpaceNearFamily(bed); insertSpaceNearFamily(bath); groupRelatedRooms(rec);
    const families=rec.spaces.map(roomFamily), lastBed=families.lastIndexOf("bedroom"), firstBath=families.indexOf("bathroom");
    check("Related rooms remain grouped",lastBed>=0&&firstBath>lastBed);
    testPhoto=uid(); const key=rec.spaces[0].id+":0", photo={id:testPhoto,insp:rec.id,key,data:"data:image/jpeg;base64,/9j/2Q==",caption:"Test caption",ts:Date.now()}; await photoPut(photo); photos[key]=[photo];
    save(); await new Promise(resolve=>setTimeout(resolve,330));
    const saved=JSON.parse(localStorage.getItem(KEY)||"[]"); check("Autosave writes the inspection",saved.length===1&&saved[0].meta.address==="100 Test Avenue");
    convertInspectionForm("out");
    const carried=cur.spaces.flatMap(sp=>sp.items).find(item=>item.n==="Test note");
    check("Form conversion preserves completed work",!!carried&&carried.s==="work");
    check("Form conversion preserves signatures",!!cur.sig.t);
    check("Form conversion preserves pricing",Object.values(cur.wk).some(row=>row.c==="125.00"));
    const report=reportHTML(cur); check("Printable report includes the property",report.includes("100 Test Avenue")); check("Printable report includes photos",report.includes("data:image/jpeg")); check("Photo captions reach reports",report.includes("Test caption"));
    const payload=JSON.stringify({type:"cimco-inspection",v:1,records:[Object.assign({},cur,{photos:[photo]})]}); const imported=JSON.parse(payload); check("Photo export/import payload round-trips",imported.records[0].photos[0].caption==="Test caption");
    check("Signature data is exportable",JSON.stringify(cur).includes("data:image/svg+xml"));
    check("Office PDF delivery has a fixed recipient",OFFICE_RECIPIENT==="cimcomngmt@gmail.com"&&OFFICE_SENDER==="cimcomngmt1@gmail.com");
    check("Office delivery accepts only Apps Script endpoints",!!validDeliveryEndpoint("https://script.google.com/macros/s/test-deployment_123/exec")&&!validDeliveryEndpoint("https://example.com/send"));
    return results;
  }finally{
    if(testPhoto) await photoDelete(testPhoto).catch(()=>{}); localStorage.removeItem(KEY); LIST=[]; cur=null; photos={}; go("home");
  }
}

if(document.body.dataset.view==="home") renderHome(); else { renderSpaces(); renderHead(); }
initPwaHealth(); updateWalkTools(); decorateSpaces(); updateDeliveryPanel();
if(SELF_TEST) window.__CIMCO_TEST__={run:runSelfTests};
})();
