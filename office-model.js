/* Portable, offline data contracts. No network calls and no dependency on page state. */
var OfficeModel = (function(){
"use strict";
const clone=value=>JSON.parse(JSON.stringify(value));
const modes=["in","out","ready","routine"],states=["open","in-progress","done"],categories=["repair","cleaning","other"];
const metaFields=["date","address","unit","tenant","owner","inspector","phone","meterE","meterW","keys","fwd","misc","officeInstructions","clean","photoSize","tenantSigName","inspSigName","marketStatus","responsible","estimatedCost","visitReason","entryStatus","tenantSignStatus"];
function fail(message){throw new Error(message);}
function text(value,max=200){if(value===undefined||value===null)return "";if(typeof value!=="string")fail("A text field has an invalid value.");if(value.length>max)fail("A text field is too long.");return value;}
function id(value){const s=text(value,160);if(!/^[A-Za-z0-9_.:-]+$/.test(s))fail("The file has an invalid record ID.");return s;}
function stamp(value){const n=Number(value);if(!Number.isFinite(n)||n<0||n>8640000000000000)fail("The file has an invalid date.");return n;}
function safeTree(value,depth=0){
  if(depth>30)fail("The file contains too many nested fields.");
  if(value&&typeof value==="object")for(const key of Object.keys(value)){if(["__proto__","prototype","constructor"].includes(key))fail("The file contains an unsupported field.");safeTree(value[key],depth+1);}
}
function canonical(value){
  if(value===null||typeof value!=="object")return JSON.stringify(value);
  if(Array.isArray(value))return "["+value.map(v=>canonical(v===undefined?null:v)).join(",")+"]";
  return "{"+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";
}
async function digest(value){
  if(!globalThis.crypto?.subtle)fail("This browser cannot verify office files. Open the app in an updated Chrome, Edge, or Safari browser.");
  const bytes=new TextEncoder().encode(typeof value==="string"?value:canonical(value));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function image(value){const s=text(value,22000000);if(s&&!/^data:image\/(?:png|jpeg|webp|gif|svg\+xml)(?:;charset=[^;,]+)?(?:;base64)?,/i.test(s))fail("A photograph or signature contains an unsupported image address.");return s;}
function photos(values,inspectionId){
  if(!Array.isArray(values)||values.length>600)fail("The photo list is not supported.");
  const seen=new Set();return values.map(p=>{
    const pid=id(p.id);if(seen.has(pid))fail("The file contains duplicate photo IDs.");seen.add(pid);
    return {id:pid,insp:inspectionId,key:text(p.key,300),data:image(p.data),caption:text(p.caption,2000),ts:stamp(p.ts||0),...(p.kind==="completion"?{kind:"completion"}:{}),...(p.deletedAt?{deletedAt:stamp(p.deletedAt)}:{})};
  });
}
function signatureMeta(value){const out={};for(const party of ["t","i"]){const m=value?.[party];if(m&&typeof m.fingerprint==="string"&&/^[a-f0-9]{8,64}$/i.test(m.fingerprint))out[party]={fingerprint:m.fingerprint,signedAt:stamp(m.signedAt)};}return out;}
function checkPhotoKeys(rec,pictures){const keys=new Set(rec.spaces.filter(sp=>rec.mode!=="ready"||!sp.tag||rec.meta.readyTags.includes(sp.tag)).flatMap(sp=>sp.items.map((it,i)=>sp.id+":"+i)));const workKeys=new Set(Object.values(rec.followUp||{}).map(t=>"followup:"+t.id));for(const p of pictures)if(!(p.kind==="completion"?workKeys.has(p.key):keys.has(p.key)))fail("A photograph is not linked to a recorded checklist or work item.");}
function room(value){
  const items=value.items;if(!Array.isArray(items)||items.length>250)fail("An area contains too many checklist items.");
  return {id:id(value.id),type:text(value.type,80),name:text(value.name,240),tag:text(value.tag,80),checklistVersion:2,items:items.map(it=>({
    t:text(it.t,500),s:["ok","work","np","nt","na"].includes(it.s)?it.s:"",n:text(it.n,18000),base:["ok","work","np","nt","na"].includes(it.base)?it.base:"",
    ...(it.urgent?{urgent:true}:{}),...(categories.includes(it.category)?{category:it.category}:{})
  }))};
}
function cleanTask(value,key){
  return {id:id(value.id),key:text(key,300),room:text(value.room,240),item:text(value.item,500),observation:text(value.observation,18000),urgent:!!value.urgent,category:categories.includes(value.category)?value.category:"other",assignee:text(value.assignee,240),state:states.includes(value.state)?value.state:"open",note:text(value.note,18000),updatedAt:stamp(value.updatedAt||0),completedAt:value.completedAt?stamp(value.completedAt):null};
}
function cleanRecord(value){
  safeTree(value);if(!value||!modes.includes(value.mode)||!Array.isArray(value.spaces)||value.spaces.length>120)fail("This is not a supported inspection record.");
  const out={id:id(value.id),mode:value.mode,created:stamp(value.created||0),updated:stamp(value.updated||0),meta:{},spaces:value.spaces.map(room),wk:{},sig:{t:image(value.sig?.t),i:image(value.sig?.i)},signatureMeta:signatureMeta(value.signatureMeta),followUp:{}};
  out.reportId=id(value.reportId||value.id);
  for(const field of metaFields)if(value.meta?.[field]!==undefined)out.meta[field]=text(value.meta[field],["misc","keys"].includes(field)?50000:field==="officeInstructions"?5000:3000);
  out.meta.workCategories=(Array.isArray(value.meta?.workCategories)?value.meta.workCategories:[]).filter(s=>["clean","repair","replace","maintenance"].includes(s));
  out.meta.readyTags=(Array.isArray(value.meta?.readyTags)?value.meta.readyTags:[]).filter(s=>["pool","well","rural","handover"].includes(s));
  const roomIds=new Set();for(const sp of out.spaces){if(roomIds.has(sp.id))fail("Two inspection areas have the same ID.");roomIds.add(sp.id);}
  for(const [key,w] of Object.entries(value.wk||{})){if(Object.keys(out.wk).length>=3000)fail("Too many estimate rows.");out.wk[text(key,300)]={k:["wear","dmg","maintenance","tenant"].includes(w.k)?w.k:"",c:text(w.c,80)};}
  for(const [key,task] of Object.entries(value.followUp||{})){if(Object.keys(out.followUp).length>=3000)fail("Too many follow-up items.");out.followUp[text(key,300)]=cleanTask(task,key);}
  if(value.from)out.from=id(value.from);
  if(value.visitId)out.visitId=id(value.visitId);
  if(Number.isSafeInteger(value.visitRevision)&&value.visitRevision>0)out.visitRevision=value.visitRevision;
  if(value.signatureHistory){if(!Array.isArray(value.signatureHistory)||value.signatureHistory.length>300)fail("Signature history is too large.");out.signatureHistory=value.signatureHistory.map(s=>({party:s.party==="t"?"t":"i",data:image(s.data),fingerprint:text(s.fingerprint,64),signedAt:stamp(s.signedAt||0),archivedAt:stamp(s.archivedAt||0),reason:text(s.reason,500)}));}
  if(value.deletedAt)out.deletedAt=stamp(value.deletedAt);
  return out;
}
function propertyKey(meta){const clean=v=>String(v||"").trim().toLowerCase().replace(/\s+/g," ");return canonical([clean(meta.address),clean(meta.unit).replace(/^#\s*/,"")]);}
function layoutKey(meta,mode){return propertyKey(meta)+"|"+mode;}
function layout(rec,prior){
  const r=cleanRecord(rec);return {id:layoutKey(r.meta,r.mode),address:r.meta.address,unit:r.meta.unit||"",mode:r.mode,revision:(prior?.revision||0)+1,updatedAt:Date.now(),readyTags:r.meta.readyTags,
    rooms:r.spaces.map(sp=>({type:sp.type,name:sp.name,tag:sp.tag||"",items:sp.items.map(it=>it.t)}))};
}
function validateLayout(value){
  if(!modes.includes(value.mode)||!Array.isArray(value.rooms)||!value.rooms.length||value.rooms.length>120)fail("This is not a supported property layout.");
  const meta={address:text(value.address,1000),unit:text(value.unit,100)};
  if(!meta.address.trim())fail("A property layout needs an address.");
  const rev=Number(value.revision);if(!Number.isSafeInteger(rev)||rev<1)fail("The layout version is invalid.");
  return {id:layoutKey(meta,value.mode),...meta,mode:value.mode,revision:rev,updatedAt:stamp(value.updatedAt),readyTags:(Array.isArray(value.readyTags)?value.readyTags:[]).filter(s=>["pool","well","rural","handover"].includes(s)),rooms:value.rooms.map(sp=>{
    if(!Array.isArray(sp.items)||!sp.items.length||sp.items.length>250||!String(sp.name||"").trim())fail("Each layout area needs a name and checklist.");return {type:text(sp.type,80),name:text(sp.name,240),tag:text(sp.tag,80),items:sp.items.map(s=>text(s,500))};
  })};
}
function mergeLayouts(existing,incoming){
  const out=clone(existing),result={added:0,updated:0,unchanged:0,conflicts:[]};
  for(const raw of incoming){const l=validateLayout(raw),old=out[l.id];if(!old){out[l.id]=l;result.added++;}else if(canonical(old)===canonical(l)){result.unchanged++;}else if(l.revision>old.revision){out[l.id]=l;result.updated++;}else result.conflicts.push(l.address+(l.unit?" #"+l.unit:"")+" - keep existing layout version "+old.revision);}
  return {layouts:out,...result};
}
function tasks(rec,now=Date.now()){
  const out={};for(const [key,value] of Object.entries(rec.followUp||{}))out[key]=cleanTask(value,key);
  rec.spaces.forEach(sp=>sp.items.forEach((it,i)=>{
    if(it.s!=="work")return;const key=sp.id+":"+i;
    out[key]=out[key]||{id:"task-"+sp.id+"-"+i,key,assignee:"",state:"open",note:"",updatedAt:now,completedAt:null};
    Object.assign(out[key],{room:sp.name,item:it.t,observation:it.n||"",urgent:!!it.urgent,category:categories.includes(it.category)?it.category:"other"});
  }));
  return Object.values(out).sort((a,b)=>Number(b.urgent)-Number(a.urgent)||a.room.localeCompare(b.room)||a.item.localeCompare(b.item));
}
async function createPacket(rec,pics,baseline,version,packetId){
  const inspection=cleanRecord(rec),payload={inspection,photos:photos(pics.filter(p=>!p.deletedAt),inspection.id),layout:layout(inspection,null),conditionVersion:text(version,64)};
  if(baseline){const b=cleanRecord(baseline.inspection);if(propertyKey(b.meta)!==propertyKey(inspection.meta))fail("The move-in comparison belongs to a different property or unit.");payload.baseline={inspection:b,photos:photos(baseline.photos.filter(p=>!p.deletedAt),b.id)};}
  checkPhotoKeys(inspection,payload.photos);if(payload.baseline)checkPhotoKeys(payload.baseline.inspection,payload.baseline.photos);
  const packet={type:"cimco-office-packet",version:1,id:id(packetId),createdAt:Date.now(),payload};packet.digest=await digest(packet);return packet;
}
async function verifyPacket(value){
  safeTree(value);if(value?.type!=="cimco-office-packet"||value.version!==1||!/^[a-f0-9]{64}$/.test(value.digest||""))fail("This is not a supported office packet.");
  const core={type:value.type,version:1,id:id(value.id),createdAt:stamp(value.createdAt),payload:value.payload};
  if(await digest(core)!==value.digest)fail("This packet is incomplete or has changed. Ask the inspector to share it again.");
  const inspection=cleanRecord(value.payload.inspection),cleanPhotos=photos(value.payload.photos,inspection.id),cleanLayout=validateLayout(value.payload.layout);
  const payload={inspection,photos:cleanPhotos,layout:cleanLayout,conditionVersion:text(value.payload.conditionVersion,64)};
  if(value.payload.baseline){const b=cleanRecord(value.payload.baseline.inspection);if(propertyKey(b.meta)!==propertyKey(inspection.meta))fail("The baseline belongs to another property.");payload.baseline={inspection:b,photos:photos(value.payload.baseline.photos,b.id)};}
  checkPhotoKeys(inspection,payload.photos);if(payload.baseline)checkPhotoKeys(payload.baseline.inspection,payload.baseline.photos);
  return {...core,payload,digest:value.digest};
}
function receipt(packet,officeName){
  const name=text(officeName,240).trim();if(!name)fail("Enter the name of the person receiving the packet.");
  return {type:"cimco-office-receipt",version:1,packetId:packet.id,packetDigest:packet.digest,reportId:packet.payload.inspection.reportId||packet.payload.inspection.id,conditionVersion:packet.payload.conditionVersion,receivedAt:Date.now(),receivedBy:name};
}
function validateReceipt(value,history){
  safeTree(value);if(value?.type!=="cimco-office-receipt"||value.version!==1)fail("This is not an office receipt.");
  const match=history.find(h=>h.id===value.packetId&&h.digest===value.packetDigest&&h.conditionVersion===value.conditionVersion);
  if(!match)fail("This receipt does not match a packet prepared on this device.");
  if(!text(value.receivedBy,240).trim())fail("The receipt does not identify who received the file.");
  return {...value,receivedAt:stamp(value.receivedAt),receivedBy:text(value.receivedBy,240)};
}
return {canonical,digest,cleanRecord,photos,propertyKey,layoutKey,layout,validateLayout,mergeLayouts,tasks,createPacket,verifyPacket,receipt,validateReceipt,image,clone,safeTree};
})();
