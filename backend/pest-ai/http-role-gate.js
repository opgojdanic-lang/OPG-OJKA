'use strict';
// Reusable patch component only: NOT a registered or replacement Cloud Function.
// Integrate privately before the existing fisPhotoLookup handler's first side effect.
const {requireRole,RoleError}=require('./roles');
const PROJECT='opg-ojka',ORIGIN='https://opgojdanic-lang.github.io';
const invalidToken=new Set(['auth/argument-error','auth/invalid-id-token','auth/id-token-expired','auth/id-token-revoked','auth/user-disabled','auth/user-not-found']);
function createHttpRoleGate({auth,db}){
 if(typeof auth?.verifyIdToken!=='function'||typeof db?.doc!=='function')throw new TypeError('Existing Auth and Firestore instances are required');
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.vary('Origin');
  const deny=(status,message)=>{res.status(status).json({error:message});return false;};
  const origin=req.get('origin');
  if(origin&&origin!==ORIGIN)return deny(403,'Izvor zahtjeva nije dopušten.');
  if(origin){res.setHeader('Access-Control-Allow-Origin',ORIGIN);res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');}
  // CORS preflight never invokes the private business handler, token verifier or DB.
  if(req.method==='OPTIONS'){res.status(204).end();return false;}
  const header=req.get('authorization');
  const copies=Array.isArray(req.rawHeaders)?req.rawHeaders.filter((v,i)=>i%2===0&&String(v).toLowerCase()==='authorization').length:0;
  if(typeof header!=='string'||header.length>8192||copies>1)return deny(401,'Potrebna je valjana Firebase prijava.');
  const match=/^Bearer ([^\s]+)$/i.exec(header);if(!match)return deny(401,'Potrebna je valjana Firebase prijava.');
  let decoded;
  try{decoded=await auth.verifyIdToken(match[1],true);}catch(e){return deny(invalidToken.has(e?.code)?401:503,'Prijava nije potvrđena. Obrada nije pokrenuta.');}
  if(decoded?.aud!==PROJECT||decoded.iss!=='https://securetoken.google.com/'+PROJECT||typeof decoded.uid!=='string'||!decoded.uid||decoded.uid.length>128||/[\s/]/.test(decoded.uid)||decoded.uid!==decoded.sub)return deny(401,'Prijava ne pripada očekivanom projektu.');
  try{await requireRole(db,{uid:decoded.uid,token:decoded});}
  catch(e){return deny(e instanceof RoleError?403:503,'Nema potvrđenog dopuštenja za obradu.');}
  return true;
 };
}
module.exports={createHttpRoleGate};
