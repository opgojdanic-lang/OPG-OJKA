'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const roles=require('../backend/pest-ai/roles'),administration=require('../backend/pest-ai/administration');
// The onCall SDK normally verifies the Firebase ID token before supplying request.auth.
// These tests exercise handler wiring using that verified-context contract, not JWT crypto or production.
function fixture(){
 const state={reads:0,writes:0,providerEntries:[],usageEntries:[],secretReads:0,authUserReads:0};
 const records=new Map(Object.entries({'access_members/owner':{enabled:true,roleVersion:1,role:'OWNER'},'access_members/member':{enabled:true,roleVersion:1,role:'MEMBER'},'access_control/owner':{uid:'owner'},'access_control/member':{uid:'member'}}));
 const db={doc:p=>({get:async()=>{state.reads++;return{data:()=>records.get(p)};}}),runTransaction:()=>{state.writes++;throw new Error('Unexpected transaction');}};
 class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
 class AnalysisError extends Error{}
 const mocks={
 'firebase-functions/v2/https':{onCall:(options,handler)=>({options,handler}),HttpsError},
 'firebase-functions/params':{defineSecret:()=>({value:()=>{state.secretReads++;return'synthetic-server-secret';}})},
 'firebase-admin/app':{initializeApp:()=>{}},
 'firebase-admin/firestore':{getFirestore:()=>db},
 'firebase-admin/auth':{getAuth:()=>({getUser:()=>{state.authUserReads++;throw new Error('Unexpected Auth write/read');}})},
 './roles':roles,'./administration':administration,
 './analysis':{AnalysisError,analyze:async(_db,uid,data)=>{state.providerEntries.push({uid,data});return{acceptedUid:uid};},status:async(_db,uid)=>{state.usageEntries.push(uid);return{acceptedUid:uid};}}
 };
 const exports={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../backend/pest-ai/index.js'),'utf8'),{exports,require:name=>{assert.ok(Object.hasOwn(mocks,name));return mocks[name];}});
 return{exports,state,records};
}
const auth=uid=>({uid,token:{firebase:{sign_in_provider:'google.com'},email_verified:true}});
test('public callable entry rejects missing Firebase auth and body-spoofed UID before AI, quota or key access',async()=>{
 const f=fixture();for(const name of ['pestPhotoAnalyze','pestPhotoUsage'])await assert.rejects(f.exports[name].handler({data:{uid:'owner',auth:auth('owner')}}),e=>e.code==='unauthenticated');
 assert.equal(f.state.reads,0);assert.equal(f.state.secretReads,0);assert.equal(f.state.providerEntries.length,0);assert.equal(f.state.usageEntries.length,0);assert.equal(f.state.writes,0);
});
test('both Google OWNER and MEMBER reach AI/usage using verified caller UID, never a body UID',async()=>{
 const f=fixture();for(const uid of ['owner','member'])for(const name of ['pestPhotoAnalyze','pestPhotoUsage'])assert.deepEqual(await f.exports[name].handler({auth:auth(uid),data:{uid:'someone-else'}}),{acceptedUid:uid});
 assert.deepEqual(f.state.providerEntries.map(x=>x.uid),['owner','member']);assert.deepEqual(f.state.usageEntries,['owner','member']);assert.equal(f.state.secretReads,2);assert.equal(f.state.writes,0);
});
test('anonymous, unapproved, disabled and orphaned role callers cannot enter AI handlers',async()=>{
 const f=fixture();f.records.set('access_members/disabled',{enabled:false,roleVersion:1,role:'OWNER'});f.records.set('access_members/orphan',{enabled:true,roleVersion:1,role:'OWNER'});
 const callers=[{uid:'owner',token:{firebase:{sign_in_provider:'anonymous'},email_verified:true}},auth('unapproved'),auth('disabled'),auth('orphan')];
 for(const a of callers)for(const name of ['pestPhotoAnalyze','pestPhotoUsage'])await assert.rejects(f.exports[name].handler({auth:a,data:{}}),e=>e.code==='permission-denied');
 assert.equal(f.state.secretReads,0);assert.equal(f.state.providerEntries.length,0);assert.equal(f.state.usageEntries.length,0);assert.equal(f.state.writes,0);
});
test('MEMBER or unauthenticated caller cannot use privileged management callable entry points',async()=>{
 const f=fixture();for(const name of ['opgManageMember','opgSecurityControl'])for(const a of [undefined,auth('member')])await assert.rejects(f.exports[name].handler({auth:a,data:{uid:'target',control:'ai',enabled:true}}),e=>['permission-denied','unauthenticated'].includes(e.code));
 assert.equal(f.state.writes,0);assert.equal(f.state.authUserReads,0);assert.equal(f.state.secretReads,0);
});
