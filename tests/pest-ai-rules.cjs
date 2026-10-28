// Local demo emulator only. Exercises final Google OWNER/MEMBER policy and legacy-denial.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc,deleteDoc,updateDoc,collection,getDocs}=require('firebase/firestore');
(async()=>{
 if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw new Error('Local emulator only');
 const env=await initializeTestEnvironment({projectId:'demo-opg-ai',firestore:{rules:fs.readFileSync(path.join(__dirname,'../backend/firestore-fis.rules.proposed'),'utf8')}});
 try{
 await env.clearFirestore();let passedAllow=0,passedDeny=0;
 const allow=async p=>{await assertSucceeds(p);passedAllow++;},deny=async p=>{await assertFails(p);passedDeny++;};
 const claims={firebase:{sign_in_provider:'google.com'},email_verified:true};
 const owner=env.authenticatedContext('owner',claims).firestore(),user=env.authenticatedContext('allowed',claims).firestore();
 const rejected=[env.unauthenticatedContext().firestore(),env.authenticatedContext('stranger',{...claims,role:'OWNER',admin:true}).firestore(),env.authenticatedContext('old-anon',{firebase:{sign_in_provider:'anonymous'},email_verified:true}).firestore(),env.authenticatedContext('legacy',claims).firestore(),env.authenticatedContext('disabled',claims).firestore(),env.authenticatedContext('unverified',{firebase:{sign_in_provider:'google.com'},email_verified:false}).firestore(),env.authenticatedContext('orphan',claims).firestore()];
 const cols=['prodaja','troskovi','zalihe','prskanje','licences','parcele','sjetva_sadnja','plan','plan_status','rokovi'];
 await env.withSecurityRulesDisabled(async ctx=>{
 const db=ctx.firestore();
 for(const [uid,role,enabled]of [['owner','OWNER',true],['allowed','MEMBER',true],['old-anon','OWNER',true],['disabled','MEMBER',false],['unverified','MEMBER',true],['orphan','OWNER',true]])await setDoc(doc(db,'access_members',uid),{role,enabled,roleVersion:1});
 await setDoc(doc(db,'access_members/legacy'),{enabled:true,administrator:true,permissions:['finance_read','finance_write','settings_manage']});
 await setDoc(doc(db,'access_control/owner'),{uid:'owner'});await setDoc(doc(db,'access_control/member'),{uid:'allowed'});
 for(const col of cols)await setDoc(doc(db,col,'legacy'),{naziv:'Laser SC',trenutna_kolicina:2,unknown:{preserved:true},unio:'Old display label'});
 for(const p of ['settings/app','settings/spray_conditions','settings/weather_live','settings/rizik','fis_cache/374','fis_sync_status/daily'])await setDoc(doc(db,p),{legacy:true});
 await setDoc(doc(db,'settings/security'),{ai_url:'https://example.test/public-endpoint'});
 await setDoc(doc(db,'access_audit/event'),{actorUid:'owner'});
 });
 for(const col of cols){
 for(const db of rejected){await deny(getDoc(doc(db,col,'legacy')));await deny(getDocs(collection(db,col)));await deny(setDoc(doc(db,col,'bad'),{}));await deny(updateDoc(doc(db,col,'legacy'),{unio:'owner'}));await deny(deleteDoc(doc(db,col,'legacy')));}
 for(const db of [owner,user]){await allow(getDoc(doc(db,col,'legacy')));await allow(getDocs(collection(db,col)));await allow(setDoc(doc(db,col,'shared'),{value:1}));await allow(updateDoc(doc(db,col,'shared'),{value:2}));assert.equal((await getDoc(doc(db===owner?user:owner,col,'shared'))).data().value,2);await allow(deleteDoc(doc(db,col,'shared')));}
 }
 await allow(updateDoc(doc(user,'zalihe/legacy'),{fis_product_id:'374'}));assert.deepEqual((await getDoc(doc(owner,'zalihe/legacy'))).data().unknown,{preserved:true});
 for(const db of [owner,user,...rejected]){
 await deny(setDoc(doc(db,'access_members/self'),{enabled:true,role:'OWNER',roleVersion:1}));await deny(updateDoc(doc(db,'access_members/allowed'),{role:'OWNER'}));await deny(deleteDoc(doc(db,'access_members/owner')));await deny(setDoc(doc(db,'access_control/owner'),{uid:'allowed'}));await deny(setDoc(doc(db,'access_control/member'),{uid:'old-anon'}));
 for(const p of ['ai_private/config','ai_private/usage_2026-10','ai_private/requests/items/test']){await deny(getDoc(doc(db,p)));await deny(setDoc(doc(db,p),{allowedUids:['old-anon']}));await deny(deleteDoc(doc(db,p)));}
 for(const p of ['fis_cache/374','fis_sync_status/daily','settings/fis_sync','settings/weather_live','settings/rizik'])await deny(setDoc(doc(db,p),{enabled:true}));
 }
 for(const db of [owner,user]){
 for(const p of ['settings/app','settings/security','settings/spray_conditions','settings/weather_live','settings/rizik','fis_cache/374','fis_sync_status/daily'])await allow(getDoc(doc(db,p)));
 await allow(updateDoc(doc(db,'settings/app'),{prag_pdv:60000,plan_mraz_prag:-2}));await allow(setDoc(doc(db,'settings/spray_conditions'),{temp_ideal:18,temp_max:28,wind_max:3},{merge:true}));
 await deny(updateDoc(doc(db,'settings/app'),{ai_url:'https://evil.test'}));await deny(updateDoc(doc(db,'settings/app'),{legacy:false}));await deny(updateDoc(doc(db,'settings/app'),{OPG_OPENAI_API_KEY:'not-real'}));await deny(getDocs(collection(db,'settings')));
 await allow(setDoc(doc(db,'aktivnosti/event'),{tekst:'Business log',unio:'label',ts:1,auth_uid:db===owner?'owner':'allowed'}));await allow(getDocs(collection(db,'aktivnosti')));await allow(updateDoc(doc(db,'aktivnosti/event'),{tekst:'Corrected business note'}));await deny(updateDoc(doc(db,'aktivnosti/event'),{auth_uid:'forged'}));await allow(deleteDoc(doc(db,'aktivnosti/event')));
 await deny(setDoc(doc(db,'aktivnosti/forged'),{tekst:'forged',unio:'label',ts:1,auth_uid:'other'}));
 }
 await allow(updateDoc(doc(owner,'settings/security'),{ai_url:'https://example.test/public'}));await deny(updateDoc(doc(user,'settings/security'),{ai_url:'https://evil.test'}));await deny(updateDoc(doc(owner,'settings/security'),{ai_url:'http://unsafe.test'}));await deny(updateDoc(doc(owner,'settings/security'),{admin:true}));
 await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),'settings/security'),{unexpected_private_field:'fixture'}));
 await deny(getDoc(doc(user,'settings/security')));await deny(getDoc(doc(owner,'settings/security')));
 await env.withSecurityRulesDisabled(async c=>setDoc(doc(c.firestore(),'settings/security'),{ai_url:'https://example.test/public'}));
 await allow(getDoc(doc(owner,'access_audit/event')));await deny(getDoc(doc(user,'access_audit/event')));await deny(setDoc(doc(owner,'access_audit/fake'),{actorUid:'owner'}));
 for(const db of rejected)for(const p of ['settings/app','settings/security','fis_cache/374','fis_sync_status/daily'])await deny(getDoc(doc(db,p)));
 // A stale anonymous token for the EXACT approved UID must still fail after Google linking.
 for(const claims of [{firebase:{sign_in_provider:'anonymous'},email_verified:true},{firebase:{sign_in_provider:'google.com'},email_verified:false}]){
 const stale=env.authenticatedContext('allowed',claims).firestore();await deny(getDoc(doc(stale,'prodaja/legacy')));await deny(setDoc(doc(stale,'zalihe/stale-token'),{}));
 }
 await allow(getDoc(doc(user,'access_members/allowed')));await deny(getDoc(doc(user,'access_members/owner')));await deny(getDocs(collection(user,'access_members')));
 const token={token:'token',user:'label',created_at:1,auth_uid:'allowed'};await allow(setDoc(doc(user,'fcm_tokens/token'),token));await deny(setDoc(doc(owner,'fcm_tokens/token'),{...token,auth_uid:'owner'}));await deny(getDoc(doc(user,'fcm_tokens/token')));await allow(deleteDoc(doc(user,'fcm_tokens/token')));
 await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),'access_members/allowed'),{enabled:false}));await deny(getDoc(doc(user,'prodaja/legacy')));
 await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),'access_members/allowed'),{enabled:true}));
 for(const p of ['unknown/test','prodaja/legacy/private/secret','access_members/owner/private/data']){await deny(getDoc(doc(owner,p)));await deny(setDoc(doc(owner,p),{}));}
 console.log(`PASS: Firestore OWNER/MEMBER matrix: ${passedAllow} allowed / ${passedDeny} denied operations; shared data, legacy anonymous rejection, owner-only security and no client role writes`);
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
      const {manageMember,securityControl}=require('../backend/pest-ai/administration');
      const ownerAuth={uid:'owner',token:claims};
      const mockAuth={getUser:async uid=>({uid,emailVerified:true,disabled:false,providerData:[{providerId:'google.com'}]})};
      await assert.rejects(manageMember(db,mockAuth,{uid:'allowed',token:claims},{uid:'target',enabled:true}),e=>e.code==='permission-denied');
      await manageMember(db,mockAuth,ownerAuth,{uid:'allowed',enabled:false});
      const approvals=await Promise.allSettled(['target-a','target-b'].map(uid=>manageMember(db,mockAuth,ownerAuth,{uid,enabled:true})));
      assert.equal(approvals.filter(r=>r.status==='fulfilled').length,1);
      const selected=(await db.doc('access_control/member').get()).data().uid;assert.ok(['target-a','target-b'].includes(selected));
      await securityControl(db,ownerAuth,{control:'ai',enabled:false});assert.equal((await db.doc('ai_private/usage_2026-10').get()).data().attempts,100);
      assert.ok((await db.collection('access_audit').get()).size>=3);
      console.log('PASS: real OWNER transactions serialize competing MEMBER approvals, reject MEMBER administration, audit changes and preserve AI quota');
    }finally{await deleteApp(app);}
    await env.withSecurityRulesDisabled(async c=>setDoc(doc(c.firestore(),'prodaja/recovery'),{retained:true}));
    const frozen=await initializeTestEnvironment({projectId:'demo-opg-ai',firestore:{rules:fs.readFileSync(path.join(__dirname,'../backend/firestore-emergency.rules'),'utf8')}});
    try{await assertFails(getDoc(doc(frozen.authenticatedContext('owner',claims).firestore(),'prodaja/recovery')));await assertFails(setDoc(doc(frozen.authenticatedContext('owner',claims).firestore(),'access_members/owner'),{role:'OWNER'}));await frozen.withSecurityRulesDisabled(async c=>assert.equal((await getDoc(doc(c.firestore(),'prodaja/recovery'))).data().retained,true));console.log('PASS: emergency deny-all blocks clients, retains data and preserves trusted Admin recovery');}finally{await frozen.cleanup();}
    console.log('PASS: default-deny shared scopes, protected ACL/settings/finance/inventory/treatments/AI, legacy compatibility and local-only quota transactions');
  }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exit(1);});
