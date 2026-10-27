'use strict';
// Read-only trusted-operator inventory. Output contains UIDs: keep private, never publish.
const {createRequire}=require('node:module');
async function main(){
  if(process.env.FIREBASE_AUTH_EMULATOR_HOST||process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Production operator scripts refuse emulator/production mixing');
 if(process.argv.slice(2).join(' ')!=='--project opg-ojka')throw new Error('Explicit --project opg-ojka required');
 const req=createRequire(require('node:path').resolve(__dirname,'../backend/pest-ai/package.json'));
 const app=req('firebase-admin/app').initializeApp({projectId:'opg-ojka'});
 try{
 const db=req('firebase-admin/firestore').getFirestore(app),auth=req('firebase-admin/auth').getAuth(app);
 const [records,owner,member,legacyAi]=await Promise.all([db.collection('access_members').get(),db.doc('access_control/owner').get(),db.doc('access_control/member').get(),db.doc('ai_private/config').get()]);
 const grants=new Map(records.docs.map(d=>[d.id,d.data()]));let pageToken;const users=[];
 do{const page=await auth.listUsers(1000,pageToken);for(const u of page.users){const r=grants.get(u.uid);users.push({uid:u.uid,disabled:u.disabled,google:u.providerData.some(p=>p.providerId==='google.com'),emailVerified:u.emailVerified,registryRole:r?.role||null,roleVersion:r?.roleVersion||null,enabled:r?.enabled===true,legacyPermissions:Array.isArray(r?.permissions),bindingOwner:owner.data()?.uid===u.uid,bindingMember:member.data()?.uid===u.uid,legacyAiAllowed:legacyAi.data()?.allowedUids?.includes(u.uid)===true});grants.delete(u.uid);}pageToken=page.pageToken;}while(pageToken);
 console.log(JSON.stringify({projectId:'opg-ojka',mode:'read-only',users,orphanRegistryUids:[...grants.keys()],ownerUid:owner.data()?.uid||null,memberUid:member.data()?.uid||null},null,2));
 }finally{await req('firebase-admin/app').deleteApp(app);}
}
if(require.main===module)main().catch(()=>{console.error('Read-only audit incomplete. Check operator IAM/ADC; no credential details printed.');process.exitCode=1;});
