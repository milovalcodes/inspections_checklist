import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import {webcrypto} from 'node:crypto';
const ctx={crypto:webcrypto,TextEncoder};vm.createContext(ctx);
for(const name of ['office-model.js','visit-model.js'])vm.runInContext(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'),ctx);
const V=ctx.VisitModel,M=ctx.OfficeModel;let count=0;function check(name,fn){fn();count++;console.log('PASS '+name);}
const rec={id:'sample',mode:'out',created:1,updated:2,meta:{date:'2026-10-29',address:'100 Sample Street',unit:'2',tenant:'DO NOT COPY TENANT',access:'DO NOT COPY CODE'},spaces:[{id:'room',type:'other',name:'Rear studio',items:[{t:'Floor',s:'work',n:'DO NOT COPY OBSERVATION'}]}],wk:{},sig:{}};
const plan={id:'visit1',revision:1,updatedAt:10,mode:'out',meta:{address:rec.meta.address,unit:'2',date:'2026-10-29',inspector:'Sample Inspector',officeInstructions:'Check rear studio.'},layout:M.layout(rec)};
check('Visit plans contain definitions and office instructions without inspection findings',()=>{const value=JSON.stringify(V.visit(plan));for(const s of ['DO NOT COPY TENANT','DO NOT COPY CODE','DO NOT COPY OBSERVATION'])assert.ok(!value.includes(s));assert.ok(value.includes('Rear studio'));});
check('Visits accept all four inspection types and flexible named spaces',()=>{for(const mode of ['in','out','ready','routine'])assert.equal(V.visit({...plan,mode,layout:{...plan.layout,mode}}).mode,mode);});
check('Wrong-property and wrong-type layouts cannot populate a visit',()=>{assert.throws(()=>V.visit({...plan,layout:{...plan.layout,address:'Wrong house'}}),/another property/);assert.throws(()=>V.visit({...plan,layout:{...plan.layout,mode:'in'}}),/another property/);});
check('Invalid calendar dates cannot enter visit files',()=>{assert.throws(()=>V.visit({...plan,meta:{...plan.meta,date:'2026-02-30'}}),/date/);});
check('Repeated visit files never duplicate a planned inspection',()=>{const result=V.merge([plan],[plan]);assert.equal(result.visits.length,1);assert.equal(result.added,0);});
check('New revisions update unstarted visits only',()=>{const changed={...plan,revision:2,updatedAt:20,meta:{...plan.meta,inspector:'Another Inspector'}};assert.equal(V.merge([plan],[changed]).updated,1);assert.equal(V.merge([plan],[changed],['visit1']).conflicts.length,1);});
check('Same-version conflicts keep the saved plan',()=>{const result=V.merge([plan],[{...plan,meta:{...plan.meta,inspector:'Another Inspector'}}]);assert.equal(result.conflicts.length,1);assert.equal(result.visits[0].meta.inspector,'Sample Inspector');});
check('Malformed and duplicate visit files are rejected',()=>{assert.throws(()=>V.file({type:'cimco-inspection-visits',version:1,visits:[plan,plan]}),/same ID/);assert.throws(()=>V.file({type:'other',version:1,visits:[plan]}),/visit file/);});
check('Notes stay specific to the chosen checklist item',()=>{assert.ok(V.suggestions('Sink / faucet')[0].includes('Water leaking'));assert.ok(V.suggestions('Floor')[0].includes('flooring'));assert.ok(!V.suggestions('Floor').join(' ').includes('Water leaking'));});
check('Saved preferences and visits validate before restoration',()=>{const value=V.state({inspector:'Sample Inspector',visits:[plan],backupAt:10});assert.equal(value.inspector,'Sample Inspector');assert.equal(value.visits.length,1);assert.equal(value.backupAt,10);});
console.log(`${count} visit-plan checks passed.`);
