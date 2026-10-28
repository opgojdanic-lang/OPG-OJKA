'use strict';
const {RoleError,requireRole,role}=require('./roles');
const validUid=uid=>typeof uid==='string'&&/^[^/\s]{1,128}$/.test(uid)&&!['.','..'].includes(uid);
async function manageMember(db,adminAuth,auth,data){
  await requireRole(db,auth,true);
  if(!data||Object.keys(data).some(k=>!['uid','enabled'].includes(k))||!validUid(data.uid)||typeof data.enabled!=='boolean'||data.uid===auth.uid)throw new RoleError('invalid-argument','Navedi drugi provjereni UID i enabled; OWNER se ovim postupkom ne mijenja.');
  const target=await adminAuth.getUser(data.uid);
  if(data.enabled&&(target.disabled||!target.emailVerified||!target.providerData.some(p=>p.providerId==='google.com')))throw new RoleError('failed-precondition','Ciljni račun nije potvrđeni Google korisnik.');
  await db.runTransaction(async tx=>{
    const ownerRef=db.doc('access_control/owner'),actorRef=db.doc('access_members/'+auth.uid),targetRef=db.doc('access_members/'+data.uid),slotRef=db.doc('access_control/member');
    const [owner,actor,existing,slot]=await Promise.all([tx.get(ownerRef),tx.get(actorRef),tx.get(targetRef),tx.get(slotRef)]);
    if(owner.data()?.uid!==auth.uid||role(actor.data())!=='OWNER')throw new RoleError('permission-denied','OWNER ovlasti su opozvane.');
    if(existing.data()?.role==='OWNER'||owner.data()?.uid===data.uid)throw new RoleError('failed-precondition','OWNER se ovim postupkom ne mijenja.');
    if(data.enabled&&slot.data()?.uid&&slot.data().uid!==data.uid)throw new RoleError('failed-precondition','Prvo opozovi postojećeg MEMBER korisnika.');
    tx.set(targetRef,{role:'MEMBER',roleVersion:1,enabled:data.enabled,approvedBy:auth.uid,updatedAt:new Date().toISOString()},{merge:true});
    tx.set(db.collection('access_audit').doc(),{actorUid:auth.uid,targetUid:data.uid,action:'member_access',enabled:data.enabled,at:new Date().toISOString()});
    if(data.enabled)tx.set(slotRef,{uid:data.uid});
    else if(slot.data()?.uid===data.uid)tx.delete(slotRef);
  });
  return {uid:data.uid,role:'MEMBER',enabled:data.enabled};
}

async function getMemberStatus(db,auth,data){
  await requireRole(db,auth,true);
  if(data != null && (typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length))
    throw new RoleError('invalid-argument','Upit ne prima parametre.');
  const snapshot = await db.doc('access_control/member').get();
  return {uid: snapshot.exists ? snapshot.data()?.uid || null : null};
}
module.exports={manageMember,validUid,getMemberStatus};

async function securityControl(db,auth,data){
  await requireRole(db,auth,true);
  if(!data||Object.keys(data).some(k=>!['control','enabled'].includes(k))||!['ai','fis_sync'].includes(data.control)||typeof data.enabled!=='boolean')throw new RoleError('invalid-argument','Dopuštene su samo eksplicitne AI/FIS enabled postavke.');
  await db.runTransaction(async tx=>{
    const [actor,owner]=await Promise.all([tx.get(db.doc('access_members/'+auth.uid)),tx.get(db.doc('access_control/owner'))]);
    if(role(actor.data())!=='OWNER'||owner.data()?.uid!==auth.uid)throw new RoleError('permission-denied','OWNER ovlasti su opozvane.');
    tx.set(db.doc(data.control==='ai'?'ai_private/config':'settings/fis_sync'),{enabled:data.enabled},{merge:true});
    tx.set(db.collection('access_audit').doc(),{actorUid:auth.uid,action:'security_control',control:data.control,enabled:data.enabled,at:new Date().toISOString()});
  });
  return {control:data.control,enabled:data.enabled};
}
module.exports.securityControl=securityControl;
