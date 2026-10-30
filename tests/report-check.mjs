import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/\r\n/g,'\n');
const ctx={console,Date,Math,JSON,Number,String,Array,Object,Set,FLAGS:['work'],MODE_LABEL:{in:'Move-in',out:'Move-out',ready:'Rent-ready',routine:'Routine'},ORG:'CIMCO Property Management',REPORT_LOGO_DATA:'data:image/png;base64,LOGO',photos:{},cur:null,drawSig:()=>{}};
vm.createContext(ctx);
for(const name of ['propertyMatches','esc','fmtDate','money','roomFamily','activeSpaces','title','stats','flagged','modeTitle','keysLabelForMode','workLabel','marketLabel','visitLabel','entryLabel']){
  const start=source.indexOf('function '+name+'('),tail=source.slice(start),line=tail.slice(0,tail.indexOf('\n')),end=line.trim().endsWith('}')?line.length:tail.indexOf('\n}')+2;
  assert.ok(start>=0,name+' exists');vm.runInContext(tail.slice(0,end),ctx);
}
vm.runInContext(fs.readFileSync(path.join(root,'inspection-reports.js'),'utf8'),ctx);
const R=ctx.InspectionReport;
let count=0;
function check(label,run){run();count++;console.log('PASS '+label);}
function fixture(){return {id:'report-B',mode:'out',meta:{date:'2026-10-29',address:'SAMPLE PROPERTY B',inspector:'Test Inspector',keys:'Front door: 2',misc:'Overall note'},wk:{},sig:{t:'',i:''},spaces:[{id:'bed',name:'Upstairs bedroom',type:'bedroom',items:[{t:'Wall',s:'work',n:'UNIQUE BEDROOM NOTE'},{t:'Closet',s:'ok',n:'GOOD ITEM NOTE'},{t:'Window',s:'nt',n:'Room locked'},{t:'Fan',s:'np',n:'No fan installed'},{t:'Floor',s:'',n:''}]}]};}
const rec=fixture();ctx.cur=rec;
check('Property matching rejects other houses and units',()=>{assert.equal(ctx.propertyMatches({address:'100 Test St',unit:'2'},{address:'100 TEST ST',unit:'#2'}),true);assert.equal(ctx.propertyMatches({address:'100 Test St',unit:'2'},{address:'200 Test St',unit:'2'}),false);assert.equal(ctx.propertyMatches({address:'100 Test St',unit:'2'},{address:'100 Test St',unit:'3'}),false);});
check('Every room note and unreviewed item survives export',()=>{const h=R.html(rec);for(const t of ['UNIQUE BEDROOM NOTE','GOOD ITEM NOTE','Room locked','No fan installed','Not reviewed','Front door: 2','Overall note'])assert.ok(h.includes(t),t);});
check('Absence, untested and unreviewed are separate outcomes',()=>{const d=R.model(rec);assert.equal(d.counts.np,1);assert.equal(d.counts.nt,1);assert.equal(d.counts.blank,1);assert.ok(R.html(rec).includes('Review needed'));});
check('No estimate produces no false zero total',()=>{const p=R.pricing(rec);assert.equal(p.priced,0);assert.ok(R.html(rec).includes('Not estimated'));assert.ok(!R.html(rec).includes('$0.00'));});
check('Cost without classification remains pending',()=>{rec.wk['bed:0']={c:'125.00',k:''};const p=R.pricing(rec);assert.equal(p.pending.length,1);assert.equal(p.priced,0);const h=R.html(rec);assert.ok(h.includes('Pending review'));assert.ok(!h.includes('Normal wear</td>'));assert.ok(h.includes('$125.00'));});
check('Explicit zero remains a real estimate',()=>{rec.wk['bed:0']={c:'0.00',k:'dmg'};assert.equal(R.pricing(rec).priced,1);assert.ok(R.html(rec).includes('$0.00'));});
check('Money rejects invalid decimals and negatives',()=>{for(const v of ['1.2.3','-12','abc','1.234','NaN',''])assert.equal(R.amount(v),null,v);assert.equal(R.amount('12.30'),1230);});
check('Partial estimate excludes unassigned costs',()=>{rec.spaces[0].items.push({t:'Door',s:'work',n:'Damaged'});rec.wk['bed:0']={k:'dmg',c:'125.10'};rec.wk['bed:5']={k:'',c:'90'};assert.equal(R.pricing(rec).total,12510);assert.equal(R.pricing(rec).pending.length,1);assert.ok(R.html(rec).includes('$125.10 - partial subtotal'));});
check('Report for B cannot borrow photos from open property A',()=>{ctx.cur={...fixture(),id:'report-A',meta:{...rec.meta,address:'PROPERTY A'}};ctx.photos={'bed:0':[{id:'photo-A',insp:'report-A',key:'bed:0',data:'data:image/png;base64,A_ONLY'}]};const h=R.html(rec);assert.ok(!h.includes('A_ONLY'));assert.ok(h.includes('SAMPLE PROPERTY B'));});
check('Explicit report photos retain captions and correct locations',()=>{rec.photos=[{id:'Bphoto',insp:rec.id,key:'bed:0',data:'data:image/png;base64,B_ONLY',caption:'Specific photo caption',ts:1000}];const h=R.html(rec);assert.ok(h.includes('B_ONLY'));assert.ok(h.includes('Specific photo caption'));assert.ok(h.includes('Photo 1 - Upstairs bedroom'));assert.ok(!h.includes('photos taken'));});
ctx.cur=rec;ctx.photos={};delete rec.photos;
check('New signature binds to the report version',()=>{rec.sig.t='data:image/svg+xml,SIGN';R.recordSignature(rec,'t');assert.equal(R.validSignature(rec,'t'),true);});
check('Navigation does not invalidate a signature',()=>{rec.fieldState={panel:'room',room:'bed'};R.invalidateSignatures(rec);assert.ok(rec.sig.t);});
check('Condition edit archives signature without destroying evidence',()=>{rec.spaces[0].items[0].n+=' changed';R.invalidateSignatures(rec);assert.equal(rec.sig.t,'');assert.equal(rec.signatureHistory.length,1);assert.equal(rec.signatureHistory[0].data,'data:image/svg+xml,SIGN');});
check('Unsigned legacy signature is never presented as current',()=>{rec.sig.i='LEGACY';assert.equal(R.validSignature(rec,'i'),false);assert.ok(R.html(rec).includes('Earlier signature requires renewed review'));R.invalidateSignatures(rec);assert.ok(rec.signatureHistory.some(s=>s.data==='LEGACY'));});
check('Change of inspection type needs fresh sign-off',()=>{rec.sig.i='NEW';R.recordSignature(rec,'i');rec.mode='in';R.invalidateSignatures(rec);assert.equal(rec.sig.i,'');});
check('Photo edits invalidate current sign-off',()=>{rec.sig.i='NEW PHOTO SIGN';R.recordSignature(rec,'i');ctx.photos={'bed:0':[{id:'new-photo',insp:rec.id,key:'bed:0',data:'NEW PHOTO'}]};R.invalidateSignatures(rec);assert.equal(rec.sig.i,'');});
check('All four inspection types generate a complete template',()=>{for(const mode of ['in','out','ready','routine']){rec.mode=mode;assert.ok(R.html(rec).includes('Detailed checklist'));assert.ok(R.text(rec).includes('GOOD ITEM NOTE'));}});
check('Internal access information stays out of reports',()=>{rec.mode='ready';rec.meta.access='PRIVATE LOCKBOX SECRET';assert.ok(!R.html(rec).includes('PRIVATE LOCKBOX SECRET'));assert.ok(!R.text(rec).includes('PRIVATE LOCKBOX SECRET'));});
check('Long photo descriptions remain complete in a full-width printable section',()=>{const caption=Array.from({length:80},(_,i)=>'CAPTION'+i+' Full recorded description.').join('\n');const h=R.photoEvidence([{data:'data:image/png;base64,TEST',alt:'Photo 1',label:'Photo 1',title:'Photo 1 - Kitchen / Floor',caption,date:'Added 10/30/26'}]);assert.ok(h.includes('Extended photo descriptions'));assert.ok(h.includes(caption));assert.ok(h.includes('See Photo 1 in Extended photo descriptions below.'));assert.ok(!h.slice(0,h.indexOf('</figure>')).includes('CAPTION79'));});
check('Ordinary photo descriptions stay directly with their photographs',()=>{const h=R.photoEvidence([{data:'data:image/png;base64,TEST',alt:'Photo 1',label:'Photo 1',title:'Photo 1 - Kitchen / Floor',caption:'Crack at doorway.',date:'Added 10/30/26'}]);assert.ok(h.includes('Crack at doorway.<br>'));assert.ok(!h.includes('Extended photo descriptions'));});
check('Long findings and checklist rows can continue onto another printed page',()=>{const sample=fixture();sample.spaces[0].items[0].n='A recorded condition.\n'.repeat(90);const h=R.html(sample);assert.ok(h.includes('r-finding r-long-content'));assert.ok(h.includes('r-work r-long-content'));});
check('Running footers stay short while the complete property remains in the report',()=>{const sample=fixture();sample.meta.address='W'.repeat(140);sample.id='W'.repeat(100);const h=R.html(sample);assert.ok(h.includes(sample.meta.address));const footer=h.match(/@bottom-left\{content:("(?:\\.|[^"])*")/);assert.ok(footer);assert.ok(JSON.parse(footer[1]).length<=63);assert.ok(h.includes('white-space:nowrap;width:80%'));});
console.log(`${count} report accuracy checks passed.`);
if(process.argv.includes('--samples')){
  const out=path.join(root,'tmp','qa-v57');fs.mkdirSync(out,{recursive:true});
  ctx.REPORT_LOGO_DATA='data:image/png;base64,'+fs.readFileSync(path.join(root,'cimco-logo.png')).toString('base64');
  for(const mode of ['in','out','ready','routine']){
    const sample={id:'SAMPLE-V57-'+mode.toUpperCase(),mode,meta:{date:'2026-10-29',address:'SAMPLE PROPERTY - 3 bedrooms, 2 bathrooms',unit:'Demo only',inspector:'Sample Inspector',tenant:'Sample Tenant',owner:'Sample Owner',keys:'Front door key: 2\nMailbox key: 1',misc:'DEMONSTRATION REPORT. All names, findings, and images are sample data.\nInspectors can record rooms in any order. This report uses a consistent order.',photoSize:'md',readyTags:[],tenantSignStatus:'absent'},wk:{},sig:{t:'',i:''},spaces:[]};
    const rooms=[['living','Living room'],['kitchen','Kitchen'],['bedroom','Primary bedroom'],['bedroom','Upstairs bedroom'],['bedroom','Guest bedroom / home office'],['bathroom','Hall bathroom'],['halfbath','Downstairs powder room'],['garage','Garage'],['patio','Rear patio / lanai']];
    rooms.forEach(([type,name],j)=>sample.spaces.push({id:'room'+j,type,name,items:['Floor','Walls / ceiling','Lights','Doors / locks','Windows','Outlets'].map(t=>({t,s:'ok',n:'',base:mode==='out'?'ok':''}))}));
    sample.spaces[1].items[0].s='work';sample.spaces[1].items[0].n='Sample observation: floor tile is cracked beside the refrigerator. Photograph records the visible condition. Office review is pending.';
    sample.spaces[3].items[1].s='work';sample.spaces[3].items[1].n='Sample bedroom note: scuff marks on the wall near the closet. Preserve this full note in the report.';
    sample.spaces[5].items[5].s='nt';sample.spaces[5].items[5].n='Power off. Outlet could not be tested.';
    sample.spaces[7].items[4].s='np';sample.spaces[7].items[4].n='No window in this garage.';
    sample.spaces[2].items[1].n='Sample Good-result note retained for context.';
    sample.spaces[8].items[4].s='';
    sample.wk['room1:0']={k:'dmg',c:'125.00'};sample.wk['room3:1']={k:'',c:''};
    ctx.cur=sample;ctx.photos={};
    for(let i=0;i<6;i++){
      const key=i<3?'room1:0':'room3:1',portrait=i%2===1,w=portrait?800:1200,h=portrait?1200:800;
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#e8eef3"/><rect x="40" y="40" width="${w-80}" height="${h-80}" rx="12" fill="#fff" stroke="#00437d" stroke-width="6"/><text x="50%" y="45%" text-anchor="middle" font-family="Arial" font-size="48" fill="#00437d">SAMPLE PHOTO ${i+1}</text><text x="50%" y="55%" text-anchor="middle" font-family="Arial" font-size="27" fill="#40596b">Demonstration image only</text></svg>`;
      (ctx.photos[key]||=[]).push({id:'sample-photo'+i,insp:sample.id,key,data:'data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64'),caption:i===5?'A longer sample caption to verify wrapping and keep the photograph and its caption together on the same page.':'Sample condition image '+(i+1),ts:Date.now()});
    }
    fs.writeFileSync(path.join(out,mode+'-sample.html'),R.html(sample));
  }
  console.log('Four demonstration reports written to tmp/qa-v57.');
}
