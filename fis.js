/* FIS public-search adapter. No doses or harvest permissions are inferred. */
(function (scope) {
  'use strict';
  const BASE = 'https://fis.mps.hr/fis-public-bff/api/v1/public-search/plant-protection-product';
  const SOURCE = 'https://fis.mps.hr/fis/javna-trazilica-szb/';
  const CACHE = 'opg_fis_v1';
  const DAY = 24 * 60 * 60 * 1000;
  function normalize(raw, id) {
    if (!raw || !raw.basicInfo || typeof raw.basicInfo.productName !== 'string' || !raw.basicInfo.productName.trim() || typeof raw.basicInfo.registrationStatus !== 'string' ||
        !Array.isArray(raw.culturesAndHarmfulOrganisms)) throw new Error('FIS je vratio nepotpune podatke.');
    return { id: String(id), name: raw.basicInfo.productName,
      registration: raw.basicInfo.registrationNumber || '',
      status: raw.basicInfo.registrationStatus || 'Status nije naveden',
      uses: raw.culturesAndHarmfulOrganisms.map(row => ({
        culture: row.culture?.name?.hr || 'Kultura nije navedena',
        phi: row.culture?.safetyPeriod || 'Karenca nije navedena — provjeri upute',
        organisms: (row.harmfulOrganisms || []).map(o => ({
          name: o.name?.hr || o.nameLat || 'Organizam nije naveden',
          usage: o.usage || '', additional: o.additionalInfo || '',
          max: o.maxNumberOfTreatmentsPerSeason ?? row.culture?.maxNumberOfTreatmentsPerSeason ?? null
        }))
      })) };
  }
  function verified(record, now = Date.now()) {
    return !!record?.product && !record.error && !stale(record, now) &&
      record.product.status?.trim().toLocaleUpperCase('hr') === 'REGISTRIRAN';
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
      if (!Array.isArray(data.content) || !Number.isInteger(data.totalElements)) throw new Error('Neočekivan oblik FIS pretrage.');
      all.push(...data.content);
      if (all.length >= data.totalElements) return all;
      if (!data.content.length) break;
    }
    throw new Error('Popis FIS sredstava nije potpuno dohvaćen.');
  }
  function findProducts(products, query) {
    const term = query.trim().toLocaleLowerCase('hr');
    if (term.length < 2) return [];
    const matches = products.filter(p => String(p.productName).toLocaleLowerCase('hr').includes(term));
    // Alias is a search aid only: identity still requires the user's explicit choice.
    if (!matches.length && term === 'laser sc') matches.push(...products.filter(p => String(p.pppId) === '374' && String(p.productName).toLocaleUpperCase('hr') === 'LASER'));
    return matches;
  }
  function mount({ host, getStock, saveLink }) {
    let records = {}, shared = {}, products = null, busy = false, activeId = null, ticket = 0;
    try { records = JSON.parse(localStorage.getItem(CACHE) || '{}') || {}; } catch (_) {}
    const status = document.createElement('p'); status.className = 'opg-hint'; status.setAttribute('aria-live', 'polite');
    const list = document.createElement('div');
    const detail = document.createElement('div'); detail.className = 'opg-card'; detail.hidden = true;
    const searchPanel = document.createElement('div'); searchPanel.className = 'opg-card'; searchPanel.hidden = true;
    const heading = document.createElement('h3'); heading.textContent = 'Poveži točan FIS proizvod';
    const label = document.createElement('label'); label.textContent = 'Naziv sredstva'; label.htmlFor = 'fis-query';
    const query = document.createElement('input'); query.id = 'fis-query'; query.type = 'search';
    const results = document.createElement('div');
    searchPanel.append(heading, label, query, results);
    host.append(status, list, searchPanel, detail);
    function el(tag, text, cls) { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
    function button(text, action) { const b = el('button', text, 'opg-submit secondary'); b.type = 'button'; b.addEventListener('click', action); return b; }
    function persist() { try { localStorage.setItem(CACHE, JSON.stringify(records)); } catch (_) { status.textContent = 'Predmemoriju nije moguće spremiti na ovom uređaju.'; } }
    function getRecord(id) {
      const a=records[String(id)], b=shared[String(id)];
      const at=r=>Date.parse(r?.lastAttemptAt||r?.checkedAt||'')||0;
      return !b?a:!a||at(b)>=at(a)?b:a;
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
          (record.error || stale(record) ? 'Aktualnost nije potvrđena' : 'Dohvat uspješan — provjeri uvjete primjene') : 'Povezano — podaci još nisu dohvaćeni', 'opg-hint'));
        if (linked) {
          card.append(el('p', item.fis_product_name || 'FIS ID: ' + linked, 'opg-hint'));
          if (record?.origin) card.append(el('p',record.origin,'opg-hint'));
          if (record?.checkedAt) card.append(el('p', 'Posljednji uspješan dohvat: ' + new Date(record.checkedAt).toLocaleString('hr-HR'), 'opg-hint'));
          if (record?.changedAt) card.append(el('p', 'Promjena podataka zabilježena: ' + new Date(record.changedAt).toLocaleString('hr-HR'), 'opg-hint'));
          if (record?.error) card.append(el('p', record.error, 'opg-hint'));
          if (record?.product) card.append(button('Otvori spremljene uvjete', () => showRecord(record)));
          card.append(button('Provjeri i otvori uvjete', () => refresh(linked)));
        }
        card.append(button(linked ? 'Promijeni FIS povezivanje' : 'Pronađi u FIS-u', () => openSearch(item)));
        list.append(card);
      });
      window.dispatchEvent(new Event('opg:fis-stock'));
    }
    function showRecord(record) {
      detail.hidden = false; detail.replaceChildren();
      detail.append(el('h3', record.product.name), el('p', 'Status u FIS-u: ' + record.product.status),
        el('p', 'Broj registracije: ' + record.product.registration, 'opg-hint'),
        el('p', 'Prikaz nije preporuka tretiranja. Provjeri točnu kulturu, otvoreni/zaštićeni uzgoj i izvornu uputu. Nepotpuni podaci nisu odobrenje primjene.', 'opg-hint'));
      if (record.error || stale(record)) detail.append(el('p', 'Aktualnost ovih spremljenih podataka nije potvrđena.', 'opg-hint'));
      if (record.checkedAt) detail.append(el('p', 'Datum provjere: ' + new Date(record.checkedAt).toLocaleString('hr-HR'), 'opg-hint'));
      if (!verified(record)) {
        detail.append(el('p', 'Registracijski uvjeti nisu potvrđeno aktualni. Obnovi provjeru i provjeri status u službenom izvoru.', 'opg-hint'));
        const source = el('a', 'Otvori izvorni FIS zapis ↗'); source.href = SOURCE + 'pregled/' + encodeURIComponent(record.product.id); source.target = '_blank'; source.rel = 'noopener noreferrer'; detail.append(source);
        return;
      }
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
      matches.slice(0, 30).forEach(p => results.append(button(p.productName + ' · ' + (p.productRegistrationNumber || 'bez broja'), async () => {
        if (busy || !activeId) return;
        busy = true;
        try {
          await saveLink(activeId, { fis_product_id: String(p.pppId), fis_product_name: p.productName });
          searchPanel.hidden = true; status.textContent = 'Povezivanje spremljeno.';
        } catch (_) { status.textContent = 'Povezivanje nije spremljeno. Provjeri Firestore ovlasti i vezu.'; }
        finally { busy = false; render(); }
      })));
    }
    async function openSearch(item) {
      if (busy) return;
      activeId = item.id; const current = ++ticket;
      query.value = item.naziv || ''; searchPanel.hidden = false; results.textContent = 'Dohvaćam popis iz FIS-a…';
      query.focus();
      try { if (!products) { busy = true; products = await catalogue(); } if (current === ticket) filter(); }
      catch (_) { results.textContent = 'Dohvat popisa nije uspio. Pokušaj ponovno kasnije.'; }
      finally { busy = false; }
    }
    query.addEventListener('input', filter);
    render();
    const integration = { render, getStock, getRecord, showRecord, setShared: data => { shared=data; render(); } };
    scope.OpgFis.integration = integration;
    if (!document.getElementById('opg-protection-loader')) {
      const script=document.createElement('script');script.id='opg-protection-loader';script.src='./protection.js';
      script.onerror=()=>{status.textContent='Novi pregled zaštite nije učitan. FIS i postojeći odjeljci ostaju dostupni.';};document.head.append(script);
    }
    return integration;
  }
  const api = { normalize, stale, verified, findProducts, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.OpgFis = api;
})(typeof window === 'undefined' ? globalThis : window);
