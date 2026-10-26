const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
  const server = http.createServer((req,res)=>{const file=path.resolve(__dirname,'..','.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(path.resolve(__dirname,'..')+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
  await new Promise(resolve=>server.listen(8766,'127.0.0.1',resolve));
  server.unref();
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--single-process','--in-process-gpu','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-zygote']} : {}) });
  const page = await browser.newPage({ viewport: { width: 360, height: 800 }, serviceWorkers: 'block' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('opg_zalihe', JSON.stringify([{id:'test',naziv:'Test proizvod',trenutna_kolicina:1,pocetna_kolicina:1,jedinica:'L'}]));
  });
  let fail = false, version = 1;
  await page.route('https://fis.mps.hr/**', route => {
    if (fail) return route.abort();
    const search = route.request().url().includes('/search?');
    return route.fulfill({ json: search ? {content:[{pppId:42,productName:'Test proizvod',productRegistrationNumber:'TEST'}],totalElements:1} : {
      basicInfo:{productName:'Test proizvod',registrationStatus:'REGISTRIRAN',registrationNumber:'TEST'},
      culturesAndHarmfulOrganisms:[{culture:{name:{hr:'Paprika'},safetyPeriod:version === 1 ? '3 dana' : '7 dana'},harmfulOrganisms:[{name:{hr:'<img src=x onerror=alert(1)>'},maxNumberOfTreatmentsPerSeason:2}]}]
    }});
  });
  await page.goto('http://127.0.0.1:8766/');
  await page.locator('#setup-skip').click();
  await page.locator('[data-tab="zastita"]').click();
  await page.locator('[data-sub="fis"]').click();
  await page.getByRole('button',{name:'Pronađi u FIS-u',exact:true}).click();
  await page.getByRole('button',{name:'Test proizvod · TEST',exact:true}).click();
  await page.getByRole('button',{name:'Provjeri i otvori uvjete',exact:true}).click();
  await page.getByText('Paprika · karenca: 3 dana', {exact:true}).waitFor();
  version=2;
  await page.getByRole('button',{name:'Provjeri i otvori uvjete',exact:true}).click();
  await page.getByText('Paprika · karenca: 7 dana', {exact:true}).waitFor();
  await page.getByText('Prethodna verzija podataka',{exact:true}).waitFor();
  const stock = await page.evaluate(()=>JSON.parse(localStorage.getItem('opg_zalihe'))[0]);
  assert.equal(stock.trenutna_kolicina,1); assert.equal(stock.fis_product_id,'42');
  fail=true;
  await page.getByRole('button',{name:'Provjeri i otvori uvjete',exact:true}).click();
  await page.getByText('Aktualnost nije potvrđena',{exact:true}).waitFor();
  assert.equal(await page.locator('#fis-host img').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
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
  await page.evaluate(()=>window.OpgFis.integration.setShared({'42':{product:{id:'42',name:'Test proizvod',status:'REGISTRIRAN',registration:'TEST',uses:[]},checkedAt:new Date().toISOString(),lastAttemptAt:new Date().toISOString(),origin:'Zajednički dnevni dohvat'}}));
  await page.locator('[data-sub="fis"]').click();
  await page.getByText('Zajednički dnevni dohvat',{exact:true}).waitFor();
  await page.locator('[data-sub="zastita-pregled"]').click();
  for(const width of [320,390,1024]){
    await page.setViewportSize({width,height:850});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await page.setViewportSize({width:390,height:850});
  await page.screenshot({path:'/tmp/opg-protection-overview.png',fullPage:true});
  assert.deepEqual(errors,[]);

  // Verify the shared Firebase read adapter with deterministic SDK snapshots.
  const cloud = await browser.newPage({serviceWorkers:'block'});
  cloud.on('pageerror',e=>errors.push(e.message));
  await cloud.route('**/cloud-fixture',r=>r.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><div data-view="zastita"><div id="zastita-subnav"><button data-sub="iskaznica"></button><button data-sub="vrijeme"></button><button data-sub="kalkulator"></button><button data-sub="zalihe"></button><button data-sub="fis"></button><button data-sub="tretiranja"></button></div><div id="sub-fis"></div></div><select id="season-select"><option>2026</option></select><script>localStorage.setItem('opg_fb_config','{}');window.OpgFis={normalize:r=>r,stale:()=>false,integration:{getStock:()=>[{naziv:'Test proizvod',fis_product_id:'42',trenutna_kolicina:1,jedinica:'L'}],setShared:()=>{},showRecord:()=>{}}};</script><script src="/protection.js"></script>`}));
  await cloud.route('https://www.gstatic.com/firebasejs/**',r=>{
    const url=r.request().url();
    let body=url.endsWith('firebase-app.js')?'export const getApps=()=>[{}];':url.endsWith('firebase-auth.js')?'export const getAuth=()=>({currentUser:{uid:"test"}});':`export const getFirestore=()=>({});export const collection=(_,p)=>p;export const doc=(_,p)=>p;export function onSnapshot(p,ok){const now=new Date().toISOString();const rows={fis_cache:[{id:'42',data:()=>({checkedAt:now,rawJson:JSON.stringify({name:'Test proizvod',status:'REGISTRIRAN',uses:[{culture:'Paprika',phi:'3 dana',organisms:[{name:'Trips',usage:'Testna primjena',max:2}]}]})})}],prskanje:[{data:()=>({kultura:'PAPRIKA BABURA',datum:'2026-06-01'})}]};const data={'settings/weather_live':{temp:22,hum:75,wind:1.5,ts:Date.now()},'settings/rizik':{checked_at:now,items:[{kulture:['PAPRIKA BABURA'],razina:1,naziv:'Testni rizik',razlog:'Vlažno vrijeme'}]},'fis_sync_status/daily':{finishedAt:now,checked:1,failed:0}};ok(rows[p]?{docs:rows[p]}:{exists:()=>!!data[p],data:()=>data[p]});}`;
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
  assert.deepEqual(errors,[]);
  await browser.close(); server.close(); console.log('PASS: FIS workflow, local observations, shared Firebase adapter, crop/organism filters and responsive layout');
})().catch(e=>{console.error(e);process.exit(1)});
