/* Offline office handoff, layouts, comparison, maintenance and recoverable deletion. */
var OfflineOffice = (function(){
"use strict";
const M=OfficeModel,officeMode=globalThis.CIMCO_OFFICE_DESK===true,STATE_KEY=KEY+".office-tools.v1";
const e=esc,clone=M.clone;
let state=loadState(),storePromise=null,prepared=null,view="receive",layoutDraft=null,baselineGeneration=0;
const base={renderHome,renderSpaces,renderHead,openRec,newInspection};
function loadState(){try{const x=JSON.parse(localStorage.getItem(STATE_KEY)||"{}");return {layouts:x.layouts||{},officeName:x.officeName||"",layoutHistory:x.layoutHistory||{}};}catch(err){return {layouts:{},officeName:"",layoutHistory:{}};}}
function saveState(){try{localStorage.setItem(STATE_KEY,JSON.stringify(state));}catch(err){state=loadState();throw new Error("The office settings or layout library could not be saved. Save a backup and free some browser storage.");}}
function store(){
  if(storePromise)return storePromise;
  storePromise=new Promise((resolve,reject)=>{const req=indexedDB.open(PHOTO_DB+"-office-files",1);req.onupgradeneeded=()=>req.result.createObjectStore("packets",{keyPath:"id"});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}).catch(err=>{storePromise=null;throw err;});return storePromise;
}
async function putPacket(value){const database=await store();return new Promise((resolve,reject)=>{const tx=database.transaction("packets","readwrite");tx.objectStore("packets").put(value);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error("Office file could not be saved."));});}
async function storedPacket(id){const database=await store();return new Promise((resolve,reject)=>{const req=database.transaction("packets","readonly").objectStore("packets").get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function packetEntries(){const database=await store();return new Promise((resolve,reject)=>{const req=database.transaction("packets","readonly").objectStore("packets").getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function photoById(id){const database=await db();return new Promise((resolve,reject)=>{const req=database.transaction("p","readonly").objectStore("p").get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function flatten(map){return Object.values(map).flat();}
function activeRecords(){return LIST.filter(r=>!r.deletedAt);}
function fieldVersion(rec,map){return InspectionReport.fingerprint(rec,map);}
function workVersion(rec){return M.canonical(rec.followUp||{});}
function imageMap(pics){const out={};for(const photo of pics)(out[photo.key]=out[photo.key]||[]).push(photo);return out;}
function attachBaseline(rec,value){Object.defineProperty(rec,"baselineSnapshot",{value,writable:true,configurable:true,enumerable:false});}
function saveBlob(name,blob){
  const a=document.createElement("a"),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function saveJSON(name,value){saveBlob(name,new Blob([JSON.stringify(value,null,2)],{type:"application/json"}));}
function fileName(rec,suffix){return title(rec).replace(/[^a-zA-Z0-9._-]+/g,"-").slice(0,110)+"-"+(rec.meta.date||today())+suffix;}
function safeDialogOpen(dialog){if(typeof dialog.showModal==="function")dialog.showModal();else dialog.setAttribute("open","");}
function closeWorkspace(){const dialog=document.getElementById("officeWorkspace");if(typeof dialog.close==="function")dialog.close();else dialog.removeAttribute("open");}
function message(text,error=false){const el=document.getElementById("officeMessage");if(el){el.textContent=text;el.classList.toggle("error",error);}else toast(text);}
async function baseline(rec){
  if(rec.baselineSnapshot){const value=rec.baselineSnapshot;if(propertyMatches(value.inspection.meta,rec.meta))return value;return null;}
  if(rec.baselinePacketId){const cached=await storedPacket(rec.baselinePacketId);const value=cached?.packet?.payload?.baseline;if(value&&propertyMatches(value.inspection.meta,rec.meta))return value;}
  if(!rec.from)return null;
  const source=LIST.find(r=>(r.id===rec.from||r.reportId===rec.from)&&r.mode==="in"&&propertyMatches(r.meta,rec.meta));
  if(!source)return null;
  return {inspection:M.cleanRecord(source),photos:flatten(await photoLoad(source.id)).filter(p=>!p.deletedAt&&p.kind!=="completion")};
}
function comparisonRows(rec,map=InspectionReport.photoMap(rec)){
  const prior=rec.baselineSnapshot;if(!prior||!propertyMatches(prior.inspection.meta,rec.meta))return [];
  const original=prior.inspection,rows=[];
  rec.spaces.forEach(sp=>{
    // Ambiguous room names are left unmatched; photos are never guessed across rooms.
    if(rec.spaces.filter(s=>s.type===sp.type&&s.name.trim().toLowerCase()===sp.name.trim().toLowerCase()).length!==1)return;
    const candidates=original.spaces.filter(s=>s.type===sp.type&&s.name.trim().toLowerCase()===sp.name.trim().toLowerCase());
    if(candidates.length!==1)return;const before=candidates[0];
    sp.items.forEach((it,i)=>{if(sp.items.filter(x=>x.t.toLowerCase()===it.t.toLowerCase()).length!==1)return;const items=before.items.map((value,index)=>({value,index})).filter(o=>o.value.t.toLowerCase()===it.t.toLowerCase());if(items.length!==1)return;const old=items[0];
      const beforePhotos=prior.photos.filter(p=>!p.deletedAt&&p.key===before.id+":"+old.index),afterPhotos=(map[sp.id+":"+i]||[]).filter(p=>!p.deletedAt);
      if(beforePhotos.length||afterPhotos.length)rows.push({room:sp.name,item:it.t,before:beforePhotos,after:afterPhotos,beforeDate:original.meta.date,afterDate:rec.meta.date,beforeResult:old.value.s,afterResult:it.s});
    });
  });return rows;
}
async function hydrateBaseline(){
  if(!cur)return;const rec=cur,generation=++baselineGeneration;
  try{const value=await baseline(rec);if(rec!==cur||generation!==baselineGeneration)return;if(value)attachBaseline(rec,value);renderComparison();}catch(err){if(rec===cur)document.getElementById("comparisonContent").textContent="The earlier photos could not be opened. The current inspection is unchanged.";}
}
function receiptStatus(rec){
  const current=fieldVersion(rec),work=workVersion(rec),history=rec.handoffs||[],last=[...history].reverse().find(h=>h.conditionVersion===current&&h.workVersion===work);
  if(last?.receipt)return "Office receipt imported: "+last.receipt.receivedBy+", "+new Date(last.receipt.receivedAt).toLocaleString()+".";
  if(last)return last.shareOpenedAt?"Sharing was opened. Office receipt is still pending.":last.savedAt?"A packet copy was saved. Office receipt is still pending.":"Office packet prepared. It has not been confirmed by the office.";
  return history.length?"There are new changes to share. Earlier receipts cover earlier copies.":"Saved on this phone. No office receipt yet.";
}
async function zipFor(packet){
  const rec=clone(packet.payload.inspection),pics=packet.payload.photos;rec.photos=pics;
  if(packet.payload.baseline)rec.baselineSnapshot=clone(packet.payload.baseline);
  const zip=new JSZip();zip.file("inspection.cimco.json",JSON.stringify(packet));zip.file("OPEN-REPORT.html",InspectionReport.html(rec,imageMap(pics)));
  zip.file("READ-ME.txt","CIMCO offline inspection packet\n\nOpen OPEN-REPORT.html to read or print the report.\nOpen CIMCO-Office-Desk.html and choose Receive office file to import this ZIP and record a receipt.\n\nNo Internet service or account is needed. A saved or shared file is not proof of office receipt. Return the generated receipt file to the inspector.\n");
  return zip.generateAsync({type:"blob",mimeType:"application/zip",compression:"DEFLATE",compressionOptions:{level:4}});
}
async function preparePacket(rec=cur){
  if(!rec||rec.deletedAt)throw new Error("Open an active inspection first.");
  if(document.body.dataset.photoSaving==="true")throw new Error("Wait for the photos to finish saving.");
  if(!String(rec.meta.address||"").trim())throw new Error("Add the property address before sharing with the office.");
  if(!flushSave())throw new Error("The inspection could not be saved on this phone.");
  await ensureReportLogo();const all=flatten(await photoLoad(rec.id)),prior=await baseline(rec);
  const keys=new Set(activeSpaces(rec).flatMap(sp=>sp.items.map((it,i)=>sp.id+":"+i)));
  const pics=all.filter(p=>keys.has(p.key)||p.kind==="completion");
  const conditionVersion=fieldVersion(rec,imageMap(pics)),work=workVersion(rec),priorHash=prior?await M.digest(prior):"";
  const existing=[...(rec.handoffs||[])].reverse().find(h=>h.conditionVersion===conditionVersion&&h.workVersion===work&&h.baselineDigest===priorHash);
  if(existing){const cached=await storedPacket(existing.id);if(cached?.blob){if(prior)rec.baselinePacketId=cached.id;flushSave();prepared={...cached,rec};paintHandoff();return prepared;}}
  const packet=await M.createPacket(rec,pics,prior,conditionVersion,"packet-"+uid()),blob=await zipFor(packet);
  const entry={id:packet.id,inspectionId:rec.id,packet,blob,direction:"outgoing",createdAt:packet.createdAt};await putPacket(entry);
  if(prior)rec.baselinePacketId=packet.id;
  rec.handoffs=rec.handoffs||[];rec.handoffs.push({id:packet.id,digest:packet.digest,conditionVersion,workVersion:work,baselineDigest:priorHash,createdAt:packet.createdAt});
  if(!flushSave())throw new Error("The packet was prepared, but its status could not be saved. Free some storage and try again.");
  prepared={...entry,rec};paintHandoff();return prepared;
}
function paintHandoff(){
  if(!cur)return;const el=document.getElementById("handoffStatus");if(el)el.textContent=receiptStatus(cur);
  const ready=document.getElementById("packetReady"),valid=prepared&&prepared.rec.id===cur.id&&prepared.packet.payload.conditionVersion===fieldVersion(cur)&&prepared.rec===cur&&prepared.rec.handoffs.some(h=>h.id===prepared.id&&h.workVersion===workVersion(cur));
  if(ready)ready.hidden=!valid;
}
function markPacket(action){if(!prepared)return;const h=(prepared.rec.handoffs||[]).find(h=>h.id===prepared.id);if(h)h[action]=Date.now();flushSave();paintHandoff();}
function downloadPrepared(){if(!prepared)throw new Error("Prepare an office packet first.");saveBlob(fileName(prepared.rec,"-office-packet.zip"),prepared.blob);markPacket("savedAt");}
async function sharePrepared(){
  if(!prepared)throw new Error("Prepare an office packet first.");const file=new File([prepared.blob],fileName(prepared.rec,"-office-packet.zip"),{type:"application/zip"});
  if(!navigator.canShare?.({files:[file]})||!navigator.share){downloadPrepared();message("Packet saved. Transfer it from Files or Downloads using your usual sharing tool or USB.");return;}
  try{await navigator.share({files:[file],title:"CIMCO inspection - "+title(prepared.rec)});markPacket("shareOpenedAt");}
  catch(err){if(err.name!=="AbortError")throw new Error("Sharing could not open. Choose Save packet instead.");}
}
async function readOfficeFile(file){
  if(file.size>250000000)throw new Error("This file is too large. Share individual inspection packets instead.");
  if(/\.zip$/i.test(file.name)||file.type==="application/zip"){
    const zip=await JSZip.loadAsync(await file.arrayBuffer());const entry=zip.file("inspection.cimco.json")||zip.file("backup.cimco.json");
    if(!entry||Object.keys(zip.files).length>20)throw new Error("This ZIP is not a CIMCO office packet.");
    if(entry._data?.uncompressedSize>350000000)throw new Error("The file contents are too large.");
    const source=await entry.async("string");if(source.length>350000000)throw new Error("The file contents are too large.");return JSON.parse(source);
  }
  const source=await file.text();if(source.length>85000000)throw new Error("The file contents are too large.");return JSON.parse(source);
}
function sameConditions(a,b){return fieldVersion(a,imageMap(a.photos||[]))===fieldVersion(b,imageMap(b.photos||[]));}
async function receivePacket(raw){
  const packet=await M.verifyPacket(raw),already=await storedPacket("received-"+packet.id);
  if(already){if(already.packet.digest!==packet.digest)throw new Error("A different packet already uses this ID. Earlier files were kept.");return {packet,record:LIST.find(r=>r.id===already.inspectionId),duplicate:true};}
  const incoming=clone(packet.payload.inspection),originalId=incoming.id,pics=clone(packet.payload.photos);
  await verifyPictures([...pics,...(packet.payload.baseline?.photos||[])]);
  let local=LIST.find(r=>r.id===incoming.id),fork=false;
  if(local?.deletedAt)throw new Error("This inspection is in Recently deleted. Restore it before importing an update.");
  if(local){const localPics=flatten(await photoLoad(local.id));local.photos=localPics;incoming.photos=pics;const equal=sameConditions(local,incoming);delete local.photos;delete incoming.photos;
    if(!equal){fork=true;incoming.reportId=incoming.reportId||originalId;incoming.id=originalId+"-copy-"+uid();local=null;}
  }
  if(local){
    const accepted=new Set();
    local.followUp=local.followUp||{};for(const [key,task] of Object.entries(incoming.followUp||{}))if(!local.followUp[key]||Number(task.updatedAt)>Number(local.followUp[key].updatedAt)){local.followUp[key]=task;accepted.add('followup:'+task.id);}
    const existing=flatten(await photoLoad(local.id));
    // A newer work update carries the current photo set for that work item.
    // Keep removed evidence recoverable rather than silently printing an older copy.
    for(const p of existing)if(p.kind==='completion'&&accepted.has(p.key)&&!pics.some(o=>o.kind==='completion'&&o.key===p.key&&o.data===p.data))await photoPut({...p,deletedAt:Date.now()});
    for(const p of pics)if(p.kind==="completion"&&accepted.has(p.key)&&!existing.some(o=>o.kind==='completion'&&o.key===p.key&&o.data===p.data))await photoPut({...p,id:"received-"+packet.id+"-"+p.id,insp:local.id});
  }else{
    local=incoming;local.receivedPackets=[];
    if(packet.payload.baseline)attachBaseline(local,clone(packet.payload.baseline));
    const written=[];
    try{for(const p of pics){const id="received-"+packet.id+"-"+p.id;await photoPut({...p,id,insp:local.id});written.push(id);}}
    catch(err){for(const id of written)await purgePhoto(id);throw new Error("The photos could not be saved. No office receipt was issued.");}
    LIST.unshift(local);
  }
  if(packet.payload.baseline){local.baselinePacketId="received-"+packet.id;attachBaseline(local,clone(packet.payload.baseline));}
  local.receivedPackets=local.receivedPackets||[];local.receivedPackets.push({id:packet.id,digest:packet.digest,conditionVersion:packet.payload.conditionVersion,receivedAt:Date.now()});
  if(!flushSave())throw new Error("The office record could not be saved. No receipt was issued.");
  await putPacket({id:"received-"+packet.id,inspectionId:local.id,packet,direction:"incoming",createdAt:Date.now()});
  renderHome();if(cur===local){photos=await photoLoad(local.id);renderSpaces();renderHead();}
  return {packet,record:local,duplicate:false,fork};
}
async function issueReceipt(packetId,name){
  const received=await storedPacket("received-"+packetId);if(!received||received.direction!=="incoming")throw new Error("Import the packet on this computer before confirming receipt.");
  const rec=LIST.find(r=>r.id===received.inspectionId&&!r.deletedAt);if(!rec)throw new Error("Restore the office inspection before issuing its receipt.");
  const receipt=M.receipt(received.packet,name);received.receipt=receipt;await putPacket(received);state.officeName=name;saveState();
  return receipt;
}
function importReceipt(raw){
  for(const rec of LIST){if(!(rec.handoffs||[]).some(h=>h.id===raw.packetId))continue;const receipt=M.validateReceipt(raw,rec.handoffs);const h=rec.handoffs.find(h=>h.id===receipt.packetId);h.receipt=receipt;if(!flushSave())throw new Error("The office receipt could not be saved.");paintHandoff();return {record:rec,receipt};}
  throw new Error("This receipt does not match a packet prepared on this device.");
}
function saveLayout(rec){
  if(!String(rec.meta.address||"").trim())throw new Error("Add the property address before saving a layout.");
  const modes=["in","out"].includes(rec.mode)?["in","out"]:[rec.mode];
  for(const mode of modes){const copy={...rec,mode},key=M.layoutKey(rec.meta,mode),prior=state.layouts[key];if(prior)(state.layoutHistory[key]=state.layoutHistory[key]||[]).push(prior);state.layouts[key]=M.layout(copy,prior);}
  saveState();renderProperties();return modes.length;
}
function importLayouts(file){
  if(file?.type!=="cimco-property-layouts"||file.version!==1||!Array.isArray(file.layouts)||file.layouts.length>1000)throw new Error("This is not a supported layout library.");
  const result=M.mergeLayouts(state.layouts,file.layouts);state.layouts=result.layouts;saveState();renderProperties();return result;
}
async function importOfficeFile(file){
  const value=await readOfficeFile(file);
  if(value.type==="cimco-office-packet")return {kind:"packet",...await receivePacket(value)};
  if(value.type==="cimco-office-receipt")return {kind:"receipt",...importReceipt(value)};
  if(value.type==="cimco-property-layouts")return {kind:"layouts",...importLayouts(value)};
  if(value.type==="cimco-offline-backup")return {kind:"backup",...await restoreBackup(value)};
  throw new Error("Choose a CIMCO office packet, office receipt, or layout library. Use Restore a backup for an older backup file.");
}
async function verifyPictures(pics){
  for(let start=0;start<pics.length;start+=8){const ok=await Promise.all(pics.slice(start,start+8).filter(p=>!p.deletedAt).map(async p=>{const img=new Image();img.src=p.data;const valid=await waitForPrintImage(img,10000);img.src='';return valid;}));if(ok.some(v=>!v))throw new Error("A packet photograph could not be read. Ask the inspector to prepare the packet again.");}
}
async function buildBackup(){
  if(!flushSave())throw new Error("Save the current inspection before backing up.");
  const ids=new Set(LIST.map(r=>r.id)),entries=(await packetEntries()).filter(p=>ids.has(p.inspectionId));
  const value={type:"cimco-offline-backup",version:1,createdAt:Date.now(),records:LIST.map(clone),photos:(await allPhotos()).filter(p=>ids.has(p.insp)),layouts:clone(state.layouts),officeName:state.officeName,
    packets:entries.map(p=>({id:p.id,inspectionId:p.inspectionId,packet:p.packet,direction:p.direction,createdAt:p.createdAt,...(p.receipt?{receipt:p.receipt}:{})}))};
  const zip=new JSZip();zip.file('backup.cimco.json',JSON.stringify(value));return {value,blob:await zip.generateAsync({type:'blob',mimeType:'application/zip',compression:'DEFLATE',compressionOptions:{level:4}})};
}
async function deleteStoredPacket(id){const database=await store();return new Promise((resolve,reject)=>{const tx=database.transaction('packets','readwrite');tx.objectStore('packets').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
async function restoreBackup(value){
  if(LIST.length)throw new Error("Full backups restore into an empty app. Use an office packet to add an inspection to this app.");
  M.safeTree(value);if(value.version!==1||!Array.isArray(value.records)||value.records.length>2000||!Array.isArray(value.photos)||!Array.isArray(value.packets)||value.packets.length>5000)throw new Error("This backup is not supported.");
  const records=value.records.map(raw=>{
    const rec=M.cleanRecord(raw);
    if(typeof raw.meta?.access==='string')rec.meta.access=raw.meta.access.slice(0,10000);
    if(raw.fieldState&&['rooms','room','details','notes','review','office'].includes(raw.fieldState.panel))rec.fieldState={panel:raw.fieldState.panel,room:String(raw.fieldState.room||'')};
    if(Array.isArray(raw.removedRooms))rec.removedRooms=raw.removedRooms.map(entry=>({space:M.cleanRecord({...raw,spaces:[entry.space]}).spaces[0],deletedAt:Number(entry.deletedAt)||0}));
    if(typeof raw.baselinePacketId==='string')rec.baselinePacketId=raw.baselinePacketId;
    if(Number.isSafeInteger(raw.layoutLibraryVersion)&&raw.layoutLibraryVersion>0)rec.layoutLibraryVersion=raw.layoutLibraryVersion;
    rec.handoffs=Array.isArray(raw.handoffs)?clone(raw.handoffs):[];rec.receivedPackets=Array.isArray(raw.receivedPackets)?clone(raw.receivedPackets):[];
    return rec;
  });
  const ids=new Set(records.map(r=>r.id));if(ids.size!==records.length)throw new Error("The backup contains duplicate inspection IDs.");
  const pictures=[];for(const rec of records)pictures.push(...M.photos(value.photos.filter(p=>p.insp===rec.id),rec.id));
  const verified=[];
  for(const entry of value.packets){const packet=await M.verifyPacket(entry.packet);if(!ids.has(entry.inspectionId)||!['incoming','outgoing'].includes(entry.direction))throw new Error("The backup has an invalid handoff record.");
    const expected=entry.direction==='incoming'?'received-'+packet.id:packet.id;if(entry.id!==expected)throw new Error("The backup has an invalid handoff ID.");
    const current=await storedPacket(entry.id);if(current&&current.packet.digest!==packet.digest)throw new Error("A different saved office file uses the same ID.");
    if(entry.receipt)M.validateReceipt(entry.receipt,[{id:packet.id,digest:packet.digest,conditionVersion:packet.payload.conditionVersion}]);
    verified.push({...entry,packet});
  }
  for(const rec of records){for(const h of rec.handoffs){const p=verified.find(p=>p.id===h.id&&p.direction==='outgoing'&&p.inspectionId===rec.id);if(!p||p.packet.digest!==h.digest)throw new Error("The backup is missing an original outgoing packet.");if(h.receipt)M.validateReceipt(h.receipt,[h]);}
    if(rec.baselinePacketId&&!verified.some(p=>p.id===rec.baselinePacketId))throw new Error("The backup is missing its move-in evidence packet.");}
  const merged=M.mergeLayouts(state.layouts,Object.values(value.layouts||{}));await verifyPictures(pictures);
  const written=[],packetWrites=[],beforeState=clone(state),used=new Set((await allPhotos()).map(p=>p.id));
  try{
    for(const p of pictures){let id=p.id;if(used.has(id))id='restored-'+uid();used.add(id);await photoPut({...p,id});written.push(id);}
    for(const entry of verified){if(await storedPacket(entry.id))continue;const saved={...entry};if(entry.direction==='outgoing')saved.blob=await zipFor(entry.packet);await putPacket(saved);packetWrites.push(entry.id);}
    LIST=records;state.layouts=merged.layouts;state.officeName=state.officeName||String(value.officeName||'').slice(0,240);saveState();if(!flushSave())throw new Error("The restored records could not be saved.");
    renderHome();return {records:records.length,photos:pictures.length};
  }catch(err){LIST=[];state=beforeState;try{saveState();flushSave();}catch(ignore){}for(const id of written)await purgePhoto(id);for(const id of packetWrites)await deleteStoredPacket(id);throw err;}
}
async function trashInspection(rec){
  if(!rec)return;rec.deletedAt=Date.now();if(!flushSave()){delete rec.deletedAt;throw new Error("The inspection could not be moved to Recently deleted.");}
  if(cur===rec){cur=null;go("home");}else renderHome();toast("Inspection moved to Recently deleted");
}
async function trashPhoto(id){
  const p=await photoById(id);if(!p)return;p.deletedAt=Date.now();await photoPut(p);touchCompletion(p);
  if(cur&&p.insp===cur.id){for(const key of Object.keys(photos))photos[key]=photos[key].filter(x=>x.id!==id);save();renderSpaces();renderHead();}
  else{const rec=LIST.find(r=>r.id===p.insp);if(rec&&p.kind!=="completion")InspectionReport.invalidateSignatures(rec,await photoLoad(rec.id));flushSave();}return p;
}
async function restoreInspection(id){const rec=LIST.find(r=>r.id===id);if(!rec)throw new Error("This inspection could not be found.");delete rec.deletedAt;if(!flushSave())throw new Error("The restored inspection could not be saved.");renderHome();return rec;}
async function restorePhoto(id){
  const p=await photoById(id);if(!p)throw new Error("This photo could not be found.");const rec=LIST.find(r=>r.id===p.insp);if(!rec||rec.deletedAt)throw new Error("Restore the inspection before restoring this photo.");
  delete p.deletedAt;await photoPut(p);touchCompletion(p);if(cur?.id===p.insp){photos=await photoLoad(p.insp);save();renderSpaces();renderHead();}else{if(p.kind!=="completion")InspectionReport.invalidateSignatures(rec,await photoLoad(rec.id));flushSave();}return p;
}
async function purgePhoto(id){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction("p","readwrite");tx.objectStore("p").delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
async function purgeInspection(id){
  const rec=LIST.find(r=>r.id===id&&r.deletedAt);if(!rec)throw new Error("Move the inspection to Recently deleted first.");
  if(LIST.some(r=>!r.deletedAt&&r.from===id&&!r.baselinePacketId))throw new Error("A later inspection uses this move-in for comparison. Prepare the later inspection's office packet before removing this record permanently.");
  const pictures=(await allPhotos()).filter(p=>p.insp===id);for(const p of pictures)await purgePhoto(p.id);
  for(const entry of await packetEntries())if(entry.inspectionId===id)await deleteStoredPacket(entry.id);
  LIST=LIST.filter(r=>r.id!==id);if(!flushSave())throw new Error("The remaining inspection list could not be saved.");renderHome();
}
async function trashRoom(sp){
  cur.removedRooms=cur.removedRooms||[];cur.removedRooms.push({space:clone(sp),deletedAt:Date.now()});cur.spaces=cur.spaces.filter(s=>s.id!==sp.id);InspectorFlow.clearUndo();save();renderSpaces();renderHead();toast("Area moved to Recently deleted");
}
function restoreRoom(rec,id){const entry=(rec.removedRooms||[]).find(r=>r.space.id===id);if(!entry)throw new Error("This area could not be found.");if(rec.spaces.some(s=>s.id===id))throw new Error("This area has already been restored.");rec.spaces.push(entry.space);rec.removedRooms=rec.removedRooms.filter(r=>r!==entry);InspectionReport.invalidateSignatures(rec);flushSave();if(cur===rec){renderSpaces();renderHead();}}
function touchCompletion(photo){
  if(photo.kind!=="completion")return;const rec=LIST.find(r=>r.id===photo.insp),task=rec&&Object.values(rec.followUp||{}).find(t=>photo.key==="followup:"+t.id);if(task)task.updatedAt=Date.now();
}
function ensureTasks(rec){rec.followUp=rec.followUp||{};for(const task of M.tasks(rec))if(!rec.followUp[task.key])rec.followUp[task.key]=task;return M.tasks(rec);}
function updateTask(rec,key,field,value){
  const tasks=ensureTasks(rec),task=rec.followUp[key];if(!task||!tasks.some(t=>t.key===key))throw new Error("This maintenance item could not be found.");
  if(field==="state"&&!['open','in-progress','done'].includes(value))throw new Error("Choose a supported work status.");
  if(!["assignee","state","note"].includes(field))throw new Error("This work field cannot be changed.");
  task[field]=String(value).slice(0,field==="note"?18000:240);task.updatedAt=Date.now();
  if(field==="state")task.completedAt=value==="done"?Date.now():null;
  if(!flushSave())throw new Error("The maintenance update could not be saved.");return task;
}
async function addCompletionPhotos(rec,key,files){
  ensureTasks(rec);const task=rec.followUp[key];if(!task)throw new Error("Choose a maintenance item first.");
  let count=0;for(const file of files){const data=await shrink(file);if(!data)continue;await photoPut({id:uid(),insp:rec.id,key:"followup:"+task.id,kind:"completion",data,caption:file.name||"Completion photo",ts:Date.now()});count++;}
  task.updatedAt=Date.now();if(!flushSave())throw new Error("The completion photo status could not be saved.");if(cur===rec)photos=await photoLoad(rec.id);return count;
}
function taskPhotos(rec,map=InspectionReport.photoMap(rec)){return flatten(map).filter(p=>p.kind==="completion"&&!p.deletedAt);}
function extraReport(rec,map,part="all"){
  const tasks=M.tasks(rec,0),pictures=taskPhotos(rec,map);let html="";
  if(tasks.length)html+='<section class="r-section '+(tasks.length<=3?'r-short-followup':'')+'"><h2>Maintenance follow-up</h2><p class="r-muted">Office follow-up is separate from the signed inspection observations. A completed work item does not change the original condition result.</p><table><thead><tr><th>Finding / priority</th><th>Assigned to / status</th><th>Office notes</th></tr></thead><tbody>'+tasks.map(t=>'<tr><td>'+e(t.room+" / "+t.item)+(t.urgent?'<br><b>URGENT</b>':'')+'<br>'+e(t.category)+'</td><td>'+e(t.assignee||"Unassigned")+'<br>'+e(({open:"Open","in-progress":"In progress",done:"Completed"})[t.state])+(t.completedAt?'<br>'+e(new Date(t.completedAt).toLocaleDateString()):'')+'</td><td>'+e(t.note||"")+'</td></tr>').join('')+'</tbody></table></section>';
  const workHTML=html;html="";
  if(pictures.length)html+='<section class="r-section r-photo-log"><h2>Maintenance completion photos</h2><p class="r-muted">Later follow-up evidence; these photographs are separate from the original inspection photo log.</p><div class="r-photos">'+pictures.map((p,i)=>{const task=tasks.find(t=>p.key==="followup:"+t.id);return '<figure><img src="'+e(p.data)+'" alt="Maintenance completion photo"><figcaption><b>Completion '+(i+1)+' - '+e(task?task.room+" / "+task.item:"Maintenance")+'</b><br>'+e(p.caption||"")+'<br><span class="r-muted">Added '+e(new Date(p.ts).toLocaleDateString())+'</span></figcaption></figure>';}).join('')+'</div></section>';
  const rows=comparisonRows(rec,map);
  if(rows.length)html+='<section class="r-section r-photo-log"><h2>Move-in / move-out photo comparison</h2><p class="r-muted">Only exact room and item matches are paired. Dates identify inspection records, not verified camera capture dates.</p>'+rows.map(r=>'<h3>'+e(r.room+" / "+r.item)+'</h3><table class="r-compare"><thead><tr><th>Move-in: '+e(fmtDate(r.beforeDate))+'</th><th>Current: '+e(fmtDate(r.afterDate))+'</th></tr></thead><tbody>'+Array.from({length:Math.max(r.before.length,r.after.length)},(_,i)=>'<tr><td>'+(r.before[i]?'<img src="'+e(r.before[i].data)+'" alt="Move-in condition"><p>'+e(r.before[i].caption||"")+'</p>':'No earlier photo for this item.')+'</td><td>'+(r.after[i]?'<img src="'+e(r.after[i].data)+'" alt="Current condition"><p>'+e(r.after[i].caption||"")+'</p>':'No current photo for this item.')+'</td></tr>').join('')+'</tbody></table>').join('')+'</section>';
  return part==="work"?workHTML:part==="evidence"?html:workHTML+html;
}
function renderComparison(){
  const el=document.getElementById("comparisonContent");if(!el||!cur)return;const rows=comparisonRows(cur);
  el.innerHTML=rows.length?rows.map(r=>'<section class="comparison-row"><h3>'+e(r.room+" / "+r.item)+'</h3><div class="comparison-pair"><div><b>Move-in - '+e(fmtDate(r.beforeDate))+'</b>'+r.before.map(p=>'<img src="'+e(p.data)+'" alt="Move-in '+e(r.item)+'">').join('')+(r.before.length?'':'<p>No earlier photo</p>')+'</div><div><b>Current - '+e(fmtDate(r.afterDate))+'</b>'+r.after.map(p=>'<img src="'+e(p.data)+'" alt="Current '+e(r.item)+'">').join('')+(r.after.length?'':'<p>No current photo</p>')+'</div></div></section>').join(''):'<p>No matching earlier photos are available on this device. Import the move-in packet to add its evidence. Rooms and items with ambiguous names are left unpaired.</p>';
}
function decorateAttention(){
  if(!cur)return;
  document.querySelectorAll('#spaces .item').forEach(el=>{
    const [room,index]=el.dataset.key.split(':'),it=cur.spaces.find(s=>s.id===room)?.items[+index];if(!it)return;
    let controls=el.querySelector('.attention-controls');if(!controls){el.insertAdjacentHTML('beforeend','<div class="attention-controls noprint"><label>Type of work<select data-attention-category="'+e(el.dataset.key)+'"><option value="other">Office review</option><option value="repair">Repair needed</option><option value="cleaning">Cleaning needed</option></select></label><label class="urgent-check"><input type="checkbox" data-attention-urgent="'+e(el.dataset.key)+'"> Urgent - contact office</label><p class="urgent-note" hidden>Urgent is saved on this phone. Contact the office directly if it needs attention now.</p></div>');controls=el.querySelector('.attention-controls');}
    controls.hidden=it.s!=="work";controls.querySelector('select').value=it.category||'other';controls.querySelector('input').checked=!!it.urgent;controls.querySelector('.urgent-note').hidden=!it.urgent;
  });paintHandoff();
}
function renderProperties(){
  const select=document.getElementById("officePropertySelect");if(!select)return;
  const list=[],seen=new Set();for(const l of Object.values(state.layouts).sort((a,b)=>a.address.localeCompare(b.address))){const key=M.propertyKey(l);if(seen.has(key))continue;seen.add(key);list.push(l);}
  select.innerHTML='<option value="">Choose a saved property (optional)</option>'+list.map(l=>'<option value="'+e(l.id)+'">'+e(l.address+(l.unit?' #'+l.unit:''))+'</option>').join('');select.closest('label').hidden=!list.length;
}
async function openWorkspace(next="receive"){view=next;await renderWorkspace();safeDialogOpen(document.getElementById("officeWorkspace"));}
async function renderWorkspace(){
  const host=document.getElementById("officeWorkspaceBody");if(!host)return;
  document.querySelectorAll('#officeWorkspace nav [data-office-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.officeView===view)));
  if(view==='receive'){
    const entries=(await packetEntries()).filter(p=>p.direction==='incoming').sort((a,b)=>b.createdAt-a.createdAt);
    host.innerHTML='<h2>Receive inspections</h2><p>Import the packet saved or shared by an inspector. Everything stays on this computer.</p><button type="button" class="act solid" data-import-office>Receive office file</button><label class="office-name">Received by<input id="officeReceiverName" value="'+e(state.officeName)+'" placeholder="Office staff name"></label>'+entries.map(p=>'<article class="office-entry"><h3>'+e(title(p.packet.payload.inspection))+'</h3><p>'+e(modeTitle(p.packet.payload.inspection))+' · '+e(fmtDate(p.packet.payload.inspection.meta.date))+'</p><p>Packet '+e(p.packet.id)+' · Imported '+e(new Date(p.createdAt).toLocaleString())+'</p><div class="office-actions"><button class="act" type="button" data-office-open="'+e(p.inspectionId)+'">Open inspection</button><button class="act solid" type="button" data-issue-receipt="'+e(p.packet.id)+'">'+(p.receipt?'Save receipt again':'Confirm receipt / Save receipt file')+'</button></div></article>').join('');
  }else if(view==='layouts')renderLayouts(host);
  else if(view==='work')await renderWork(host);
  else if(view==='trash')await renderTrash(host);
}
function renderLayouts(host){
  const entries=Object.values(state.layouts).sort((a,b)=>a.address.localeCompare(b.address)||a.mode.localeCompare(b.mode));
  host.innerHTML='<h2>Property layout library</h2><p>Layouts contain room names and checklist items only. Share the library file with inspectors; import it on each phone.</p><div class="office-actions"><button class="act solid" type="button" data-new-layout>Create property layout</button><button class="act" type="button" data-export-layouts>Save layout library file</button><button class="act" type="button" data-import-office>Import layout library</button></div>'+entries.map(l=>'<article class="office-entry"><h3>'+e(l.address+(l.unit?' #'+l.unit:''))+'</h3><p>'+e(MODE_LABEL[l.mode])+' · Version '+l.revision+' · '+l.rooms.length+' areas</p><button type="button" class="act" data-edit-layout="'+e(l.id)+'">Edit layout</button></article>').join('');
}
function layoutEditor(value){
  layoutDraft=value?clone(value):{address:'',unit:'',mode:'in',revision:0,readyTags:[],rooms:makeSpacesForMode('in').map(sp=>({type:sp.type,name:sp.name,tag:sp.tag||'',items:sp.items.map(it=>it.t)}))};
  const host=document.getElementById('officeWorkspaceBody');host.innerHTML='<h2>'+ (value?'Edit property layout':'Create property layout')+'</h2><p>Changes here affect the library. Existing inspection findings stay unchanged.</p><form id="layoutEditor"><div class="office-grid"><label>Property address<input name="address" value="'+e(layoutDraft.address)+'" required></label><label>Unit<input name="unit" value="'+e(layoutDraft.unit)+'"></label><label>Inspection type<select name="mode">'+['in','out','ready','routine'].map(m=>'<option value="'+m+'" '+(m===layoutDraft.mode?'selected':'')+'>'+e(MODE_LABEL[m])+'</option>').join('')+'</select></label></div><div id="layoutRoomEditor"></div><div class="office-actions"><select id="layoutRoomType">'+Object.entries(T).map(([key,t])=>'<option value="'+e(key)+'">'+e(t.label)+'</option>').join('')+'</select><button type="button" class="act" data-layout-add>Add area</button></div><div class="office-actions"><button class="act solid" type="submit">Save property layout</button><button class="act" type="button" data-office-view="layouts">Cancel</button></div></form>';renderLayoutRooms();
}
function renderLayoutRooms(){const host=document.getElementById('layoutRoomEditor');host.innerHTML=layoutDraft.rooms.map((sp,i)=>'<section class="layout-area" data-layout-index="'+i+'"><label>Area name<input data-layout-name="'+i+'" value="'+e(sp.name)+'" required></label><label>Checklist items - one per line<textarea data-layout-items="'+i+'">'+e(sp.items.join('\n'))+'</textarea></label><button type="button" class="act" data-layout-remove="'+i+'">Remove area from layout</button></section>').join('');}
function readLayoutRooms(){document.querySelectorAll('.layout-area').forEach(el=>{const i=Number(el.dataset.layoutIndex);layoutDraft.rooms[i].name=el.querySelector('input').value.trim();layoutDraft.rooms[i].items=el.querySelector('textarea').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);});}
async function renderWork(host){
  const records=activeRecords(),images=await allPhotos();
  host.innerHTML='<h2>Maintenance follow-up</h2><p>Assign work, update its status, and attach completion photos. Original inspection observations remain unchanged.</p><label>Show<select id="maintenanceFilter"><option value="open">Open and in progress</option><option value="all">All work</option><option value="urgent">Urgent work</option><option value="done">Completed</option></select></label><label>Type of work<select id="maintenanceCategory"><option value="all">All types</option><option value="repair">Repair</option><option value="cleaning">Cleaning</option><option value="other">Office review</option></select></label><div id="maintenanceItems"></div>';
  function paint(){const filter=document.getElementById('maintenanceFilter').value,category=document.getElementById('maintenanceCategory').value;const rows=[];for(const rec of records)for(const task of M.tasks(rec)){if(category!=='all'&&task.category!==category)continue;if(filter==='open'&&task.state==='done'||filter==='urgent'&&!task.urgent||filter==='done'&&task.state!=='done')continue;rows.push({rec,task});}rows.sort((a,b)=>Number(b.task.urgent)-Number(a.task.urgent)||title(a.rec).localeCompare(title(b.rec)));
    document.getElementById('maintenanceItems').innerHTML=rows.length?rows.map(({rec,task})=>'<article class="office-entry maintenance-entry '+(task.urgent?'urgent':'')+'"><h3>'+e(title(rec))+'</h3><p><b>'+e(task.room+' / '+task.item)+'</b></p><p>'+(task.urgent?'URGENT · ':'')+e(task.category)+' · '+e(task.observation)+'</p><div class="office-grid"><label>Assigned to<input data-task-record="'+e(rec.id)+'" data-task-key="'+e(task.key)+'" data-task-field="assignee" value="'+e(task.assignee)+'" placeholder="Staff member or vendor"></label><label>Work status<select data-task-record="'+e(rec.id)+'" data-task-key="'+e(task.key)+'" data-task-field="state">'+['open','in-progress','done'].map(v=>'<option value="'+v+'" '+(task.state===v?'selected':'')+'>'+e(({open:'Open','in-progress':'In progress',done:'Completed'})[v])+'</option>').join('')+'</select></label></div><label>Office / completion notes<textarea data-task-record="'+e(rec.id)+'" data-task-key="'+e(task.key)+'" data-task-field="note">'+e(task.note)+'</textarea></label><div class="completion-photos">'+images.filter(p=>!p.deletedAt&&p.kind==='completion'&&p.insp===rec.id&&p.key==='followup:'+task.id).map(p=>'<figure><img src="'+e(p.data)+'" alt="Completion photo"><figcaption>'+e(p.caption)+'</figcaption><button type="button" class="act" data-trash-photo="'+e(p.id)+'">Remove photo</button></figure>').join('')+'</div><div class="office-actions"><button class="act" type="button" data-completion-record="'+e(rec.id)+'" data-completion-key="'+e(task.key)+'">Add completion photos</button><button class="act" type="button" data-office-open="'+e(rec.id)+'">Open inspection</button></div></article>').join(''):'<p>No work matches this filter.</p>';
  }document.getElementById('maintenanceFilter').addEventListener('change',paint);document.getElementById('maintenanceCategory').addEventListener('change',paint);paint();
}
async function renderTrash(host){
  const pictures=await allPhotos();
  host.innerHTML='<h2>Recently deleted</h2><p>Items stay here until you restore them. Nothing is automatically deleted permanently.</p>'+LIST.filter(r=>r.deletedAt).map(r=>'<article class="office-entry"><h3>'+e(title(r))+'</h3><p>Inspection · '+e(fmtDate(r.meta.date))+'</p><div class="office-actions"><button type="button" class="act solid" data-restore-inspection="'+e(r.id)+'">Restore inspection</button><button type="button" class="act" data-purge-inspection="'+e(r.id)+'">Delete local inspection permanently</button></div></article>').join('')+LIST.filter(r=>!r.deletedAt).flatMap(r=>(r.removedRooms||[]).map(entry=>'<article class="office-entry"><h3>'+e(title(r))+' / '+e(entry.space.name)+'</h3><p>Removed area, with its original checks and photos</p><button type="button" class="act" data-restore-room-record="'+e(r.id)+'" data-restore-room="'+e(entry.space.id)+'">Restore area</button></article>')).join('')+pictures.filter(p=>p.deletedAt).map(p=>{const rec=LIST.find(r=>r.id===p.insp);return '<article class="office-entry trash-photo"><img src="'+e(p.data)+'" alt="Deleted condition photo"><h3>'+e(rec?title(rec):'Inspection photo')+'</h3><p>'+e(p.caption||'Condition photo')+'</p><div class="office-actions"><button type="button" class="act" data-restore-photo="'+e(p.id)+'">Restore photo</button><button type="button" class="act" data-purge-photo="'+e(p.id)+'">Delete local photo permanently</button></div></article>';}).join('');
}
function shell(){
  document.body.classList.add('offline-office-tools');if(officeMode)document.body.classList.add('office-desk-mode');
  const home=document.getElementById('homeOffice');home.insertAdjacentHTML('afterbegin','<div class="office-quick-actions"><button type="button" class="act solid" data-import-office>Receive office file</button><button type="button" class="act" data-office-view="layouts">Property layouts</button><button type="button" class="act" data-office-view="work">Maintenance follow-up</button><button type="button" class="act" data-office-view="trash">Recently deleted</button><button type="button" class="act" data-office-backup>Save complete backup</button></div>');
  if(officeMode){const intro=document.createElement('section');intro.id='officeDeskIntro';intro.className='card';intro.innerHTML='<h2>Office desk</h2><p>Receive inspection packets, review reports, assign work, and save receipts. Files stay on this computer.</p>';intro.append(home.querySelector('.office-quick-actions'));document.getElementById('home').prepend(intro);}
  document.querySelector('#newAddress').closest('.quickstart').insertAdjacentHTML('beforebegin','<label class="office-property-picker" hidden>Office property list<select id="officePropertySelect"></select></label>');
  document.getElementById('reviewPanel').insertAdjacentHTML('afterbegin','<section class="handoff-card"><h2>Share with the office</h2><p>Prepare one packet with this report and its photos. Share it using your phone tools, or save it for transfer by USB.</p><p id="handoffStatus" role="status"></p><button type="button" class="act solid" data-prepare-packet>Prepare office packet</button><div id="packetReady" hidden><p>Packet ready. Choose how to transfer it.</p><div class="office-actions"><button class="act solid" type="button" data-share-packet>Share packet</button><button class="act" type="button" data-save-packet>Save packet</button></div></div><button type="button" class="act" data-import-office>Import office receipt</button></section>');
  document.querySelector('.handoff-card').insertAdjacentHTML('beforeend','<details class="transfer-help"><summary>Send without putting the app online</summary><p>At the office, use LocalSend on the phone and Windows computer while both are on the same local Wi-Fi. It supports iPhone and Android. Choose Share packet and LocalSend, or Save packet and select the saved ZIP inside LocalSend.</p><p>The office imports the ZIP in Office Desk and returns a receipt file the same way. Import the receipt here to confirm the exact copy was received.</p><p>A USB file transfer also works. When away from the office, you can send the saved packet through your existing email or messaging app when a connection is available; the inspection app itself needs no online account or server.</p><p><a href="https://localsend.org/" target="_blank" rel="noopener noreferrer">LocalSend official download and setup</a></p></details>');
  document.getElementById('reviewCost').after(document.querySelector('.handoff-card'));
  document.getElementById('officePanel').insertAdjacentHTML('afterbegin','<div class="office-actions"><button class="act" type="button" data-save-current-layout>Save this property layout to library</button><button class="act" type="button" data-office-view="work">Maintenance follow-up</button><button class="act" type="button" data-office-view="trash">Recently deleted</button></div>');
  const comparison=document.createElement('details');comparison.className='comparison-card';comparison.id='comparisonCard';comparison.innerHTML='<summary>Compare move-in photos</summary><div id="comparisonContent"></div>';document.getElementById('reviewPanel').append(comparison);
  const dialog=document.createElement('dialog');dialog.id='officeWorkspace';dialog.innerHTML='<header><h2>CIMCO office tools</h2><button type="button" class="act" data-close-office>Close</button></header><nav aria-label="Office tools"><button type="button" data-office-view="receive">Receive files</button><button type="button" data-office-view="layouts">Property layouts</button><button type="button" data-office-view="work">Maintenance</button><button type="button" data-office-view="trash">Recently deleted</button></nav><p id="officeMessage" role="status"></p><main id="officeWorkspaceBody"></main>';document.body.append(dialog);
  document.body.insertAdjacentHTML('beforeend','<input type="file" id="officeFileInput" accept=".zip,.json,application/zip,application/json" hidden><input type="file" id="completionFileInput" accept="image/*" multiple hidden>');
  renderProperties();
  if(globalThis.CIMCO_OFFLINE_BUNDLE){const schedule=document.querySelector('a[href="./schedule.html"]');if(schedule)schedule.closest('.card').hidden=true;}
}
shell();
renderHome=function(){base.renderHome();renderProperties();if(officeMode){document.getElementById('mastTitle').textContent=globalThis.CIMCO_PRACTICE_MODE?'Office desk - practice':'Office desk';document.getElementById('mastLede').textContent='Receive local inspection files, review reports, and manage follow-up on this computer.';document.querySelector('#list').parentElement.querySelector('h2').textContent='Received inspections';document.querySelector('.home-save-label').textContent=globalThis.CIMCO_PRACTICE_MODE?'Practice records are kept separate from real office records.':'Records stay on this computer. Save complete backups regularly.';}if(globalThis.CIMCO_OFFLINE_BUNDLE){const footer=document.querySelector('#home>.foot');if(footer)footer.textContent='Keep this app file in its original location. Save backups after inspections.';}};
renderSpaces=function(){base.renderSpaces();decorateAttention();};
renderHead=function(){base.renderHead();decorateAttention();};
openRec=async function(rec){await base.openRec(rec);prepared=null;decorateAttention();await hydrateBaseline();};
newInspection=function(mode,from,seed){const rec=base.newInspection(mode,from,seed);if(!from&&seed?.address){let l=state.layouts[M.layoutKey(seed,mode)];if(!l&&['in','out'].includes(mode))l=state.layouts[M.layoutKey(seed,mode==='in'?'out':'in')];if(l){rec.spaces=l.rooms.map(sp=>({id:uid(),type:sp.type,name:sp.name,tag:sp.tag||'',checklistVersion:2,items:sp.items.map(t=>({t,s:'',n:'',base:''}))}));rec.meta.readyTags=[...l.readyTags];rec.layoutLibraryVersion=l.revision;flushSave();}}return rec;};
let completionTarget=null;
document.addEventListener('click',event=>{
  const t=event.target.closest('button');if(!t)return;
  const handled=t.hasAttribute('data-purge-inspection')||t.hasAttribute('data-purge-photo')||t.hasAttribute('data-office-backup')||t.hasAttribute('data-prepare-packet')||t.hasAttribute('data-share-packet')||t.hasAttribute('data-save-packet')||t.hasAttribute('data-import-office')||t.hasAttribute('data-office-view')||t.hasAttribute('data-close-office')||t.hasAttribute('data-issue-receipt')||t.hasAttribute('data-office-open')||t.hasAttribute('data-save-current-layout')||t.hasAttribute('data-export-layouts')||t.hasAttribute('data-new-layout')||t.hasAttribute('data-edit-layout')||t.hasAttribute('data-layout-add')||t.hasAttribute('data-layout-remove')||t.hasAttribute('data-restore-inspection')||t.hasAttribute('data-restore-photo')||t.hasAttribute('data-restore-room')||t.hasAttribute('data-completion-record')||t.hasAttribute('data-trash-photo');
  if(!handled)return;event.preventDefault();event.stopImmediatePropagation();
  void(async()=>{try{
    if(t.hasAttribute('data-import-office')){document.getElementById('officeFileInput').click();return;}
    if(t.dataset.purgeInspection||t.dataset.purgePhoto){const ok=await CimcoDialog.open({title:'Delete this local copy permanently?',message:'It cannot be restored from Recently deleted after this. Copies already saved in other packets or backups are separate.',confirmLabel:'Delete permanently',danger:true});if(!ok)return;if(t.dataset.purgeInspection)await purgeInspection(t.dataset.purgeInspection);else{const p=await photoById(t.dataset.purgePhoto);if(!p?.deletedAt)throw new Error('Only deleted photos can be removed permanently.');await purgePhoto(p.id);}await renderWorkspace();message('Local copy removed permanently.');return;}
    if(t.hasAttribute('data-office-backup')){t.disabled=true;const backup=await buildBackup();saveBlob('CIMCO-complete-backup-'+today()+'.zip',backup.blob);toast('Complete backup saved with records, photos, layouts, receipts, and deleted items.');return;}
    if(t.dataset.officeView){await openWorkspace(t.dataset.officeView);return;}
    if(t.hasAttribute('data-close-office')){closeWorkspace();return;}
    if(t.hasAttribute('data-prepare-packet')){if(InspectionReport.readiness(cur).length){const proceed=await CimcoDialog.open({title:'Prepare a draft packet?',message:'Some inspection details or checks are unfinished. The report will clearly identify them for the office.',confirmLabel:'Prepare draft packet'});if(!proceed)return;}t.disabled=true;t.textContent='Preparing packet...';await preparePacket();toast('Packet ready. Choose Share packet or Save packet.');return;}
    if(t.hasAttribute('data-share-packet')){await sharePrepared();return;}
    if(t.hasAttribute('data-save-packet')){downloadPrepared();return;}
    if(t.dataset.issueReceipt){const name=document.getElementById('officeReceiverName').value.trim(),value=await issueReceipt(t.dataset.issueReceipt,name);saveJSON(value.packetId+'-office-receipt.json',value);message('Receipt file saved. Return this file to the inspector to confirm office receipt.');await renderWorkspace();return;}
    if(t.dataset.officeOpen){const rec=LIST.find(r=>r.id===t.dataset.officeOpen&&!r.deletedAt);if(!rec)throw new Error('Restore this inspection before opening it.');closeWorkspace();await openRec(rec);InspectorFlow.setPanel('review');return;}
    if(t.hasAttribute('data-save-current-layout')){saveLayout(cur);toast('Property layout saved. Use Property layouts to share it with inspectors.');return;}
    if(t.hasAttribute('data-export-layouts')){const layouts=Object.values(state.layouts);if(!layouts.length)throw new Error('Save a property layout first.');saveJSON('CIMCO-property-layouts.json',{type:'cimco-property-layouts',version:1,layouts});message('Layout file saved. Import it on each inspector device.');return;}
    if(t.hasAttribute('data-new-layout')){layoutEditor(null);return;}
    if(t.dataset.editLayout){layoutEditor(state.layouts[t.dataset.editLayout]);return;}
    if(t.hasAttribute('data-layout-add')){readLayoutRooms();const type=document.getElementById('layoutRoomType').value;layoutDraft.rooms.push({type,name:T[type].label,tag:'',items:[...T[type].items]});renderLayoutRooms();return;}
    if(t.hasAttribute('data-layout-remove')){readLayoutRooms();layoutDraft.rooms.splice(Number(t.dataset.layoutRemove),1);renderLayoutRooms();return;}
    if(t.dataset.restoreInspection){await restoreInspection(t.dataset.restoreInspection);await renderWorkspace();message('Inspection restored with its photos.');return;}
    if(t.dataset.restorePhoto){await restorePhoto(t.dataset.restorePhoto);await renderWorkspace();message('Photo restored.');return;}
    if(t.dataset.restoreRoom){restoreRoom(LIST.find(r=>r.id===t.dataset.restoreRoomRecord),t.dataset.restoreRoom);await renderWorkspace();message('Area restored.');return;}
    if(t.dataset.completionRecord){completionTarget={record:LIST.find(r=>r.id===t.dataset.completionRecord),key:t.dataset.completionKey};document.getElementById('completionFileInput').click();return;}
    if(t.dataset.trashPhoto){await trashPhoto(t.dataset.trashPhoto);await renderWorkspace();message('Photo moved to Recently deleted.');return;}
  }catch(err){message(err.message||'This action could not finish.',true);toast(err.message||'This action could not finish.');}finally{if(t.hasAttribute('data-prepare-packet')){t.disabled=false;t.textContent='Prepare office packet';}if(t.hasAttribute('data-office-backup'))t.disabled=false;}})();
},true);
document.addEventListener('change',event=>{
  const t=event.target;
  if(t.id==='officePropertySelect'){const l=state.layouts[t.value];if(l){document.getElementById('newAddress').value=l.address;document.getElementById('newUnit').value=l.unit;}return;}
  if(t.dataset.attentionCategory||t.dataset.attentionUrgent){const key=t.dataset.attentionCategory||t.dataset.attentionUrgent,[rid,index]=key.split(':'),it=cur.spaces.find(s=>s.id===rid).items[+index];if(t.dataset.attentionCategory)it.category=t.value;else it.urgent=t.checked;save();decorateAttention();return;}
  if(t.dataset.taskField){try{updateTask(LIST.find(r=>r.id===t.dataset.taskRecord),t.dataset.taskKey,t.dataset.taskField,t.value);message('Maintenance update saved on this computer.');}catch(err){message(err.message,true);}return;}
  if(t.id==='officeFileInput'){const file=t.files[0];t.value='';if(!file)return;void(async()=>{try{const result=await importOfficeFile(file);await openWorkspace(result.kind==='layouts'?'layouts':'receive');message(result.kind==='backup'?result.records+' inspections restored with photos, layouts and office files.':result.kind==='receipt'?'Matching office receipt imported.':result.kind==='layouts'?result.added+' layouts added, '+result.updated+' updated.'+(result.conflicts.length?' Conflicts kept unchanged: '+result.conflicts.join('; '):''):result.duplicate?'This packet was already imported.':result.fork?'Another report version was saved. The earlier copy was kept.':'Inspection and photos saved on this computer. Enter Received by to save a receipt.');}catch(err){toast(err.message||'This file could not be opened.');message(err.message||'This file could not be opened.',true);}})();return;}
  if(t.id==='completionFileInput'){const files=[...t.files];t.value='';if(!files.length||!completionTarget)return;const target=completionTarget;completionTarget=null;void(async()=>{try{const count=await addCompletionPhotos(target.record,target.key,files);await renderWorkspace();message(count+' completion photos saved.');}catch(err){message(err.message,true);}})();}
  if(t.name==='mode'&&t.closest('#layoutEditor')&&layoutDraft?.revision===0){layoutDraft.mode=t.value;layoutDraft.rooms=makeSpacesForMode(t.value).map(sp=>({type:sp.type,name:sp.name,tag:sp.tag||'',items:sp.items.map(it=>it.t)}));renderLayoutRooms();}
},true);
document.addEventListener('input',event=>{const t=event.target;if(!t.dataset.taskField)return;try{updateTask(LIST.find(r=>r.id===t.dataset.taskRecord),t.dataset.taskKey,t.dataset.taskField,t.value);message('Maintenance update saved on this computer.');}catch(err){message(err.message,true);}},true);
document.addEventListener('submit',event=>{if(event.target.id!=='layoutEditor')return;event.preventDefault();try{readLayoutRooms();const form=event.target,meta={address:form.elements.address.value.trim(),unit:form.elements.unit.value.trim()},mode=form.elements.mode.value,key=M.layoutKey(meta,mode),old=state.layouts[key];const value=M.validateLayout({...layoutDraft,...meta,mode,revision:(old?.revision||0)+1,updatedAt:Date.now()});if(!value.rooms.length||value.rooms.some(r=>!r.name||!r.items.length))throw new Error('Give each area a name and at least one checklist item.');if(old)(state.layoutHistory[key]=state.layoutHistory[key]||[]).push(old);state.layouts[key]=value;if(['in','out'].includes(mode)){const other=mode==='in'?'out':'in',otherKey=M.layoutKey(meta,other),prior=state.layouts[otherKey];state.layouts[otherKey]={...clone(value),id:otherKey,mode:other,revision:(prior?.revision||0)+1};}saveState();renderProperties();view='layouts';void renderWorkspace();message('Layout saved. Save the library file to share it with inspectors.');}catch(err){message(err.message,true);}},true);
if(SELF_TEST)window.__CIMCO_OFFICE__={preparePacket,receivePacket,issueReceipt,importReceipt,importLayouts,saveLayout,baseline,comparisonRows,trashInspection,restoreInspection,trashPhoto,restorePhoto,trashRoom,restoreRoom,ensureTasks,updateTask,addCompletionPhotos,storedPacket,putPacket,readOfficeFile,importOfficeFile,zipFor,activeRecords,openWorkspace,renderWorkspace,receiptStatus,buildBackup,restoreBackup,
  putPhoto:async p=>{await photoPut(p);if(cur?.id===p.insp){photos=await photoLoad(cur.id);renderSpaces();renderHead();}},getPhotos:photoLoad,allPhotos,getState:()=>state,extraReport,
  cleanup:async()=>{state={layouts:{},officeName:'',layoutHistory:{}};prepared=null;localStorage.removeItem(STATE_KEY);const database=await store();await new Promise((resolve,reject)=>{const tx=database.transaction('packets','readwrite');tx.objectStore('packets').clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});const p=await db();await new Promise((resolve,reject)=>{const tx=p.transaction('p','readwrite');tx.objectStore('p').clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
};
renderHome();
return {trashInspection,trashPhoto,trashRoom,restoreInspection,restorePhoto,restoreRoom,decorateAttention,paintHandoff,comparisonRows,extraReport,touchCompletion,taskPhotos};
})();
