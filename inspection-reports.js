/* One report model and template for browser printing, sharing and office review. */
var InspectionReport = (function(){
"use strict";
const e=value=>esc(value);
const labels={ok:"Good",work:"Needs work",np:"Not present",nt:"Could not check",na:"N/A - earlier record","":"Not reviewed"};
const imageHashes=new WeakMap();
function hashText(value){let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,"0");}
function imageHash(photo){const prior=imageHashes.get(photo);if(prior&&prior.data===photo.data)return prior.hash;const hash=hashText(String(photo.data||""));imageHashes.set(photo,{data:photo.data,hash});return hash;}
function photoMap(rec){
  if(rec===cur) return photos;
  const map={};
  (Array.isArray(rec.photos)?rec.photos:[]).filter(p=>!p.insp||p.insp===rec.id).forEach(p=>(map[p.key]=map[p.key]||[]).push(p));
  return map;
}
function log(rec,map=photoMap(rec)){
  const rows=[];
  activeSpaces(rec).forEach(sp=>sp.items.forEach((it,i)=>{
    const key=sp.id+":"+i;
    (map[key]||[]).filter(p=>!p.insp||p.insp===rec.id).forEach(p=>rows.push({n:rows.length+1,key,sp,it,p}));
  }));
  return rows;
}
function amount(value){
  const raw=String(value==null?"":value).trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const n=Number(raw); return Number.isFinite(n)&&n>=0?Math.round(n*100):null;
}
function pricing(rec){
  const rows=flagged(rec).map(o=>{
    const w=(rec.wk||{})[o.key]||{};
    return {...o,kind:w.k||"",cents:amount(w.c),raw:String(w.c||"")};
  });
  const routine=rec.mode==="routine";
  const relevant=rows.filter(r=>routine||r.kind==="dmg");
  const known=relevant.filter(r=>r.cents!==null);
  const pending=rows.filter(r=>!r.kind||(routine||r.kind==="dmg")&&r.cents===null);
  return {rows,pending,priced:known.length,total:known.reduce((sum,r)=>sum+r.cents,0),complete:!!rows.length&&!pending.length};
}
function fingerprint(rec,map){
  const source=typeof OfficeModel!=="undefined"?OfficeModel.cleanRecord(rec):rec;
  const meta={...(source.meta||{})};
  delete meta.access; delete meta.photoSize;
  return hashText(JSON.stringify({id:source.reportId||source.id,mode:source.mode,meta,spaces:activeSpaces(source),wk:source.wk||{},photos:log(rec,map).map(o=>[o.p.key,o.p.caption||"",imageHash(o.p)])}));
}
function archiveSignature(rec,key,reason){
  if(!rec.sig||!rec.sig[key]) return;
  rec.signatureHistory=rec.signatureHistory||[];
  rec.signatureHistory.push({party:key,data:rec.sig[key],...(rec.signatureMeta||{})[key],archivedAt:Date.now(),reason});
  rec.sig[key]="";
  if(rec.signatureMeta) delete rec.signatureMeta[key];
  rec.signatureNotice="The inspection changed after signing. Please review and sign again.";
  if(rec===cur && typeof drawSig==="function") drawSig(key==="t"?"T":"I","");
}
function invalidateSignatures(rec,map){
  if(!rec||!rec.sig) return;
  const hash=fingerprint(rec,map);
  for(const key of ["t","i"]){
    const meta=(rec.signatureMeta||{})[key];
    if(rec.sig[key]&&(!meta||meta.fingerprint!==hash)) archiveSignature(rec,key,meta?"Report content changed":"Earlier signature has no report version");
  }
}
function recordSignature(rec,key){
  const hash=fingerprint(rec);
  for(const other of ["t","i"].filter(k=>k!==key)){
    const meta=(rec.signatureMeta||{})[other];
    if(rec.sig[other]&&(!meta||meta.fingerprint!==hash)) archiveSignature(rec,other,"Report content changed");
  }
  rec.signatureMeta=rec.signatureMeta||{};
  rec.signatureMeta[key]={fingerprint:hash,signedAt:Date.now()};
  rec.signatureNotice="";
}
function validSignature(rec,key,map){
  return !!(rec.sig&&rec.sig[key]&&rec.signatureMeta&&rec.signatureMeta[key]&&rec.signatureMeta[key].fingerprint===fingerprint(rec,map));
}
function signOffVersion(rec){
  const source=typeof OfficeModel!=="undefined"?OfficeModel.cleanRecord(rec):rec;
  return hashText(JSON.stringify([source.sig||{},source.signatureMeta||{},source.signatureHistory||[]]));
}
function readiness(rec){
  const issues=[],m=rec.meta||{},s=stats(rec);
  if(!String(m.address||"").trim()) issues.push({text:"Add the property address",target:"metaBox"});
  if(!m.date) issues.push({text:"Add the inspection date",target:"metaBox"});
  if(!String(m.inspector||"").trim()) issues.push({text:"Add the inspector name",target:"metaBox"});
  if(s.done<s.total) issues.push({text:(s.total-s.done)+((s.total-s.done)===1?" item still needs checking":" items still need checking"),target:"roomDirectory"});
  activeSpaces(rec).forEach(sp=>sp.items.forEach((it,i)=>{
    if(["work","nt"].includes(it.s)&&!String(it.n||"").trim()) issues.push({text:sp.name+" / "+it.t+": add a short explanation",room:sp.id,item:i});
  }));
  if(!s.total) issues.push({text:"Add at least one inspection area",target:"roomDirectory"});
  return issues;
}
function model(rec,map){
  const s=stats(rec),counts={ok:0,work:0,np:0,nt:0,na:0,blank:0};
  activeSpaces(rec).forEach(sp=>sp.items.forEach(it=>counts[it.s||"blank"]=(counts[it.s||"blank"]||0)+1));
  const hash=fingerprint(rec,map),pics=log(rec,map),refs={};
  pics.forEach(o=>(refs[o.key]=refs[o.key]||[]).push(o.n));
  return {rec,s,counts,pics,refs,pricing:pricing(rec),hash,id:String(rec.reportId||rec.id||"unsaved").toUpperCase(),issues:readiness(rec)};
}
function signOffIssues(rec,map){
  if(rec.mode==='ready')return [];
  const issues=[],m=rec.meta||{};
  if(!validSignature(rec,'i',map))issues.push({text:'Inspector signature not recorded',target:'signatures'});
  if(!m.tenantSignStatus&&!validSignature(rec,'t',map))issues.push({text:'Record the tenant signature or why it is unavailable',target:'signatures'});
  else if(m.tenantSignStatus==='present'&&!validSignature(rec,'t',map))issues.push({text:'Tenant signature not recorded',target:'signatures'});
  return issues;
}
const CSS=`
.inspection-report{font:10pt/1.4 Arial,Helvetica,sans-serif;color:#172f43;background:#fff;max-width:190mm;margin:0 auto;overflow-wrap:anywhere}
.inspection-report *{box-sizing:border-box}.inspection-report h1,.inspection-report h2,.inspection-report h3,.inspection-report p{margin:0}
.inspection-report .r-brand{display:flex;gap:6mm;align-items:center;border-bottom:2pt solid #00437d;padding-bottom:4mm;margin-bottom:4mm}
.inspection-report .r-brand img{width:31mm;max-height:16mm;object-fit:contain}.inspection-report .r-brand p{font-size:8pt;letter-spacing:.08em;color:#40596b}
.inspection-report h1{font-size:21pt;line-height:1.15;margin-top:1mm}.inspection-report .r-address{font-size:15pt;margin:3mm 0}
.inspection-report .r-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3mm 5mm;padding:3mm 0;border-top:.5pt solid #c5d1da;border-bottom:.5pt solid #c5d1da}
.inspection-report .r-meta b{display:block;font-size:7.5pt;text-transform:uppercase;letter-spacing:.04em;color:#40596b}
.inspection-report .r-summary{margin:4mm 0;padding:3mm 4mm;background:#eef4f8;border-left:3pt solid #00437d}
.inspection-report .r-summary strong{font-size:11pt}.inspection-report .r-summary p{margin-top:1mm}
.inspection-report .r-alert{background:#fff3e9;border-color:#a54b20}.inspection-report .r-section{margin-top:5mm}
.inspection-report h2{font-size:12pt;padding-bottom:1.5mm;margin-bottom:2mm;border-bottom:1pt solid #00437d;break-after:avoid-page}
.inspection-report h3{font-size:10.5pt;margin:2.5mm 0 1.5mm;break-after:avoid-page}
.inspection-report table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9pt}
.inspection-report th{background:#eef4f8;text-align:left;font-size:8pt;padding:1.5mm 2mm;border-bottom:1pt solid #b7c8d5}
.inspection-report td{padding:1.5mm 2mm;border-bottom:.5pt solid #d8e1e8;vertical-align:top;white-space:pre-wrap}
.inspection-report tr{break-inside:avoid-page}.inspection-report thead{display:table-header-group}
.inspection-report .r-item{width:30%}.inspection-report .r-result{width:19%}.inspection-report .r-work td{background:#fff5f1}
.inspection-report .r-nt td{background:#fff9ee}.inspection-report .r-muted{color:#40596b;font-size:8.5pt}
.inspection-report .r-finding{padding:2.5mm 0;border-bottom:.5pt solid #d8e1e8;break-inside:avoid-page}
.inspection-report .r-finding p{margin-top:1mm;white-space:pre-wrap}.inspection-report .r-ref{font-size:8pt;color:#00437d}
.inspection-report .r-text{white-space:pre-wrap}.inspection-report .r-signatures{display:grid;grid-template-columns:1fr 1fr;gap:8mm;break-inside:avoid-page}
.inspection-report .r-signature{border-bottom:.5pt solid #8196a6;padding:2mm 0;min-height:23mm}
.inspection-report .r-signature img{display:block;width:auto;height:auto;max-width:60mm;max-height:16mm;margin:1mm 0}
.inspection-report .r-photo-log{break-before:auto}.inspection-report .r-photos{font-size:0}
.inspection-report figure{display:inline-block;width:48%;vertical-align:top;margin:0 4% 5mm 0;break-inside:avoid-page;font-size:9pt}
.inspection-report figure:nth-child(even){margin-right:0}.inspection-report figure img{display:block;width:100%;height:54mm;object-fit:contain;background:#f5f7f9;border:.5pt solid #bccbd5}
.inspection-report figcaption{padding-top:1.5mm;line-height:1.35}.inspection-report .r-photo-log.r-large figure{width:100%;margin-right:0}
.inspection-report .r-photo-log.r-large figure img{height:155mm}.inspection-report .r-photo-log.r-small figure{width:31%;margin-right:3.5%}.inspection-report .r-photo-log.r-small figure:nth-child(3n){margin-right:0}.inspection-report .r-photo-log.r-small figure img{height:46mm}
.inspection-report .r-record{margin-top:4mm;border-top:.5pt solid #c5d1da;padding-top:2mm;font-size:8pt;color:#40596b}
.inspection-report .r-write{display:block;height:9mm;border-bottom:.5pt solid #9eafbc}
.inspection-report .r-totals{padding:3mm;background:#eef4f8;margin-top:2mm;break-inside:avoid-page}
.inspection-report .r-pricing{break-inside:avoid-page}.inspection-report .r-section>p.r-muted{break-after:avoid-page}
.inspection-report .r-short-followup{break-inside:avoid-page}
.inspection-report .r-compare img{display:block;width:100%;height:48mm;object-fit:contain;background:#f2f5f8}.inspection-report .r-compare th,.inspection-report .r-compare td{width:50%}.inspection-report .r-urgent{color:#922e17}
@media screen{.inspection-report{padding:6mm}.inspection-report .r-photo-log{margin-top:8mm}}
@media print{
 @page{size:Letter portrait;margin:14mm 14mm 17mm}
 body{background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
 body.report-printing>*:not(#professionalReport){display:none!important}
 #professionalReport{display:block!important;margin:0!important;padding:0!important;width:100%!important}
 .inspection-report{max-width:none;padding:0;font-size:9.3pt}.inspection-report .r-brand,.inspection-report .r-meta,.inspection-report .r-summary{break-inside:avoid-page}
 .inspection-report .r-photos{orphans:1;widows:1}.inspection-report .r-photo-log>h2{break-after:avoid-page}
}
@media screen and (max-width:560px){.inspection-report .r-meta{grid-template-columns:1fr 1fr}.inspection-report figure{width:100%;margin-right:0}.inspection-report .r-signatures{grid-template-columns:1fr}}
`;
function footerCSS(rec){
  const content=JSON.stringify(title(rec)+" | "+String(rec.reportId||rec.id||"").toUpperCase()).replace(/</g,"\\3c ");
  return "@page{@bottom-left{content:"+content+";font:7pt Arial;color:#40596b}@bottom-right{content:'Page ' counter(page) ' of ' counter(pages);font:7pt Arial;color:#40596b}}";
}
function body(rec,map){
  const m=rec.meta||{},d=model(rec,map),s=d.s,c=d.counts;
  const reviewIssues=[...d.issues,...signOffIssues(rec,map)];
  const row=(name,value)=>value?`<div><b>${e(name)}</b>${e(value)}</div>`:"";
  const refs=key=>d.refs[key]?`<span class="r-ref">Photos ${d.refs[key].join(", ")}</span>`:"";
  let meta=row("Inspection date",fmtDate(m.date))+row("Inspector",m.inspector||"Not recorded")+row("Tenant",m.tenant)+row("Owner",m.owner);
  meta+=row("Report ID",d.id)+row("Inspection version",d.hash)+row("Clean condition",m.clean==="yes"?"Clean":m.clean==="no"?"Needs cleaning":"");
  if(rec.mode==="routine") meta+=row("Visit reason",visitLabel(m.visitReason))+row("Attendance / access",entryLabel(m.entryStatus));
  if(rec.mode==="ready") meta+=row("Market status",marketLabel(m.marketStatus))+row("Work category",workLabel(rec))+row("Assigned to",m.responsible)+row("Overall estimate",amount(m.estimatedCost)!==null?money(amount(m.estimatedCost)/100):m.estimatedCost?"Estimate needs review":"");
  meta+=row("Electric meter",m.meterE)+row("Water meter",m.meterW);
  if(rec.mode==="out") meta+=row("Forwarding address",m.fwd);
  const pending=c.blank+c.nt;
  let content=`<article class="inspection-report"><header class="r-brand"><img src="${e(REPORT_LOGO_DATA||"./cimco-logo.png")}" alt="CIMCO Property Management"><div><p>PROPERTY CONDITION REPORT</p><h1>${e(modeTitle(rec))} inspection</h1></div></header><h2 class="r-address">${e(title(rec))}</h2><div class="r-meta">${meta}</div>`;
  content+=`<div class="r-summary ${reviewIssues.length||pending?"r-alert":""}"><strong>${reviewIssues.length||pending?"Review needed":"Checklist recorded"}</strong><p>${s.done} of ${s.total} items recorded. ${c.ok} Good; ${c.work} Needs work; ${c.np} Not present; ${c.nt} Could not check; ${c.blank} Not reviewed${c.na?"; "+c.na+" earlier N/A results":""}.</p><p>${c.work?"Conditions needing attention are listed below.":s.done<s.total?"The inspection is incomplete. No conclusion should be drawn about unreviewed items.":"No items are marked Needs work."}</p>${pending?"<p>Unreviewed and untested items are not confirmed to be in good condition.</p>":""}${reviewIssues.length?"<p>"+e(reviewIssues.slice(0,6).map(i=>i.text).join("; "))+(reviewIssues.length>6?"; additional items require review.":".")+"</p>":""}</div>`;
  const findings=[];
  activeSpaces(rec).forEach(sp=>sp.items.forEach((it,i)=>{if(["work","nt"].includes(it.s))findings.push({sp,it,key:sp.id+":"+i});}));
  findings.sort((a,b)=>Number(!!b.it.urgent)-Number(!!a.it.urgent));
  if(findings.length) content+=`<section class="r-section"><h2>Findings and inspection limits</h2>${findings.map((o,i)=>`<div class="r-finding"><b>${i+1}. ${e(o.sp.name)} / ${e(o.it.t)} - ${e(labels[o.it.s])}</b>${o.it.urgent?'<p class="r-urgent"><b>URGENT - office attention requested</b></p>':""}${o.it.category?'<p>'+e(({repair:"Repair needed",cleaning:"Cleaning needed",other:"Office review"})[o.it.category]||o.it.category)+'</p>':""}<p>${e(o.it.n||"No explanation recorded. Inspector review needed.")}</p>${refs(o.key)}</div>`).join("")}</section>`;
  if(m.misc) content+=`<section class="r-section"><h2>Overall inspector notes</h2><p class="r-text">${e(m.misc)}</p></section>`;
  if(m.officeInstructions) content+=`<section class="r-section"><h2>Visit instructions supplied by office</h2><p class="r-text">${e(m.officeInstructions)}</p></section>`;
  if(m.keys) content+=`<section class="r-section"><h2>${e(keysLabelForMode(rec.mode))}</h2><p class="r-text">${e(m.keys)}</p></section>`;
  content+=`<section class="r-section"><h2>Detailed checklist</h2><p class="r-muted">Results describe the recorded observations. Move-in comparisons appear where results differ. Unchecked items are not confirmed Good.</p>`;
  activeSpaces(rec).forEach(sp=>{
    content+=`<h3>${e(sp.name)}</h3><table><thead><tr><th class="r-item">Item</th><th class="r-result">Result</th><th>Notes / photo references</th></tr></thead><tbody>`;
    content+=sp.items.map((it,i)=>`<tr class="r-${e(it.s||"blank")}"><td>${e(it.t)}${it.base&&it.base!==it.s?`<div class="r-muted">Move-in: ${e(labels[it.base]||it.base)}</div>`:""}</td><td>${e(labels[it.s]||labels[""])}</td><td>${e(it.n||"")}${rec.mode==="routine"&&!it.n?'<span class="r-write"></span>':""}${d.refs[sp.id+":"+i]?"<br>"+refs(sp.id+":"+i):""}</td></tr>`).join("");
    content+="</tbody></table>";
  });
  content+="</section>";
  if(["out","routine"].includes(rec.mode)&&d.pricing.rows.length){
    const routine=rec.mode==="routine",p=d.pricing;
    const kinds={wear:"Normal wear",dmg:"Tenant damage",maintenance:"Maintenance",tenant:"Tenant-caused"};
    content+=`<section class="r-section r-pricing"><h2>Office review - responsibility and estimates</h2><p class="r-muted">Condition findings do not automatically assign responsibility. Amounts are estimates recorded for office review.</p><table><thead><tr><th>Item / location</th><th>Classification</th><th>Recorded estimate</th></tr></thead><tbody>`;
    content+=p.rows.map(o=>`<tr><td>${e(o.sp.name)} / ${e(o.it.t)}</td><td>${e(kinds[o.kind]||"Pending review")}</td><td>${o.cents!==null?money(o.cents/100):o.raw?"Invalid estimate - review needed":"Not estimated"}</td></tr>`).join("");
    content+=`</tbody></table><div class="r-totals"><b>${routine?"Estimated work":"Estimated tenant damage"}: ${!p.priced?"Not estimated":money(p.total/100)+(p.pending.length?" - partial subtotal":"")}</b><p>${p.pending.length?p.pending.length+" item(s) need classification or an estimate.":"All listed classifications and applicable estimates have been entered."}</p></div></section>`;
  }
  if(rec.mode==="routine") content+='<section class="r-section"><h2>Additional maintenance pricing</h2><table><thead><tr><th>Item / location</th><th>Responsibility</th><th>Estimate</th></tr></thead><tbody>'+Array.from({length:3},()=>'<tr><td><span class="r-write"></span></td><td><span class="r-write"></span></td><td><span class="r-write"></span></td></tr>').join('')+'</tbody></table></section>';
  if(rec.mode!=="ready"){
    content+=`<section class="r-section"><h2>Review and signatures</h2><p class="r-muted">Signatures acknowledge review of the recorded condition in this report version. Unreviewed items and inspection limits remain as listed.</p><div class="r-signatures">`;
    for(const [key,label,name] of [["t","Tenant",m.tenantSigName||m.tenant],["i","Inspector",m.inspSigName||m.inspector]]){
      const valid=validSignature(rec,key,map),reason=key==="t"?({absent:"Tenant absent",declined:"Tenant declined to sign",remote:"Tenant review pending",unavailable:"Tenant signature not available"})[m.tenantSignStatus]:"";
      content+=`<div class="r-signature"><b>${label}</b><p>${e(name||"Name not recorded")}</p>${valid?`<img src="${e(rec.sig[key])}" alt="${label} signature"><span class="r-muted">Signed ${e(new Date(rec.signatureMeta[key].signedAt).toLocaleString("en-US"))} - version ${e(d.hash)}</span>`:`<p class="r-muted">${e(reason||(rec.sig&&rec.sig[key]?"Earlier signature requires renewed review":"Not signed"))}</p>`}</div>`;
    }
    content+="</div></section>";
  }
  if(typeof OfflineOffice!=="undefined")content+=OfflineOffice.extraReport(rec,map,"work");
  content+=`<footer class="r-record">CIMCO Property Management | ${e(title(rec))} | Report ${e(d.id)} | Inspection version ${e(d.hash)}</footer>`;
  if(d.pics.length){
    const size=m.photoSize==="lg"?"large":m.photoSize==="sm"?"small":"medium";
    content+=`<section class="r-section r-photo-log r-${size}"><h2>Photo evidence - ${d.pics.length} photo${d.pics.length===1?'':'s'}</h2><div class="r-photos">`;
    content+=d.pics.map(o=>`<figure><img src="${e(o.p.data)}" alt="Photo ${o.n}: ${e(o.sp.name+" / "+o.it.t)}" loading="eager"><figcaption><b>Photo ${o.n} - ${e(o.sp.name)} / ${e(o.it.t)}</b><br>${e(o.p.caption||o.it.n||labels[o.it.s]||"Condition photo")}<br><span class="r-muted">${o.p.ts?"Added to inspection "+e(new Date(o.p.ts).toLocaleDateString("en-US")):"Capture date not recorded"}</span></figcaption></figure>`).join("");
    content+="</div></section>";
  }
  if(typeof OfflineOffice!=="undefined")content+=OfflineOffice.extraReport(rec,map,"evidence");
  return content+'</article>';
}
function html(rec,map){return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+e(modeTitle(rec)+" inspection - "+title(rec))+'</title><style>'+CSS+footerCSS(rec)+'</style></head><body>'+body(rec,map)+'</body></html>';}
function prepare(){
  if(!cur) return;
  let host=document.getElementById("professionalReport");
  if(!host){host=document.createElement("div");host.id="professionalReport";host.style.display="none";document.body.appendChild(host);}
  const markup='<style>'+CSS+footerCSS(cur)+'</style>'+body(cur);
  if(host.innerHTML!==markup) host.innerHTML=markup;
  document.body.classList.add("report-printing");
}
async function images(timeout=15000){
  return (await Promise.all([...document.querySelectorAll("#professionalReport img")].map(img=>waitForPrintImage(img,timeout)))).every(Boolean);
}
function text(rec){
  const d=model(rec),m=rec.meta||{},lines=[modeTitle(rec)+" INSPECTION - "+ORG,title(rec),"Date: "+fmtDate(m.date),"Inspector: "+(m.inspector||"Not recorded"),"Report: "+d.id+" / "+d.hash,d.s.done+" of "+d.s.total+" items recorded",""];
  activeSpaces(rec).forEach(sp=>{lines.push(sp.name.toUpperCase());sp.items.forEach((it,i)=>lines.push("  "+it.t+": "+(labels[it.s]||labels[""])+(it.urgent?" [URGENT]":"")+(it.category?" ["+it.category+"]":"")+(it.n?" - "+it.n:"")+(d.refs[sp.id+":"+i]?" [Photos "+d.refs[sp.id+":"+i].join(", ")+"]":"")));lines.push("");});
  if(m.keys) lines.push(keysLabelForMode(rec.mode)+": "+m.keys);
  if(m.misc) lines.push("Overall notes: "+m.misc);
  if(m.officeInstructions) lines.push("Visit instructions supplied by office: "+m.officeInstructions);
  if(["out","routine"].includes(rec.mode)&&d.pricing.rows.length){
    lines.push("OFFICE REVIEW - ESTIMATES");
    const kinds={wear:"Normal wear",dmg:"Tenant damage",maintenance:"Maintenance",tenant:"Tenant-caused"};
    d.pricing.rows.forEach(r=>lines.push(r.sp.name+" / "+r.it.t+" - "+(kinds[r.kind]||"Pending review")+": "+(r.cents===null?"Not estimated":money(r.cents/100))));
    lines.push((rec.mode==="routine"?"Estimated work":"Estimated tenant damage")+": "+(!d.pricing.priced?"Not estimated":money(d.pricing.total/100)+(d.pricing.pending.length?" - partial subtotal":"")));
  }
  if(typeof OfficeModel!=="undefined"){const tasks=OfficeModel.tasks(rec,0);if(tasks.length){lines.push("MAINTENANCE FOLLOW-UP - separate from signed inspection observations");for(const task of tasks)lines.push(task.room+" / "+task.item+": "+(task.urgent?"URGENT - ":"")+task.state+"; assigned to "+(task.assignee||"Unassigned")+(task.note?"; "+task.note:""));}}
  if(typeof OfflineOffice!=="undefined"){const comparisons=OfflineOffice.comparisonRows(rec);if(comparisons.length){lines.push("MOVE-IN / CURRENT PHOTO COMPARISONS");for(const row of comparisons)lines.push(row.room+" / "+row.item+": move-in "+fmtDate(row.beforeDate)+" ("+row.before.length+" photos), current "+fmtDate(row.afterDate)+" ("+row.after.length+" photos)");}}
  return lines.join("\n");
}
return {html,body,model,log,photoMap,pricing,amount,fingerprint,readiness,signOffIssues,signOffVersion,prepare,images,text,recordSignature,invalidateSignatures,validSignature,clearSignature:(rec,key)=>archiveSignature(rec,key,'Signature cleared for renewed review')};
})();
