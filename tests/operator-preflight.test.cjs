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
 if(url.includes('run.googleapis.com/v2/')&&!url.endsWith(':getIamPolicy'))return{name:'projects/opg-ojka/locations/europe-west1/services/test',ingress:'INGRESS_TRAFFIC_ALL',invokerIamDisabled:true,defaultUriDisabled:false,template:{containers:[{image:'fixture@sha256:abc',env:[{name:'PRIVATE_VALUE',value:'must-not-export'},{name:'BOUND_SECRET',valueSource:{secretKeyRef:{secret:'existing-secret-reference',version:'1'}}}]}]}};
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
 const service=JSON.parse(fs.readFileSync(path.join(out,'function-v2-service-0.json'),'utf8'));assert.equal(service.invokerIamDisabled,true);assert.equal(service.ingress,'INGRESS_TRAFFIC_ALL');assert.equal(service.template.containers[0].env[0].value,'[VALUE OMITTED]');assert.equal(service.template.containers[0].env[1].valueSource.secretKeyRef.secret,'existing-secret-reference');
 const s=scrub({hashConfig:{signerKey:'hidden'},refresh_token:'hidden',clientSecret:'hidden'});assert.ok(!JSON.stringify(s).includes('hidden'));
 }finally{fs.rmSync(parent,{recursive:true,force:true});}
});

test('help exits before credential loading, network, emulator guards or snapshot filesystem writes',()=>{
 const {spawnSync}=require('node:child_process');
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'opg-help-'));
 try{
 const guard=path.join(parent,'guard.cjs');fs.writeFileSync(guard,`
 const Module=require('node:module'),load=Module._load;
 Module._load=function(name,...args){if(/google-auth-library|gaxios|gcp-metadata/.test(name))throw new Error('Credential SDK forbidden during help');return load.call(this,name,...args);};
 const forbidden=()=>{throw new Error('Network or filesystem write forbidden during help');};
 global.fetch=forbidden;for(const mod of ['node:http','node:https']){const m=require(mod);m.request=m.get=forbidden;}
 const net=require('node:net');net.connect=net.createConnection=forbidden;require('node:fs').mkdirSync=forbidden;require('node:fs').writeFileSync=forbidden;
 `);
 for(const flag of ['--help','-h']){
 const out=path.join(parent,'must-not-exist');
 const r=spawnSync(process.execPath,['--require',guard,path.resolve(__dirname,'../scripts/operator-preflight.cjs'),flag,'--snapshot','--out',out],{encoding:'utf8',timeout:10000,env:{...process.env,GOOGLE_APPLICATION_CREDENTIALS:'/missing/never-print-fixture',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8088'}});
 assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/Usage:/);assert.match(r.stdout,/--cloud-shell/);assert.ok(!r.stdout.includes('never-print-fixture'));assert.equal(fs.existsSync(out),false);
 }
 }finally{fs.rmSync(parent,{recursive:true,force:true});}
});

test('real Compute and OAuth clients preserve fixed quota header through SDK merging without ADC/env edits',async()=>{
 const req=require('node:module').createRequire(path.resolve(__dirname,'../backend/pest-ai/package.json'));
 const {Compute,OAuth2Client}=req('google-auth-library'),{createRequest}=require('../scripts/operator-preflight.cjs');
 const before={quota:process.env.GOOGLE_CLOUD_QUOTA_PROJECT,adc:process.env.GOOGLE_APPLICATION_CREDENTIALS};
 for(const Client of [Compute,OAuth2Client]){
 const client=new Client();client.quotaProjectId='previous-quota-project';
 client.setCredentials({access_token:'synthetic-not-real',token_type:'Bearer',expiry_date:Date.now()+3600000});
 client.refreshTokenNoCache=async()=>{throw new Error('No metadata/token network allowed in this test');};
 const credentials=structuredClone(client.credentials),calls=[];
 client.transporter={request:async opts=>{calls.push(opts);if(opts.headers['x-goog-user-project']!==project)throw{response:{status:403,config:opts,data:{error:{message:'Fixture quota mismatch'}}}};return{data:{ok:true}};}};
 // Reproduces SDK overriding a caller header with the client's previous quota project.
 await assert.rejects(client.request({url:'https://identitytoolkit.googleapis.com/v1/projects/opg-ojka/accounts:batchGet?maxResults=1',headers:{'x-goog-user-project':project}}),e=>e.response?.status===403);
 const request=createRequest(client);
 for(const [method,url,data]of [['GET','https://identitytoolkit.googleapis.com/v1/projects/opg-ojka/accounts:batchGet?maxResults=1'],['POST','https://firestore.googleapis.com/v1/projects/opg-ojka/databases/(default)/documents:runQuery',{}],['POST','https://cloudresourcemanager.googleapis.com/v1/projects/opg-ojka:getIamPolicy',{}]])assert.deepEqual(await request(method,url,data),{ok:true});
 assert.ok(calls.slice(1).every(c=>c.headers['x-goog-user-project']===project));
 assert.deepEqual(client.credentials,credentials);assert.deepEqual({quota:process.env.GOOGLE_CLOUD_QUOTA_PROJECT,adc:process.env.GOOGLE_APPLICATION_CREDENTIALS},before);
 }
});

test('request wrapper blocks non-Google destinations, non-HTTPS and mutation APIs before sending credentials',async()=>{
 const {createRequest}=require('../scripts/operator-preflight.cjs');let sent=0;const request=createRequest({request:()=>{sent++;}});
 for(const [method,url]of [['GET','https://example.test/'],['GET','http://identitytoolkit.googleapis.com/'],['POST','https://firestore.googleapis.com/v1/projects/opg-ojka/databases/(default)/documents:commit'],['DELETE','https://cloudfunctions.googleapis.com/v2/projects/opg-ojka/locations/x/functions/x'],['POST','https://cloudresourcemanager.googleapis.com/v1/projects/opg-ojka:setIamPolicy']])await assert.rejects(request(method,url));assert.equal(sent,0);
});

test('Cloud Shell mode checks all APIs with quota header but never claims a verified human principal',async()=>{
 const {createRequest}=require('../scripts/operator-preflight.cjs'),f=fixture(),logs=[],calls=[];
 const client={request:async opts=>{calls.push(opts);assert.equal(opts.headers['x-goog-user-project'],project);return{data:await f.request(opts.method,opts.url,opts.data)};}};
 const r=await run({request:createRequest(client),cloudShell:true,log:s=>logs.push(s)});
 assert.equal(r.complete,true);assert.equal(r.operatorIdentityVerified,false);assert.equal(r.quotaProjectId,project);assert.equal(r.credentialMode,'cloud-shell');assert.equal(r.results.find(x=>x.check==='adc-principal').status,'NOT_VERIFIED');assert.ok(!calls.some(c=>c.url.includes('userinfo')));
 for(const name of ['auth-users-read','firestore-read','project-iam','project-permissions'])assert.equal(r.results.find(r=>r.check===name).status,'PASS');
 assert.ok(logs.some(l=>l.includes('NOT_VERIFIED')));assert.ok(!logs.join('').includes('private-'));
 const denied=await run({cloudShell:true,request:(m,u,d)=>u.includes('accounts:batchGet')?Promise.reject({response:{status:403}}):f.request(m,u,d),log:()=>{}});assert.equal(denied.complete,false);assert.equal(denied.results.find(r=>r.check==='auth-users-read').status,'BLOCKED');
 assert.deepEqual(options(['--project',project,'--cloud-shell']),{project,cloudShell:true});assert.throws(()=>options(['--project','other','--cloud-shell']));
});
