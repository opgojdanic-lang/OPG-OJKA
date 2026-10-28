const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prepare, successRecord, failureRecord, loadProduct, syncStocks } = require('../backend/fis-sync/sync');
const product = {basicInfo:{productName:'Test',registrationStatus:'REGISTRIRAN'},culturesAndHarmfulOrganisms:[]};
test('canonical fingerprint ignores object key order', () => {
  assert.equal(prepare(product, 1).fingerprint, prepare({culturesAndHarmfulOrganisms:[],basicInfo:{registrationStatus:'REGISTRIRAN',productName:'Test'}},1).fingerprint);
});
test('malformed, invalid ID and oversized records fail closed', () => {
  assert.throws(()=>prepare({},1)); assert.throws(()=>prepare(product,'../settings'));
  assert.throws(()=>prepare({...product,large:'x'.repeat(350001)},1));
});
test('failure preserves last successful check and data when merged', () => {
  const old = successRecord(null,prepare(product,1),1,'2026-10-26T05:00:00Z');
  const next = {...old,...failureRecord('2026-10-27T05:00:00Z')};
  assert.equal(next.checkedAt,old.checkedAt); assert.equal(next.rawJson,old.rawJson); assert.ok(next.error);
});
test('changed record keeps previous version; unchanged checks retain change date', () => {
  const old = successRecord(null,prepare(product,1),1,'A');
  const next = successRecord(old,prepare({...product,restriction:'changed'},1),1,'B');
  assert.equal(next.previousRawJson,old.rawJson);assert.equal(next.changedAt,'B');
  const last = successRecord(next,prepare({...product,restriction:'changed'},1),1,'C');
  assert.equal(last.changedAt,'B'); assert.equal(last.checkedAt,'C');
});
test('HTTP failure is not a successful empty product', async () => {
  await assert.rejects(loadProduct(1,async()=>({ok:false,status:503})),/503/);
});
test('disabled job makes no stock or network requests', async () => {
  let called=false;
  const result=await syncStocks({doc:()=>({get:async()=>({data:()=>({enabled:false})}),set:async data=>{assert.equal(data.outcome,'disabled');}})},{fetchImpl:()=>{called=true;}});
  assert.equal(result.enabled,false); assert.equal(called,false);
});
test('daily job deduplicates stocks, stores versions once and preserves cache on failure', async () => {
  const store = new Map([['settings/fis_sync',{enabled:true}]]);
  const refs = path => ({
    path,
    get:async()=>({data:()=>store.get(path)}),
    set:async(data,options)=>store.set(path,options?.merge?{...store.get(path),...data}:data),
    collection:name=>({doc:id=>refs(path+'/'+name+'/'+id)})
  });
  const db={doc:refs,collection:name=>({limit:()=>({get:async()=>({size:2,docs:[{data:()=>({fis_product_id:'1'})},{data:()=>({fis_product_id:'1'})}]})})}),
    runTransaction:async fn=>fn({get:ref=>ref.get(),set:(ref,data)=>{store.set(ref.path,data);}})};
  let calls=0;
  const options={fetchImpl:async()=>{calls++;return{ok:true,json:async()=>product};},now:()=> '2026-10-26T05:00:00Z',logger:{warn:()=>{}}};
  const first=await syncStocks(db,options);
  assert.equal(calls,1);assert.equal(first.checked,1);assert.equal(first.scanned,2);assert.equal(first.attempted,1);assert.equal(first.updated,1);assert.equal(first.changed,0);assert.equal(first.outcome,'completed');
  await syncStocks(db,options);
  assert.equal([...store.keys()].filter(k=>k.includes('/versions/')).length,1);
  const old=store.get('fis_cache/1');
  const failure=await syncStocks(db,{...options,now:()=> '2026-10-27T05:00:00Z',fetchImpl:async()=>({ok:false,status:503})});
  assert.equal(failure.failed,1);assert.equal(failure.attempted,1);assert.equal(failure.checked,0);assert.equal(failure.updated,0);assert.equal(failure.outcome,'unavailable');assert.deepEqual(failure.errorsByKind,{http_503:1});assert.equal(store.get('fis_cache/1').checkedAt,old.checkedAt);
  assert.ok(store.get('fis_cache/1').error);
});

test('empty inventory and unlinked inventory are distinct successful no-op outcomes', async () => {
  for (const [items,outcome] of [[[],'no_stock'],[[{naziv:'Laser SC'}],'no_links']]) {
    let saved;
    const db={doc:()=>({get:async()=>({data:()=>({enabled:true})}),set:async r=>{saved=r;}}),collection:()=>({limit:()=>({get:async()=>({size:items.length,docs:items.map(d=>({data:()=>d}))})})})};
    const r=await syncStocks(db,{logger:{},fetchImpl:()=>assert.fail('no linked products: no fetch')});
    assert.equal(r.outcome,outcome);assert.equal(r.scanned,items.length);assert.equal(r.checked,0);assert.equal(r.attempted,0);assert.equal(saved,r);
  }
});

test('invalid JSON, missing product and timeout have safe distinct error categories', async()=>{
  await assert.rejects(loadProduct(374,async()=>({ok:true,json:async()=>null})),e=>e.code==='invalid_payload');
  await assert.rejects(loadProduct(374,async()=>({ok:true,json:async()=>{throw new Error('untrusted body');}})),e=>e.code==='invalid_json'&&!e.message.includes('untrusted'));
  await assert.rejects(loadProduct(374,async()=>{throw Object.assign(new Error('secret-bearing URL'),{name:'TimeoutError'});}),e=>e.code==='timeout'&&!e.message.includes('secret'));
});

test('a malformed legacy stock link cannot block valid LASER 374 checks or form a cache path',async()=>{
  const store=new Map([['settings/fis_sync',{enabled:true}]]);
  const refs=path=>({path,get:async()=>({data:()=>store.get(path)}),set:async r=>store.set(path,r),collection:name=>({doc:id=>refs(path+'/'+name+'/'+id)})});
  const db={doc:refs,collection:()=>({limit:()=>({get:async()=>({size:2,docs:[{data:()=>({fis_product_id:374})},{data:()=>({fis_product_id:'../private'})}]})})}),runTransaction:async fn=>fn({get:r=>r.get(),set:(r,d)=>store.set(r.path,d)})};
  let calls=0;const r=await syncStocks(db,{logger:{info:()=>{},warn:()=>{}},fetchImpl:async url=>{calls++;assert.ok(url.endsWith('/374'));return{ok:true,json:async()=>product};}});
  assert.equal(calls,1);assert.equal(r.checked,1);assert.equal(r.attempted,1);assert.equal(r.invalidLinks,1);assert.equal(r.outcome,'partial');assert.ok(store.has('fis_cache/374'));assert.ok([...store.keys()].every(k=>!k.includes('..')));
});
