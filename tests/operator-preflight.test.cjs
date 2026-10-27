'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {options,privateDirectory,missingPermissions,paged,run,scrub,PERMISSIONS}=require('../scripts/operator-preflight.cjs');
const project='opg-ojka';
function fixture(){
 const calls=[];const request=async(method,url,data)=>{
 calls.push({method,url,data});
 if(url.includes('openidconnect.googleapis.com'))return{email:'private-fixture@example.test',email_verified:true};
 if(url.endsWith(':testIamPermissions'))return{permissions:url.includes('iam.googleapis.com')?['iam.serviceAccounts.actAs','iam.serviceAccounts.get']:Object.values(PERMISSIONS).flat()};
 if(url.endsWith(':getIamPolicy'))return{version:3,bindings:[{role:'roles/owner',members:['user:private-fixture@example.test']}]};
 if(url.includes('accounts:batchGet'))return{users:[{localId:'private-user-not-for-logs'}]};
 if(url.endsWith(':runQuery'))return[{document:{fields:{privateBusinessValue:{stringValue:'private-business-not-for-logs'}}}}];
 if(url.includes('cloudresourcemanager.googleapis.com'))return{projectId:project,projectNumber:'123',lifecycleState:'ACTIVE'};
 if(url.includes('/releases?'))return{releases:[{name:`projects/${project}/releases/cloud.firestore`,rulesetName:`projects/${project}/rulesets/test`}]};
 if(url.endsWith('/releases/cloud.firestore'))return{name:`projects/${project}/releases/cloud.firestore`,rulesetName:`projects/${project}/rulesets/test`};
 if(url.includes('/rulesets/'))return{source:{files:[{name:'firestore.rules',content:'rules_version = "2"; // fixture'}]}};
 if(url.includes('cloudfunctions.googleapis.com'))return{functions:[{name:`projects/${project}/locations/europe-west1/functions/test`,serviceConfig:{service:`projects/${project}/locations/europe-west1/services/test`},environmentVariables:{LEGACY_SECRET:'must-not-export'},secretEnvironmentVariables:[{key:'OPG_OPENAI_API_KEY',secret:'existing-secret-reference',version:'1'}]}]};
 return{fields:{enabled:{booleanValue:false},OPG_OPENAI_API_KEY:{stringValue:'must-not-export'}}};
 };return{calls,request};
}
test('operator preflight is explicit-project only and never enables deploy or role grants',()=>{
 assert.deepEqual(options(['--project','opg-ojka']),{project});
 for(const argv of [[],['--project','other'],['--project',project,'--snapshot'],['--project',project,'--out','/tmp/out'],['--project',project,'--apply'],['--project',project,'--service-account','../bad']])assert.throws(()=>options(argv));
 assert.ok(missingPermissions([]).rulesPublish.includes('firebaserules.releases.update'));
});
test('preflight uses only read/query/permission-test APIs and never logs or exports Auth/business samples',async()=>{
 const f=fixture(),logs=[],r=await run({request:f.request,serviceAccount:'fixture@opg-ojka.iam.gserviceaccount.com',log:s=>logs.push(s)});assert.equal(r.complete,true);
 for(const c of f.calls){assert.ok(c.method==='GET'||(c.method==='POST'&&/:(testIamPermissions|getIamPolicy|runQuery)$/.test(c.url)));assert.ok(!/:(commit|batchWrite|access|setIamPolicy)$/.test(c.url));}
 assert.ok(!logs.join('').includes('private-'));assert.ok(!f.calls.some(c=>c.url.includes('secretmanager.googleapis.com')));
});
test('missing permissions, API denial or incomplete pagination cannot produce complete status',async()=>{
 const f=fixture();const r=await run({request:(m,u,d)=>u.endsWith(':testIamPermissions')?Promise.resolve({permissions:[]}):u.includes('accounts:batchGet')?Promise.reject({response:{status:403,data:{secret:'never-log'}}}):f.request(m,u,d),log:()=>{}});assert.equal(r.complete,false);assert.equal(r.results.find(r=>r.check==='auth-users-read').code,403);
 let calls=0;const rows=await paged(async()=>++calls===1?{items:[1],nextPageToken:'next'}:{items:[2]},'https://example.test/list','items');assert.deepEqual(rows,[1,2]);
 await assert.rejects(paged(async()=>({items:[],nextPageToken:'same'}),'https://example.test/list','items'));
});
test('private snapshot exports active rules/config metadata, omits credential values, refuses repo or shared output',async()=>{
 assert.throws(()=>privateDirectory(path.resolve(__dirname,'../operator-snapshot')));
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'opg-preflight-'));fs.chmodSync(parent,0o700);
 try{
 const out=privateDirectory(path.join(parent,'snapshot')),f=fixture();const report=await run({request:f.request,out,log:()=>{}});assert.equal(report.complete,true);
 assert.equal(fs.statSync(out).mode&0o077,0);assert.throws(()=>privateDirectory(out));
 const files=fs.readdirSync(out),all=files.map(n=>fs.readFileSync(path.join(out,n),'utf8')).join('');assert.ok(all.includes('firestore.rules'));assert.ok(all.includes('existing-secret-reference'));assert.ok(!all.includes('must-not-export'));assert.ok(!all.includes('private-business-not-for-logs'));assert.ok(!all.includes('private-user-not-for-logs'));
 for(const file of files)assert.equal(fs.statSync(path.join(out,file)).mode&0o077,0);
 assert.ok(files.includes('sha256-manifest.json'));assert.ok(files.includes('function-v2-invoker-0.json'));
 const s=scrub({hashConfig:{signerKey:'hidden'},refresh_token:'hidden',clientSecret:'hidden'});assert.ok(!JSON.stringify(s).includes('hidden'));
 }finally{fs.rmSync(parent,{recursive:true,force:true});}
});
