/* Flexible field workflow: choose any area, keep a clear route back, resume safely. */
var InspectorFlow = (function(){
"use strict";
let openedId="",panel="rooms",lastChange=null;
const base={renderEditor,renderHome,renderSpaces,renderHead,setActiveSpace,openRec};
function paintSaved(ok){
  const el=document.getElementById("fieldSaveStatus");
  if(el){el.textContent=ok?"Saved on this phone":"Could not save - open Office tools";el.classList.toggle("save-error",!ok);}
}
function remember(){if(cur)lastChange={id:cur.id,spaces:JSON.parse(JSON.stringify(cur.spaces)),wk:JSON.parse(JSON.stringify(cur.wk||{}))};}
function persistPlace(){
  if(!cur)return;
  cur.fieldState={panel,room:ACTIVE_SPACE_ID};
  flushSave();
}
function setPanel(next,room){
  if(!cur)return;
  panel=next;
  if(room){base.setActiveSpace(room);}
  const currentRoom=activeSpaces(cur).find(sp=>sp.id===ACTIVE_SPACE_ID);
  document.getElementById('fieldRoomTitle').textContent=currentRoom?currentRoom.name:'Choose an area';
  document.getElementById('fieldPropertyTitle').textContent=title(cur);
  document.body.dataset.fieldPanel=panel;
  document.querySelectorAll('#spaces details.sec').forEach(d=>{d.classList.toggle("field-active",d.dataset.sp===ACTIVE_SPACE_ID);if(d.dataset.sp===ACTIVE_SPACE_ID)d.open=true;});
  if(next==="details")document.getElementById("metaBox").open=true;
  if(next==="review")renderReview();
  persistPlace();renderBar();
  const target=next==="room"?document.querySelector('.field-room-head'):document.getElementById(({rooms:"roomDirectory",details:"propertyDetails",notes:"fieldNotesCard",review:"reviewPanel",office:"officePanel"})[next]);
  if(target){target.scrollIntoView({block:"start",behavior:"auto"});const heading=target.querySelector("h2,h3,summary");if(heading){heading.setAttribute("tabindex","-1");heading.focus({preventScroll:true});}}
  if(typeof FieldGuide!=="undefined")FieldGuide.onPanel(next);
}
function roomState(sp){
  const done=sp.items.filter(i=>!!i.s).length,work=sp.items.filter(i=>i.s==="work").length,untested=sp.items.filter(i=>i.s==="nt").length;
  return {done,work,untested,label:!done?"Not started":done<sp.items.length?"In progress":"Checked"};
}
function renderDirectory(){
  if(!cur)return;
  const host=document.getElementById("roomCards");
  host.innerHTML=activeSpaces(cur).map(sp=>{const s=roomState(sp);return `<button type="button" class="room-card ${s.done===sp.items.length?"checked":""}" data-room-open="${sp.id}"><b>${esc(sp.name)}</b><span>${s.label} · ${s.done} of ${sp.items.length} checked${s.work?" · "+s.work+(s.work===1?" needs work":" need work"):""}${s.untested?" · "+s.untested+" could not check":""}</span></button>`;}).join("")||'<p>No areas yet. Add a room or area below.</p>';
  const count=document.getElementById("fieldSummary"),s=stats(cur);
  count.textContent=s.done+" of "+s.total+" items recorded"+(s.flags?" · "+s.flags+(s.flags===1?" needs work":" need work"):"");
}
function renderReview(){
  if(!cur)return;
  const issues=InspectionReport.readiness(cur),host=document.getElementById("reviewIssues"),p=InspectionReport.pricing(cur);
  document.getElementById("reviewTitle").textContent=issues.length?"A few things to review":"Ready to review the report";
  host.innerHTML=issues.length?issues.map(i=>`<button type="button" class="review-fix" ${i.room?`data-review-room="${i.room}" data-review-item="${i.item}"`:`data-field-panel="${i.target==="metaBox"?"details":"rooms"}"`}>${esc(i.text)} <span aria-hidden="true">→</span></button>`).join(""):'<p>Property details and checklist explanations are recorded. Review the report before sharing it.</p>';
  document.getElementById("reviewCost").textContent=p.rows.length?"Office review: "+(p.pending.length?p.pending.length+(p.pending.length===1?" item needs classification or estimates.":" items need classification or estimates."):"Recorded classifications and estimates are available."):"No work estimates recorded.";
  const notice=document.getElementById("signatureNotice");notice.textContent=cur.signatureNotice||"";notice.hidden=!cur.signatureNotice;
  if(typeof FieldGuide!=="undefined")FieldGuide.renderFinish();
}
function decorate(){
  if(!cur)return;
  document.querySelectorAll('#spaces details.sec').forEach(d=>{
    d.classList.toggle("field-active",d.dataset.sp===ACTIVE_SPACE_ID);
    if(d.dataset.sp===ACTIVE_SPACE_ID)d.open=true;
    const sp=cur.spaces.find(s=>s.id===d.dataset.sp);if(!sp)return;
    const old=d.querySelector('.sectools');
    if(old&&!old.closest('.room-settings')){const options=document.createElement('details');options.className='room-settings noprint';options.innerHTML='<summary>Room options</summary>';old.before(options);options.append(old);}
    const all=d.querySelector('[data-allok]');if(all)all.textContent="Mark remaining items Good";
    const add=d.querySelector('[data-additem]');if(add)add.textContent="Add checklist item";
    const remove=d.querySelector('[data-delsp]');if(remove)remove.textContent="Remove this area";
    if(!d.querySelector('.room-done'))d.insertAdjacentHTML('beforeend','<div class="room-done noprint"><button type="button" class="act solid" data-field-panel="rooms">Back to all rooms</button><button type="button" class="act" data-finish-later>Save and finish later</button></div>');
    d.querySelectorAll('.item').forEach(item=>{
      const index=Number(item.dataset.key.split(':')[1]),it=sp.items[index];
      item.classList.toggle('is-nt',it.s==='nt');item.classList.toggle('is-np',it.s==='np');
      const cam=item.querySelector('.cam'),pics=(photos[item.dataset.key]||[]).length;
      cam.innerHTML='Add photo'+(pics?' ('+pics+')':'');
      const note=item.querySelector('.note');note.setAttribute('aria-label','Notes for '+sp.name+' / '+it.t);note.placeholder=it.s==='nt'?'Why could you not check it?':'What did you notice?';
      note.classList.toggle('has-note',!!it.n);
      if(!item.querySelector('.add-note'))note.insertAdjacentHTML('beforebegin',`<button type="button" class="add-note noprint" data-add-note="${item.dataset.key}">Add or edit note</button>`);
      if(!item.querySelector('.quick-reasons'))note.insertAdjacentHTML('afterend',`<div class="quick-reasons noprint" aria-label="Common reasons">${['Power off','Water off','Room locked','Could not reach safely'].map(reason=>`<button type="button" data-reason="${esc(reason)}" data-item-key="${item.dataset.key}">${esc(reason)}</button>`).join('')}</div>`);
    });
  });
  renderDirectory();
  if(panel==='review')renderReview();
  document.body.dataset.fieldPanel=panel;
  const titleEl=document.getElementById('fieldRoomTitle'),sp=activeSpaces(cur).find(s=>s.id===ACTIVE_SPACE_ID);if(titleEl)titleEl.textContent=sp?sp.name:'Choose an area';
}
function shell(){
  document.body.classList.add('simple-field');
  const first=document.querySelector('#editor>.card');first.id='inspectionHeading';
  first.insertAdjacentHTML('afterbegin','<div class="field-heading-actions noprint"><button type="button" class="act ghost" data-field-panel="details">Property details</button><button type="button" class="act ghost" data-finish-later>Save and finish later</button></div>');
  document.getElementById('edAddr').insertAdjacentHTML('afterend','<p id="fieldSummary"></p><p id="fieldSaveStatus" role="status">Saved on this phone</p>');
  const details=document.createElement('section');details.id='propertyDetails';details.className='card noprint';details.innerHTML='<h2>Property details</h2>';
  first.after(details);details.append(document.getElementById('metaBox'));
  const metaSummary=document.querySelector('#metaBox>summary');metaSummary.textContent='Inspection information';
  const office=document.createElement('section');office.id='officePanel';office.className='card noprint';office.innerHTML='<h2>Office tools</h2><p>Report settings, estimates, backups, and form changes.</p>';
  document.getElementById('editor').append(office);office.append(document.querySelector('.form-switch'));
  const actions=document.getElementById('expOne').parentElement;office.append(actions);office.append(document.getElementById('wkCard'));
  const photoLabel=document.querySelector('[data-m="photoSize"]').closest('label');office.append(photoLabel);
  const officeJump=document.createElement('button');officeJump.type='button';officeJump.className='act';officeJump.dataset.fieldPanel='office';officeJump.textContent='Office tools';details.append(officeJump);
  first.append(first.querySelector('.field-heading-actions'));
  const directory=document.createElement('section');directory.id='roomDirectory';directory.className='card noprint';directory.innerHTML='<h2>Rooms and areas</h2><p>Choose any area. Walk the house in the order that works for you.</p><div class="room-cards" id="roomCards"></div>';
  document.getElementById('spaces').before(directory);
  const add=document.getElementById('addSpaces');directory.append(add);
  add.querySelector('.roomtools-head b').textContent='Add a room or area';add.querySelector('.roomtools-head span').textContent='Add rooms as you find them. Use Room options to rename or remove an area.';
  add.querySelector('.roomtools-note').textContent='This layout is kept with the property inspection.';
  add.querySelector('.roomquick').insertAdjacentHTML('beforeend','<button class="mini" data-add="garage">+ Garage</button><button class="mini" data-add="patio">+ Patio / lanai</button><button class="mini" data-add="hvac">+ HVAC</button><button class="mini" data-add="thermostat">+ Thermostat</button><button class="mini" data-add="filter">+ Air filter</button>');
  const roomHead=document.createElement('div');roomHead.className='field-room-head noprint';roomHead.innerHTML='<button type="button" class="act" data-field-panel="rooms">← All rooms</button><div><p id="fieldPropertyTitle"></p><h2 id="fieldRoomTitle">Choose an area</h2></div>';document.getElementById('spaces').before(roomHead);
  const review=document.createElement('section');review.id='reviewPanel';review.className='card noprint';review.innerHTML='<h2 id="reviewTitle">Review inspection</h2><div id="reviewIssues"></div><p id="reviewCost"></p><p id="signatureNotice" role="status" hidden></p><button type="button" class="act solid" data-preview-report>Preview report / Save PDF</button>';
  document.getElementById('editor').append(review);review.append(document.getElementById('signCard'));
  const tenantBox=document.querySelector('#signCard .sigbox');tenantBox.insertAdjacentHTML('afterbegin','<label class="f"><span>Tenant signature status</span><select class="in m" data-m="tenantSignStatus"><option value="">Signature not recorded</option><option value="present">Tenant signing in person</option><option value="absent">Tenant absent</option><option value="declined">Tenant declined to sign</option><option value="remote">Tenant review pending</option><option value="unavailable">Signature not available</option></select></label>');
  const nav=document.querySelector('.inspection-nav');nav.innerHTML='<button type="button" data-field-panel="rooms">All rooms</button><button type="button" id="notesJump" data-field-panel="notes">Keys & notes</button><button type="button" data-field-panel="review">Review & PDF</button>';
  const startCard=document.querySelector('#home>.card:first-child'),start=document.createElement('details');start.id='simpleStart';start.className='card';start.innerHTML='<summary>Start inspection</summary>';startCard.before(start);start.append(startCard);startCard.className='start-inner';
  const savedTitle=document.querySelector('#list').parentElement.querySelector('h2');savedTitle.textContent='Continue an inspection';
  const homeOffice=document.createElement('details');homeOffice.id='homeOffice';homeOffice.className='card';homeOffice.innerHTML='<summary>Office tools & backups</summary>';document.getElementById('home').append(homeOffice);
  [...document.querySelectorAll('#home>.card')].filter(card=>card.contains(document.getElementById('expAll'))||card.querySelector('a[href="./schedule.html"]')).forEach(card=>homeOffice.append(card));
  document.querySelector('#newAddress').placeholder='Street address';
  document.querySelector('#newUnit').placeholder='Unit, if any';
  document.querySelector('#mastLede').textContent='Choose a property, check its rooms, and review the report. Your work saves on this phone.';
  const navLabel=document.querySelector('.form-switch small');if(navLabel)navLabel.textContent='Changing the form keeps observations and photos. Existing signatures require a new review.';
  for(const [id,label] of [['repBtn','Save shareable report'],['expOne','Back up this inspection'],['expAll','Back up all inspections'],['impBtn','Restore a backup']]){const el=document.getElementById(id);if(el)el.textContent=label;}
  const preview=document.createElement('dialog');preview.id='reportPreview';preview.innerHTML='<div class="preview-actions"><button type="button" class="act" data-close-preview>Back to inspection</button><button type="button" class="act solid" data-print-preview>Print / Save PDF</button></div><iframe title="Inspection report preview"></iframe>';document.body.append(preview);
}
shell();
renderHome=function(){base.renderHome();};
renderEditor=function(){
  if(openedId!==cur.id){openedId=cur.id;lastChange=null;panel=cur.fieldState?.panel||'rooms';if(!['rooms','room','details','notes','review','office'].includes(panel))panel='rooms';ACTIVE_SPACE_ID=cur.fieldState?.room||'';}
  base.renderEditor();
  document.getElementById('ackText').textContent='Signatures acknowledge review of this report version. Unreviewed items and inspection limits remain as listed.';
  decorate();
};
renderSpaces=function(){base.renderSpaces();decorate();};
renderHead=function(){base.renderHead();decorate();};
setActiveSpace=function(id){base.setActiveSpace(id);};
jumpToSpace=function(id){setPanel('room',id);};
watchSpaces=function(){if(SPACE_OBSERVER){SPACE_OBSERVER.disconnect();SPACE_OBSERVER=null;}};
renderBar=function(){
  const bar=document.getElementById('bar');
  if(document.body.dataset.view==='home'){bar.innerHTML='<div class="home-save-label">Inspections stay on this phone. Use Office tools for backups.</div>';return;}
  bar.innerHTML='<button type="button" class="act" data-field-panel="rooms">All rooms</button><button type="button" class="act" data-undo '+(!lastChange||lastChange.id!==cur.id?'disabled':'')+'>Undo</button><button type="button" class="act solid" data-field-panel="review">Finish / PDF</button>';
};
document.addEventListener('click',async event=>{
  const t=event.target.closest('button');if(!t)return;
  if(document.body.dataset.photoSaving==='true'&&(t.hasAttribute('data-finish-later')||t.hasAttribute('data-preview-report'))){event.preventDefault();event.stopImmediatePropagation();toast('Please wait for the photos to finish saving.');return;}
  if(t.hasAttribute('data-k')||t.hasAttribute('data-allok'))remember();
  if(t.hasAttribute('data-allok')){
    event.preventDefault();event.stopImmediatePropagation();
    const ok=await CimcoDialog.open({title:'Mark the remaining items Good?',message:'Only do this after checking every remaining item in this area. Existing results and notes are kept.',confirmLabel:'I checked them - mark Good'});
    if(ok){const sp=cur.spaces.find(s=>s.id===t.dataset.allok);sp.items.forEach(it=>{if(!it.s)it.s='ok';});save();renderSpaces();renderHead();}return;
  }
  if(t.dataset.fieldPanel){event.preventDefault();event.stopImmediatePropagation();setPanel(t.dataset.fieldPanel);return;}
  if(t.dataset.roomOpen){event.preventDefault();event.stopImmediatePropagation();setPanel('room',t.dataset.roomOpen);return;}
  if(t.dataset.reviewRoom){event.preventDefault();event.stopImmediatePropagation();setPanel('room',t.dataset.reviewRoom);const item=document.querySelector('[data-key="'+t.dataset.reviewRoom+':'+t.dataset.reviewItem+'"]');if(item){item.scrollIntoView({block:'center'});item.querySelector('.note')?.focus();}return;}
  if(t.hasAttribute('data-finish-later')){event.preventDefault();event.stopImmediatePropagation();persistPlace();if(flushSave())go('home');return;}
  if(t.hasAttribute('data-undo')){event.preventDefault();event.stopImmediatePropagation();if(!cur||!lastChange||lastChange.id!==cur.id)return;cur.spaces=lastChange.spaces;cur.wk=lastChange.wk;lastChange=null;save();renderSpaces();renderHead();toast('Last checklist change undone');return;}
  if(t.dataset.addNote){event.preventDefault();event.stopImmediatePropagation();const note=document.querySelector('[data-note="'+t.dataset.addNote+'"]');note.classList.add('has-note');note.focus();return;}
  if(t.dataset.reason){event.preventDefault();event.stopImmediatePropagation();const [id,index]=t.dataset.itemKey.split(':');const it=cur.spaces.find(s=>s.id===id).items[+index];remember();it.n=t.dataset.reason;save();const note=document.querySelector('[data-note="'+t.dataset.itemKey+'"]');note.value=it.n;note.classList.add('has-note');renderHead();return;}
  if(t.hasAttribute('data-preview-report')){event.preventDefault();event.stopImmediatePropagation();await ensureReportLogo();flushSave();const dialog=document.getElementById('reportPreview');dialog.querySelector('iframe').srcdoc=reportHTML(cur);dialog.showModal();return;}
  if(t.hasAttribute('data-close-preview')){document.getElementById('reportPreview').close();return;}
  if(t.hasAttribute('data-print-preview')){event.preventDefault();document.getElementById('reportPreview').close();await printNow();return;}
},true);
document.addEventListener('input',event=>{
  if(event.target.dataset.note){const el=event.target;el.classList.add('has-note');}
  if(cur)queueMicrotask(()=>{if(panel==='review')renderReview();});
},true);
document.addEventListener('change',event=>{if(event.target.dataset.cost){const value=InspectionReport.amount(event.target.value);event.target.setCustomValidity(value===null&&event.target.value?'Enter a non-negative amount with up to two decimal places.':'');}},true);
openRec=async function(rec){await base.openRec(rec);if(panel==='room'&&!activeSpaces(cur).some(s=>s.id===ACTIVE_SPACE_ID))panel='rooms';decorate();if(panel==='room')setPanel('room',ACTIVE_SPACE_ID);};
if(SELF_TEST){window.__CIMCO_FLOW__={setPanel,roomState,remember,renderReview,
  create:async(mode,seed)=>{const rec=newInspection(mode,null,seed);await openRec(rec);return rec;},
  current:()=>cur,reopen:rec=>openRec(rec),report:rec=>reportHTML(rec),flush:flushSave,
  cleanup:()=>{lastChange=null;LIST=[];cur=null;photos={};clearTimeout(saveTimer);localStorage.removeItem(KEY);go('home');}
};}
renderHome();renderBar();
return {paintSaved,remember,setPanel,decorate,renderReview,clearUndo:()=>{lastChange=null;renderBar();}};
})();
