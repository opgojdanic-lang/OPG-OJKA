'use strict';
const BUSINESS_PERMISSIONS=['finance_read','finance_write','inventory_read','inventory_write','treatments_read','treatments_write','licenses_read','licenses_write','farm_read','farm_write','settings_read','settings_manage','protection_read','activities_read','activities_create','notifications_write'];
const OWNER_PERMISSIONS=[...BUSINESS_PERMISSIONS,'users_manage','security_manage'];
class RoleError extends Error {constructor(code,message){super(message);this.code=code;}}
function google(auth){return !!auth?.uid&&auth.token?.firebase?.sign_in_provider==='google.com'&&auth.token?.email_verified===true;}
function role(record){return record?.enabled===true&&record.roleVersion===1&&['OWNER','MEMBER'].includes(record.role)?record.role:'UNAPPROVED';}
async function requireRole(db,auth,ownerOnly=false){
  if(!auth?.uid)throw new RoleError('unauthenticated','Potrebna je Google prijava.');
  if(!google(auth))throw new RoleError('permission-denied','Potrebna je potvrđena Google prijava; anonimni račun nema poslovne ovlasti.');
  const current=role((await db.doc('access_members/'+auth.uid).get()).data());
  if(current==='UNAPPROVED'||(ownerOnly&&current!=='OWNER'))throw new RoleError('permission-denied','Nema odobrene uloge za ovu radnju.');
  if((await db.doc('access_control/'+(current==='OWNER'?'owner':'member')).get()).data()?.uid!==auth.uid)throw new RoleError('permission-denied','OWNER nije potvrđen u zaštićenom registru.');
  return current;
}
module.exports={BUSINESS_PERMISSIONS,OWNER_PERMISSIONS,RoleError,google,role,requireRole};
