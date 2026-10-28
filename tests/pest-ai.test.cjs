'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {analyze,status,validateInput,buildRequest,monthKey,usageCost,readResult}=require('../backend/pest-ai/analysis');
// Small JPEG header fixture; the provider is mocked, no photos leave the tests.
const jpeg=(w=10,h=10)=>{const b=Buffer.from([255,216,255,192,0,11,8,h>>8,h&255,w>>8,w&255,1,1,17,0,255,217]);return 'data:image/jpeg;base64,'+b.toString('base64');};
const input=()=>({requestId:randomUUID(),culture:'PAPRIKA BABURA',note:'Srebrnkasti tragovi na listu',photos:[jpeg()]});
const result={assessment:'possible_causes',summary:'Moguć je napad tripsa; potreban pregled.',visibleSigns:['Srebrnkasti tragovi'],possibleCauses:[{name:'Trips',kind:'pest',confidence:'low',evidence:'Tragovi na listu',check:'Pregledaj cvijet i donju stranu lista.'}],nextPhotos:['Makro fotografija kukca'],fieldChecks:['Pregledaj više biljaka.']};
const raw=(r=result)=>({status:'completed',usage:{input_tokens:1000,output_tokens:200,input_tokens_details:{cached_tokens:100}},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(r)}]}]});
function database(seed={}){
  const store=new Map(Object.entries({'access_members/allowed':{enabled:true,role:'MEMBER',roleVersion:1},'access_control/member':{uid:'allowed'},'ai_private/config':{enabled:true,allowedUids:['allowed']},...seed}));
  let queue=Promise.resolve();
  const doc=path=>({path,get:async()=>({data:()=>structuredClone(store.get(path))})});
  const db={doc,runTransaction:fn=>{
    const next=queue.then(async()=>{const writes=[];const value=await fn({get:ref=>ref.get(),set:(ref,data,options)=>writes.push([ref.path,data,options])});for(const [path,data,options]of writes)store.set(path,options?.merge?{...store.get(path),...structuredClone(data)}:structuredClone(data));return value;});
    queue=next.catch(()=>{});return next;
  }};
  return {db,store};
}
const opts=(fetchImpl=async()=>({ok:true,json:async()=>raw()}))=>({apiKey:'test-key-not-real',fetchImpl,now:()=>new Date('2026-10-26T10:00:00Z')});
test('Zagreb month boundary and strict image/input validation',()=>{
  assert.equal(monthKey(new Date('2026-10-31T23:30:00Z')),'2026-11');
  assert.equal(validateInput(input()).photos.length,1);
  for(const change of [{photos:[]},{photos:[jpeg(),jpeg(),jpeg(),jpeg()]},{photos:['https://example.com/a.jpg']},{photos:[jpeg(701)]},{note:'x'.repeat(1201)},{culture:'unknown'},{requestId:'../../quota'}])assert.throws(()=>validateInput({...input(),...change}),e=>e.code==='invalid-argument');
});
test('request has structured uncertain results, image inputs, no storage and bounded output',()=>{
  const b=buildRequest(validateInput(input()));assert.equal(b.store,false);assert.equal(b.max_output_tokens,2500);assert.equal(b.text.format.strict,true);assert.equal(b.input[0].content[1].type,'input_image');assert.equal(b.tools,undefined);
});
test('disabled, unauthenticated and unapproved users cannot call paid API',async()=>{
  let calls=0;const options=opts(async()=>{calls++;});
  for(const [uid,config,code]of [[undefined,{enabled:true,allowedUids:['allowed']},'unauthenticated'],['stranger',{enabled:true,allowedUids:['allowed']},'permission-denied'],['allowed',{enabled:false,allowedUids:['allowed']},'failed-precondition'],['allowed',undefined,'failed-precondition']]){
    const {db}=database({'ai_private/config':config});await assert.rejects(analyze(db,uid,input(),options),e=>e.code===code);
  }assert.equal(calls,0);
});
test('missing key and invalid image never reserve quota',async()=>{
  const {db,store}=database();await assert.rejects(analyze(db,'allowed',input(),{apiKey:''}),e=>e.code==='failed-precondition');await assert.rejects(analyze(db,'allowed',{...input(),photos:['bad']},opts()));assert.equal(store.size,3);
});
test('one successful request is charged once; replay and changed-payload ID are safe',async()=>{
  const {db,store}=database();let calls=0;const options=opts(async()=>{calls++;return{ok:true,json:async()=>raw()};});const data=input();
  const first=await analyze(db,'allowed',data,options),second=await analyze(db,'allowed',data,options);
  assert.equal(calls,1);assert.deepEqual(first.result,result);assert.equal(second.replayed,true);assert.equal(second.usage.attempts,1);
  await assert.rejects(analyze(db,'allowed',{...data,note:'Changed'},options),e=>e.code==='invalid-argument');
  const serialized=JSON.stringify([...store]);assert.equal(serialized.includes('base64'),false);assert.equal(serialized.includes(data.note),false);assert.equal(serialized.includes('test-key-not-real'),false);
});
test('concurrent requests at attempt 99 admit one call only',async()=>{
  const {db}=database({'ai_private/usage_2026-10':{attempts:99}});let calls=0;const options=opts(async()=>{calls++;return{ok:true,json:async()=>raw()};});
  const all=await Promise.allSettled([analyze(db,'allowed',input(),options),analyze(db,'allowed',input(),options)]);
  assert.equal(all.filter(x=>x.status==='fulfilled').length,1);assert.equal(calls,1);assert.equal((await status(db,'allowed',options.now())).attempts,100);
});
test('concurrent duplicate stays pending or replays, never calls provider twice',async()=>{
  const {db}=database();let calls=0;const options=opts(async()=>{calls++;return{ok:true,json:async()=>raw()};});const data=input();
  const all=await Promise.allSettled([analyze(db,'allowed',data,options),analyze(db,'allowed',data,options)]);assert.equal(calls,1);assert.ok(all.some(x=>x.status==='fulfilled'));
});
test('provider HTTP failure and timeout retain quota and unknown cost',async()=>{
  for(const fetchImpl of [async()=>({ok:false,status:429}),async()=>{throw new Error('timeout');}]){
    const {db}=database();const options=opts(fetchImpl);const data=input();await assert.rejects(analyze(db,'allowed',data,options),e=>e.code==='unavailable');
    const u=await status(db,'allowed',options.now());assert.equal(u.attempts,1);assert.equal(u.unaccounted,1);assert.equal(u.estimatedUsd,0);
    await assert.rejects(analyze(db,'allowed',data,options),e=>e.code==='already-exists');
  }
});
test('refused, malformed and incomplete output never becomes a diagnosis; known usage is recorded',async()=>{
  const variants=[{...raw(),status:'incomplete'},{...raw(),output:[{type:'message',content:[{type:'refusal',refusal:'No'}]}]},raw({...result,assessment:'insufficient_evidence'}),{...raw(),output:[{type:'message',content:[{type:'output_text',text:'not json'}]}]}];
  for(const response of variants){const {db}=database();const options=opts(async()=>({ok:true,json:async()=>response}));await assert.rejects(analyze(db,'allowed',input(),options),e=>e.code==='unavailable');const u=await status(db,'allowed',options.now());assert.equal(u.accounted,1);assert.equal(u.successful,0);assert.ok(u.estimatedUsd>0);}
});
test('insufficient evidence may return no causes, never forced identification',()=>{
  const r={...result,assessment:'insufficient_evidence',possibleCauses:[]};assert.deepEqual(readResult(raw(r)),r);
});
test('cost uses returned token usage, output including reasoning, and cached-input rate',()=>{
  const c=usageCost(raw().usage);assert.ok(Math.abs(c.estimatedUsd-0.00381)<1e-10);assert.equal(usageCost({input_tokens:2,output_tokens:1,input_tokens_details:{cached_tokens:3}}),null);assert.equal(usageCost({}),null);
});
test('sample stops at 20 accounted responses while monthly totals keep growing',async()=>{
  const {db}=database();for(let i=0;i<22;i++)await analyze(db,'allowed',input(),opts());const u=await status(db,'allowed',opts().now());assert.equal(u.sampleCount,20);assert.equal(u.accounted,22);assert.ok(Math.abs(u.sampleUsd-20*0.00381)<1e-10);assert.equal(u.unaccounted,0);
});
test('new Zagreb month has fresh quota; prior request replay does not consume it',async()=>{
  const {db}=database();const data=input();await analyze(db,'allowed',data,opts());const next={...opts(),now:()=>new Date('2026-11-01T05:00:00Z')};const replay=await analyze(db,'allowed',data,next);assert.equal(replay.replayed,true);assert.equal(replay.usage.attempts,0);assert.equal((await analyze(db,'allowed',input(),next)).usage.attempts,1);
});
test('AI shutdown blocks newly admitted requests and usage, but accounts for an already-running provider call',async()=>{
 const {db,store}=database();let entered,release,calls=0;
 const started=new Promise(resolve=>entered=resolve),paused=new Promise(resolve=>release=resolve);
 const options=opts(async()=>{calls++;entered();await paused;return{ok:true,json:async()=>raw()};});
 const inFlight=analyze(db,'allowed',input(),options);await started;
 store.set('ai_private/config',{enabled:false,allowedUids:['allowed']});
 await assert.rejects(analyze(db,'allowed',input(),options),e=>e.code==='failed-precondition');
 await assert.rejects(status(db,'allowed',options.now()),e=>e.code==='failed-precondition');
 assert.equal(calls,1);assert.equal(store.get('ai_private/usage_2026-10').attempts,1);
 release();const done=await inFlight;assert.equal(done.usage.attempts,1);assert.equal(done.usage.accounted,1);assert.ok(done.usage.estimatedUsd>0);
});
