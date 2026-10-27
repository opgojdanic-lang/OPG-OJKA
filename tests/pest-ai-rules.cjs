// Run only against a local demo Firestore emulator. No production credentials.
const fs=require('node:fs');
const path=require('node:path');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc,deleteDoc,updateDoc,collection,getDocs}=require('firebase/firestore');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
(async()=>{
  if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw new Error('Only a local demo Firestore emulator is allowed');
  const env=await initializeTestEnvironment({projectId:'demo-opg-ai',firestore:{rules:fs.readFileSync(path.join(__dirname,'../backend/firestore-fis.rules.proposed'),'utf8')}});
  try{
    await env.clearFirestore(); // Dedicated demo-opg-ai emulator only; make append-only scenarios repeatable.
    let passedAllow=0,passedDeny=0;
    const allow=async promise=>{await assertSucceeds(promise);passedAllow++;};
    const deny=async promise=>{await assertFails(promise);passedDeny++;};
    const guest=env.unauthenticatedContext().firestore();
    const user=env.authenticatedContext('allowed',{firebase:{sign_in_provider:'anonymous'}}).firestore();
    const stranger=env.authenticatedContext('unapproved',{firebase:{sign_in_provider:'anonymous'},admin:true}).firestore();
    const disabled=env.authenticatedContext('disabled').firestore();
    const viewer=env.authenticatedContext('viewer').firestore();
    const finance=env.authenticatedContext('finance').firestore();
    const inventory=env.authenticatedContext('inventory').firestore();
    const allPermissions=['finance_read','finance_write','inventory_read','inventory_write','treatments_read','treatments_write','licenses_read','licenses_write','farm_read','farm_write','settings_read','settings_manage','protection_read','activities_read','activities_create','notifications_write'];
    const groups={finance:['prodaja','troskovi'],inventory:['zalihe'],treatments:['prskanje'],licenses:['licences'],farm:['parcele','sjetva_sadnja','plan','plan_status','rokovi']};
    await env.withSecurityRulesDisabled(async ctx=>{
      const db=ctx.firestore();
      for(const [uid,enabled,permissions] of [['allowed',true,allPermissions],['disabled',false,allPermissions],['viewer',true,allPermissions.filter(p=>p.endsWith('_read'))],['finance',true,['finance_read','finance_write']],['inventory',true,['inventory_read','inventory_write']],['bad-shape',true,'finance_read']])await setDoc(doc(db,'access_members',uid),{enabled,permissions});
      for(const cols of Object.values(groups))for(const col of cols)await setDoc(doc(db,col,'legacy'),{naziv:'Legacy',unio:'Display name is not ownership',extra_legacy:{retained:true}});
      await setDoc(doc(db,'zalihe/legacy'),{naziv:'Laser SC',fis_product_id:374,trenutna_kolicina:2,slika:'existing attachment',extra_legacy:{retained:true}});
      await setDoc(doc(db,'settings/app'),{prag_pdv:60000,old_unreviewed_field:'preserved'});
      for(const id of ['weather_live','rizik','spray_conditions','fis_sync'])await setDoc(doc(db,'settings',id),{});
      for(const p of ['fis_cache/374','fis_cache/374/versions/abc','fis_sync_status/daily'])await setDoc(doc(db,p),{fixture:true});
      await setDoc(doc(db,'fcm_tokens/legacy-token'),{token:'legacy-token',user:'old name',created_at:1});
    });
    for(const [scope,cols] of Object.entries(groups))for(const col of cols){
      const path=col+'/legacy';
      for(const db of [guest,stranger,disabled]){
        await deny(getDoc(doc(db,path)));await deny(getDocs(collection(db,col)));
        await deny(setDoc(doc(db,col,'blocked'),{unio:'allowed'}));await deny(updateDoc(doc(db,path),{unio:'allowed'}));await deny(deleteDoc(doc(db,path)));
      }
      await allow(getDoc(doc(viewer,path)));await allow(getDocs(collection(viewer,col)));
      await deny(setDoc(doc(viewer,col,'blocked'),{}));await deny(updateDoc(doc(viewer,path),{unio:'viewer'}));await deny(deleteDoc(doc(viewer,path)));
      await allow(setDoc(doc(user,col,'crud'),{unio:'legacy display label'}));await allow(updateDoc(doc(user,col,'crud'),{legacy_extra:'retained'}));await allow(deleteDoc(doc(user,col,'crud')));
    }
    await allow(getDoc(doc(finance,'prodaja/legacy')));await allow(setDoc(doc(finance,'troskovi/finance-only'),{naziv:'Test'}));
    await deny(getDoc(doc(finance,'zalihe/legacy')));await deny(setDoc(doc(finance,'prskanje/blocked'),{}));await deny(getDocs(collection(finance,'aktivnosti')));
    await allow(updateDoc(doc(inventory,'zalihe/legacy'),{fis_product_id:'374',fis_product_name:'LASER'}));
    const retained=(await getDoc(doc(inventory,'zalihe/legacy'))).data();assert.equal(retained.trenutna_kolicina,2);assert.equal(retained.slika,'existing attachment');assert.deepEqual(retained.extra_legacy,{retained:true});
    await deny(getDoc(doc(inventory,'prodaja/legacy')));await deny(setDoc(doc(inventory,'troskovi/blocked'),{}));
    const badShape=env.authenticatedContext('bad-shape').firestore();await deny(getDoc(doc(badShape,'prodaja/legacy')));
    await allow(getDoc(doc(user,'access_members/allowed')));await deny(getDoc(doc(user,'access_members/finance')));await deny(getDocs(collection(user,'access_members')));
    for(const db of [guest,stranger,user,viewer]){await deny(setDoc(doc(db,'access_members/new-admin'),{enabled:true,permissions:allPermissions}));await deny(updateDoc(doc(db,'access_members/allowed'),{enabled:true}));await deny(deleteDoc(doc(db,'access_members/allowed')));}
    for(const p of ['ai_private/config','ai_private/usage_2026-10','ai_private/requests/items/test'])for(const db of [guest,stranger,user,viewer]){await deny(getDoc(doc(db,p)));await deny(setDoc(doc(db,p),{enabled:true}));await deny(deleteDoc(doc(db,p)));}
    for(const p of ['fis_cache/374','fis_sync_status/daily']){
      await allow(getDoc(doc(user,p)));for(const db of [guest,stranger,disabled])await deny(getDoc(doc(db,p)));
      for(const db of [guest,stranger,user]){await deny(setDoc(doc(db,p),{rawJson:'tampered'}));await deny(deleteDoc(doc(db,p)));}
    }
    await allow(getDocs(collection(user,'fis_cache')));await deny(getDocs(collection(user,'fis_sync_status')));
    await deny(getDoc(doc(user,'fis_cache/374/versions/abc')));await deny(setDoc(doc(user,'fis_cache/374/versions/abc'),{rawJson:'tampered'}));
    for(const id of ['app','weather_live','rizik','spray_conditions'])await allow(getDoc(doc(user,'settings',id)));
    for(const db of [guest,stranger,disabled])await deny(getDoc(doc(db,'settings/app')));
    await deny(getDocs(collection(user,'settings')));await deny(getDoc(doc(user,'settings/fis_sync')));
    await allow(updateDoc(doc(user,'settings/app'),{prag_pdv:70000,plan_mraz_prag:-2,plan_nicanje_dana:null}));
    assert.equal((await getDoc(doc(user,'settings/app'))).data().old_unreviewed_field,'preserved');
    await deny(updateDoc(doc(user,'settings/app'),{old_unreviewed_field:'changed'}));await deny(updateDoc(doc(user,'settings/app'),{OPG_OPENAI_API_KEY:'not-a-real-key'}));
    await deny(updateDoc(doc(viewer,'settings/app'),{prag_pdv:0}));await deny(updateDoc(doc(user,'settings/app'),{ai_url:'http://unsafe.example'}));await deny(deleteDoc(doc(user,'settings/app')));
    await allow(setDoc(doc(user,'settings/spray_conditions'),{temp_ideal:18,temp_max:28,wind_max:3}));
    for(const id of ['weather_live','rizik','fis_sync','unknown'])await deny(setDoc(doc(user,'settings',id),{enabled:true}));
    const event={tekst:'Client observation only',unio:'Display name',ts:1,auth_uid:'allowed'};
    await allow(setDoc(doc(user,'aktivnosti/new'),event));await allow(getDocs(collection(user,'aktivnosti')));
    await deny(setDoc(doc(user,'aktivnosti/forged'),{...event,auth_uid:'other'}));await deny(updateDoc(doc(user,'aktivnosti/new'),{tekst:'rewrite'}));await deny(deleteDoc(doc(user,'aktivnosti/new')));
    const token={token:'own-token',user:'display name',created_at:1,auth_uid:'allowed'};
    await allow(setDoc(doc(user,'fcm_tokens/own-token'),token));await allow(updateDoc(doc(user,'fcm_tokens/own-token'),{created_at:2}));
    await env.withSecurityRulesDisabled(async ctx=>updateDoc(doc(ctx.firestore(),'fcm_tokens/own-token'),{server_metadata:'preserved'}));
    await allow(setDoc(doc(user,'fcm_tokens/own-token'),{...token,created_at:3},{merge:true}));
    await env.withSecurityRulesDisabled(async ctx=>assert.equal((await getDoc(doc(ctx.firestore(),'fcm_tokens/own-token'))).data().server_metadata,'preserved'));
    await deny(updateDoc(doc(user,'fcm_tokens/own-token'),{server_metadata:'tampered'}));
    await deny(getDoc(doc(user,'fcm_tokens/own-token')));await deny(getDocs(collection(user,'fcm_tokens')));
    await deny(setDoc(doc(user,'fcm_tokens/forged'),{...token,token:'forged',auth_uid:'other'}));await deny(updateDoc(doc(user,'fcm_tokens/own-token'),{auth_uid:'other'}));
    await deny(setDoc(doc(stranger,'fcm_tokens/own-token'),{...token,auth_uid:'unapproved'}));
    await deny(setDoc(doc(user,'fcm_tokens/legacy-token'),{...token,token:'legacy-token'}));await deny(deleteDoc(doc(user,'fcm_tokens/legacy-token')));
    await allow(deleteDoc(doc(user,'fcm_tokens/own-token')));
    for(const path of ['unknown/test','prodaja/legacy/private/data','settings/app/private/secret','access_members/allowed/private/secret']){await deny(getDoc(doc(user,path)));await deny(setDoc(doc(user,path),{}));}
    await env.withSecurityRulesDisabled(async ctx=>updateDoc(doc(ctx.firestore(),'access_members/allowed'),{enabled:false}));
    await deny(getDoc(doc(user,'prodaja/legacy')));await deny(setDoc(doc(user,'zalihe/revoked'),{}));
    await env.withSecurityRulesDisabled(async ctx=>updateDoc(doc(ctx.firestore(),'access_members/allowed'),{enabled:true}));
    // Google authentication is identity only; an operator's protected record grants explicit rights.
    const google=env.authenticatedContext('google-unapproved',{firebase:{sign_in_provider:'google.com'},email:'administrator@trusted.example.test',email_verified:true,admin:true}).firestore();
    const googleAdmin=env.authenticatedContext('google-admin',{firebase:{sign_in_provider:'google.com'},email_verified:true}).firestore();
    await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),'access_members/google-admin'),{enabled:true,administrator:true,permissions:allPermissions}));
    await allow(getDoc(doc(google,'access_members/google-unapproved')));
    for(const p of ['prodaja/legacy','troskovi/legacy','zalihe/legacy','prskanje/legacy','settings/app']){await deny(getDoc(doc(google,p)));await deny(setDoc(doc(google,p),{administrator:true}));await allow(getDoc(doc(googleAdmin,p)));}
    await allow(updateDoc(doc(googleAdmin,'settings/app'),{prag_pdv:65000}));
    for(const db of [google,googleAdmin]){
      await deny(setDoc(doc(db,'access_members/google-unapproved'),{enabled:true,administrator:true,permissions:allPermissions}));
      await deny(updateDoc(doc(db,'access_members/google-admin'),{permissions:allPermissions}));
      await deny(getDoc(doc(db,'ai_private/config')));await deny(setDoc(doc(db,'ai_private/config'),{enabled:true}));
    }
    console.log(`PASS: Firestore permission matrix: ${passedAllow} allowed / ${passedDeny} denied operations; no owner inferred from display names`);
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
    console.log('PASS: default-deny shared scopes, protected ACL/settings/finance/inventory/treatments/AI, legacy compatibility and local-only quota transactions');
  }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exit(1);});
