/* FIS public-search adapter. No doses or harvest permissions are inferred. */
(function (scope) {
  'use strict';
  const BASE = 'https://fis.mps.hr/fis-public-bff/api/v1/public-search/plant-protection-product';
  const SOURCE = 'https://fis.mps.hr/fis/javna-trazilica-szb/';
  const CACHE = 'opg_fis_v1';
  const DAY = 24 * 60 * 60 * 1000;
  function normalize(raw, id) {
    if (!/^[1-9]\d{0,8}$/.test(String(id))) throw new Error('Neispravan FIS ID.');
    if (!raw || !raw.basicInfo || typeof raw.basicInfo.productName !== 'string' || !raw.basicInfo.productName.trim() || typeof raw.basicInfo.registrationStatus !== 'string' ||
        !Array.isArray(raw.culturesAndHarmfulOrganisms)) throw new Error('FIS je vratio nepotpune podatke.');
    return { id: String(id), name: raw.basicInfo.productName,
      registration: raw.basicInfo.registrationNumber || '',
      status: raw.basicInfo.registrationStatus || 'Status nije naveden',
      formulations: Array.isArray(raw.additionalData?.productFormulation) ? raw.additionalData.productFormulation.map(f=>typeof f?.hr==='string'?f.hr:typeof f?.en==='string'?f.en:'').map(f=>f.trim()).filter(Boolean) : [],
      uses: raw.culturesAndHarmfulOrganisms.map(row => {
        if (!row || typeof row!=='object' || Array.isArray(row) || (row.harmfulOrganisms != null && !Array.isArray(row.harmfulOrganisms))) throw new Error('Nepotpune FIS primjene.');
        return {
          culture: row.culture?.name?.hr || 'Kultura nije navedena',
          phi: row.culture?.safetyPeriod || 'Karenca nije navedena — provjeri upute',
          organisms: (row.harmfulOrganisms || []).map(o => {
            if (!o || typeof o!=='object' || Array.isArray(o) || ['usage','additionalInfo','nameLat'].some(k=>o[k]!=null && typeof o[k]!=='string')) throw new Error('Nepotpuni FIS organizmi.');
            return {
              name: o.name?.hr || o.nameLat || 'Organizam nije naveden', nameLat: o.nameLat || '',
              usage: o.usage || '', additional: o.additionalInfo || '',
              max: o.maxNumberOfTreatmentsPerSeason ?? row.culture?.maxNumberOfTreatmentsPerSeason ?? null
            };
          })
        };
      }) };
  }
  // Lexical search aids, never a determination of permitted use or a taxonomic synonym service.
  function words(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('hr').replace(/đ/g,'d').replace(/[^a-z0-9]+/g,' ').trim();
  }
  function cultureMatches(label, selected) {
    const full=words(label), base=words(String(label || '').replace(/\([^)]*\)/g,''));
    if (/\b(ukrasna|ukrasne|ljuta|ljute|feferon|feferoni)\b/.test(full)) return false;
    const names={
      'PAPRIKA BABURA':['paprika','paprike','paprika babura','paprike babure','babura paprika'],
      'TIKVICA':['tikvica','tikvice'],
      'BUTTERNUT TIKVA':['butternut','tikva butternut','butternut tikva']
    };
    // A generic squash label is insufficient evidence for the butternut cultivar.
    if (selected==='BUTTERNUT TIKVA' && ['tikva','tikve'].includes(base)) return (String(label).match(/\([^)]*\)/g)||[]).some(part=>words(part)==='butternut');
    return (names[selected] || []).includes(base);
  }
  function organismMatches(organism, query) {
    const term=words(query);
    if (!term) return true;
    const contains=(a,b)=>(' '+a+' ').includes(' '+b+' ');
    const name=words(organism.name), latin=words(organism.nameLat);
    return contains(name,term) || (!!latin && (contains(latin,term) || contains(term,latin)));
  }
  function tradeName(value){return String(value||'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleUpperCase('hr');}
  function linkAssessment(stock, product) {
    const local=tradeName(stock?.naziv), remote=tradeName(product?.name);
    const sc=(Array.isArray(product?.formulations)?product.formulations:[]).some(f=>['koncentrat za suspenziju','suspension concentrate','sc'].includes(words(f)));
    if (local==='LASER SC') return {ok:String(product?.id)==='374' && remote==='LASER' && sc,
      message:'Laser SC zahtijeva LASER, ID 374, i izričito potvrđenu SC formulaciju (koncentrat za suspenziju).'};
    return {ok:!!local && local===remote && Array.isArray(product?.formulations) && product.formulations.length>0,
      message:'Naziv zalihe mora odgovarati FIS nazivu, a formulacija mora biti dostupna za usporedbu s etiketom. Nepoznate sinonime ne povezujemo automatski.'};
  }
  function createLinkVerification(stock, product, checkedAt) {
    return {method:'label-confirmation',stockName:stock.naziv,productId:String(product.id),productName:product.name,
      registration:product.registration,formulations:product.formulations,checkedAt,source:SOURCE+'pregled/'+encodeURIComponent(product.id)};
  }
  function linkVerified(stock, record) {
    const proof=stock?.fis_link_verification, p=record?.product, time=Date.parse(proof?.checkedAt||'');
    return !!proof && !!p && proof.method==='label-confirmation' && Number.isFinite(time) && time<=Date.now()
      && String(stock.fis_product_id)===String(p.id) && proof.productId===String(p.id)
      && proof.stockName===stock.naziv && proof.productName===p.name && proof.registration===p.registration
      && proof.source===SOURCE+'pregled/'+encodeURIComponent(p.id)
      && JSON.stringify(proof.formulations)===JSON.stringify(p.formulations) && linkAssessment(stock,p).ok;
  }
  function verified(record, now = Date.now()) {
    return !!record?.product && /^[1-9]\d{0,8}$/.test(String(record.product.id)) &&
      typeof record.product.name==='string' && !!record.product.name.trim() &&
      typeof record.product.registration==='string' && !!record.product.registration.trim() && !record.error && !stale(record, now) &&
      typeof record.product.status==='string' && record.product.status.trim().toLocaleUpperCase('hr') === 'REGISTRIRAN';
  }
  function stale(record, now = Date.now()) {
    const t = Date.parse(record?.checkedAt || '');
    return !Number.isFinite(t) || t > now || now - t >= DAY;
  }
  async function request(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store', credentials: 'omit' });
      if (!res.ok) throw new Error('FIS nije dostupan (HTTP ' + res.status + ').');
      return await res.json();
    } finally { clearTimeout(timer); }
  }
  async function catalogue() {
    const all = [];
    for (let page = 0; page < 50; page++) {
      const data = await request(BASE + '/search?page=' + page + '&size=100', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      });
      if (!Array.isArray(data.content) || !Number.isInteger(data.totalElements) || data.totalElements<0 || data.content.some(p=>!p || !/^[1-9]\d{0,8}$/.test(String(p.pppId)) || typeof p.productName!=='string' || !p.productName.trim())) throw new Error('Neočekivan oblik FIS pretrage.');
      all.push(...data.content);
      if (all.length >= data.totalElements) return all;
      if (!data.content.length) break;
    }
    throw new Error('Popis FIS sredstava nije potpuno dohvaćen.');
  }
  function findProducts(products, query) {
    const term = query.trim().toLocaleLowerCase('hr');
    if (term.length < 2) return [];
    const valid = products.filter(p=>p && /^[1-9]\d{0,8}$/.test(String(p.pppId)));
    const matches = valid.filter(p => String(p.productName).toLocaleLowerCase('hr').includes(term));
    // Alias is a search aid only: identity still requires the user's explicit choice.
    if (!matches.length && term === 'laser sc') matches.push(...valid.filter(p => String(p.pppId) === '374' && String(p.productName).toLocaleUpperCase('hr') === 'LASER'));
    return matches;
  }
  function mount({ host, getStock, saveLink }) {
    let records = {}, shared = {}, products = null, busy = false, activeId = null, ticket = 0, detailRecord = null, detailId = null, detailCurrent = false, pendingLink = null;
    try { records = JSON.parse(localStorage.getItem(CACHE) || '{}') || {}; } catch (_) {}
    const status = document.createElement('p'); status.className = 'opg-hint'; status.setAttribute('aria-live', 'polite');
    const list = document.createElement('div');
    const detail = document.createElement('div'); detail.className = 'opg-card'; detail.hidden = true;
    const searchPanel = document.createElement('div'); searchPanel.className = 'opg-card'; searchPanel.hidden = true;
    const linkPanel=document.createElement('section');linkPanel.className='opg-card';linkPanel.hidden=true;
    const heading = document.createElement('h3'); heading.textContent = 'Poveži točan FIS proizvod';
    const label = document.createElement('label'); label.textContent = 'Naziv sredstva'; label.htmlFor = 'fis-query';
    const query = document.createElement('input'); query.id = 'fis-query'; query.type = 'search';
    const results = document.createElement('div');
    searchPanel.append(heading, label, query, results);
    host.append(status, list, searchPanel, linkPanel, detail);
    function el(tag, text, cls) { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
    function button(text, action) { const b = el('button', text, 'opg-submit secondary'); b.type = 'button'; b.addEventListener('click', action); return b; }
    function persist() { try { localStorage.setItem(CACHE, JSON.stringify(records)); } catch (_) { status.textContent = 'Predmemoriju nije moguće spremiti na ovom uređaju.'; } }
    function getRecord(id) {
      const a=records[String(id)], b=shared[String(id)];
      const at=r=>Date.parse(r?.lastAttemptAt||r?.checkedAt||'')||0;
      if (b?.error && !at(b)) return b;
      const chosen = !b?a:!a||at(b)>=at(a)?b:a;
      if (chosen?.product && String(chosen.product.id) !== String(id)) return {...chosen,product:null,error:'FIS ID podataka ne odgovara povezanoj zalihi.'};
      return chosen;
    }
    function render() {
      list.replaceChildren();
      const stock = getStock();
      if (!stock.length) list.append(el('p', 'Prvo dodaj sredstvo u Zalihe.', 'opg-hint'));
      stock.forEach(item => {
        const card = el('section', null, 'opg-card');
        card.append(el('h3', item.naziv));
        const linked = item.fis_product_id;
        const record = linked && getRecord(linked);
        card.append(el('p', !linked ? 'Nije povezano s FIS-om' : record ?
          (!verified(record) ? 'Aktualnost nije potvrđena' : !linkVerified(item,record) ? 'Povezano — identitet i formulaciju treba potvrditi prema etiketi' : 'Dohvat uspješan — provjeri uvjete primjene') : 'Povezano — podaci još nisu dohvaćeni', 'opg-hint'));
        if (linked) {
          if(!linkVerified(item,record))card.append(el('p','Identitet i formulacija zalihe nisu potvrđeni prema etiketi. Ponovno provjeri povezivanje.','opg-hint'));
          card.append(el('p', item.fis_product_name || 'FIS ID: ' + linked, 'opg-hint'));
          if (record?.origin) card.append(el('p',record.origin,'opg-hint'));
          if (record?.checkedAt) card.append(el('p', 'Posljednji uspješan dohvat: ' + new Date(record.checkedAt).toLocaleString('hr-HR'), 'opg-hint'));
          if (record?.changedAt) card.append(el('p', 'Promjena podataka zabilježena: ' + new Date(record.changedAt).toLocaleString('hr-HR'), 'opg-hint'));
          if (record?.error) card.append(el('p', record.error, 'opg-hint'));
          if (record?.product) card.append(button('Otvori spremljene uvjete', () => showRecord(record)));
          card.append(button('Provjeri i otvori uvjete', () => refresh(linked)));
        }
        card.append(button(linked ? 'Provjeri ili promijeni FIS povezivanje' : 'Pronađi u FIS-u', () => openSearch(item)));
        list.append(card);
      });
      if (detailId && !detail.hidden) {
        const next = getRecord(detailId) || detailRecord;
        if (next !== detailRecord || verified(next) !== detailCurrent) showRecord(next);
      }
      window.dispatchEvent(new Event('opg:fis-stock'));
    }
    function showRecord(record) {
      detailRecord = record; detailCurrent = verified(record);
      if (record?.product) detailId = record.product.id;
      detail.hidden = false; detail.replaceChildren();
      if (!record?.product) { detail.append(el('p','FIS podaci nisu dostupni ili su nepotpuni. Aktualnost nije potvrđena.')); return; }
      const current = detailCurrent;
      detail.append(el('h3', record.product.name), el('p', (current ? 'Status u FIS-u: ' : 'Spremljeni status — nije potvrđeno aktualan: ') + record.product.status),
        el('p', 'Broj registracije: ' + (record.product.registration || 'nije naveden — provjeri izvor'), 'opg-hint'),
        el('p', 'Prikaz nije preporuka tretiranja. Provjeri točnu kulturu, otvoreni/zaštićeni uzgoj i izvornu uputu. Nepotpuni podaci nisu odobrenje primjene.', 'opg-hint'));
      if (record.error || stale(record)) detail.append(el('p', 'Aktualnost ovih spremljenih podataka nije potvrđena.', 'opg-hint'));
      if (record.checkedAt) detail.append(el('p', 'Datum provjere: ' + new Date(record.checkedAt).toLocaleString('hr-HR'), 'opg-hint'));
      if (!verified(record)) {
        detail.append(el('p', 'Registracijski uvjeti nisu potvrđeno aktualni. Obnovi provjeru i provjeri status u službenom izvoru.', 'opg-hint'));
        const source = el('a', 'Otvori izvorni FIS zapis ↗'); source.href = SOURCE + 'pregled/' + encodeURIComponent(record.product.id); source.target = '_blank'; source.rel = 'noopener noreferrer'; detail.append(source);
        return;
      }
      if (record.historyError) detail.append(el('p', record.historyError, 'opg-hint'));
      if (record.previous) {
        const d = el('details'); d.append(el('summary', 'Prethodna verzija podataka — povijesno, nije za primjenu'));
        const pre = el('pre', JSON.stringify(record.previous, null, 2)); pre.style.whiteSpace = 'pre-wrap'; d.append(pre); detail.append(d);
      }
      if (!record.product.uses.length) detail.append(el('p', 'Nema navedenih primjena — provjeri izvornu uputu.', 'opg-hint'));
      record.product.uses.forEach(use => {
        const d = el('details'); d.append(el('summary', use.culture + ' · karenca: ' + use.phi));
        use.organisms.forEach(o => {
          d.append(el('h4', o.name), el('p', 'Najviše tretiranja: ' + (o.max ?? 'nije navedeno')));
          d.append(el('p', o.usage || 'Primjena nije navedena u ovom polju.', 'opg-hint'));
          if (o.additional) d.append(el('p', o.additional, 'opg-hint'));
        }); detail.append(d);
      });
      const link = el('a', 'Otvori izvorni FIS zapis ↗'); link.href = SOURCE + 'pregled/' + encodeURIComponent(record.product.id); link.target = '_blank'; link.rel = 'noopener noreferrer'; detail.append(link);
    }
    async function refresh(id) {
      if (busy) return;
      busy = true; status.textContent = 'Provjeravam FIS…';
      try {
        const product = normalize(await request(BASE + '/' + encodeURIComponent(id)), id);
        const old = getRecord(id), changed = old?.product && JSON.stringify(old.product) !== JSON.stringify(product);
        records[String(id)] = { product, checkedAt: new Date().toISOString(),
          changedAt: changed ? new Date().toISOString() : old?.changedAt || null,
          previous: changed ? old.product : old?.previous || null, error: null, origin: 'Ručni dohvat na ovom uređaju', lastAttemptAt: new Date().toISOString() };
        persist(); showRecord(records[String(id)]); status.textContent = changed ? 'Pronađena je promjena. Pregledaj uvjete i izvornu uputu.' : 'Podaci su dohvaćeni iz FIS-a.';
      } catch (_) {
        const old = getRecord(id);
        if (old?.product) { records[String(id)] = {...old,error:'Provjera nije uspjela. Prikazana je zadnja spremljena verzija.',lastAttemptAt:new Date().toISOString()}; persist(); showRecord(records[String(id)]); }
        else { detail.hidden = true; }
        status.textContent = 'FIS provjera nije uspjela. Provjeri vezu ili otvori službenu tražilicu. Aktualnost nije potvrđena.';
      } finally { busy = false; render(); }
    }
    function filter() {
      results.replaceChildren();
      if (!products) return;
      const term = query.value.trim().toLocaleLowerCase('hr');
      if (term.length < 2) { results.append(el('p', 'Upiši najmanje dva znaka.', 'opg-hint')); return; }
      const matches = findProducts(products, term);
      results.append(el('p', matches.length + ' rezultata u dohvaćenom katalogu (prazan rezultat nije dokaz nepostojanja registracije). Provjeri naziv i broj registracije prije povezivanja.', 'opg-hint'));
      matches.slice(0, 30).forEach(p => results.append(button(p.productName + ' · ' + (p.productRegistrationNumber || 'bez broja'), () => prepareLink(p))));
    }
    function showLinkConfirmation(stock, product, checkedAt) {
      pendingLink={stockId:stock.id,stockName:stock.naziv,oldId:stock.fis_product_id,product,checkedAt};
      linkPanel.hidden=false;linkPanel.replaceChildren();
      linkPanel.append(el('h3','Provjeri etiketu prije povezivanja'),el('p','Zaliha: '+stock.naziv),el('p','FIS: '+product.name+' · ID '+product.id),
        el('p','Registracija: '+(product.registration||'nije potvrđena')),el('p','Formulacija iz FIS-a: '+(product.formulations.join(' · ')||'nije dostupna')),
        el('p','Dohvaćeno: '+new Date(checkedAt).toLocaleString('hr-HR'),'opg-hint'));
      const source=el('a','Usporedi sa službenim FIS zapisom ↗');source.href=SOURCE+'pregled/'+encodeURIComponent(product.id);source.target='_blank';source.rel='noopener noreferrer';linkPanel.append(source);
      const assessment=linkAssessment(stock,product), current=verified({product,checkedAt});
      linkPanel.append(el('p',assessment.message,'opg-hint'));
      if(!assessment.ok||!current)linkPanel.append(el('p','Povezivanje je blokirano: naziv, formulacija ili aktualna registracija nisu potvrđeni. Nije spremljena nikakva promjena.','opg-hint'));
      const label=el('label'),confirm=el('input');confirm.type='checkbox';label.append(confirm,el('span','Usporedio/la sam etiketu: naziv, registracijski broj i formulacija odgovaraju prikazanom FIS zapisu.'));
      const save=button('Potvrdi FIS povezivanje',async()=>{
        if(busy||!confirm.checked||!pendingLink||!assessment.ok)return;
        const chosen=pendingLink;busy=true;save.disabled=true;
        try{
          const latest=normalize(await request(BASE+'/'+encodeURIComponent(chosen.product.id)),chosen.product.id), now=new Date().toISOString();
          const currentStock=getStock().find(i=>i.id===chosen.stockId);
          if(!currentStock||currentStock.naziv!==chosen.stockName||String(currentStock.fis_product_id||'')!==String(chosen.oldId||''))throw new Error('Zaliha je promijenjena. Ponovno otvori povezivanje.');
          if(JSON.stringify(latest)!==JSON.stringify(chosen.product)){
            showLinkConfirmation(currentStock,latest,now);status.textContent='FIS podaci su se promijenili. Ponovno usporedi etiketu i potvrdi.';return;
          }
          if(!verified({product:latest,checkedAt:now})||!linkAssessment(currentStock,latest).ok)throw new Error('FIS identitet i formulacija nisu potvrđeni.');
          await saveLink(currentStock.id,{fis_product_id:String(latest.id),fis_product_name:latest.name,fis_link_verification:createLinkVerification(currentStock,latest,now)});
          searchPanel.hidden=true;linkPanel.hidden=true;pendingLink=null;detail.hidden=true;detailId=null;detailRecord=null;status.textContent='Povezivanje spremljeno nakon usporedbe etikete.';
        }catch(_){status.textContent='Povezivanje nije spremljeno. Provjeri podatke, Firestore ovlasti i vezu te ponovno otvori povezivanje.';}
        finally{busy=false;save.disabled=!confirm.checked||!assessment.ok||!current;render();}
      });
      save.disabled=true;confirm.disabled=!assessment.ok||!current;confirm.addEventListener('change',()=>save.disabled=!confirm.checked||!assessment.ok||!current||busy);
      linkPanel.append(label,save,button('Odustani od povezivanja',()=>{pendingLink=null;linkPanel.hidden=true;}));
    }
    async function prepareLink(candidate){
      if(busy||!activeId)return;busy=true;status.textContent='Provjeravam identitet i formulaciju u FIS-u…';
      try{
        const stock=getStock().find(i=>i.id===activeId);if(!stock)throw new Error('Zaliha ne postoji');
        const product=normalize(await request(BASE+'/'+encodeURIComponent(candidate.pppId)),candidate.pppId);
        if(tradeName(product.name)!==tradeName(candidate.productName))throw new Error('FIS katalog i detalj nisu usklađeni');
        showLinkConfirmation(stock,product,new Date().toISOString());status.textContent='Ništa nije spremljeno. Usporedi etiketu i izričito potvrdi povezivanje.';
      }catch(_){pendingLink=null;linkPanel.hidden=true;status.textContent='Identitet ili formulacija nisu dohvaćeni. Povezivanje nije spremljeno.';}
      finally{busy=false;}
    }

    async function openSearch(item) {
      if (busy) return;
      pendingLink=null;linkPanel.hidden=true;
      activeId = item.id; const current = ++ticket;
      query.value = item.naziv || ''; searchPanel.hidden = false; results.textContent = 'Dohvaćam popis iz FIS-a…';
      query.focus();
      try { if (!products) { busy = true; products = await catalogue(); } if (current === ticket) filter(); }
      catch (_) { results.textContent = 'Dohvat popisa nije uspio. Pokušaj ponovno kasnije.'; }
      finally { busy = false; }
    }
    query.addEventListener('input', filter);
    render();
    // Recheck an already open detail after ageing, new shared data and returning from background.
    setInterval(() => { if (!document.hidden) render(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
    const integration = { render, getStock, getRecord, showRecord, setShared: data => { shared=data; render(); } };
    scope.OpgFis.integration = integration;
    if (!document.getElementById('opg-protection-loader')) {
      const script=document.createElement('script');script.id='opg-protection-loader';script.src='./protection.js';
      script.onerror=()=>{status.textContent='Novi pregled zaštite nije učitan. FIS i postojeći odjeljci ostaju dostupni.';};document.head.append(script);
    }
    return integration;
  }
  const api = { normalize, stale, verified, linkAssessment, createLinkVerification, linkVerified, cultureMatches, organismMatches, findProducts, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.OpgFis = api;
})(typeof window === 'undefined' ? globalThis : window);
