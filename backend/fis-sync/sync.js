'use strict';
const { createHash } = require('node:crypto');
const BASE = 'https://fis.mps.hr/fis-public-bff/api/v1/public-search/plant-protection-product/';
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function prepare(raw, id) {
  if (!/^[1-9]\d{0,8}$/.test(String(id))) throw new Error('Neispravan FIS ID');
  if (!raw || typeof raw.basicInfo?.productName !== 'string' || !raw.basicInfo.productName.trim() ||
      typeof raw.basicInfo.registrationStatus !== 'string' || !Array.isArray(raw.culturesAndHarmfulOrganisms))
    throw new Error('Nepotpuni FIS podaci');
  const rawJson = stable(raw);
  if (Buffer.byteLength(rawJson) > 350000) throw new Error('Prevelik FIS zapis — potrebna provjera');
  return { rawJson, fingerprint: createHash('sha256').update(rawJson).digest('hex') };
}
function successRecord(previous, prepared, id, now) {
  const changed = !!previous?.fingerprint && previous.fingerprint !== prepared.fingerprint;
  return { ...prepared, productId: String(id), checkedAt: now, lastAttemptAt: now, error: null,
    changedAt: changed ? now : previous?.changedAt || null,
    previousRawJson: changed ? previous.rawJson || null : previous?.previousRawJson || null,
    source: 'https://fis.mps.hr/fis/javna-trazilica-szb/pregled/' + id,
    schemaVersion: 1 };
}
function failureRecord(now) {
  // Merge only: never renew checkedAt or discard the last successful record.
  return { lastAttemptAt: now, error: 'Automatska FIS provjera nije uspjela. Aktualnost nije potvrđena.' };
}
async function loadProduct(id, fetchImpl = fetch) {
  if (!/^[1-9]\d{0,8}$/.test(String(id))) throw new Error('Neispravan FIS ID');
  const response = await fetchImpl(BASE + id, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('FIS HTTP ' + response.status);
  const raw = await response.json();
  return prepare(raw, id);
}
async function syncStocks(db, { fetchImpl = fetch, now = () => new Date().toISOString(), logger = console } = {}) {
  const control = await db.doc('settings/fis_sync').get();
  if (control.data()?.enabled !== true) return { enabled: false, checked: 0 };
  const stocks = await db.collection('zalihe').limit(201).get();
  if (stocks.size > 200) throw new Error('Više od 200 zaliha — prilagodi ograničenje prije pokretanja');
  const ids = [...new Set(stocks.docs.map(d => d.data().fis_product_id).filter(x => x != null && x !== '').map(String))];
  if (ids.length > 40 || ids.some(id => !/^[1-9]\d{0,8}$/.test(id))) throw new Error('Previše proizvoda ili neispravno FIS povezivanje');
  let checked = 0, failed = 0, changed = 0;
  for (const id of ids) {
    const ref = db.doc('fis_cache/' + id);
    let prepared;
    try { prepared = await loadProduct(id, fetchImpl); }
    catch (error) {
      failed++; await ref.set(failureRecord(now()), { merge: true });
      logger.warn('FIS dohvat nije uspio', { productId: id, reason: error.message });
      continue;
    }
    const didChange = await db.runTransaction(async tx => {
      const snapshot = await tx.get(ref), previous = snapshot.data();
      const record = successRecord(previous, prepared, id, now());
      // Store versions only when contents change. Repeated invocation is idempotent.
      if (!previous?.fingerprint || previous.fingerprint !== prepared.fingerprint) {
        tx.set(ref.collection('versions').doc(prepared.fingerprint), { rawJson: prepared.rawJson, firstSeenAt: record.checkedAt, schemaVersion: 1 });
      }
      tx.set(ref, record);
      return !!previous?.fingerprint && previous.fingerprint !== prepared.fingerprint;
    });
    checked++; if (didChange) changed++;
  }
  const result = { enabled: true, checked, failed, changed, finishedAt: now() };
  await db.doc('fis_sync_status/daily').set(result);
  return result;
}
module.exports = { stable, prepare, successRecord, failureRecord, loadProduct, syncStocks };
