'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {requireRole,BUSINESS_PERMISSIONS,OWNER_PERMISSIONS}=require('../backend/pest-ai/roles');
const {manageMember,securityControl,getMemberStatus}=require('../backend/pest-ai/administration');
const {access,PERMISSIONS}=require('../auth');
const claims=uid=>({uid,token:{firebase:{sign_in_provider:'google.com'},email_verified:true}});
function database(){
 const store=new Map(Object.entries({'access_members/owner':{role:'OWNER',roleVersion:1,enabled:true},'access_members/member':{role:'MEMBER',roleVersion:1,enabled:true},'access_control/owner':{uid:'owner'},'access_control/member':{uid:'member'},'ai_private/config':{enabled:true,secretMetadata:'preserved'},'ai_private/usage_2026-10':{attempts:42}}));let reads=0,writes=0;
 const doc=path=>({path,get:async()=>({exists:store.has(path),data:()=>structuredClone(store.get(path))})});
 const db={doc,collection:path=>({doc:()=>doc(path+'/'+ ++reads)}),runTransaction:async fn=>{const pending=[];const result=await fn({get:r=>r.get(),set:(r,v,o)=>pending.push(()=>{writes++;store.set(r.path,o?.merge?{...store.get(r.path),...v}:v);}),delete:r=>pending.push(()=>{writes++;store.delete(r.path);})});pending.forEach(f=>f());return result;}};
 return {db,store,writes:()=>writes};
}
const adminAuth={getUser:async uid=>({uid,disabled:false,emailVerified:true,providerData:[{providerId:'google.com'}]})};
test('frontend/server role catalogs agree; MEMBER has all business writes, OWNER alone manages security/users',()=>{
 assert.deepEqual(PERMISSIONS,BUSINESS_PERMISSIONS);
 for(const role of ['OWNER','MEMBER'])assert.deepEqual(access({enabled:true,roleVersion:1,role},{isAnonymous:false,emailVerified:true,providerData:[{providerId:'google.com'}]}).permissions,role==='OWNER'?OWNER_PERMISSIONS:BUSINESS_PERMISSIONS);
});
test('callable gate rejects anonymous, unapproved, forged claims, legacy ACL, wrong binding and revoked OWNER',async()=>{
 const {db,store}=database();assert.equal(await requireRole(db,claims('member')),'MEMBER');assert.equal(await requireRole(db,claims('owner'),true),'OWNER');
 store.set('access_members/old',{enabled:true,administrator:true,permissions:OWNER_PERMISSIONS});
 for(const a of [null,{uid:'member',token:{firebase:{sign_in_provider:'anonymous'},email_verified:true}},{uid:'member',token:{firebase:{sign_in_provider:'google.com'},email_verified:false}},claims('stranger'),claims('old'),{...claims('member'),token:{role:'OWNER'} }])await assert.rejects(requireRole(db,a));
 await assert.rejects(requireRole(db,claims('member'),true));store.set('access_control/owner',{uid:'other'});await assert.rejects(requireRole(db,claims('owner')));
});
test('only OWNER can approve/revoke one MEMBER; cannot promote self, replace OWNER or silently replace MEMBER',async()=>{
 const {db,store,writes}=database();for(const a of [claims('member'),claims('unapproved'),null])await assert.rejects(manageMember(db,adminAuth,a,{uid:'target',enabled:true}));assert.equal(writes(),0);
 for(const data of [{uid:'owner',enabled:false},{uid:'target',enabled:true,role:'OWNER'},{uid:'target',enabled:true}])await assert.rejects(manageMember(db,adminAuth,claims('owner'),data));
 await manageMember(db,adminAuth,claims('owner'),{uid:'member',enabled:false});assert.equal(store.get('access_members/member').enabled,false);assert.equal(store.has('access_control/member'),false);
 await manageMember(db,adminAuth,claims('owner'),{uid:'target',enabled:true});assert.equal(store.get('access_members/target').role,'MEMBER');assert.equal(await requireRole(db,claims('target')),'MEMBER');assert.equal(store.get('access_control/owner').uid,'owner');
 await assert.rejects(manageMember(db,{getUser:async uid=>({uid,emailVerified:false,providerData:[]})},claims('owner'),{uid:'target',enabled:true}));
 assert.ok([...store.keys()].some(k=>k.startsWith('access_audit/')));
});
test('security controls are OWNER-only, finite fields; preserve quota and private config',async()=>{
 const {db,store,writes}=database();await assert.rejects(securityControl(db,claims('member'),{control:'ai',enabled:false}));await assert.rejects(securityControl(db,claims('owner'),{control:'allowedUids',enabled:true}));assert.equal(writes(),0);
 await securityControl(db,claims('owner'),{control:'ai',enabled:false});assert.equal(store.get('ai_private/config').secretMetadata,'preserved');assert.equal(store.get('ai_private/usage_2026-10').attempts,42);await securityControl(db,claims('owner'),{control:'fis_sync',enabled:false});assert.equal(store.get('settings/fis_sync').enabled,false);
});
test('transaction rechecks OWNER after preflight to prevent a revoked owner from approving users or controls',async()=>{
 for(const fn of [db=>manageMember(db,adminAuth,claims('owner'),{uid:'member',enabled:true}),db=>securityControl(db,claims('owner'),{control:'ai',enabled:true})]){
 const {db,store,writes}=database(),run=db.runTransaction;db.runTransaction=cb=>{store.set('access_members/owner',{role:'OWNER',roleVersion:1,enabled:false});return run(cb);};await assert.rejects(fn(db));assert.equal(writes(),0);
 }
});


test('only OWNER can read MEMBER status',async()=>{
 const {db,store,writes}=database();

 assert.deepEqual(await getMemberStatus(db,claims('owner'),{}),{uid:'member'});

 for(const actor of [
  claims('member'),
  claims('stranger'),
  null,
  {uid:'owner',token:{firebase:{sign_in_provider:'anonymous'},email_verified:true}}
 ])await assert.rejects(getMemberStatus(db,actor,{}));

 await assert.rejects(getMemberStatus(db,claims('owner'),{enabled:true}));

 store.delete('access_control/member');
 assert.deepEqual(await getMemberStatus(db,claims('owner'),{}),{uid:null});

 store.set('access_members/owner',{role:'OWNER',roleVersion:1,enabled:false});
 await assert.rejects(getMemberStatus(db,claims('owner'),{}));

 assert.equal(writes(),0);
});
