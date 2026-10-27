'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHttpRoleGate}=require('../backend/pest-ai/http-role-gate');
const client=require('../fis-photo-client');
const URL='https://europe-west1-opg-ojka.cloudfunctions.net/fisPhotoLookup';
const claims=uid=>({uid,sub:uid,aud:'opg-ojka',iss:'https://securetoken.google.com/opg-ojka',firebase:{sign_in_provider:'google.com'},email_verified:true});
function server({decoded=claims('member'),failure,enabled=true,role='MEMBER',binding='member',dbFailure}={}){
 const calls={verify:0,reads:0,handler:0,revoked:null},records={'access_members/member':{role,enabled,roleVersion:1},'access_control/member':{uid:binding},'access_members/owner':{role:'OWNER',enabled:true,roleVersion:1},'access_control/owner':{uid:'owner'}};
 const gate=createHttpRoleGate({auth:{verifyIdToken:async(_token,revoked)=>{calls.verify++;calls.revoked=revoked;if(failure)throw failure;return decoded;}},db:{doc:p=>({get:async()=>{calls.reads++;if(dbFailure)throw dbFailure;return{data:()=>records[p]};}})}});
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},vary(v){this.headers.Vary=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;},end(){}};
 const request=(headers={},method='POST')=>({method,body:{image:'synthetic-image',mimeType:'image/jpeg',uid:'owner',role:'OWNER'},get:key=>headers[key.toLowerCase()],rawHeaders:Object.entries(headers).flat()});
 const invoke=async req=>{if(await gate(req,res)){calls.handler++;res.status(200).json({parsed:[{existingField:'unchanged'}]});}return res;};
 return{gate,res,calls,request,invoke};
}
test('HTTP gate denies missing/malformed/duplicate bearer without calling original business handler',async()=>{
 for(const h of [{},{authorization:'Basic no'},{authorization:['Bearer one','Bearer two']}]){const f=server();await f.invoke(f.request(h));assert.equal(f.res.statusCode,401);assert.equal(f.calls.verify,0);assert.equal(f.calls.reads,0);assert.equal(f.calls.handler,0);}
 const f=server(),req=f.request({authorization:'Bearer synthetic'});req.rawHeaders.push('Authorization','Bearer duplicate');await f.invoke(req);assert.equal(f.res.statusCode,401);assert.equal(f.calls.verify,0);
});
test('allowed CORS preflight does not run auth/database/business code; disallowed origin fails',async()=>{
 const f=server();await f.invoke(f.request({origin:'https://opgojdanic-lang.github.io'},'OPTIONS'));assert.equal(f.res.statusCode,204);assert.match(f.res.headers['Access-Control-Allow-Headers'],/Authorization/);assert.equal(f.calls.verify+f.calls.reads+f.calls.handler,0);
 const denied=server();await denied.invoke(denied.request({origin:'https://untrusted.example',authorization:'Bearer synthetic'}));assert.equal(denied.res.statusCode,403);assert.equal(denied.calls.verify,0);
});
test('expired, revoked and wrong-project credentials fail closed without exposing provider errors',async()=>{
 for(const code of ['auth/id-token-expired','auth/id-token-revoked','auth/user-disabled','auth/invalid-id-token']){const f=server({failure:{code,message:'private-token-fixture'}});await f.invoke(f.request({authorization:'Bearer synthetic'}));assert.equal(f.res.statusCode,401);assert.equal(f.calls.revoked,true);assert.equal(f.calls.handler,0);assert.ok(!JSON.stringify(f.res).includes('private-token-fixture'));}
 for(const change of [{aud:'other'},{iss:'https://securetoken.google.com/other'},{sub:'other'}]){const f=server({decoded:{...claims('member'),...change}});await f.invoke(f.request({authorization:'Bearer synthetic'}));assert.equal(f.res.statusCode,401);assert.equal(f.calls.reads,0);}
 const f=server({failure:{code:'auth/insufficient-permission'}});await f.invoke(f.request({authorization:'Bearer synthetic'}));assert.equal(f.res.statusCode,503);assert.equal(f.calls.handler,0);
 const unavailable=server({dbFailure:new Error('private-db-fixture')});await unavailable.invoke(unavailable.request({authorization:'Bearer synthetic'}));assert.equal(unavailable.res.statusCode,503);assert.equal(unavailable.calls.handler,0);assert.ok(!JSON.stringify(unavailable.res).includes('private-db-fixture'));
});
test('anonymous, unapproved, disabled or orphaned roles never enter the private handler',async()=>{
 for(const options of [{decoded:{...claims('member'),firebase:{sign_in_provider:'anonymous'}}},{decoded:claims('unapproved')},{enabled:false},{binding:'other'},{role:'UNAPPROVED'},{decoded:{...claims('member'),email_verified:false}}]){const f=server(options);await f.invoke(f.request({authorization:'Bearer synthetic'}));assert.equal(f.res.statusCode,403);assert.equal(f.calls.handler,0);}
});
test('OWNER and MEMBER invoke unchanged handler once; body UID/role do not affect authorization',async()=>{
 for(const uid of ['owner','member']){const f=server({decoded:claims(uid)}),req=f.request({authorization:'Bearer synthetic',origin:'https://opgojdanic-lang.github.io'}),before=structuredClone(req.body);await f.invoke(req);assert.equal(f.calls.handler,1);assert.equal(f.calls.revoked,true);assert.deepEqual(req.body,before);assert.deepEqual(f.res.body,{parsed:[{existingField:'unchanged'}]});assert.equal(f.res.headers['Cache-Control'],'no-store');}
});
const user=()=>({uid:'member',isAnonymous:false,emailVerified:true,providerData:[{providerId:'google.com'}],getIdToken:async()=> 'synthetic-client-token'});
const session={uid:'member',enabled:true,role:'MEMBER'};
test('frontend sends one authenticated POST with original payload; does not follow token-leaking redirects',async()=>{
 let calls=0;const response={ok:true,status:200,json:async()=>({parsed:[{name:'existing-contract'}]})};
 const result=await client.request({url:URL,user:user(),session,image:'synthetic-image',fetchImpl:async(url,o)=>{calls++;assert.equal(url,URL);assert.equal(o.headers.authorization,'Bearer synthetic-client-token');assert.deepEqual(JSON.parse(o.body),{image:'synthetic-image',mimeType:'image/jpeg'});assert.equal(o.redirect,'error');assert.equal(o.credentials,'omit');return response;}});assert.equal(result,response);assert.equal(calls,1);
});
test('frontend never sends bearer to arbitrary origins, project aliases, queries or unverified run.app hosts',async()=>{
 let sent=0;for(const url of ['https://untrusted.example/fisPhotoLookup','https://europe-west1-other.cloudfunctions.net/fisPhotoLookup','https://fisphotolookup-unverified-ew.a.run.app','https://europe-west1-opg-ojka.cloudfunctions.net/other',URL+'?token=x'])await assert.rejects(client.request({url,user:user(),session,image:'synthetic',fetchImpl:async()=>{sent++;}}));assert.equal(sent,0);
});
test('frontend stops anonymous/unapproved/stale identities and does not retry 401/403',async()=>{
 let sent=0;for(const options of [{user:{...user(),isAnonymous:true}},{session:{...session,role:'UNAPPROVED'}},{isCurrent:()=>false},{user:{...user(),getIdToken:async()=>{throw new Error('private-fixture');}}}])await assert.rejects(client.request({url:URL,user:user(),session,image:'synthetic',fetchImpl:async()=>{sent++;},...options}));assert.equal(sent,0);
 let current=true;await assert.rejects(client.request({url:URL,user:{...user(),getIdToken:async()=>{current=false;return'synthetic';}},session,isCurrent:()=>current,fetchImpl:async()=>{sent++;}}));assert.equal(sent,0);
 for(const status of [401,403]){let calls=0;await assert.rejects(client.request({url:URL,user:user(),session,image:'synthetic',fetchImpl:async()=>{calls++;return{ok:false,status};}}));assert.equal(calls,1);}
});
