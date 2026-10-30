/* Inspector help, assigned visit files and a guided finish. Entirely local. */
var FieldGuide=(function(){
"use strict";
const V=VisitModel,M=OfficeModel,e=esc,office=globalThis.CIMCO_OFFICE_DESK===true,PREF_KEY=KEY+'.field-guide.v1';
let prefs=load(),saveOK=true,finishStep=0,finishRecord='',ready=null,busy=false,onlyUnchecked=false,filterRecord='';
const base={renderHome,renderSpaces,renderHead,openRec,newInspection,save,flushSave};
function load(){try{return V.state(JSON.parse(localStorage.getItem(PREF_KEY)||'{}'));}catch(err){return V.state();}}
function store(){try{prefs=V.state(prefs);localStorage.setItem(PREF_KEY,JSON.stringify(prefs));}catch(err){prefs=load();throw new Error('The visit list or your name could not be saved. Save a backup and free some storage.');}}
function saveFile(name,value){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function exportState(){return M.clone(prefs);}
function restoreState(value){const clean=V.state(value);prefs=clean;store();renderVisits();paintStatus();}
function noteBackup(){prefs.backupAt=Date.now();store();paintStatus();}
function importVisits(value){const rows=V.file(value),merged=V.merge(prefs.visits,rows,LIST.filter(r=>r.visitId).map(r=>r.visitId));prefs.visits=merged.visits;store();renderVisits();return merged;}
function visitFile(rows){return {type:'cimco-inspection-visits',version:1,visits:rows.map(V.visit)};}
function exportVisit(id){const visit=prefs.visits.find(v=>v.id===id);if(!visit)throw new Error('This visit could not be found.');saveFile('CIMCO-visit-'+visit.meta.address.replace(/[^a-z0-9]+/gi,'-').slice(0,90)+'.json',visitFile([visit]));}
function createVisit(data){
  const libraries=OfflineOffice.layoutLibrary(),meta={address:data.address.trim(),unit:data.unit.trim(),date:data.date,inspector:data.inspector.trim(),officeInstructions:data.instructions.trim()};
  let layout=libraries.find(l=>M.propertyKey(l)===M.propertyKey(meta)&&l.mode===data.mode);
  if(!layout&&['in','out'].includes(data.mode))layout=libraries.find(l=>M.propertyKey(l)===M.propertyKey(meta)&&['in','out'].includes(l.mode));
  layout=M.validateLayout({...layout,address:meta.address,unit:meta.unit,mode:data.mode,revision:layout?.revision||1,updatedAt:Date.now(),rooms:layout?.rooms||makeSpacesForMode(data.mode).map(sp=>({type:sp.type,name:sp.name,tag:sp.tag||'',items:sp.items.map(it=>it.t)})),readyTags:layout?.readyTags||[]});
  const visit=V.visit({id:'visit-'+uid(),revision:1,updatedAt:Date.now(),mode:data.mode,meta,layout});prefs.visits.push(visit);store();renderVisits();return visit;
}
async function startVisit(id){
  if(busy)throw new Error('Please wait for the report to finish preparing.');
  const visit=prefs.visits.find(v=>v.id===id);if(!visit)throw new Error('Open the office visit file first.');
  const prior=LIST.find(r=>r.visitId===id);if(prior){if(prior.deletedAt)throw new Error('This visit is in Recently deleted. Restore it to continue.');await openRec(prior);return prior;}
  const rec=newInspection(visit.mode,null,visit.meta);Object.assign(rec.meta,visit.meta);rec.visitId=id;rec.visitRevision=visit.revision;
  rec.spaces=visit.layout.rooms.map(sp=>({id:uid(),type:sp.type,name:sp.name,tag:sp.tag,checklistVersion:2,items:sp.items.map(t=>({t,s:'',n:'',base:''}))}));rec.meta.readyTags=[...visit.layout.readyTags];rec.layoutLibraryVersion=visit.layout.revision;
  if(!flushSave())throw new Error('The visit could not be saved on this device.');await openRec(rec);InspectorFlow.setPanel('rooms');renderVisits();return rec;
}
function renderVisits(){
  const host=document.getElementById('assignedVisits');if(!host)return;
  const visits=prefs.visits.filter(v=>!LIST.some(r=>r.visitId===v.id)).sort((a,b)=>a.meta.date.localeCompare(b.meta.date));
  host.innerHTML='<h2>'+(office?'Prepared visits':'Visits ready to start')+'</h2><p>'+(office?'Prepare a visit file with the address, inspector and property layout. Transfer it to the phone using local file sharing.':'Open a visit file from the office, then choose a property below. You can still change rooms during the inspection.')+'</p><div class="guide-actions"><button class="act '+(office?'':'solid')+'" type="button" data-import-office>Open office visit file</button>'+(office?'<button class="act solid" type="button" data-plan-visit>Prepare a visit</button>':'')+'</div>'+visits.map(v=>'<article class="visit-card"><h3>'+e(v.meta.address+(v.meta.unit?' #'+v.meta.unit:''))+'</h3><p>'+e(MODE_LABEL[v.mode])+' · '+e(fmtDate(v.meta.date))+(v.meta.inspector?' · '+e(v.meta.inspector):'')+'</p>'+(v.meta.officeInstructions?'<p class="visit-instructions">Office instructions: '+e(v.meta.officeInstructions)+'</p>':'')+'<button class="act '+(office?'':'solid')+'" type="button" '+(office?'data-save-visit':'data-start-visit')+'="'+e(v.id)+'">'+(office?'Save visit file':'Start this visit')+'</button></article>').join('');
}
function paintStatus(){
  const host=document.getElementById('confidenceStatus');if(!host)return;
  const kit=globalThis.CIMCO_OFFLINE_BUNDLE||navigator.serviceWorker?.controller;
  document.getElementById('kitConfidence').textContent=kit?(navigator.onLine?'Ready to work offline':'Working offline'):'Offline setup: open the app once while connected';
  document.getElementById('saveConfidence').textContent=!saveOK?'Could not save on this device':saveNoticeText==='Saving on this phone...'?'Saving on this device…':cur?'Saved on this device':'Records stay on this device';
  document.getElementById('saveConfidence').classList.toggle('guide-error',!saveOK);
  let receipt=cur?'Saved here; office confirmation pending.':'No automatic online sync.';
  if(cur){try{receipt=OfflineOffice.receiptStatus(cur).replace('Office receipt imported:','Office confirmed:').replace('packet','report file').replace('Packet','Report file');}catch(err){receipt='Office confirmation could not be checked.';}}
  document.getElementById('officeConfidence').textContent=receipt;
  const backup=document.getElementById('backupReminder');backup.hidden=!LIST.length;
  backup.textContent=prefs.backupAt?'Backup file created '+new Date(prefs.backupAt).toLocaleString()+'. Keep a copy with the office.':'After your visits, save a complete backup and keep a copy with the office.';
}
function applyFilter(){
  if(!cur)return;if(filterRecord!==cur.id){filterRecord=cur.id;onlyUnchecked=false;}
  document.querySelectorAll('#spaces details.sec').forEach(d=>{
    const check=d.querySelector('[data-only-unchecked]');if(check)check.checked=onlyUnchecked;
    let shown=0;d.querySelectorAll('.item').forEach(item=>{const [rid,i]=item.dataset.key.split(':'),it=cur.spaces.find(s=>s.id===rid)?.items[+i],needsDetails=it&&['work','nt'].includes(it.s)&&!String(it.n||'').trim(),hide=onlyUnchecked&&!!it?.s&&!needsDetails;item.classList.toggle('guide-filtered',hide);if(!hide)shown++;});
    const message=d.querySelector('.unchecked-empty');if(message)message.hidden=!onlyUnchecked||shown>0;
  });
}
function decorateRooms(){
  if(!cur)return;
  document.querySelectorAll('#spaces details.sec').forEach(d=>{
    const all=d.querySelector('[data-allok]'),footer=d.querySelector('.room-done');if(all&&footer&&!footer.contains(all))footer.prepend(all);
    if(!d.querySelector('.room-review-tools'))d.querySelector('.room-settings').after(Object.assign(document.createElement('div'),{className:'room-review-tools',innerHTML:'<label><input type="checkbox" data-only-unchecked> Show only unchecked items</label><small>Items needing an explanation stay visible.</small><p class="unchecked-empty" role="status" hidden>Every item in this area has a result. You can turn off the filter to review them.</p>'}));
    d.querySelectorAll('.item').forEach(item=>{
      const [rid,i]=item.dataset.key.split(':'),it=cur.spaces.find(s=>s.id===rid)?.items[+i];if(!it)return;
      let suggestions=item.querySelector('.note-suggestions');if(!suggestions){suggestions=document.createElement('details');suggestions.className='note-suggestions';suggestions.innerHTML='<summary>Suggested notes</summary><p>Tap a phrase only if it matches what you saw. You can edit it afterward.</p><div>'+V.suggestions(it.t).map(note=>'<button type="button" class="act" data-suggest-key="'+e(item.dataset.key)+'" data-suggest-note="'+e(note)+'">'+e(note)+'</button>').join('')+'</div>';item.querySelector('.note').after(suggestions);}
      suggestions.hidden=it.s!=='work';
      let replacements=item.querySelector('.replacement-actions');if(!replacements){replacements=document.createElement('div');replacements.className='replacement-actions';replacements.innerHTML=V.replacementActions(it.t).map(action=>'<div><span>'+e(action.label)+'</span><button class="act" type="button" data-replace-key="'+e(item.dataset.key)+'" data-replace-kind="'+action.kind+'" data-replace-note="'+e(action.note)+'" aria-label="'+e(action.label+': needs replacement for '+it.t)+'">Needs replacement</button></div>').join('');item.querySelector('.pad6').after(replacements);}replacements.hidden=it.s==='np'||!replacements.children.length;
      let reminder=item.querySelector('.photo-nudge');if(!reminder){reminder=document.createElement('p');reminder.className='photo-nudge';reminder.textContent='A photo helps the office see this problem. Add one if it is safe and useful.';item.querySelector('.thumbs')?.after(reminder);if(!reminder.parentElement)item.append(reminder);}
      reminder.hidden=it.s!=='work'||!!photos[item.dataset.key]?.length;
    });
  });applyFilter();
}
function finishWarnings(rec=cur){return [...InspectionReport.readiness(rec),...InspectionReport.signOffIssues(rec)];}
function validReady(){return !!(cur&&ready&&ready.rec===cur&&OfflineOffice.currentPrepared());}
function renderFinish(){
  if(!cur)return;if(finishRecord!==cur.id){finishRecord=cur.id;finishStep=0;ready=null;}
  const root=document.getElementById('reviewPanel');root.dataset.finishStep=String(finishStep);
  root.querySelectorAll('[data-step-content]').forEach(el=>el.hidden=Number(el.dataset.stepContent)!==finishStep);
  root.querySelectorAll('.finish-steps [data-finish-step]').forEach(b=>{if(Number(b.dataset.finishStep)===finishStep)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
  document.getElementById('reviewTitle').textContent='Finish this inspection';
  const warnings=finishWarnings();document.getElementById('finishSummary').textContent=warnings.length?'Review needed: '+warnings.map(i=>i.text).join('; ')+'.':'Checklist and signatures are recorded. Review the report, then send it to the office.';
  const missing=[];for(const sp of activeSpaces(cur))sp.items.forEach((it,i)=>{if(it.s==='work'&&!photos[sp.id+':'+i]?.length)missing.push({sp,i,it});});
  document.getElementById('finishPhotoNudges').innerHTML=missing.length?'<p>Helpful photos (optional)</p>'+missing.slice(0,10).map(o=>'<button class="review-fix" type="button" data-review-room="'+e(o.sp.id)+'" data-review-item="'+o.i+'">'+e(o.sp.name+' / '+o.it.t)+': add a photo if useful</button>').join(''):'';
  document.getElementById('finishOfficeStatus').textContent=OfflineOffice.receiptStatus(cur).replace(/packet/g,'report file');
  document.getElementById('finishTransfer').hidden=!validReady();document.getElementById('finishRebuild').hidden=validReady();
  document.getElementById('comparisonCard').hidden=!OfflineOffice.comparisonRows(cur).length;
  document.querySelectorAll('[data-continue-send],[data-rebuild-report]').forEach(b=>b.disabled=busy);
}
async function prepareFinish(){
  if(busy)return;const rec=cur;if(!rec)return;
  if(document.body.dataset.photoSaving==='true')throw new Error('Wait for the photos to finish saving.');
  const warnings=finishWarnings(rec);
  if(warnings.length){const ok=await CimcoDialog.open({title:'Prepare a draft report?',message:'This visit still needs review: '+warnings.map(w=>w.text).join('; ')+'. These limits will remain visible in the report.',confirmLabel:'Prepare draft report'});if(!ok)return;}
  if(cur!==rec)return;busy=true;renderFinish();
  try{const file=await OfflineOffice.preparePacket(rec);if(cur!==rec)return;ready=file;finishStep=2;InspectorFlow.setPanel('review');renderFinish();}finally{busy=false;renderFinish();}
}
function onPanel(next){if(next==='review')renderFinish();if(next==='room')applyFilter();paintStatus();}
function showPlan(){
  const dialog=document.getElementById('visitPlanner'),libraries=OfflineOffice.layoutLibrary(),seen=new Set(),rows=libraries.filter(l=>{const k=M.propertyKey(l);if(seen.has(k))return false;seen.add(k);return true;});
  dialog.querySelector('form').reset();dialog.querySelector('[name=date]').value=today();dialog.querySelector('[name=inspector]').value=prefs.inspector;dialog.querySelector('[name=property]').innerHTML='<option value="">Another property</option>'+rows.map(l=>'<option value="'+e(l.id)+'">'+e(l.address+(l.unit?' #'+l.unit:''))+'</option>').join('');dialog.querySelector('[role=status]').textContent='';dialog.showModal();
}
function shell(){
  document.body.classList.add('guided-field');
  const confidence=document.createElement('aside');confidence.id='confidenceStatus';confidence.setAttribute('aria-label','Saving and office status');confidence.innerHTML='<span id="kitConfidence"></span><span id="saveConfidence" role="status"></span><span id="officeConfidence" role="status"></span>';document.querySelector('.mast').after(confidence);
  const visits=document.createElement('section');visits.id='assignedVisits';visits.className='card';document.getElementById('home').prepend(visits);
  document.querySelector('.start-inner').insertAdjacentHTML('afterbegin','<label class="f"><span>Your inspector name</span><input class="in" id="rememberInspector" autocomplete="name" maxlength="240" placeholder="Your name"></label>');document.getElementById('rememberInspector').value=prefs.inspector;
  document.querySelector('[data-m="inspector"]').maxLength=240;
  const quick=document.createElement('section');quick.className='card guide-help';quick.innerHTML='<h2>Help & practice</h2><p>Choose any room, record what you checked, then finish and send. Rooms can be added or renamed for each house.</p><a class="act" id="practiceLink">Try a practice inspection</a><details><summary>How to use this app</summary><ol><li>Open a visit from the office, or start an inspection.</li><li>Choose rooms in any order. Good means checked; Could not check keeps the reason.</li><li>Add notes and photos for problems. Add or rename rooms as needed.</li><li>Use Finish & send. The office receives a file through local sharing or USB.</li></ol><p>The app works offline after its files are installed. There is no automatic online sync.</p></details><p id="backupReminder"></p><button class="act" type="button" data-office-backup>Save complete backup</button><small>App version 60</small>';document.getElementById('home').append(quick);
  const practiceURL=globalThis.CIMCO_OFFLINE_BUNDLE?new URL(office?'CIMCO-Office-Practice.html':'CIMCO-Field-Practice.html',location.href):new URL(location.href);practiceURL.search='';if(!globalThis.CIMCO_OFFLINE_BUNDLE)practiceURL.searchParams.set('practice','1');document.getElementById('practiceLink').href=practiceURL.href;
  if(SELF_TEST){const banner=document.createElement('aside');banner.id='practiceBanner';banner.innerHTML='<b>'+(PRACTICE?'Practice mode':'Test mode')+' — separate from real inspections</b><span>Use fictional details only. Your real inspection records are kept separately.</span><a id="exitPractice" class="act">Return to real inspections</a>';document.body.prepend(banner);const exit=globalThis.CIMCO_OFFLINE_BUNDLE?new URL(office?'CIMCO-Office-Desk.html':'CIMCO-Field-App.html',location.href):new URL(location.href);exit.search='';document.getElementById('exitPractice').href=exit.href;}
  const review=document.getElementById('reviewPanel'),sign=document.getElementById('signCard'),preview=review.querySelector('[data-preview-report]');
  for(const [name,label] of [['inspSigName','Printed inspector name (optional)'],['tenantSigName','Printed tenant name (optional)']]){const input=document.querySelector('[data-m="'+name+'"]');input.setAttribute('aria-label',label);input.placeholder=label;}
  review.insertAdjacentHTML('afterbegin','<nav class="finish-steps" aria-label="Finish steps"><button class="act" type="button" data-finish-step="0">1. Check</button><button class="act" type="button" data-finish-step="1">2. Sign</button><button class="act" type="button" data-finish-step="2">3. Send</button></nav><p id="finishSummary" role="status"></p>');
  const check=document.createElement('section');check.dataset.stepContent='0';check.className='finish-stage';check.innerHTML='<h3>Check the report</h3><p>Open any missing item below. You can return to any room.</p><div id="finishPhotoNudges"></div><button class="act solid" type="button" data-next-sign>Continue to signatures</button>';check.prepend(document.getElementById('reviewIssues'));check.querySelector('[data-next-sign]').before(preview);review.append(check);
  const signatures=document.createElement('section');signatures.dataset.stepContent='1';signatures.className='finish-stage';signatures.innerHTML='<h3>Review and sign</h3><p>Sign after checking the report. If someone cannot sign, record the reason. You can still send a clearly identified draft.</p><button class="act solid" type="button" data-continue-send>Continue to send</button>';signatures.querySelector('button').before(sign);review.append(signatures);
  const send=document.createElement('section');send.dataset.stepContent='2';send.className='finish-stage';send.innerHTML='<h3>Send to the office</h3><p>The report file includes the inspection and its photos. Use local file sharing or save it for USB transfer.</p><p id="finishOfficeStatus" role="status"></p><div id="finishTransfer" hidden><button class="act solid" type="button" data-guide-share>Send to office</button><button class="act" type="button" data-guide-save>Save office file</button></div><div id="finishRebuild"><p>The report needs preparing after the latest changes.</p><button class="act solid" type="button" data-rebuild-report>Prepare report</button></div><details><summary>Office confirmation & transfer help</summary><p>Sharing or saving is not proof the office received it. Ask the office to return its confirmation file, then open it here.</p><button class="act" type="button" data-import-office>Open office confirmation</button><p>LocalSend can transfer files between iPhone, Android and Windows on the same local Wi-Fi without internet. USB is another option. The app has no online account or automatic sync.</p></details>';review.append(send);
  const cost=document.getElementById('reviewCost'),advanced=document.createElement('details');advanced.className='finish-office-details';advanced.innerHTML='<summary>Office estimates</summary>';advanced.append(cost);check.append(advanced);
  check.append(document.getElementById('comparisonCard'));
  const calendar=document.querySelector('a[href="./schedule.html"]');if(calendar)calendar.closest('.card').hidden=true;
  if(!office)document.getElementById('homeOffice').insertAdjacentHTML('afterbegin','<div class="guide-actions"><button class="act" type="button" data-plan-visit>Prepare visit file (office)</button></div>');
  const planner=document.createElement('dialog');planner.id='visitPlanner';planner.innerHTML='<form><header><h2>Prepare a visit file</h2><button class="act" type="button" data-close-planner>Close</button></header><p>Choose a saved property layout, or use the starting checklist. The inspector can change rooms on site.</p><label>Saved property<select name="property"></select></label><label>Property address<input name="address" required maxlength="1000"></label><label>Unit<input name="unit" maxlength="100"></label><label>Inspection type<select name="mode">'+['in','out','ready','routine'].map(m=>'<option value="'+m+'">'+e(MODE_LABEL[m])+'</option>').join('')+'</select></label><label>Visit date<input type="date" name="date" required></label><label>Inspector name<input name="inspector" maxlength="240"></label><label>Office instructions (optional)<textarea name="instructions" maxlength="5000"></textarea></label><p role="status"></p><button class="act solid" type="submit">Prepare visit</button></form>';document.body.append(planner);
  if(!office){document.querySelectorAll('[data-field-panel="review"]').forEach(b=>b.textContent='Finish & send');}
}
shell();
renderHome=function(){base.renderHome();renderVisits();paintStatus();};
renderSpaces=function(){base.renderSpaces();decorateRooms();};
renderHead=function(){base.renderHead();decorateRooms();if(cur&&document.body.dataset.fieldPanel==='review')renderFinish();paintStatus();};
save=function(){base.save();saveOK=true;if(cur&&document.body.dataset.fieldPanel==='review')renderFinish();paintStatus();};
flushSave=function(){const ok=base.flushSave();saveOK=ok;paintStatus();return ok;};
newInspection=function(mode,from,seed){const rec=base.newInspection(mode,from,seed);if(!rec.meta.inspector&&prefs.inspector)rec.meta.inspector=prefs.inspector;return rec;};
openRec=async function(rec){await base.openRec(rec);decorateRooms();onPanel(document.body.dataset.fieldPanel);};
document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  const handled=['planVisit','closePlanner','saveVisit','startVisit','suggestKey','replaceKey','finishStep','nextSign','continueSend','rebuildReport','guideShare','guideSave'].some(k=>Object.prototype.hasOwnProperty.call(b.dataset,k));if(!handled)return;
  event.preventDefault();event.stopImmediatePropagation();void(async()=>{try{
    if(b.hasAttribute('data-plan-visit'))return showPlan();
    if(b.hasAttribute('data-close-planner'))return document.getElementById('visitPlanner').close();
    if(b.dataset.saveVisit)return exportVisit(b.dataset.saveVisit);
    if(b.dataset.startVisit)return await startVisit(b.dataset.startVisit);
    if(b.dataset.replaceKey){const [rid,i]=b.dataset.replaceKey.split(':'),it=cur.spaces.find(s=>s.id===rid)?.items[+i];if(!it||!V.replacementActions(it.t).some(a=>a.kind===b.dataset.replaceKind))return;InspectorFlow.remember();it.s='work';it.category='repair';const note=b.dataset.replaceNote;if(!String(it.n||'').split('\n').includes(note))it.n=it.n?it.n+'\n'+note:note;save();renderSpaces();renderHead();toast('Replacement needed recorded.');return;}
    if(b.dataset.suggestKey){const [rid,i]=b.dataset.suggestKey.split(':'),it=cur.spaces.find(s=>s.id===rid)?.items[+i];if(!it||it.s!=='work')return;InspectorFlow.remember();const note=b.dataset.suggestNote;if(!it.n.split('\n').includes(note))it.n=it.n?it.n+'\n'+note:note;const field=document.querySelector('[data-note="'+b.dataset.suggestKey+'"]');field.value=it.n;field.classList.add('has-note');save();renderHead();return;}
    if(b.hasAttribute('data-next-sign')){finishStep=1;InspectorFlow.setPanel('review');return;}
    if(b.hasAttribute('data-finish-step')){const next=Number(b.dataset.finishStep);if(next===2)return await prepareFinish();finishStep=next;InspectorFlow.setPanel('review');return;}
    if(b.hasAttribute('data-continue-send')||b.hasAttribute('data-rebuild-report'))return await prepareFinish();
    if(!validReady())throw new Error('Prepare the report again after the latest changes.');
    if(b.hasAttribute('data-guide-share'))await OfflineOffice.sharePrepared();
    if(b.hasAttribute('data-guide-save'))OfflineOffice.downloadPrepared();
    renderFinish();paintStatus();
  }catch(err){toast(err.message||'This action could not finish.');}})();
},true);
document.addEventListener('change',event=>{
  const t=event.target;
  if(t.hasAttribute('data-only-unchecked')){onlyUnchecked=t.checked;applyFilter();return;}
  if(t.name==='property'&&t.closest('#visitPlanner')){const layout=OfflineOffice.layoutLibrary().find(l=>l.id===t.value),form=t.form;if(layout){form.elements.address.value=layout.address;form.elements.unit.value=layout.unit;form.elements.mode.value=layout.mode;}return;}
  if(t.dataset.m==='inspector'||t.id==='rememberInspector'){try{prefs.inspector=t.value.trim();store();document.getElementById('rememberInspector').value=prefs.inspector;}catch(err){toast(err.message);}}
},true);
document.addEventListener('submit',event=>{if(!event.target.closest('#visitPlanner'))return;event.preventDefault();const form=event.target;try{const data=Object.fromEntries(new FormData(form)),visit=createVisit(data);document.getElementById('visitPlanner').close();exportVisit(visit.id);toast('Visit file created. Transfer it to the inspector.');}catch(err){form.querySelector('[role=status]').textContent=err.message;}},true);
addEventListener('online',paintStatus);addEventListener('offline',paintStatus);navigator.serviceWorker?.addEventListener('controllerchange',paintStatus);
if(PRACTICE&&!office&&!LIST.length){const rec=newInspection('out',null,{address:'PRACTICE HOUSE - fictional',unit:''});rec.meta.inspector='Practice Inspector';flushSave();renderHome();}
if(SELF_TEST)window.__CIMCO_GUIDE__={importVisits,createVisit,startVisit,exportState,restoreState,visitFile,finishWarnings,prepareFinish,renderFinish,decorateRooms,onPanel,noteBackup,
  cleanup:()=>{prefs=V.state();localStorage.removeItem(PREF_KEY);ready=null;finishRecord='';finishStep=0;onlyUnchecked=false;filterRecord='';saveOK=true;renderVisits();paintStatus();}};
renderHome();decorateRooms();paintStatus();
return {exportState,restoreState,noteBackup,importVisits,renderVisits,paintStatus,onPanel,decorateRooms,renderFinish};
})();
