/* Protection workspace: reads existing sources; never schedules a treatment automatically. */
(function () {
  'use strict';
  const bridge = window.OpgFis?.integration;
  const view = document.querySelector('[data-view="zastita"]');
  if (!bridge || !view) return;
  if(!document.querySelector('link[href="./protection.css"]')){const css=document.createElement('link');css.rel='stylesheet';css.href='./protection.css';document.head.append(css);}
  view.classList.add('protection-workspace');
  const nav = document.getElementById('zastita-subnav');
  const state = { cache: {}, weather: null, risk: null, sync: null, parcels: [], treatments: [], connected: false, cacheError: null };
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  const by = id => document.getElementById(id);
  const dt = value => { const n = typeof value === 'number' ? value : Date.parse(value || ''); return Number.isFinite(n) ? new Date(n).toLocaleString('hr-HR') : 'nije dostupno'; };
  const fresh = (value, minutes) => { const n = typeof value === 'number' ? value : Date.parse(value || ''); return Number.isFinite(n) && Date.now() >= n && Date.now() - n < minutes * 60000; };
  function go(sub) { nav.querySelector('[data-sub="' + sub + '"]')?.click(); }
  function button(text, fn, primary = false) { const b = el('button', text, primary ? 'protect-button protect-primary' : 'protect-button'); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function panel(id, title) { const section = el('section', null, 'protect-card'); section.id = id; if (title) section.append(el('h3', title)); return section; }
  function line(parent, label, value) { const r = el('div', null, 'protect-line'); r.append(el('span', label), el('strong', value)); parent.append(r); }
  function text(parent, value, cls = 'protect-muted') { parent.append(el('p', value, cls)); }
  function makeTab(sub, label) { const b = el('button', label, 'opg-chip'); b.type = 'button'; b.dataset.sub = sub; return b; }
  const overview = el('div', null, 'opg-subview'); overview.id = 'sub-zastita-pregled';
  const advice = el('div', null, 'opg-subview'); advice.id = 'sub-zastita-prijedlozi';
  nav.prepend(makeTab('zastita-pregled', 'Pregled'), makeTab('zastita-prijedlozi', 'Prijedlozi'));
  nav.querySelector('[data-sub="fis"]').textContent = 'Zalihe / FIS';
  const tools=el('details',null,'protect-tools');tools.append(el('summary','Alati i postavke'));
  ['iskaznica','vrijeme','kalkulator','zalihe'].forEach(sub=>tools.append(nav.querySelector('[data-sub="'+sub+'"]')));
  nav.append(nav.querySelector('[data-sub="fis"]'),nav.querySelector('[data-sub="tretiranja"]'),tools);
  view.insertBefore(overview, nav.nextSibling); view.insertBefore(advice, overview.nextSibling);
  const header = el('header', null, 'protect-header'); header.append(el('span', 'OPG Ojdanić · zaštita nasada', 'protect-eyebrow'), el('h2', 'Zdrav nasad, jasna evidencija.'));
  text(header, 'Pregledaj stanje, provjeri sredstva i zabilježi što je provedeno.'); view.prepend(header);
  const sync = el('div', null, 'protect-sync'); sync.setAttribute('aria-live', 'polite'); header.append(sync);
  const cropLabel = el('label', 'Kultura za pregled', 'protect-field');
  const crop = el('select'); crop.id = 'protect-crop'; cropLabel.htmlFor = crop.id;
  [['PAPRIKA BABURA','Paprika babura'],['TIKVICA','Tikvica'],['BUTTERNUT TIKVA','Butternut tikva']].forEach(([v,t])=>crop.add(new Option(t,v)));
  header.append(cropLabel, crop);
  const photo = panel('protect-photo', 'Fotografije i opažanje');
  text(photo, 'Dodaj cijelu biljku, detalj problema i donju stranu lista.');
  const upload = el('input'); upload.type = 'file'; upload.accept = 'image/jpeg,image/png,image/webp'; upload.multiple = true; upload.id = 'protect-images'; upload.hidden = true;
  photo.append(button('Dodaj fotografije problema',()=>upload.click(),true), upload);
  const thumbs = el('div', null, 'protect-thumbnails'); photo.append(thumbs);
  const noteLabel = el('label', 'Što primjećuješ?', 'protect-field'); noteLabel.htmlFor = 'protect-note';
  const note = el('textarea'); note.id = 'protect-note'; note.rows = 2; note.maxLength = 1200; note.placeholder = 'Npr. sitni kukci ispod lista, uvijanje mladih vrhova…';
  const localStatus = el('p', '', 'protect-muted'); localStatus.setAttribute('aria-live','polite');
  let photos = [], pestAi = null,photoEpoch=0;
  const observationKey=()=>window.OpgAuth?(window.OpgAuth.session?'opg_observations_v1:'+window.OpgAuth.session.uid:localStorage.getItem('opg_fb_config')?'opg_observations_v1:locked':'opg_observations_v1'):'opg_observations_v1';
  const save = button('Spremi opažanje na ovaj uređaj',()=>{
    if (!note.value.trim()) { localStatus.textContent='Opiši što primjećuješ prije spremanja.'; return; }
    try {
      const all = JSON.parse(localStorage.getItem(observationKey()) || '[]');
      const aiAnalysis=pestAi?.current()||null;
      all.push({ culture: crop.value, note: note.value.trim(), photos, aiAnalysis, createdAt: new Date().toISOString(), status: 'opažanje — bez potvrđene dijagnoze' });
      localStorage.setItem(observationKey(), JSON.stringify(all));
      localStatus.textContent=aiAnalysis?'Opažanje, fotografije i AI rezultat spremljeni su na ovom uređaju. Dijagnoza nije potvrđena.':'Opažanje i fotografije spremljeni su samo na ovom uređaju. Nije provedena AI analiza.';
      note.value=''; photos=[]; thumbs.replaceChildren(); upload.value=''; pestAi?.reset(); renderObservations();
    } catch (_) { localStatus.textContent='Nema dovoljno prostora. Opažanje nije spremljeno; sačuvaj fotografije u galeriji.'; }
  });
  photo.append(noteLabel,note,save,localStatus);
  text(photo,'AI analiza pomaže izdvojiti moguće uzroke. Potrebno ju je uključiti u Firebaseu. Postojeći čitač FIS preporuke dostupan je u Kalkulatoru.','protect-disclaimer');
  upload.addEventListener('change',async()=>{
    const epoch=photoEpoch;
    photos=[]; thumbs.replaceChildren(); localStatus.textContent='Pripremam do tri fotografije…'; save.disabled=true;
    try {
      for (const file of Array.from(upload.files).slice(0,3)) {
        if (file.size > 15 * 1024 * 1024 || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Odaberi JPG, PNG ili WebP fotografiju manju od 15 MB.');
        const bitmap=await createImageBitmap(file);if(epoch!==photoEpoch){bitmap.close();return;} const scale=Math.min(1,700/Math.max(bitmap.width,bitmap.height));
        const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
        const src=canvas.toDataURL('image/jpeg',0.65); if(src.length>220000) throw new Error('Fotografija je prevelika nakon pripreme; odaberi manji izrez.');
        photos.push(src);const img=el('img');img.src=src;img.alt='Fotografija opaženog problema';thumbs.append(img);
      } localStatus.textContent=photos.length+' fotografija spremno za opažanje.';
    } catch(e) { photos=[];thumbs.replaceChildren();localStatus.textContent=e.message; }
    finally{save.disabled=false;}
  });
  const meteo=panel('protect-meteo','Meteo stanica'), risk=panel('protect-risk','Zahtijeva pažnju'), phi=panel('protect-phi','Tretiranja i karenca'), observations=panel('protect-observations','Moja opažanja');
  overview.append(photo,risk,meteo,phi,observations);
  const candidates=panel('protect-candidates','Primjene sredstava iz zalihe');
  text(candidates,'Pretraga obuhvaća samo povezane proizvode iz zalihe, a ne cijeli FIS registar. Ne odobrava primjenu i ne određuje potrebu za tretiranjem.');
  const officialSearch=el('a','Pretraži cijeli službeni FIS registar ↗');officialSearch.href='https://fis.mps.hr/fis/javna-trazilica-szb/';officialSearch.target='_blank';officialSearch.rel='noopener noreferrer';candidates.append(officialSearch);
  const problemLabel=el('label','Štetnik ili bolest iz potvrđenog opažanja','protect-field');problemLabel.htmlFor='protect-problem';
  const problem=el('input');problem.id='protect-problem';problem.placeholder='Npr. trips';problem.type='search';
  text(candidates,'Podudaranje naziva služi za pronalaženje zapisa. Paprika babura pretražuje i općeniti naziv paprika; uvjete uzgoja i točnu kulturu provjeri u izvornom zapisu. Neprepoznati sinonimi ne daju automatsko podudaranje.');
  const candidateList=el('div');candidates.append(problemLabel,problem,candidateList);advice.append(candidates);
  function renderObservations(){
    observations.replaceChildren(el('h3','Moja opažanja'));
    let all=[];try{all=JSON.parse(localStorage.getItem(observationKey())||'[]');}catch(_){}
    const filtered=all.filter(o=>o.culture===crop.value).slice(-5).reverse();
    if(!filtered.length)text(observations,'Nema opažanja za ovu kulturu na ovom uređaju.');
    filtered.forEach(o=>{const d=el('details');d.append(el('summary',dt(o.createdAt)),el('p',o.note));const imgs=el('div',null,'protect-thumbnails');(o.photos||[]).forEach(src=>{if(!/^data:image\/jpeg;base64,/.test(src))return;const i=el('img');i.src=src;i.alt='Fotografija uz opažanje';imgs.append(i);});d.append(imgs);if(o.aiAnalysis){text(d,'Spremljen AI rezultat — nije potvrđena dijagnoza.');text(d,o.aiAnalysis.summary);}observations.append(d);});
  }
  function renderCandidates(){
    candidateList.replaceChildren(); let found=0;
    let unavailable=0;
    if (!bridge.getStock().length) text(candidateList,'Nema podataka o zalihama. Ova pretraga obuhvaća samo povezane proizvode iz zalihe.');
    bridge.getStock().forEach(stock=>{
      const r=bridge.getRecord?.(stock.fis_product_id)||state.cache[String(stock.fis_product_id)];if(!window.OpgFis.verified(r)||!window.OpgFis.linkVerified(stock,r)){unavailable++;return;}
      const uses=r.product.uses.filter(u=>window.OpgFis.cultureMatches(u.culture,crop.value));
      const matching=uses.map(u=>({...u,organisms:u.organisms.filter(o=>window.OpgFis.organismMatches(o,problem.value))})).filter(u=>u.organisms.length);
      if(!matching.length)return;found++;
      const card=el('div',null,'protect-candidate');card.append(el('h4',stock.naziv));
      text(card,'Preostalo: '+stock.trenutna_kolicina+' '+(stock.jedinica||'')+' · FIS: '+r.product.status);
      text(card,'Provjereno: '+dt(r.checkedAt));
      const source=el('a','Izvor: službeni FIS zapis ↗');source.href='https://fis.mps.hr/fis/javna-trazilica-szb/pregled/'+encodeURIComponent(r.product.id);source.target='_blank';source.rel='noopener noreferrer';card.append(source);
      matching.forEach(u=>{const d=el('details');d.append(el('summary',u.culture+' · karenca: '+u.phi));u.organisms.forEach(o=>{d.append(el('h4',o.name));text(d,o.usage||'Primjena nije navedena u ovom polju.');if(o.additional)text(d,o.additional);text(d,'Najviše primjena: '+(o.max??'nije navedeno'));});card.append(d);});
      text(card,'Prije odluke provjeri otvoreni/zaštićeni uzgoj, izvornu uputu, prethodna tretiranja, otpornost i plan berbe. Nema automatskog odabira doze.','protect-disclaimer');
      card.append(button('Otvori FIS zapis',()=>{go('fis');bridge.showRecord(r);}));candidateList.append(card);
    });
    if(unavailable)text(candidateList,unavailable+' zaliha nema potvrđen identitet/formulaciju povezivanja ili aktualne registracijske podatke. Provjeri ih u Zalihe / FIS.');
    if(!found)text(candidateList,'Nema pronađenih zapisa za odabranu kulturu i unos. To ne dokazuje da primjena postoji ili ne postoji: provjeri povezanost zaliha, aktualnost podataka i izvornu FIS uputu.');
  }
  function render(){
    const s=state.sync;
    const outcomes={disabled:'dnevna provjera je isključena',no_stock:'nema zaliha za pregled',no_links:'zalihe nemaju FIS povezivanje',invalid_links:'zalihe imaju neispravne FIS ID-jeve',partial:'djelomična provjera',unavailable:'FIS dohvat nije uspio',failed:'zadatak nije dovršen',completed:'zadatak dovršen'};
    const count=n=>Number.isInteger(n)?n:'nije zabilježeno';
    sync.textContent=state.cacheError?'FIS · '+state.cacheError:s?'FIS · '+(outcomes[s.outcome]||'stariji zapis statusa')+' · pokušaj '+dt(s.lastAttemptAt||s.startedAt)+' · završetak '+dt(s.finishedAt)+' · pregledano zaliha '+count(s.scanned)+' · pokušano proizvoda '+count(s.attempted)+' · provjereno '+count(s.checked)+' · osvježeno '+count(s.updated)+' · promijenjeno '+count(s.changed)+' · neispravna povezivanja '+count(s.invalidLinks)+' · pogreške '+count(s.failed)+(s.error?' · '+s.error:''):'FIS · '+(state.connected?'nema rezultata dnevne provjere':'zajednički podaci još nisu povezani');
    risk.replaceChildren(el('h3','Zahtijeva pažnju'));
    const r=state.risk;
    if(!r||!fresh(r.checked_at,90))text(risk,'Nema aktualne procjene rizika. To ne znači da nema bolesti ili štetnika.');
    else {
      const items=(r.items||[]).filter(x=>(x.kulture||[]).includes(crop.value)&&x.razina>0);
      if(!items.length)text(risk,'Vremenski pokazatelji nisu izdvojili upozorenje. Nastavi pregledavati nasad.');
      items.forEach(x=>{const d=el('details',null,'protect-warning');d.append(el('summary',x.naziv+' · '+(x.prognoza?'prognozirani':'zabilježeni')+' povoljni uvjeti'));text(d,x.razlog||x.uvjeti);text(d,x.izvor||'Izvor nije naveden.');text(d,'Približna vremenska procjena; nije potvrda prisutnosti ili zaraze.');risk.append(d);});
    }
    meteo.replaceChildren(el('h3','Meteo stanica'));
    const w=state.weather;
    if(!w)text(meteo,'Očitanja Home Assistanta nisu dostupna.');
    else { const grid=el('div',null,'protect-metrics');[['Temperatura',w.temp,'°C'],['Vlaga zraka',w.hum,'%'],['Vjetar',w.wind,'m/s']].forEach(([l,v,u])=>{const c=el('div');c.append(el('span',l),el('strong',Number.isFinite(v)?v+' '+u:'—'));grid.append(c);});meteo.append(grid);text(meteo,'Očitano: '+dt(w.ts)+(fresh(w.ts,45)?'':' · zastarjelo'));text(meteo,w.leafWet==null?'Senzor vlažnosti lista nije dostupan.':'Vlažnost lista: '+(w.leafWet?'mokar':'suh'));text(meteo,'Pogodnost tretiranja provjerava se prema konkretnom sredstvu, kiši i prognozi. Sama temperatura i vjetar nisu dovoljni.','protect-disclaimer'); }
    meteo.append(button('Vrijeme, prognoza i postavke',()=>go('vrijeme')));
    phi.replaceChildren(el('h3','Tretiranja i karenca'));
    const season=by('season-select')?.value;
    const treatments=state.treatments.filter(t=>!season||season==='sve'||String(t.datum||'').startsWith(season)).filter(t=>String(t.kultura||'').toLocaleLowerCase('hr').includes(crop.value==='PAPRIKA BABURA'?'paprik':crop.value==='TIKVICA'?'tikvic':'butternut'));
    if(!state.connected)text(phi,'Za pregled evidencije poveži zajedničku bazu.');
    else if(!treatments.length)text(phi,'Nema evidentiranih tretiranja za odabranu kulturu. To nije potvrda da je berba dopuštena.');
    else text(phi,treatments.length+' evidentiranih tretiranja. Evidencija još nije vezana uz pojedinu parcelu; provjeri sve zapise prije berbe.');
    phi.append(button('Otvori dnevnik tretiranja',()=>go('tretiranja')),button('Novi unos tretiranja',()=>{go('tretiranja');const c=by('tretiranja-add-card');if(c.style.display==='none')by('tretiranja-add-toggle').click();}));
    renderCandidates();renderObservations();
  }
  crop.addEventListener('change',render);problem.addEventListener('input',renderCandidates);
  by('season-select')?.addEventListener('change',render);
  window.addEventListener('opg:fis-stock',render);
  const oldNotice=by('sub-fis').querySelector('.opg-hint');if(oldNotice)oldNotice.textContent='Poveži točan FIS proizvod. Zajednički dnevni dohvat odvojen je od ručne provjere na ovom uređaju.';
  go('zastita-pregled');render();
  // Reuse the app's Firebase instance and authentication. Never sign in a second user.
  let connectionStarted=false,connectionEpoch=0,stops=[];
  window.addEventListener('opg:auth-session',event=>{
    connectionEpoch++;stops.splice(0).forEach(stop=>stop());connectionStarted=false;
    state.cache={};state.weather=null;state.risk=null;state.sync=null;state.treatments=[];state.connected=false;state.cacheError=null;
    if(event.detail?.resetPrivate!==false){photoEpoch++;photos=[];thumbs.replaceChildren();note.value='';upload.value='';localStatus.textContent='';pestAi?.reset();}bridge.setShared({});render();connect();
  });
  async function connect(){
    if(connectionStarted)return;
    if(window.OpgAuth&&!window.OpgAuth.session?.permissions.includes('protection_read'))return;
    const generation=connectionEpoch;
    if(!localStorage.getItem('opg_fb_config'))return;
    connectionStarted=true;
    try{
      const [apps,fs,auth]=await Promise.all([import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js')]);
      let attempts=0;
      async function attach(){
        if(generation!==connectionEpoch)return;
        const app=apps.getApps()[0];
        if(!app||!auth.getAuth(app).currentUser){if(attempts++<30)setTimeout(attach,2000);return;}
        const db=fs.getFirestore(app);state.connected=true;
        const uid=auth.getAuth(app).currentUser.uid;
        const listen=(ref,next,error)=>stops.push(fs.onSnapshot(ref,snap=>{if(generation===connectionEpoch&&auth.getAuth(app).currentUser?.uid===uid&&(!window.OpgAuth||window.OpgAuth.session?.uid===uid)&&!snap.metadata?.fromCache&&!snap.metadata?.hasPendingWrites)next(snap);},()=>{if(generation===connectionEpoch)error?.();}));
        listen(fs.collection(db,'fis_cache'),snap=>{
          state.cache={};snap.docs.forEach(d=>{
            const v=d.data();
            try {
              const record={...v,product:v.rawJson?window.OpgFis.normalize(JSON.parse(v.rawJson),d.id):null,previous:null,origin:'Zajednički dnevni dohvat'};
              // A damaged historical version must not invalidate a separately checked current payload.
              if(v.previousRawJson)try{record.previous=window.OpgFis.normalize(JSON.parse(v.previousRawJson),d.id);}catch(_){record.historyError='Prethodna verzija podataka nije čitljiva.';}
              state.cache[d.id]=record;
            }catch(_){state.cache[d.id]={...v,product:null,error:'Nepotpuni FIS podaci — potrebna provjera.'};}
          });
          state.cacheError=null;bridge.setShared(state.cache);render();
        },()=>{state.cacheError='zajednički dohvat nije dostupan';Object.values(state.cache).forEach(r=>r.error=state.cacheError);bridge.setShared(state.cache);render();});
        [['settings/weather_live','weather'],['settings/rizik','risk'],['fis_sync_status/daily','sync']].forEach(([path,key])=>listen(fs.doc(db,path),snap=>{state[key]=snap.exists()?snap.data():null;render();},()=>{state[key]=null;render();}));
        if(!window.OpgAuth||window.OpgAuth.session.permissions.includes('treatments_read'))listen(fs.collection(db,'prskanje'),snap=>{state.treatments=snap.docs.map(d=>d.data());render();},()=>{state.connected=false;render();});
      }await attach();
    }catch(_){state.cacheError='povezivanje nije uspjelo';render();}
  }
  if(by('sync-label'))new MutationObserver(()=>connect()).observe(by('sync-label'),{childList:true,subtree:true});
  const aiScript=document.createElement('script');aiScript.src='./pest-ai.js';
  aiScript.onload=()=>{pestAi=window.OpgPestAi.mount({photo,crop,note,upload,save,getPhotos:()=>photos,isPreparing:()=>save.disabled});};
  aiScript.onerror=()=>{text(photo,'AI sučelje se nije učitalo. Opažanja i fotografije i dalje možeš spremati na uređaj.');};document.head.append(aiScript);
  connect();setInterval(()=>{if(!document.hidden)render();},60000);
})();
