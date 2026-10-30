async function runGuideChecks(field,office,practice){
  const G=field.__CIMCO_GUIDE__,OG=office.__CIMCO_GUIDE__,F=field.__CIMCO_OFFICE__,O=office.__CIMCO_OFFICE__,flow=field.__CIMCO_FLOW__,oflow=office.__CIMCO_FLOW__,doc=field.document,checks=[];
  const tick=()=>new Promise(resolve=>setTimeout(resolve,40));
  const check=(name,value)=>{if(!value)throw new Error(name);checks.push({name,passed:true});};
  const click=async selector=>{const el=doc.querySelector(selector);if(!el)throw new Error('Missing guide control '+selector);el.click();await tick();};
  try{
    G.cleanup();OG.cleanup();await F.cleanup();await O.cleanup();flow.cleanup();oflow.cleanup();
    const layout=await oflow.create('out',{address:'SAMPLE FLEXIBLE HOUSE',unit:'B'});layout.spaces=[{id:'studio',type:'other',name:'Rear studio',items:[{t:'Floor',s:'work',n:'DO NOT COPY FINDING'},{t:'Lights',s:'ok',n:''},{t:'Window',s:'',n:''}]},{id:'half',type:'halfbath',name:'Downstairs powder room',items:[{t:'Toilet',s:'',n:''}]}];O.saveLayout(layout);
    const visit=OG.createVisit({address:'SAMPLE FLEXIBLE HOUSE',unit:'B',date:'2026-10-29',mode:'out',inspector:'Assigned Inspector',instructions:'Check the rear studio.'});
    check('Office-prepared visit files use saved layouts without copying findings',visit.layout.rooms.length===2&&!JSON.stringify(visit).includes('DO NOT COPY FINDING'));
    const file=OG.visitFile([visit]);G.importVisits(file);G.importVisits(file);
    check('Opening the same visit file twice produces one start card',doc.querySelectorAll('[data-start-visit]').length===1);
    const profile=doc.getElementById('rememberInspector');profile.value='Remembered Inspector';profile.dispatchEvent(new field.Event('change',{bubbles:true}));
    const rec=await G.startVisit(visit.id);
    check('One tap starts the assigned address, date, inspector and custom areas',rec.meta.inspector==='Assigned Inspector'&&rec.meta.date==='2026-10-29'&&rec.spaces[0].name==='Rear studio'&&rec.spaces[1].name==='Downstairs powder room');
    check('Prepared visits start with blank results, notes and signatures',rec.spaces.every(sp=>sp.items.every(it=>!it.s&&!it.n))&&!rec.sig.i&&!rec.sig.t);
    const again=await G.startVisit(visit.id);check('Starting a visit again resumes it instead of duplicating it',again===rec&&F.activeRecords().length===1);
    const conflict=G.importVisits({...file,visits:[{...visit,revision:2,updatedAt:visit.updatedAt+1,meta:{...visit.meta,inspector:'Changed Inspector'}}]});check('An updated office plan never rewrites an inspection already started',conflict.conflicts.length===1&&rec.meta.inspector==='Assigned Inspector');
    const sp=rec.spaces[0],key=sp.id+':0';flow.setPanel('room',sp.id);await click('.field-active [data-only-unchecked]');await click('[data-k="'+key+'"][data-v="work"]');
    check('Unchecked filtering keeps findings visible until their explanation is recorded',!doc.querySelector('[data-key="'+key+'"]').classList.contains('guide-filtered')&&sp.items[0].s==='work');
    await click('[data-k="'+sp.id+':1"][data-v="ok"]');check('Unchecked filtering hides checked items without changing rooms',doc.querySelector('[data-key="'+sp.id+':1"]').classList.contains('guide-filtered')&&doc.body.dataset.fieldPanel==='room');
    await click('.field-active [data-only-unchecked]');sp.items[0].n='Existing location detail';flow.flush();
    const suggestion=doc.querySelector('[data-suggest-key="'+key+'"]');suggestion.click();await tick();
    check('Suggested observations require a tap and append without replacing existing notes',sp.items[0].n.includes('Existing location detail')&&sp.items[0].n.includes('Loose or raised flooring'));
    await click('[data-undo]');check('Undo can reverse an added suggested note',rec.spaces[0].items[0].n==='Existing location detail');
    check('A missing problem photo produces a helpful optional reminder',!doc.querySelector('[data-key="'+key+'"] .photo-nudge').hidden);
    check('Room marking is visible outside the room options menu',doc.querySelector('.field-active .room-done [data-allok]')!==null);
    await click('.field-active [data-allok]');doc.getElementById('appDialogForm').requestSubmit();await tick();
    check('Confirmed room marking fills only unchecked items and preserves findings',rec.spaces[0].items[0].s==='work'&&rec.spaces[0].items[1].s==='ok'&&rec.spaces[0].items[2].s==='ok');
    flow.setPanel('review');await click('[data-next-sign]');check('Finish flow presents signatures as its second step',!doc.querySelector('[data-step-content="1"]').hidden&&doc.querySelector('[data-step-content="0"]').hidden);
    await click('[data-continue-output]');check('The main finish flow reaches PDF and print without preparing an office file',!doc.querySelector('[data-step-content="2"]').hidden&&!field.OfflineOffice.currentPrepared()&&!(rec.handoffs||[]).length);
    check('Office transfer is collapsed and clearly optional',!doc.getElementById('optionalOfficeTransfer').open&&doc.getElementById('optionalOfficeTransfer').querySelector('summary').textContent==='Send to office (optional)'&&doc.getElementById('officeConfidence').textContent==='Office sharing is optional.');
    await click('[data-step-content="2"] [data-preview-report]');check('PDF preview opens without an office copy or receipt',doc.getElementById('reportPreview').open&&!(rec.handoffs||[]).length);
    const originalPrint=field.print;let printTimeout;try{const printed=new Promise(resolve=>{field.print=()=>resolve(true);});await click('[data-print-preview]');await Promise.race([printed,new Promise((_,reject)=>{printTimeout=setTimeout(()=>reject(new Error('Print action did not reach the browser print service')),6000);})]);check('The primary output action reaches printing without creating an office handoff',doc.getElementById('professionalReport').textContent.includes('SAMPLE FLEXIBLE HOUSE')&&!(rec.handoffs||[]).length);}finally{clearTimeout(printTimeout);field.print=originalPrint;field.dispatchEvent(new field.Event('afterprint'));}
    await click('#optionalOfficeTransfer>summary');await click('[data-rebuild-report]');check('An optional office copy still warns about missing checks and signatures',doc.getElementById('appDialogTitle').textContent==='Prepare a draft report?'&&!doc.getElementById('appDialog').hidden);await click('[data-dialog-cancel]');
    rec.spaces.forEach(s=>s.items.forEach(it=>{if(!it.s)it.s='ok';}));rec.meta.tenantSignStatus='absent';
    const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    await F.putPhoto({id:'guide-photo',insp:rec.id,key,data:png,caption:'Practice condition',ts:Date.now()});const unsigned=await F.preparePacket(rec);await O.receivePacket(unsigned.packet);
    rec.sig.i='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="30"><path d="M10 15 L80 20" stroke="black"/></svg>');field.InspectionReport.recordSignature(rec,'i');flow.flush();
    check('Signing after preparation invalidates the earlier unsigned office file',!field.OfflineOffice.currentPrepared());
    check('A complete visit recognizes a valid inspector signature and tenant absence',G.finishWarnings().length===0);
    await G.prepareFinish();const prepared=field.OfflineOffice.currentPrepared();
    check('A new signature creates a new transferable file instead of reusing an unsigned draft',prepared.id!==unsigned.id&&!!prepared.packet.payload.inspection.sig.i);
    check('Finish prepares a transferable report and shows plain-language send controls',prepared?.blob.size>0&&!doc.getElementById('finishTransfer').hidden&&doc.querySelector('[data-guide-share]').textContent==='Send to office');
    check('Visit identity and office instructions survive report transfer',prepared.packet.payload.inspection.visitId===visit.id&&flow.report(rec).includes('Visit instructions supplied by office'));
    const signedImport=await O.receivePacket(prepared.packet);check('The office receives later signatures for unchanged inspection conditions',office.InspectionReport.validSignature(signedImport.record,'i',await O.getPhotos(signedImport.record.id)));
    const receipt=await O.issueReceipt(prepared.id,'Practice Office');F.importReceipt(receipt);G.onPanel('review');
    check('The confidence display confirms only the matching returned office receipt',doc.getElementById('officeConfidence').textContent.includes('Office confirmed: Practice Office'));
    await tick();field.InspectionReport.clearSignature(rec,'i');field.save();flow.flush();const cleared=await F.preparePacket(rec);const clearedImport=await O.receivePacket(cleared.packet);
    check('Withdrawing a signature reaches the office and preserves the earlier signature as history',!clearedImport.record.sig.i&&clearedImport.record.signatureHistory.some(h=>h.party==='i'&&h.data));
    rec.spaces[0].items[0].n+=' Changed detail';field.save();flow.flush();G.renderFinish();
    check('Editing a prepared report hides the old send controls and requests preparation again',!field.OfflineOffice.currentPrepared()&&doc.getElementById('finishTransfer').hidden&&!doc.getElementById('finishRebuild').hidden);
    check('New changes make earlier office confirmation visibly out of date',doc.getElementById('officeConfidence').textContent.includes('new changes'));
    const backup=await F.buildBackup();check('Complete backups include assigned visits and the remembered inspector',backup.value.guide.visits.length===1&&backup.value.guide.inspector==='Remembered Inspector');
    await O.cleanup();oflow.cleanup();OG.cleanup();await O.restoreBackup(backup.value);
    check('Backup recovery preserves prepared visits, profile, and started-visit identity',OG.exportState().visits.length===1&&OG.exportState().inspector==='Remembered Inspector'&&O.activeRecords()[0].visitId===visit.id);
    const manual=await flow.create('routine',{address:'ANOTHER SAMPLE HOUSE',unit:''});check('The remembered inspector fills a new manual inspection',manual.meta.inspector==='Remembered Inspector');
    const originalSet=field.Storage.prototype.setItem;try{field.Storage.prototype.setItem=function(){throw new field.DOMException('Test storage full','QuotaExceededError');};field.flushSave();check('Storage failures are shown instead of claiming the latest changes saved',doc.getElementById('saveConfidence').textContent==='Could not save on this device');const rescue=await F.buildBackup();check('A complete backup can rescue current in-memory work when browser storage is full',rescue.value.includesUnsavedChanges&&rescue.value.records.some(r=>r.id===manual.id));}finally{field.Storage.prototype.setItem=originalSet;field.flushSave();}
    check('Practice has a visible banner and fictional records in separate storage',practice.document.getElementById('practiceBanner').textContent.includes('Practice mode')&&practice.__CIMCO_OFFICE__.activeRecords().some(r=>r.meta.address.includes('PRACTICE HOUSE'))&&!F.activeRecords().some(r=>r.meta.address.includes('PRACTICE HOUSE')));
    return checks;
  }finally{G.cleanup();OG.cleanup();await F.cleanup();await O.cleanup();flow.cleanup();oflow.cleanup();await tick();}
}
