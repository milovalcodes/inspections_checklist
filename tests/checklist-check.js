async function runChecklistChecks(win,office){
  const flow=win.__CIMCO_FLOW__,F=win.__CIMCO_OFFICE__,O=office.__CIMCO_OFFICE__,doc=win.document,checks=[];
  const tick=()=>new Promise(resolve=>setTimeout(resolve,40));
  const check=(name,value)=>{if(!value)throw new Error(name);checks.push({name,passed:true});};
  const click=async selector=>{const el=doc.querySelector(selector);if(!el)throw new Error('Missing checklist control '+selector);el.click();await tick();};
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  try{
    for(const mode of ['in','out','ready','routine']){
      const rec=await flow.create(mode,{address:'SAMPLE DEFAULT '+mode,unit:''});
      check(mode+': base template starts with two bedrooms and two full bathrooms',rec.spaces.filter(s=>s.type==='bedroom').length===2&&rec.spaces.filter(s=>s.type==='bathroom').length===2);
      check(mode+': HVAC, thermostat and air filter are independent areas', ['hvac','thermostat','filter'].every(type=>rec.spaces.filter(s=>s.type===type).length===1)&&!rec.spaces.some(s=>s.items.some(it=>/HVAC \/ thermostat \/ filter|A\/C cooling \/ thermostat|A\/C filter \/ condensate/.test(it.t))));
    }
    const rec=await flow.create('out',{address:'SAMPLE BATTERY CHECK',unit:''});rec.meta.inspector='Sample Inspector';
    const extraBed=rec.spaces.find(s=>s.name==='Bedroom 2'),extraBath=rec.spaces.find(s=>s.name==='Bathroom 2');
    for(const sp of [extraBed,extraBath]){
      flow.setPanel('room',sp.id);await click('[data-delsp="'+sp.id+'"]');doc.getElementById('appDialogForm').requestSubmit();await tick();
      check('Default '+sp.name+' can be removed through Room options',!rec.spaces.some(s=>s.id===sp.id)&&rec.removedRooms.some(r=>r.space.id===sp.id));
      F.restoreRoom(rec,sp.id);
    }
    check('Removed default rooms can be restored without losing their checklists',rec.spaces.some(s=>s.id===extraBed.id&&s.items.length===extraBed.items.length)&&rec.spaces.some(s=>s.id===extraBath.id));
    const primary=rec.spaces.find(s=>s.name==='Master Bedroom');await F.trashRoom(primary);check('Adding a bedroom after deleting the primary never duplicates Bedroom 2',win.nextSpaceName('bedroom')==='Bedroom 3');F.restoreRoom(rec,primary.id);
    const thermostat=rec.spaces.find(s=>s.type==='thermostat'),battery=thermostat.items.find(it=>/Batteries/.test(it.t)),index=thermostat.items.indexOf(battery),key=thermostat.id+':'+index;
    battery.s='ok';battery.n='Existing location detail';flow.setPanel('room',thermostat.id);
    await F.putPhoto({id:'battery-detail',insp:rec.id,key,data:png,caption:'Thermostat battery compartment',ts:Date.now()});
    rec.sig.i='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="30"><path d="M10 15 L80 20" stroke="black"/></svg>');win.InspectionReport.recordSignature(rec,'i');flow.flush();
    await click('[data-replace-key="'+key+'"][data-replace-kind="batteries"]');
    check('Battery shortcut records repair and appends the exact finding',battery.s==='work'&&battery.category==='repair'&&battery.n==='Existing location detail\nBatteries need replacement.');
    check('Battery replacement never assigns a cost, tenant responsibility or urgency',!rec.wk[key]&&!battery.urgent);
    check('Replacement preserves photographs and requires renewed sign-off',Object.values(await F.getPhotos(rec.id)).flat().some(p=>p.id==='battery-detail')&&!rec.sig.i&&rec.signatureHistory.some(h=>h.party==='i'));
    await click('[data-undo]');const restored=rec.spaces.find(s=>s.id===thermostat.id).items[index];check('Undo restores the earlier battery result and note',restored.s==='ok'&&restored.n==='Existing location detail');
    await click('[data-replace-key="'+key+'"][data-replace-kind="batteries"]');await click('[data-replace-key="'+key+'"][data-replace-kind="batteries"]');
    check('Repeated replacement taps keep one finding without toggling it off',rec.spaces.find(s=>s.id===thermostat.id).items[index].n.split('Batteries need replacement.').length===2);
    const systems=rec.spaces.find(s=>s.type==='systems'),alarms=systems.items.findIndex(it=>/Smoke/.test(it.t));check('Smoke and CO alarm checks also expose the battery shortcut',!!doc.querySelector('[data-replace-key="'+systems.id+':'+alarms+'"][data-replace-kind="batteries"]'));
    const filter=rec.spaces.find(s=>s.type==='filter'),filterKey=filter.id+':0';flow.setPanel('room',filter.id);await click('[data-replace-key="'+filterKey+'"][data-replace-kind="filter"]');
    check('Air-filter replacement stays separate from thermostat batteries',filter.items[0].s==='work'&&filter.items[0].n==='Air filter needs replacement.'&&rec.spaces.find(s=>s.id===thermostat.id).items[index].n.includes('Batteries need replacement.'));
    check('A non-battery electrical panel never shows a battery replacement shortcut',!win.VisitModel.replacementActions('Electrical panel').length);
    check('Pool filters are never mistaken for the HVAC air filter',!win.VisitModel.replacementActions('Pool equipment / water (pump, filter, timer run; water clear)').some(a=>a.kind==='filter'));
    check('Custom battery, remote and doorbell checks offer replacement', ['Remote / keypad','Doorbell','Electronic lock batteries'].every(t=>win.VisitModel.replacementActions(t).some(a=>a.kind==='batteries')));
    const report=flow.report(rec);check('Reports identify both replacement findings in their own sections',report.includes('Batteries need replacement.')&&report.includes('Air filter needs replacement.')&&report.includes('Thermostat')&&report.includes('Air filter'));
    const prepared=await F.preparePacket(rec),received=await O.receivePacket(prepared.packet);check('Offline office transfer preserves replacement notes and separate system areas',received.record.spaces.some(s=>s.type==='thermostat'&&s.items.some(it=>it.n.includes('Batteries need replacement.')))&&received.record.spaces.some(s=>s.type==='filter'&&s.items[0].n==='Air filter needs replacement.'));
    const legacy=await flow.create('in',{address:'SAMPLE SAVED LAYOUT',unit:''});legacy.spaces=[{id:'legacy-bedroom',type:'bedroom',name:'Custom bedroom',checklistVersion:2,items:[{t:'Floor',s:'ok',n:'Keep this note'}]},{id:'legacy-systems',type:'systems',name:'Existing systems',checklistVersion:2,items:[{t:'HVAC / thermostat / filter',s:'nt',n:'Power off'}]}];flow.flush();await flow.reopen(legacy);
    check('Reopening a saved layout does not add rooms, split old results, or change existing notes',legacy.spaces.length===2&&legacy.spaces[0].items[0].n==='Keep this note'&&legacy.spaces[1].items[0].t==='HVAC / thermostat / filter');
    return checks;
  }finally{await F.cleanup();await O.cleanup();flow.cleanup();office.__CIMCO_FLOW__.cleanup();}
}
