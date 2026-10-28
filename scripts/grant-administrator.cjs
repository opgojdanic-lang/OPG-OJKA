'use strict';
// Trusted operator only. Default dry-run; never imported or executed by the web app.
const {createRequire}=require('node:module');
function plan({projectId,uid,user,existingOwner,existing={}}){
  if(projectId!=='opg-ojka')throw new Error('Explicit opg-ojka project required');
  if(typeof uid!=='string'||!uid||uid.length>128||/[\s/]/.test(uid)||['.','..'].includes(uid)||user?.uid!==uid||user.disabled||user.emailVerified!==true||!user.providerData?.some(p=>p.providerId==='google.com'))throw new Error('Independently verified enabled Google UID required');
  if(existingOwner?.uid&&existingOwner.uid!==uid)throw new Error('A different OWNER already exists; no automatic owner replacement');
  if(existing.role&&existing.role!=='OWNER')throw new Error('Review existing role conflict; no automatic promotion');
  return {role:'OWNER',roleVersion:1,enabled:true};
}
async function main(argv){
  if(process.env.FIREBASE_AUTH_EMULATOR_HOST||process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Production operator scripts refuse emulator/production mixing');
  const options={};for(let i=0;i<argv.length;i++){const key=argv[i];if(key==='--apply')options.apply=true;else if(['--project','--uid','--confirm-project','--confirm-uid'].includes(key))options[key.slice(2)]=argv[++i];else throw new Error('Unknown option; arbitrary permissions are no longer supported');}
  if(options.project!=='opg-ojka'||!options.uid)throw new Error('Required --project opg-ojka --uid VERIFIED_OWNER_UID; default dry-run');
  if(options.apply&&(options['confirm-project']!==options.project||options['confirm-uid']!==options.uid))throw new Error('Exact project and UID confirmations required');
  const req=createRequire(require('node:path').resolve(__dirname,'../backend/pest-ai/package.json'));
  const app=req('firebase-admin/app').initializeApp({projectId:options.project});
  try{
    const user=await req('firebase-admin/auth').getAuth(app).getUser(options.uid),db=req('firebase-admin/firestore').getFirestore(app),ref=db.doc('access_members/'+options.uid),owner=db.doc('access_control/owner');
    const args={projectId:options.project,uid:options.uid,user};
    const proposed=plan({...args,existing:(await ref.get()).data(),existingOwner:(await owner.get()).data()});
    if(options.apply)await db.runTransaction(async tx=>{const [a,b]=await Promise.all([tx.get(ref),tx.get(owner)]);const value=plan({...args,existing:a.data(),existingOwner:b.data()});tx.set(ref,value,{merge:true});tx.set(owner,{uid:options.uid},{merge:true});});
    console.log(JSON.stringify({mode:options.apply?'applied':'dry-run',projectId:options.project,uid:options.uid,...proposed,writes:options.apply?2:0}));
  }finally{await req('firebase-admin/app').deleteApp(app);}
}
if(require.main===module)main(process.argv.slice(2)).catch(()=>{console.error('OWNER bootstrap not completed. Check independently verified UID, existing owner, confirmations and operator IAM/ADC. No credential details printed.');process.exitCode=1;});
module.exports={plan};
