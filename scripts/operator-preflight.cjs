'use strict';
// Read-only production preflight. Writes ONLY private local snapshot files on explicit --snapshot.
// No deploy, mutations, IAM changes, account provisioning or secret-version access.
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const PROJECT='opg-ojka';
const HELP=`Usage: node scripts/operator-preflight.cjs --project opg-ojka [--cloud-shell]
       [--service-account EXISTING_SERVICE_ACCOUNT_EMAIL]
       [--snapshot --out PRIVATE_NEW_DIRECTORY]
       node scripts/operator-preflight.cjs --help

--help, -h       Print this help locally; no credentials, network or snapshot.
--project        Required exact target opg-ojka. No implicit/default project.
--cloud-shell    Use existing Cloud Shell ADC. Human userinfo is not required;
                 principal identity stays NOT_VERIFIED and must be checked privately.
--service-account Test existing resource-level actAs permissions; no impersonation.
--snapshot       Explicit private local configuration snapshot only.
--out            New directory outside repo and /workspace; private parent required.

Read/query/permission-test APIs only. No deploy, cloud writes, IAM/role changes,
new credentials or service-account keys. Tokens and private data are not printed.
Quota project opg-ojka is set only in this process and x-goog-user-project requests;
no gcloud set-quota-project, ADC file edit or environment modification is performed.
Existing caller must have serviceusage.services.use and API-specific permissions.
Cloud Shell repeat: node scripts/operator-preflight.cjs --project opg-ojka --cloud-shell
API PASS/exit 0 does not independently verify a human operator or guarantee deploy.
See docs/OPERATOR-PREFLIGHT.md for private identity and snapshot checks.
`;

