/* Local visit plans and writing aids. No network, observations, photos or credentials. */
var VisitModel=(function(){
"use strict";
const M=OfficeModel,types=['in','out','ready','routine'];
function text(value,max=240){if(value==null)return '';if(typeof value!=='string'||value.length>max)throw new Error('A visit field is not supported.');return value.trim();}
function date(value){const s=text(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T12:00:00Z'))||new Date(s+'T12:00:00Z').toISOString().slice(0,10)!==s)throw new Error('Choose a valid visit date.');return s;}
function visit(raw){
  M.safeTree(raw);const id=text(raw?.id,160),revision=Number(raw?.revision),updatedAt=Number(raw?.updatedAt);
  if(!/^[A-Za-z0-9_.:-]+$/.test(id)||!types.includes(raw.mode)||!Number.isSafeInteger(revision)||revision<1||!Number.isFinite(updatedAt)||updatedAt<0)throw new Error('This visit plan is not supported.');
  const meta={address:text(raw.meta?.address,1000),unit:text(raw.meta?.unit,100),date:date(raw.meta?.date),inspector:text(raw.meta?.inspector,240),officeInstructions:text(raw.meta?.officeInstructions,5000)};
  if(!meta.address)throw new Error('A visit needs a property address.');
  const layout=M.validateLayout(raw.layout);
  if(M.propertyKey(meta)!==M.propertyKey(layout)||layout.mode!==raw.mode)throw new Error('The visit layout belongs to another property or inspection type.');
  return {id,revision,updatedAt,mode:raw.mode,meta,layout};
}
function file(value){M.safeTree(value);if(value?.type!=='cimco-inspection-visits'||value.version!==1||!Array.isArray(value.visits)||!value.visits.length||value.visits.length>500)throw new Error('Choose a CIMCO visit file.');const rows=value.visits.map(visit);if(new Set(rows.map(v=>v.id)).size!==rows.length)throw new Error('Two visits have the same ID.');return rows;}
function merge(existing,rows,started=[]){
  const out=existing.map(visit),conflicts=[];let added=0,updated=0;
  for(const raw of rows){const next=visit(raw),at=out.findIndex(v=>v.id===next.id),old=out[at];
    if(!old){out.push(next);added++;}else if(M.canonical(old)===M.canonical(next))continue;
    else if(started.includes(next.id)||next.revision<=old.revision)conflicts.push(next.meta.address+' - keep the saved visit');
    else{out[at]=next;updated++;}
  }return {visits:out,added,updated,conflicts};
}
function state(raw={}){
  M.safeTree(raw);if(!Array.isArray(raw.visits||[])||(raw.visits||[]).length>500)throw new Error('The saved visit list is not supported.');
  const visits=(raw.visits||[]).map(visit);if(new Set(visits.map(v=>v.id)).size!==visits.length)throw new Error('Two saved visits have the same ID.');
  return {inspector:text(raw.inspector,240),visits,backupAt:Number.isFinite(raw.backupAt)&&raw.backupAt>=0?raw.backupAt:0};
}
function suggestions(item){
  const s=String(item||'').toLowerCase();
  if(/sink|faucet|toilet|tub|shower|hookup|hose/.test(s))return ['Water leaking at this fixture.','Fixture does not operate.','Cleaning needed at this fixture.'];
  if(/window|blind|screen/.test(s))return ['Window does not open or close.','Lock does not secure.','Screen is torn.'];
  if(/door|lock|deadbolt|gate/.test(s))return ['Does not close properly.','Lock does not secure.','Visible damage to the surface.'];
  if(/light|outlet|gfci|switch|alarm/.test(s))return ['Did not operate when tested.','Cover is missing or damaged.'];
  if(/floor|carpet|tile/.test(s))return ['Loose or raised flooring.','Staining or marks on the floor.','Cleaning needed on the floor.'];
  if(/wall|ceiling|trim|paint/.test(s))return ['Visible marks or staining.','Hole or crack in the surface.','Paint is peeling.'];
  if(/refrigerator|range|oven|microwave|washer|dryer|dishwasher/.test(s))return ['Did not operate when tested.','Visible damage to the appliance.','Cleaning needed inside the appliance.'];
  return ['Visible damage; add the location below.','Cleaning needed; add the location below.'];
}
return {visit,file,merge,state,suggestions,date};
})();
