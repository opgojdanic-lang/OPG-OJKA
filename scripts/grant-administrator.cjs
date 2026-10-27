'use strict';
// Operator-only Node CLI. No HTTP endpoint, browser import or automatic execution.
const {createRequire}=require('node:module');
const {PERMISSIONS}=require('../auth');
function plan({projectId,uid,permissions,user,existing={}}){
  if(projectId!=='opg-ojka')throw new Error('Explicit target project opg-ojka is required');
  if(typeof uid!=='string'||!uid||uid.length>128||uid.includes('/')||['.','..'].includes(uid)||user?.uid!==uid||user.disabled||user.emailVerified!==true||!user.providerData?.some(p=>p.providerId==='google.com'))throw new Error('Target must be the independently verified enabled Google Firebase UID');
  if(!Array.isArray(permissions)||!permissions.length||permissions.some(p=>!PERMISSIONS.includes(p)))throw new Error('Provide an explicit list of known permissions; there is no all-users/domain/default-admin grant');
  if(existing.permissions!=null&&(!Array.isArray(existing.permissions)||existing.permissions.some(p=>!PERMISSIONS.includes(p))))throw new Error('Review malformed existing grants manually');
  return {enabled:true,administrator:true,permissions:[...new Set([...(existing.permissions||[]),...permissions])]};
}
async function main(argv){
  const options={};for(let i=0;i<argv.length;i++){const key=argv[i];if(key==='--apply')options.apply=true;else if(['--project','--uid','--permissions','--confirm-project','--confirm-uid'].includes(key))options[key.slice(2)]=argv[++i];else throw new Error('Unknown option');}
  if(options.project!=='opg-ojka'||!options.uid||!options.permissions)throw new Error('Required: --project opg-ojka --uid VERIFIED_UID --permissions EXPLICIT,SCOPES; default is read-only dry-run');
  if(options.apply&&(options['confirm-project']!==options.project||options['confirm-uid']!==options.uid))throw new Error('Apply requires exact --confirm-project and --confirm-uid values');
  const req=createRequire(require('node:path').resolve(__dirname,'../backend/pest-ai/package.json'));
  const app=req('firebase-admin/app').initializeApp({projectId:options.project});
  try{
    const user=await req('firebase-admin/auth').getAuth(app).getUser(options.uid),db=req('firebase-admin/firestore').getFirestore(app),ref=db.doc('access_members/'+options.uid);
    const permissions=options.permissions.split(',').map(p=>p.trim());
    const proposed=plan({projectId:options.project,uid:options.uid,permissions,user,existing:(await ref.get()).data()});
    if(options.apply)await db.runTransaction(async tx=>{const existing=(await tx.get(ref)).data();tx.set(ref,plan({projectId:options.project,uid:options.uid,permissions,user,existing}),{merge:true});});
    console.log(JSON.stringify({mode:options.apply?'applied':'dry-run',projectId:options.project,uid:options.uid,permissions:proposed.permissions,administrator:true,writes:options.apply?1:0}));
  }finally{await req('firebase-admin/app').deleteApp(app);}
}
if(require.main===module)main(process.argv.slice(2)).catch(()=>{console.error('Grant not completed. Check independently verified UID, explicit scopes, confirmations and operator IAM/ADC. No credential details are printed.');process.exitCode=1;});
module.exports={plan};
