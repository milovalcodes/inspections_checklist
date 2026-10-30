// Fictional reports for checking the browser's real paginated print output.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'tmp','print-review');fs.mkdirSync(out,{recursive:true});
const core=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/\r\n/g,'\n');
const ctx={console,Date,Math,JSON,Number,String,Array,Object,Set,FLAGS:['work'],MODE_LABEL:{in:'Move-in',out:'Move-out',ready:'Rent-ready',routine:'Routine'},ORG:'CIMCO Property Management',REPORT_LOGO_DATA:'data:image/png;base64,'+fs.readFileSync(path.join(root,'cimco-logo.png')).toString('base64'),cur:null,photos:{}};
vm.createContext(ctx);
function extract(source,name){const start=source.indexOf('function '+name+'(');if(start<0)throw new Error(name);const tail=source.slice(start),line=tail.slice(0,tail.indexOf('\n')),end=line.trim().endsWith('}')?line.length:tail.indexOf('\n}')+2;vm.runInContext(tail.slice(0,end),ctx);}
for(const name of ['propertyMatches','esc','fmtDate','money','activeSpaces','title','stats','flagged','modeTitle','keysLabelForMode','workLabel','marketLabel','visitLabel','entryLabel'])extract(core,name);
vm.runInContext(fs.readFileSync(path.join(root,'office-model.js'),'utf8'),ctx);ctx.M=ctx.OfficeModel;ctx.e=ctx.esc;
vm.runInContext(fs.readFileSync(path.join(root,'inspection-reports.js'),'utf8'),ctx);
const office=fs.readFileSync(path.join(root,'offline-office.js'),'utf8').replace(/\r\n/g,'\n');
for(const name of ['flatten','comparisonRows','taskPhotos','extraReport'])extract(office,name);
ctx.OfflineOffice={extraReport:ctx.extraReport,comparisonRows:ctx.comparisonRows};
const stamp=Date.parse('2026-10-30T10:00:00-04:00');
const cases=[];
const numbered=(prefix,n)=>Array.from({length:n},(_,i)=>prefix+String(i+1).padStart(3,'0')+' Recorded condition detail for the inspection report.').join('\n');
function fixture(mode){
  const rec={id:'SAMPLE-PRINT-'+mode.toUpperCase(),mode,meta:{address:'SAMPLE PROPERTY - 100 Demonstration Lane',unit:'Practice only',date:'2026-10-30',inspector:'Sample Inspector',tenant:'Sample Tenant',owner:'Sample Owner',tenantSignStatus:'absent',keys:'Front door: 2\nMailbox: 1',misc:'SAMPLE REPORT ONLY. All people, observations and images are fictional.',officeInstructions:'Inspect rooms in any order and change the layout to match the house.',photoSize:'md',readyTags:[],workCategories:[]},spaces:[],wk:{},sig:{t:'',i:''},followUp:{}};
  ['Living room','Kitchen','Primary bedroom','Bedroom 2','Primary bath','Bathroom 2','HVAC','Thermostat','Air filter','Outside'].forEach((name,i)=>rec.spaces.push({id:'room'+i,type:'other',name,items:['Floor / condition','Walls / ceiling','Operation','Doors / access','Windows','Fixtures'].map(t=>({t,s:'ok',n:'',base:mode==='out'?'ok':''}))}));
  rec.spaces[1].items[0]={t:'Floor / condition',s:'work',base:'ok',category:'repair',n:'Cracked tile beside the refrigerator. Inspect and repair after office review.'};
  rec.spaces[5].items[2]={t:'Outlet operation',s:'nt',n:'Power was off. Outlet operation could not be checked.'};
  rec.wk['room1:0']={k:'dmg',c:'125.00'};
  return rec;
}
function picture(rec,i,caption){const portrait=i%2===1,w=portrait?800:1200,h=portrait?1200:800;return {id:'photo'+i,insp:rec.id,key:i<4?'room1:0':'room5:2',ts:stamp,caption,data:'data:image/svg+xml;base64,'+Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#edf3f8"/><rect x="30" y="30" width="${w-60}" height="${h-60}" fill="white" stroke="#00437d" stroke-width="8"/><text x="50%" y="45%" text-anchor="middle" font-family="Arial" font-size="44" fill="#00437d">SAMPLE PHOTO ${i+1}</text><text x="50%" y="55%" text-anchor="middle" font-family="Arial" font-size="26" fill="#40596b">Fictional print test</text></svg>`).toString('base64')};}
function write(name,rec,pics){ctx.cur=rec;ctx.photos={};for(const p of pics)(ctx.photos[p.key]||=[]).push(p);rec.sig.i='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80"><path d="M10 60 Q60 0 80 50 T150 20 T250 35" fill="none" stroke="#172f43" stroke-width="3"/></svg>').toString('base64');ctx.InspectionReport.recordSignature(rec,'i');const html=ctx.InspectionReport.html(rec,ctx.photos);fs.writeFileSync(path.join(out,name+'.html'),html);cases.push({name,markers:[...html.matchAll(/\b(?:NOTE|CAPTION|OFFICE|KEY|GENERAL|INSTRUCTION)\d{3}\b/g)].map(m=>m[0])});
  if(name==='out'){
    const data=JSON.stringify({rec,pics}).replace(/</g,'\\u003c');
    const harness=`<script>(async()=>{try{if(!SELF_TEST)throw new Error('Use selftest=1');await __CIMCO_OFFICE__.cleanup();__CIMCO_FLOW__.cleanup();const fixture=${data};const rec=await __CIMCO_FLOW__.create('out',{});const id=rec.id;Object.assign(rec,fixture.rec,{id,reportId:fixture.rec.id,sig:{t:'',i:''},signatureMeta:{}});for(const p of fixture.pics)await __CIMCO_OFFICE__.putPhoto({...p,insp:id});await __CIMCO_FLOW__.reopen(rec);await ensureReportLogo();rec.sig.i=fixture.rec.sig.i;InspectionReport.recordSignature(rec,'i');__CIMCO_FLOW__.flush();const status=document.createElement('p');status.id='printFixtureStatus';status.textContent='App print fixture ready';document.body.append(status);}catch(e){document.body.textContent=e.stack;}})();</script>`;
    fs.writeFileSync(path.join(out,'app-print.html'),core.replace('<meta charset="utf-8">','<meta charset="utf-8"><base href="../../">').replaceAll('?v=62','?v=62&print-fixture='+Date.now())+harness);
  }
}
for(const mode of ['in','out','ready','routine']){const rec=fixture(mode);write(mode,rec,Array.from({length:7},(_,i)=>picture(rec,i,'Sample condition photo '+(i+1)+'. Full image must remain visible.')));}
const long=fixture('out');long.meta.address='SAMPLE PROPERTY WITH A LONG ADDRESS - Building 123, North Demonstration Estates, Rear studio and upstairs addition';long.spaces[1].items[0].n=numbered('NOTE',150)+'\nLONGTOKEN'+('Abcdefghij'.repeat(35));long.meta.misc=numbered('GENERAL',36);long.meta.keys=numbered('KEY',22);long.meta.officeInstructions=numbered('INSTRUCTION',28);const tasks=ctx.M.tasks(long,stamp);long.followUp[tasks[0].key]={...tasks[0],note:numbered('OFFICE',115),assignee:'Sample Maintenance Team'};write('long-notes',long,[picture(long,0,'Long-note report photograph.')]);
for(const size of ['sm','md','lg']){const rec=fixture('out');rec.meta.photoSize=size;write('captions-'+size,rec,Array.from({length:4},(_,i)=>picture(rec,i,i===0?numbered('CAPTION',100):'Short caption '+(i+1))));}
const evidence=fixture('out'),prior=fixture('in');prior.id='SAMPLE-PRIOR';prior.meta.date='2026-09-01';evidence.from=prior.id;evidence.baselineSnapshot={inspection:prior,photos:[picture(prior,0,'Earlier inspection condition.')]};const evidenceTasks=ctx.M.tasks(evidence,stamp);evidence.followUp[evidenceTasks[0].key]={...evidenceTasks[0],state:'done',assignee:'Sample Maintenance',note:'Sample office follow-up.',completedAt:stamp};const completion={...picture(evidence,1,numbered('OFFICE',65)),key:'followup:'+evidenceTasks[0].id,kind:'completion'};write('office-evidence',evidence,[picture(evidence,0,'Current inspection condition.'),completion]);
const estimates=fixture('routine');estimates.spaces.forEach(sp=>sp.items.forEach((it,i)=>{it.s='work';it.n='Sample finding requiring office review.';estimates.wk[sp.id+':'+i]={k:'maintenance',c:'25.00'};}));write('many-estimates',estimates,[]);
const wide=fixture('out');wide.meta.address='W'.repeat(120)+' - SAMPLE LONG ADDRESS';wide.id='W'.repeat(100);wide.meta.inspector='W'.repeat(100);wide.meta.tenant='W'.repeat(100);write('wide-labels',wide,[]);
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(cases,null,2));
console.log('Created '+cases.length+' fictional print fixtures in '+out);
