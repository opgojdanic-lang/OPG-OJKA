// Run only against a local demo Firestore emulator. No production credentials.
const fs=require('node:fs');
const path=require('node:path');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc,deleteDoc}=require('firebase/firestore');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
(async()=>{
  const env=await initializeTestEnvironment({projectId:'demo-opg-ai',firestore:{rules:fs.readFileSync(path.join(__dirname,'../backend/firestore-fis.rules.proposed'),'utf8')}});
  try{
    const guest=env.unauthenticatedContext().firestore();
    const user=env.authenticatedContext('allowed').firestore();
    for(const p of ['ai_private/config','ai_private/usage_2026-10','ai_private/requests/items/test']){
      await assertFails(getDoc(doc(guest,p)));await assertFails(setDoc(doc(guest,p),{enabled:true}));
      await assertFails(getDoc(doc(user,p)));await assertFails(setDoc(doc(user,p),{enabled:true}));
    }
    for(const p of ['fis_cache/42','fis_cache/42/versions/abc','fis_sync_status/daily']){
      await assertSucceeds(getDoc(doc(user,p)));await assertFails(setDoc(doc(user,p),{rawJson:'tampered'}));
    }
    await assertSucceeds(setDoc(doc(user,'zalihe/test'),{naziv:'Test'}));
    await assertSucceeds(getDoc(doc(user,'zalihe/test')));
    await assertFails(getDoc(doc(guest,'zalihe/test')));
    // Exercise real Admin SDK transactions under concurrency, still with a mocked provider.
    if(!process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Local emulator host is required');
    const backendRequire=require('node:module').createRequire(path.join(__dirname,'../backend/pest-ai/package.json'));
    const {initializeApp,deleteApp}=backendRequire('firebase-admin/app');
    const {getFirestore}=backendRequire('firebase-admin/firestore');
    const app=initializeApp({projectId:'demo-opg-ai'},'ai-quota-test');
    try{
      const db=getFirestore(app),{analyze}=require('../backend/pest-ai/analysis');
      await db.doc('ai_private/config').set({enabled:true,allowedUids:['allowed']});
      await db.doc('ai_private/usage_2026-10').set({attempts:99});
      for(const p of ['ai_private/config','ai_private/usage_2026-10']){
        await assertFails(getDoc(doc(user,p)));await assertFails(setDoc(doc(user,p),{attempts:0}));await assertFails(deleteDoc(doc(user,p)));
      }
      const image='data:image/jpeg;base64,'+Buffer.from([255,216,255,192,0,11,8,0,10,0,10,1,1,17,0,255,217]).toString('base64');
      let calls=0;const options={apiKey:'emulator-test',now:()=>new Date('2026-10-26T10:00:00Z'),fetchImpl:async()=>{calls++;return{ok:true,json:async()=>({status:'completed',usage:{input_tokens:100,output_tokens:100},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({assessment:'insufficient_evidence',summary:'Nema dovoljno znakova.',visibleSigns:[],possibleCauses:[],nextPhotos:['Bliži kadar lista.'],fieldChecks:[]})}]}]})};}};
      const requests=Array.from({length:4},()=>analyze(db,'allowed',{requestId:randomUUID(),culture:'TIKVICA',note:'Test',photos:[image]},options));
      const outcomes=await Promise.allSettled(requests);
      assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(calls,1);
      assert.equal((await db.doc('ai_private/usage_2026-10').get()).data().attempts,100);
      console.log('PASS: real Firestore transactions admit only one of four parallel requests at 99/100');
    }finally{await deleteApp(app);}
    console.log('PASS: AI private configuration/quota/request records deny all clients; FIS is read-only; existing authenticated stock access preserved');
  }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exit(1);});
