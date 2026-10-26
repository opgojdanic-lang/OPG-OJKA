const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true });
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
  await page.goto('http://127.0.0.1:8765/');
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
  await browser.close(); console.log('PASS: linking, product details, changed PHI, failed refresh, quantity preservation, safe text, mobile layout');
})().catch(e=>{console.error(e);process.exit(1)});
