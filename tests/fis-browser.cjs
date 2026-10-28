const { chromium, webkit, devices } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
  const server = http.createServer((req,res)=>{const file=path.resolve(__dirname,'..','.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(path.resolve(__dirname,'..')+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
  await new Promise(resolve=>server.listen(8766,'127.0.0.1',resolve));
  server.unref();
  const engine=process.env.BROWSER_ENGINE==='webkit'?'webkit':'chromium';
  const browser = await (engine==='webkit'?webkit:chromium).launch({ headless: true, ...(engine==='webkit' && process.env.WEBKIT_PATH ? {executablePath:process.env.WEBKIT_PATH}:{}), ...(engine==='chromium' && process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']} : {}) });
  const page = await browser.newPage({ ...(engine==='webkit'?devices['iPhone 13']:{}), viewport: { width: 360, height: 800 }, serviceWorkers: 'block' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('opg_zalihe', JSON.stringify([{id:'test',naziv:'Test proizvod',trenutna_kolicina:1,pocetna_kolicina:1,jedinica:'L'}]));
    localStorage.setItem('opg_prodaja',JSON.stringify([{id:'preserved-sale',kupac:'RIBOLA',datum:'2026-10-01',proizvod:'<img src=x onerror=window.financialXss=true>',cijena_kg:2,kg:3,placeno:false,pak:null}]));
  });
  if(process.env.SAFE_AREA_TEST==='1')await page.route('http://127.0.0.1:8766/',route=>{
    const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').replace(/env\(safe-area-inset-top(?:,\s*0px)?\)/g,'47px').replace(/env\(safe-area-inset-bottom(?:,\s*0px)?\)/g,'34px');
    return route.fulfill({contentType:'text/html',body:html});
  });
  let fail = false, version = 1;
  await page.route('https://fis.mps.hr/**', route => {
    if (fail) return route.abort();
    const search = route.request().url().includes('/search?');
    return route.fulfill({ json: search ? {content:[{pppId:42,productName:'Test proizvod',productRegistrationNumber:'TEST'}],totalElements:1} : {
      basicInfo:{productName:'Test proizvod',registrationStatus:'REGISTRIRAN',registrationNumber:'TEST'},additionalData:{productFormulation:[{hr:'koncentrat za suspenziju'}]},
      culturesAndHarmfulOrganisms:[{culture:{name:{hr:'Paprika'},safetyPeriod:version === 1 ? '3 dana' : '7 dana'},harmfulOrganisms:[{name:{hr:'<img src=x onerror=alert(1)>'},maxNumberOfTreatmentsPerSeason:2}]}]
    }});
  });
  await page.goto('http://127.0.0.1:8766/');
  await page.locator('#setup-skip').click();
  await page.evaluate(()=>window.OpgSecurity.renderActivityItems(document.getElementById('activity-modal-list'),[{tekst:'<img src=x onerror="window.activityXss=true">',unio:'<script>malicious</script>',ts:1}]));
  assert.equal(await page.locator('#activity-modal-list img, #activity-modal-list script').count(),0,'stored activity text never executes as HTML');
  assert.ok((await page.locator('#activity-modal-list').textContent()).includes('<img'));
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('opg_prodaja')).length),1,'existing local finance records are preserved, not seeded or deleted');
  assert.equal(await page.locator('#prodaja-list-card img, #sum-by-kupac img, #proizvod-list img').count(),0,'financial text is not HTML');
  const csp=await page.evaluate(()=>new Promise(resolve=>{
    const violations=[];const listener=e=>violations.push(e.effectiveDirective);document.addEventListener('securitypolicyviolation',listener);
    const img=document.createElement('img');img.setAttribute('onerror','window.cspInjected=true');img.addEventListener('error',()=>setTimeout(()=>{img.remove();document.removeEventListener('securitypolicyviolation',listener);resolve({executed:!!window.cspInjected,violations});},50));img.src='data:image/png;base64,invalid';document.body.append(img);
  }));
  assert.equal(csp.executed,false);assert.ok(csp.violations.some(v=>v.startsWith('script-src')),'CSP blocks injected inline handlers');
  await page.locator('[data-tab="zastita"]').click();
  if(process.env.SAFE_AREA_TEST==='1'){
    await page.addStyleTag({content:'*{transition:none!important}'});
    const safe=await page.evaluate(()=>{
      const nav=document.querySelector('.opg-tabbar').getBoundingClientRect(),fab=document.querySelector('.opg-fab').getBoundingClientRect(),header=document.querySelector('.opg-head-row').getBoundingClientRect();
      const toast=document.querySelector('.opg-toast');toast.classList.add('show');const toastBottom=toast.getBoundingClientRect().bottom;toast.classList.remove('show');
      const indicator=document.getElementById('opg-pull-indicator');const hiddenOpacity=getComputedStyle(indicator).opacity;indicator.classList.add('visible');const indicatorTop=indicator.getBoundingClientRect().top;indicator.dispatchEvent(new Event('touchcancel',{bubbles:true}));
      return{toastBottom,navBottom:nav.bottom,fabBottom:fab.bottom,navTop:nav.top,headerTop:header.top,hiddenOpacity,indicatorTop,cancelled:!indicator.classList.contains('visible'),height:innerHeight};
    });
    assert.ok(safe.headerTop>=47,'header content clears notch');assert.ok(safe.navBottom<=safe.height-34,'navigation clears home indicator');assert.ok(safe.fabBottom<safe.navTop,'action clears navigation');assert.ok(safe.toastBottom<safe.navTop,'toast clears navigation and home indicator: '+JSON.stringify(safe));
    assert.equal(safe.hiddenOpacity,'0');assert.ok(safe.indicatorTop>=47,'refresh indicator clears status area');assert.ok(safe.cancelled,'cancelled Safari touch hides indicator');
  }
  await page.locator('[data-sub="fis"]').click();
  await page.getByRole('button',{name:'Pronađi u FIS-u',exact:true}).click();
  await page.getByRole('button',{name:'Test proizvod · TEST',exact:true}).click();
  await page.getByText('Provjeri etiketu prije povezivanja',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('opg_zalihe'))[0].fis_product_id),undefined,'product selection never writes stock');
  const confirmLink=page.getByRole('button',{name:'Potvrdi FIS povezivanje',exact:true});assert.equal(await confirmLink.isDisabled(),true);
  await page.getByText('Usporedio/la sam etiketu: naziv, registracijski broj i formulacija odgovaraju prikazanom FIS zapisu.',{exact:true}).click();
  await confirmLink.click();await page.getByText('Povezivanje spremljeno nakon usporedbe etikete.',{exact:true}).waitFor();

  await page.getByRole('button',{name:'Provjeri i otvori uvjete',exact:true}).click();
  await page.locator('#fis-host').getByText('Paprika · karenca: 3 dana', {exact:true}).waitFor();
  version=2;
  await page.getByRole('button',{name:'Provjeri i otvori uvjete',exact:true}).click();
  await page.locator('#fis-host').getByText('Paprika · karenca: 7 dana', {exact:true}).waitFor();
  await page.getByText('Prethodna verzija podataka — povijesno, nije za primjenu',{exact:true}).waitFor();
  const stock = await page.evaluate(()=>JSON.parse(localStorage.getItem('opg_zalihe'))[0]);
  assert.equal(stock.trenutna_kolicina,1); assert.equal(stock.fis_product_id,'42');
  fail=true;
  await page.getByRole('button',{name:'Provjeri i otvori uvjete',exact:true}).click();
  await page.getByText('Aktualnost nije potvrđena',{exact:true}).waitFor();
  assert.equal(await page.locator('#fis-host img').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
  assert.equal(await page.locator('#fis-host').getByText('Status u FIS-u: REGISTRIRAN',{exact:true}).count(),0,'failed data cannot claim current status');
  assert.equal(await page.locator('#fis-host summary').filter({hasText:'karenca:'}).count(),0,'failed detail hides conditions');
  await page.evaluate(()=>{
    const product={id:'42',name:'Test proizvod',status:'REGISTRIRAN',registration:'TEST',formulations:['koncentrat za suspenziju'],uses:[{culture:'Paprika',phi:'TEST',organisms:[]}]};
    window.OpgFis.integration.setShared({'42':{product,checkedAt:new Date().toISOString(),lastAttemptAt:new Date().toISOString()}});
    window.OpgFis.integration.showRecord(window.OpgFis.integration.getRecord('42'));
  });
  await page.locator('#fis-host').getByText('Status u FIS-u: REGISTRIRAN',{exact:true}).waitFor();
  await page.locator('#fis-host summary').filter({hasText:'karenca: TEST'}).click();
  await page.evaluate(()=>window.OpgFis.integration.render());
  assert.equal(await page.locator('#fis-host details[open]').count(),1,'unchanged checks preserve open conditions');
  await page.evaluate(()=>{const original=Date.now;Date.now=()=>original()+86400001;document.dispatchEvent(new Event('visibilitychange'));Date.now=original;});
  assert.equal(await page.locator('#fis-host').getByText('Status u FIS-u: REGISTRIRAN',{exact:true}).count(),0,'open detail ages safely');
  assert.equal(await page.locator('#fis-host summary').filter({hasText:'karenca:'}).count(),0,'aged detail hides conditions');
  await page.evaluate(()=>window.OpgFis.integration.setShared({'42':{product:{id:'99',name:'Wrong product',registration:'TEST',status:'REGISTRIRAN',formulations:['koncentrat za suspenziju'],uses:[]},checkedAt:new Date().toISOString(),lastAttemptAt:new Date().toISOString()}}));
  assert.equal(await page.evaluate(()=>window.OpgFis.verified(window.OpgFis.integration.getRecord('42'))),false,'cache identity must match linked stock');
  assert.equal(await page.locator('#fis-host').getByText('Status u FIS-u: REGISTRIRAN',{exact:true}).count(),0);


  assert.deepEqual(errors,[]);
  await page.screenshot({path:'/tmp/opg-fis-mobile.png',fullPage:true});
  await page.locator('[data-sub="zastita-pregled"]').click();
  const sampleImage=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=4;c.height=4;return c.toDataURL('image/png').split(',')[1];});
  await page.locator('#protect-images').setInputFiles({name:'test-leaf.png',mimeType:'image/png',buffer:Buffer.from(sampleImage,'base64')});
  await page.getByText('1 fotografija spremno za opažanje.',{exact:true}).waitFor();
  await page.locator('#protect-note').fill('Testno opažanje: provjeriti donju stranu lista.');
  await page.getByRole('button',{name:'Spremi opažanje na ovaj uređaj',exact:true}).click();
  await page.getByText('Opažanje i fotografije spremljeni su samo na ovom uređaju. Nije provedena AI analiza.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('opg_observations_v1'))[0].culture),'PAPRIKA BABURA');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('opg_observations_v1'))[0].photos.length),1);
  await page.locator('#protect-crop').selectOption('TIKVICA');
  await page.getByText('Nema opažanja za ovu kulturu na ovom uređaju.',{exact:true}).waitFor();
  await page.locator('#protect-crop').selectOption('PAPRIKA BABURA');
  await page.evaluate(()=>window.OpgFis.integration.setShared({'42':{product:{id:'42',name:'Test proizvod',status:'REGISTRIRAN',registration:'TEST',formulations:['koncentrat za suspenziju'],uses:[]},checkedAt:new Date().toISOString(),lastAttemptAt:new Date().toISOString(),origin:'Zajednički dnevni dohvat'}}));
  await page.locator('[data-sub="fis"]').click();
  await page.getByText('Zajednički dnevni dohvat',{exact:true}).waitFor();
  await page.locator('[data-sub="zastita-pregled"]').click();
  for(const width of [320,360,390,430,1024]){
    await page.setViewportSize({width,height:850});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  // At the end of a long page the last card must clear both fixed controls.
  for(const width of [320,430]){
    await page.setViewportSize({width,height:740});
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    const rects=await page.evaluate(()=>{const r=s=>{const x=document.querySelector(s).getBoundingClientRect();return{top:x.top,bottom:x.bottom};};return{last:r('#protect-observations'),nav:r('.opg-tabbar'),fab:r('.opg-fab'),header:r('.opg-header')};});
    assert.ok(rects.last.bottom<=rects.fab.top,'last card clears floating action');
    assert.ok(rects.fab.bottom<rects.nav.top,'floating action clears navigation');
  }
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.setViewportSize({width:390,height:850});
  await page.screenshot({path:'/tmp/opg-protection-overview.png',fullPage:true});
  assert.deepEqual(errors,[]);

  // Laser SC: legacy links are unverified; formula mismatch and changes during confirmation never write.
  const laser=await browser.newPage({viewport:{width:320,height:800},serviceWorkers:'block'});laser.on('pageerror',e=>errors.push(e.message));
  const originalLaser={id:'laser-stock',naziv:'Laser SC',fis_product_id:374,fis_product_name:'LASER',trenutna_kolicina:2,pocetna_kolicina:2,jedinica:'L'};
  await laser.addInitScript(stock=>localStorage.setItem('opg_zalihe',JSON.stringify([stock])),originalLaser);
  let laserForm='emulzija';
  await laser.route('https://fis.mps.hr/**',route=>route.fulfill({json:route.request().url().includes('/search?')?{content:[{pppId:374,productName:'LASER',productRegistrationNumber:'TEST'}],totalElements:1}:{basicInfo:{productName:'LASER',registrationNumber:'TEST',registrationStatus:'REGISTRIRAN'},additionalData:{productFormulation:[{hr:laserForm}]},culturesAndHarmfulOrganisms:[{culture:{name:{hr:'Paprika (u zaštićenom prostoru)'}},harmfulOrganisms:[{name:{hr:'kalifornijski trips'},nameLat:'Frankliniella occidentalis'}]}]}}));
  await laser.goto('http://127.0.0.1:8766/');await laser.locator('#setup-skip').click();await laser.locator('[data-tab="zastita"]').click();await laser.locator('[data-sub="fis"]').click();
  await laser.getByText('Identitet i formulacija zalihe nisu potvrđeni prema etiketi. Ponovno provjeri povezivanje.',{exact:true}).waitFor();
  await laser.getByRole('button',{name:'Provjeri i otvori uvjete',exact:true}).click();
  await laser.locator('[data-sub="zastita-prijedlozi"]').click();assert.equal(await laser.locator('#protect-candidates .protect-candidate').count(),0,'unconfirmed legacy link is not a verified stock candidate');
  await laser.locator('[data-sub="fis"]').click();await laser.getByRole('button',{name:'Provjeri ili promijeni FIS povezivanje',exact:true}).click();
  await laser.getByRole('button',{name:'LASER · TEST',exact:true}).click();
  await laser.getByText('Povezivanje je blokirano: naziv, formulacija ili aktualna registracija nisu potvrđeni. Nije spremljena nikakva promjena.',{exact:true}).waitFor();
  assert.equal(await laser.getByRole('button',{name:'Potvrdi FIS povezivanje',exact:true}).isDisabled(),true);
  assert.deepEqual(await laser.evaluate(()=>JSON.parse(localStorage.getItem('opg_zalihe'))[0]),originalLaser);
  laserForm='koncentrat za suspenziju';await laser.getByRole('button',{name:'Odustani od povezivanja',exact:true}).click();await laser.getByRole('button',{name:'LASER · TEST',exact:true}).click();
  await laser.getByText('Usporedio/la sam etiketu: naziv, registracijski broj i formulacija odgovaraju prikazanom FIS zapisu.',{exact:true}).click();
  laserForm='emulzija';await laser.getByRole('button',{name:'Potvrdi FIS povezivanje',exact:true}).click();
  await laser.getByText('FIS podaci su se promijenili. Ponovno usporedi etiketu i potvrdi.',{exact:true}).waitFor();
  assert.deepEqual(await laser.evaluate(()=>JSON.parse(localStorage.getItem('opg_zalihe'))[0]),originalLaser,'changed source never silently confirms old data');
  laserForm='koncentrat za suspenziju';await laser.getByRole('button',{name:'Odustani od povezivanja',exact:true}).click();await laser.getByRole('button',{name:'LASER · TEST',exact:true}).click();
  await laser.getByText('Usporedio/la sam etiketu: naziv, registracijski broj i formulacija odgovaraju prikazanom FIS zapisu.',{exact:true}).click();await laser.getByRole('button',{name:'Potvrdi FIS povezivanje',exact:true}).click();
  await laser.getByText('Povezivanje spremljeno nakon usporedbe etikete.',{exact:true}).waitFor();
  const confirmedLaser=await laser.evaluate(()=>JSON.parse(localStorage.getItem('opg_zalihe'))[0]);assert.equal(confirmedLaser.fis_product_id,'374');assert.equal(confirmedLaser.fis_link_verification.productName,'LASER');assert.equal(confirmedLaser.trenutna_kolicina,2);
  await laser.getByRole('button',{name:'Provjeri i otvori uvjete',exact:true}).click();await laser.locator('[data-sub="zastita-prijedlozi"]').click();await laser.locator('#protect-problem').fill('Trips (Frankliniella occidentalis)');
  assert.equal(await laser.locator('#protect-candidates .protect-candidate').count(),1);assert.equal(await laser.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await laser.close();

  // Verify the shared Firebase read adapter with deterministic SDK snapshots.
  const cloud = await browser.newPage({serviceWorkers:'block'});
  cloud.on('pageerror',e=>errors.push(e.message));
  await cloud.route('**/cloud-fixture',r=>r.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><div data-view="zastita"><div id="zastita-subnav"><button data-sub="iskaznica"></button><button data-sub="vrijeme"></button><button data-sub="kalkulator"></button><button data-sub="zalihe"></button><button data-sub="fis"></button><button data-sub="tretiranja"></button></div><div id="sub-fis"></div></div><select id="season-select"><option>2026</option></select><script src="/fis.js"></script><script>localStorage.setItem('opg_fb_config','{}');window.OpgFis={...window.OpgFis,normalize:r=>r,integration:{getStock:()=>[{naziv:'Test proizvod',fis_product_id:'42',trenutna_kolicina:1,jedinica:'L',fis_link_verification:window.OpgFis.createLinkVerification({naziv:'Test proizvod'},{id:'42',name:'Test proizvod',registration:'TEST',formulations:['koncentrat za suspenziju']},new Date().toISOString())}],setShared:()=>{},showRecord:()=>{}}};</script><script src="/protection.js"></script>`}));
  await cloud.route('https://www.gstatic.com/firebasejs/**',r=>{
    const url=r.request().url();
    if(url.endsWith('firebase-functions.js'))return r.fulfill({contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:`export const getFunctions=()=>({});export const httpsCallable=(_,name)=>async data=>{window.aiCalls=window.aiCalls||[];if(name==='pestPhotoUsage')return{data:{month:'2026-10',attempts:1,limit:100,remaining:99,estimatedUsd:0.00381,sampleCount:1,sampleUsd:0.00381,unaccounted:0}};window.aiCalls.push(data);if(window.aiMode==='quota')throw Object.assign(new Error('Dosegnuto je 100 analiza za ovaj mjesec.'),{code:'functions/resource-exhausted'});return{data:{result:window.aiMode==='unclear'?{assessment:'insufficient_evidence',summary:'Nema dovoljno vidljivih znakova.',visibleSigns:[],possibleCauses:[],nextPhotos:['Fotografiraj donju stranu lista.'],fieldChecks:[]}:{assessment:'possible_causes',summary:'Mogući uzrok: trips. <img src=x onerror=alert(1)>',visibleSigns:['Srebrnkasti tragovi'],possibleCauses:[{name:'Trips',kind:'pest',confidence:'low',evidence:'Tragovi na listu',check:'Pregledaj cvjetove.'}],nextPhotos:[],fieldChecks:['Pregledaj više biljaka.']},usage:{month:'2026-10',attempts:1,limit:100,remaining:99,estimatedUsd:0.00381,sampleCount:1,sampleUsd:0.00381,unaccounted:0}}};};`});
    let body=url.endsWith('firebase-app.js')?'export const getApps=()=>[{}];':url.endsWith('firebase-auth.js')?'export const getAuth=()=>({currentUser:{uid:"test"}});':`export const getFirestore=()=>({});export const collection=(_,p)=>p;export const doc=(_,p)=>p;export function onSnapshot(p,ok){window.snapshots=window.snapshots||{};window.snapshots[p]=ok;const now=new Date().toISOString();const rows={fis_cache:[{id:'42',data:()=>({checkedAt:now,rawJson:JSON.stringify({id:'42',name:'Test proizvod',status:'REGISTRIRAN',registration:'TEST',formulations:['koncentrat za suspenziju'],uses:[{culture:'Paprika',phi:'3 dana',organisms:[{name:'Trips',usage:'Testna primjena',max:2}]}]})})}],prskanje:[{data:()=>({kultura:'PAPRIKA BABURA',datum:'2026-06-01'})}]};const data={'settings/weather_live':{temp:22,hum:75,wind:1.5,ts:Date.now()},'settings/rizik':{checked_at:now,items:[{kulture:['PAPRIKA BABURA'],razina:1,naziv:'Testni rizik',razlog:'Vlažno vrijeme'}]},'fis_sync_status/daily':{finishedAt:now,checked:1,failed:0}};ok(rows[p]?{docs:rows[p]}:{exists:()=>!!data[p],data:()=>data[p]});}`;
    return r.fulfill({contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body});
  });
  await cloud.goto('http://127.0.0.1:8766/cloud-fixture');
  await cloud.getByText('22 °C',{exact:true}).waitFor();
  await cloud.getByText('Testni rizik · zabilježeni povoljni uvjeti',{exact:true}).waitFor();
  await cloud.getByText('Paprika · karenca: 3 dana',{exact:true}).waitFor();
  await cloud.locator('#protect-problem').fill('Nepostojeći štetnik');
  assert.equal(await cloud.locator('.protect-candidate').count(),0);
  await cloud.locator('#protect-problem').fill('Trips');
  assert.equal(await cloud.locator('.protect-candidate').count(),1);
  await cloud.locator('#protect-crop').selectOption('TIKVICA');
  assert.equal(await cloud.locator('.protect-candidate').count(),0);
  // Generic squash registrations must not silently qualify as butternut.
  await cloud.locator('#protect-crop').selectOption('BUTTERNUT TIKVA');
  assert.equal(await cloud.locator('.protect-candidate').count(),0);
  await cloud.locator('#protect-crop').selectOption('PAPRIKA BABURA');
  for(const change of [{error:'offline'},{checkedAt:'2020-01-01T00:00:00Z'},{status:'UKINUT'}]){
    await cloud.evaluate(change=>window.snapshots.fis_cache({docs:[{id:'42',data:()=>({checkedAt:change.checkedAt||new Date().toISOString(),error:change.error||null,rawJson:JSON.stringify({id:'42',name:'Test',status:change.status||'REGISTRIRAN',registration:'TEST',formulations:['koncentrat za suspenziju'],uses:[{culture:'Paprika',phi:'Test',organisms:[{name:'Trips'}]}]})})}]}),change);
    assert.equal(await cloud.locator('.protect-candidate').count(),0,'unverified records never qualify');
  }
  await cloud.evaluate(()=>window.snapshots.fis_cache({docs:[{id:'42',data:()=>({checkedAt:new Date().toISOString(),rawJson:JSON.stringify({id:'42',name:'Test proizvod',registration:'TEST',status:'REGISTRIRAN',formulations:['koncentrat za suspenziju'],uses:[{culture:'Paprika',phi:'TEST',organisms:[{name:'Trips'}]}]}),previousRawJson:'invalid historical JSON'})}]}));
  assert.equal(await cloud.locator('.protect-candidate').count(),1,'invalid history cannot invalidate separately verified current data');
  // AI flow uses mocked callable responses; never calls a paid provider.
  await cloud.locator('#protect-ai-analyze').waitFor();
  assert.equal(await cloud.evaluate(()=>window.aiCalls?.length||0),0);
  await cloud.locator('#protect-ai-analyze').click();
  await cloud.getByText('Dodaj barem jednu fotografiju problema.',{exact:true}).waitFor();
  await cloud.locator('#protect-crop').selectOption('PAPRIKA BABURA');
  await cloud.locator('#protect-images').setInputFiles({name:'test-leaf.png',mimeType:'image/png',buffer:Buffer.from(sampleImage,'base64')});
  await cloud.getByText('1 fotografija spremno za opažanje.',{exact:true}).waitFor();
  await cloud.locator('#protect-note').fill('Testno opažanje');
  await cloud.locator('#protect-ai-analyze').click();
  await cloud.getByText('Potvrdi slanje fotografija i opisa na AI analizu.',{exact:true}).waitFor();
  assert.equal(await cloud.evaluate(()=>window.aiCalls?.length||0),0);
  await cloud.locator('#protect-ai-check').click();
  await cloud.getByText('AI je dostupan. Provjeri fotografije i opis prije slanja.',{exact:true}).waitFor();
  await cloud.locator('#protect-ai-consent').check();
  await cloud.locator('#protect-ai-analyze').click();
  await cloud.getByRole('heading',{name:'Rezultat AI analize — mogući uzroci',exact:true}).waitFor();
  assert.equal(await cloud.locator('#protect-ai-result img').count(),0);
  for(const heading of ['1. Najvjerojatniji uzrok','2. Razina pouzdanosti','3. Vidljivi simptomi — opažanja AI-ja na fotografiji','4. Što provjeriti u nasadu','6. Sljedeći preporučeni korak'])assert.equal(await cloud.getByRole('heading',{name:heading,exact:true}).count(),1);
  await cloud.getByText('5. Alternativni mogući uzroci',{exact:true}).waitFor();
  const fisButton=cloud.getByRole('button',{name:'Pretraži FIS za: Trips',exact:true});
  assert.equal(await fisButton.isDisabled(),true);
  await cloud.locator('#protect-ai-result input[type=checkbox]').check();
  await fisButton.click();
  assert.equal(await cloud.locator('#protect-problem').inputValue(),'Trips');
  await cloud.locator('#protect-ai-analyze').click();
  await cloud.getByText('Analiza je završena. Provjeri moguće uzroke u nasadu; rezultat možeš spremiti uz opažanje.',{exact:true}).waitFor();
  assert.equal(await cloud.evaluate(()=>window.aiCalls[0].requestId===window.aiCalls[1].requestId),true);
  await cloud.getByRole('button',{name:'Spremi opažanje na ovaj uređaj',exact:true}).click();
  assert.equal(await cloud.evaluate(()=>JSON.parse(localStorage.getItem('opg_observations_v1')).at(-1).aiAnalysis.possibleCauses[0].name),'Trips');
  await cloud.locator('#protect-images').setInputFiles({name:'test-leaf.png',mimeType:'image/png',buffer:Buffer.from(sampleImage,'base64')});
  await cloud.getByText('1 fotografija spremno za opažanje.',{exact:true}).waitFor();
  await cloud.locator('#protect-note').fill('Mutna slika');
  await cloud.locator('#protect-ai-consent').check();
  await cloud.evaluate(()=>window.aiMode='unclear');
  await cloud.locator('#protect-ai-analyze').click();
  await cloud.getByText('Sažetak analize',{exact:true}).click();
  await cloud.getByText('Nema dovoljno vidljivih znakova.',{exact:true}).waitFor();
  assert.equal(await cloud.locator('#protect-ai-result input[type=checkbox]').count(),0);
  await cloud.locator('#protect-note').fill('Novi opis');
  assert.equal(await cloud.locator('#protect-ai-result').innerText(),'');
  await cloud.locator('#protect-ai-consent').check();
  await cloud.evaluate(()=>window.aiMode='quota');
  await cloud.locator('#protect-ai-analyze').click();
  await cloud.locator('#protect-ai-status').filter({hasText:'Dosegnuto je 100 analiza'}).waitFor();
  assert.equal(await cloud.locator('#protect-ai-analyze').isEnabled(),true);
  assert.deepEqual(errors,[]);
  await browser.close(); server.close(); console.log(engine+': PASS: FIS, photo observations, shared Firebase reads, AI callable UI, consent, replay IDs, FIS confirmation, quota and responsive layout');
})().catch(e=>{console.error(e);process.exit(1)});