const PERMISSIONS={
 authRead:['firebaseauth.users.get','firebaseauth.configs.get'],
 firestoreRead:['datastore.databases.get','datastore.entities.get','datastore.entities.list'],
 rulesRead:['firebaserules.releases.get','firebaserules.releases.list','firebaserules.rulesets.get'],
 rulesPublish:['firebase.projects.get','firebaserules.rulesets.create','firebaserules.releases.create','firebaserules.releases.update'],
 functionsPublish:['cloudfunctions.functions.get','cloudfunctions.functions.list','cloudfunctions.functions.create','cloudfunctions.functions.update','cloudfunctions.functions.delete','cloudfunctions.functions.sourceCodeSet','cloudfunctions.operations.get','cloudfunctions.functions.setIamPolicy'],
 gen2Support:['cloudbuild.builds.create','cloudbuild.builds.get','run.services.get','run.services.create','run.services.update','run.services.getIamPolicy','run.services.setIamPolicy','artifactregistry.repositories.list','cloudscheduler.jobs.get','cloudscheduler.jobs.create','cloudscheduler.jobs.update','serviceusage.services.get','serviceusage.services.use']
};
function options(argv){
 if(argv.includes('--help')||argv.includes('-h'))return{help:true};
 const o={};for(let i=0;i<argv.length;i++){const a=argv[i];if(a==='--snapshot')o.snapshot=true;else if(a==='--cloud-shell')o.cloudShell=true;else if(['--project','--out','--service-account'].includes(a)){if(!argv[i+1]||argv[i+1].startsWith('--'))throw new Error('Missing option value');o[a.slice(2)]=argv[++i];}else throw new Error('Unknown option');}
 if(o.project!==PROJECT||!!o.snapshot!==!!o.out)throw new Error('Use --project opg-ojka; --snapshot requires --out PRIVATE_NEW_DIRECTORY');
 if(o['service-account']&&!/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.gserviceaccount\.com$/.test(o['service-account']))throw new Error('Invalid existing service-account identity');
 return o;
}
function privateDirectory(target){
 const root=fs.realpathSync(path.join(__dirname,'..')),absolute=path.resolve(target),parent=fs.realpathSync(path.dirname(absolute));
 const inside=(p,r)=>p===r||p.startsWith(r+path.sep);
 if(inside(absolute,root)||inside(parent,root)||inside(absolute,'/workspace')||inside(parent,'/workspace'))throw new Error('Snapshot must be outside repo and shared /workspace');
 // Parent must already be a private directory owned by this operator. No symlink output/overwrite.
 const st=fs.statSync(parent);if((st.mode&0o077)!==0||(process.getuid&&st.uid!==process.getuid()))throw new Error('Create a private parent directory (0700) first');
 fs.mkdirSync(absolute,{mode:0o700});return absolute;
}
function scrub(value){
 if(Array.isArray(value))return value.map(scrub);
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,key==='environmentVariables'?Object.fromEntries(Object.keys(v||{}).map(name=>[name,'[VALUE OMITTED]'])):/password|private.?key|client.?secret|token|hashConfig|signerKey|api.?key|credential|sourceUploadUrl/i.test(key)?'[VALUE OMITTED]':scrub(v)]));
}
function missingPermissions(granted){const set=new Set(granted||[]);return Object.fromEntries(Object.entries(PERMISSIONS).map(([k,v])=>[k,v.filter(p=>!set.has(p))]));}
function code(error){return Number(error?.response?.status)||String(error?.code||'UNAVAILABLE').replace(/[^A-Z0-9_-]/gi,'').slice(0,40);}
async function paged(request,url,key){
 let pageToken;const rows=[],seen=new Set();do{
 const u=new URL(url);if(pageToken)u.searchParams.set('pageToken',pageToken);
 const data=await request('GET',u.href);rows.push(...(data[key]||[]));pageToken=data.nextPageToken;
 if(pageToken&&seen.has(pageToken))throw new Error('Repeated pagination token');seen.add(pageToken);
 }while(pageToken);return rows;
}
async function run({request,out,serviceAccount,cloudShell=false,log=console.log}){
 const results=[];const save=(name,data)=>{if(out)fs.writeFileSync(path.join(out,name),JSON.stringify(scrub(data),null,2)+'\n',{mode:0o600,flag:'wx'});};
 async function check(name,fn){try{await fn();results.push({check:name,status:'PASS'});log(name+': PASS');}catch(e){const status=code(e);results.push({check:name,status:'BLOCKED',code:status});log(name+': BLOCKED ('+status+'); no credential/error payload printed');}}
 if(cloudShell){results.push({check:'adc-principal',status:'NOT_VERIFIED',required:false});log('adc-principal: NOT_VERIFIED (Cloud Shell mode; confirm the actual caller privately; all API/permission checks remain required)');}
 else await check('adc-principal',async()=>{const p=await request('GET','https://openidconnect.googleapis.com/v1/userinfo');if(!p.email||p.email_verified!==true)throw new Error('Human ADC identity not established');save('adc-principal.json',{email:p.email,emailVerified:p.email_verified});log('ADC human identity available; compare privately with the intended IAM Owner. Identity not printed.');});
 await check('project',async()=>{const p=await request('GET',`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}`);if(p.projectId!==PROJECT||p.lifecycleState!=='ACTIVE')throw new Error('Project mismatch');save('project.json',p);});
 await check('project-permissions',async()=>{const data=await request('POST',`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:testIamPermissions`,{permissions:[...new Set(Object.values(PERMISSIONS).flat())]});const missing=missingPermissions(data.permissions);save('project-permissions.json',{missing,granted:data.permissions||[]});for(const [group,list]of Object.entries(missing))log('permissions '+group+': '+(list.length?'MISSING '+list.join(', '):'PASS (project scope)'));if(Object.values(missing).some(v=>v.length))throw Object.assign(new Error('Review missing permissions and resource-scoped conditions'),{code:'MISSING_PERMISSIONS'});});
 await check('auth-users-read',async()=>{const data=await request('GET',`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:batchGet?maxResults=1`);if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Invalid response');log('Auth sample: '+((data.users||[]).length?'readable':'readable, no users returned')+'; user data not logged/exported');});
 await check('firestore-read',async()=>{const rows=await request('POST',`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`,{structuredQuery:{from:[{collectionId:'zalihe'}],limit:1}});if(!Array.isArray(rows))throw new Error('Invalid query response');log('Firestore sample: '+(rows.some(r=>r.document)?'readable':'query readable, empty collection')+'; business values not logged/exported');});
 await check('firestore-database',async()=>save('firestore-database.json',await request('GET',`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)`)));
 await check('firestore-rules',async()=>{
 const releases=await paged(request,`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases?pageSize=100`,'releases');const active=releases.filter(r=>r.name?.startsWith(`projects/${PROJECT}/releases/cloud.firestore`));
 if(!active.some(r=>r.name===`projects/${PROJECT}/releases/cloud.firestore`))throw new Error('Default Firestore release not found; inspect database/release mapping');
 save('firestore-releases.json',active);
 for(let i=0;i<active.length;i++){
 const release=await request('GET','https://firebaserules.googleapis.com/v1/'+active[i].name);
 if(!new RegExp('^projects/'+PROJECT+'/rulesets/[^/]+$').test(release.rulesetName||''))throw new Error('Invalid ruleset binding');
 const ruleset=await request('GET','https://firebaserules.googleapis.com/v1/'+release.rulesetName);
 if(!ruleset.source?.files?.length)throw new Error('Rules source missing');save('firestore-rules-'+i+'.json',{release,ruleset});
 }
 });
 await check('project-iam',async()=>save('project-iam.json',await request('POST',`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:getIamPolicy`,{options:{requestedPolicyVersion:3}})));
 for(const version of ['v1','v2'])await check('functions-'+version,async()=>{
 const functions=await paged(request,`https://cloudfunctions.googleapis.com/${version}/projects/${PROJECT}/locations/-/functions`,'functions');save('functions-'+version+'.json',{functions});
 if(out)for(let i=0;i<functions.length;i++){
 const f=functions[i];if(!new RegExp('^projects/'+PROJECT+'/locations/[^/]+/functions/[^/]+$').test(f.name||''))throw new Error('Invalid function resource');
 // Gen2 invocation policy is on the backing Cloud Run service; Gen1 on the function.
 const svc=f.serviceConfig?.service;
 if(version==='v2'&&svc){if(!new RegExp('^projects/[^/]+/locations/[^/]+/services/[^/]+$').test(svc))throw new Error('Invalid service resource');save('function-v2-invoker-'+i+'.json',await request('GET','https://run.googleapis.com/v2/'+svc+':getIamPolicy'));}
 else if(version==='v1')save('function-v1-invoker-'+i+'.json',await request('GET','https://cloudfunctions.googleapis.com/v1/'+f.name+':getIamPolicy'));
 }
 });
 await check('firebase-auth-config',async()=>save('auth-project-config.json',await request('GET',`https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`)));
 if(out)await check('access-registry',async()=>save('access-members.json',{documents:await paged(request,`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/access_members?pageSize=100`,'documents')}));
 if(out)for(const document of ['settings/app','settings/security','settings/spray_conditions','settings/fis_sync','ai_private/config','access_control/owner','access_control/member'])await check('config '+document,async()=>{
 try{save(document.replaceAll('/','-')+'.json',await request('GET',`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${document}`));}catch(e){if(e?.response?.status===404)save(document.replaceAll('/','-')+'.json',{exists:false});else throw e;}
 });
 if(serviceAccount)await check('service-account-actAs',async()=>{const data=await request('POST',`https://iam.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccount}:testIamPermissions`,{permissions:['iam.serviceAccounts.actAs','iam.serviceAccounts.get']});save('service-account-permissions.json',data);if(!data.permissions?.includes('iam.serviceAccounts.actAs'))throw Object.assign(new Error('Missing actAs'),{code:'MISSING_ACTAS'});});
 const report={projectId:PROJECT,at:new Date().toISOString(),readOnly:true,quotaProjectId:PROJECT,credentialMode:cloudShell?'cloud-shell':'adc',operatorIdentityVerified:results.some(r=>r.check==='adc-principal'&&r.status==='PASS'),scope:'ADC API access; human identity in Cloud Shell remains unverified; project permission tests are not a deployment dry-run',complete:results.every(r=>r.status==='PASS'||(cloudShell&&r.check==='adc-principal'&&r.status==='NOT_VERIFIED')),results};save('report.json',report);
 if(out){const {createHash}=require('node:crypto');const entries=fs.readdirSync(out).map(name=>({file:name,sha256:createHash('sha256').update(fs.readFileSync(path.join(out,name))).digest('hex')}));save('sha256-manifest.json',entries);}
 return report;
}
// AuthClient.quotaProjectId is process-local. Google OAuth/Compute SDK merging can
// override a caller header, so set BOTH this property and each API request header.
function createRequest(client){
 client.quotaProjectId=PROJECT;
 const hosts=new Set(['openidconnect.googleapis.com','cloudresourcemanager.googleapis.com','identitytoolkit.googleapis.com','firestore.googleapis.com','firebaserules.googleapis.com','cloudfunctions.googleapis.com','run.googleapis.com','iam.googleapis.com']);
 return async(method,url,data)=>{
  const u=new URL(url);
  if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||!hosts.has(u.hostname)
    ||!(method==='GET'||(method==='POST'&&/:(testIamPermissions|getIamPolicy|runQuery)$/.test(u.pathname))))throw new Error('Only known read-only Google API routes are allowed');
  return (await client.request({method,url,data,headers:{'x-goog-user-project':PROJECT},timeout:20000,retry:false})).data;
 };
}
async function main(argv){
 const o=options(argv);
 if(o.help){console.log(HELP);return;}
 if(process.env.FIREBASE_AUTH_EMULATOR_HOST||process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Production preflight refuses emulator/production mixing');
 const out=o.out?privateDirectory(o.out):null;
 const req=createRequire(path.resolve(__dirname,'../backend/pest-ai/package.json')),{GoogleAuth}=req('google-auth-library');
 const auth=new GoogleAuth({projectId:PROJECT,scopes:['https://www.googleapis.com/auth/cloud-platform',...(o.cloudShell?[]:['https://www.googleapis.com/auth/userinfo.email'])]}),client=await auth.getClient();
 const request=createRequest(client);
 const token=await client.getAccessToken();if(!token?.token)throw new Error('ADC token unavailable');
 console.log('ADC token: obtained; token not printed. This does not prove Firebase CLI identity or API permissions.');
 console.log('Quota project: opg-ojka (process-local client/header only; existing ADC unchanged).');
 const report=await run({request,out,serviceAccount:o['service-account'],cloudShell:o.cloudShell});if(!report.complete)process.exitCode=1;
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{console.error('Preflight not completed ('+code(e)+'). Check local ADC, OAuth client compatibility, project, enabled APIs and permissions; no credentials/error details printed.');process.exitCode=1;});
module.exports={options,privateDirectory,missingPermissions,paged,run,scrub,createRequest,HELP,PERMISSIONS};
