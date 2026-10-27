/* Public HTTP client patch. Business image/parsed payload contract is unchanged. */
(function(scope){
 'use strict';
 // Never send Firebase bearer credentials to a database-configurable arbitrary host.
 // Add a run.app alias only after its exact public URL/project mapping is independently verified.
 const ENDPOINT='https://europe-west1-opg-ojka.cloudfunctions.net/fisPhotoLookup';
 function endpoint(value){
  const u=new URL(value);
  if(u.href!==ENDPOINT&&u.href!==ENDPOINT+'/')throw new Error('Adresa obrade nije na provjerenom popisu. Administrator mora potvrditi adresu prije slanja prijave.');
  return u.href;
 }
 async function request({url,user,session,image,mimeType='image/jpeg',isCurrent=()=>true,fetchImpl=scope.fetch}){
  const target=endpoint(url);
  if(!user||user.isAnonymous||user.emailVerified!==true||!user.providerData?.some(p=>p.providerId==='google.com')||user.uid!==session?.uid||!session.enabled||!['OWNER','MEMBER'].includes(session.role))throw new Error('Za obradu je potrebna odobrena Google OWNER/MEMBER prijava.');
  if(!isCurrent())throw new Error('Prijava se promijenila. Fotografija nije poslana.');
  let token;try{token=await user.getIdToken();}catch(_){throw new Error('Prijavu nije moguće potvrditi. Fotografija nije poslana.');}
  if(!token||!isCurrent())throw new Error('Prijava se promijenila ili nije potvrđena. Fotografija nije poslana.');
  let response;
  try{response=await fetchImpl(target,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({image,mimeType}),redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});}
  catch(_){throw new Error('Obrada nije potvrđena zbog mrežne ili CORS pogreške. Zahtjev nije automatski ponovljen.');}
  if(!isCurrent())throw new Error('Prijava se promijenila. Rezultat nije primijenjen.');
  if(response.status===401)throw new Error('Prijava je istekla ili nije prihvaćena. Ponovno se prijavi; nema automatskog ponavljanja.');
  if(response.status===403)throw new Error('Server nije odobrio pristup. Potrebna je provjera ovlasti ili transportne karantene.');
  if(!response.ok)throw new Error('Obrada fotografije nije uspjela. Zahtjev nije automatski ponovljen.');
  return response;
 }
 const api={endpoint,request};if(typeof module!=='undefined'&&module.exports)module.exports=api;else scope.OpgFisPhoto=api;
})(typeof window==='undefined'?globalThis:window);
