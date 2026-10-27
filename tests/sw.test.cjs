const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function worker({fetchImpl,open,match}={}){
  const listeners={};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../sw.js'),'utf8'),{self:{location:{origin:'https://example.test'},addEventListener:(name,fn)=>listeners[name]=fn},URL,fetch:fetchImpl,caches:{open,match}});return listeners.fetch;
}
test('service worker clones before page consumes response and waits for cache write',async()=>{
  let saved;
  const handler=worker({fetchImpl:async()=>new Response('page'),open:async()=>{await new Promise(r=>setTimeout(r,5));return{put:async(_,r)=>{saved=await r.text();}};}});
  let response;const pending=[];
  handler({request:{method:'GET',url:'https://example.test/'},respondWith:p=>response=p,waitUntil:p=>pending.push(p)});
  assert.equal(await (await response).text(),'page');await Promise.all(pending);assert.equal(saved,'page');
});
test('cache failure leaves successful network response usable',async()=>{
  const handler=worker({fetchImpl:async()=>new Response('page'),open:async()=>{throw new Error('quota');}});let response;const pending=[];
  handler({request:{method:'GET',url:'https://example.test/'},respondWith:p=>response=p,waitUntil:p=>pending.push(p)});assert.equal(await(await response).text(),'page');await Promise.all(pending);
});
test('external regulatory requests are never served from app cache',()=>{
  let intercepted=false;worker()({request:{method:'GET',url:'https://fis.mps.hr/product'},respondWith:()=>intercepted=true});assert.equal(intercepted,false);
});
test('activation expires previous app assets with private seeds while preserving other applications caches',async()=>{
  const listeners={},deleted=[];let claimed=false;
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../sw.js'),'utf8'),{self:{location:{origin:'https://example.test'},clients:{claim:async()=>{claimed=true;}},addEventListener:(name,fn)=>listeners[name]=fn},URL,caches:{keys:async()=>['opg-evidencija-v25','opg-evidencija-v26','opg-evidencija-v27','opg-evidencija-v28','opg-evidencija-v29','another-app'],delete:async name=>deleted.push(name)}});
  let pending;listeners.activate({waitUntil:p=>pending=p});await pending;assert.deepEqual(deleted,['opg-evidencija-v25','opg-evidencija-v26','opg-evidencija-v27','opg-evidencija-v28']);assert.equal(claimed,true);
});
