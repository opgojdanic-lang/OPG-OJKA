/* Firebase Web Auth only. Authorization remains in the protected server-managed registry. */
(function(scope){
  'use strict';
  const PERMISSIONS=['finance_read','finance_write','inventory_read','inventory_write','treatments_read','treatments_write','licenses_read','licenses_write','farm_read','farm_write','settings_read','settings_manage','protection_read','activities_read','activities_create','notifications_write'];
  function access(record,user){
    const role=user&&!user.isAnonymous&&user.emailVerified===true&&user.providerData?.some(p=>p.providerId==='google.com')&&record?.enabled===true&&record.roleVersion===1&&['OWNER','MEMBER'].includes(record.role)?record.role:'UNAPPROVED';
    return {role,permissions:role==='OWNER'?[...PERMISSIONS,'users_manage','security_manage']:role==='MEMBER'?[...PERMISSIONS]:[],administrator:role==='OWNER',enabled:role!=='UNAPPROVED'};
  }
  function redirectSupported(origin,authDomain){
    // These origins serve Firebase Hosting reserved auth helpers. GitHub Pages does not.
    return ['https://opg-ojka.firebaseapp.com','https://opg-ojka.web.app'].includes(origin)&&origin==='https://'+authDomain;
  }
  function message(error){
    const messages={
      'auth/popup-blocked':'Preglednik je blokirao skočni prozor. Dopusti popup za ovu stranicu i ponovno pritisni prijavu. Ne prelazimo automatski na redirect.',
      'auth/popup-closed-by-user':'Prozor prijave je zatvoren. Postojeći račun nije zamijenjen.',
      'auth/cancelled-popup-request':'Drugi prozor prijave je već otvoren. Dovrši ga ili zatvori pa pokušaj ponovno.',
      'auth/credential-already-in-use':'Google račun već pripada drugom Firebase UID-u. Anonimni UID nije obrisan; podaci i ovlasti nisu spojeni. Zabilježi postojeći UID i zatraži administratorsku provjeru.',
      'auth/account-exists-with-different-credential':'Račun već postoji s drugim načinom prijave. Ne spajamo račune niti prenosimo podatke automatski.',
      'auth/unauthorized-domain':'Domena prijave nije odobrena u odabranom Firebase projektu. Provjeri projekt, Authorized domains i OAuth konfiguraciju.',
      'auth/operation-not-allowed':'Ovaj način prijave nije omogućen u konfiguriranom Firebase projektu.',
      'auth/network-request-failed':'Prijava nije dovršena zbog mrežne pogreške. Postojeći podaci nisu migrirani.',
      'auth/web-storage-unsupported':'Preglednik ne dopušta potrebnu pohranu prijave. Ne briši postojeću pohranu anonimnog računa; provjeri postavke preglednika.',
      'auth/provider-already-linked':'Google je već povezan s ovim računom. Osvježi provjeru identiteta i ovlasti.',
      'auth/requires-recent-login':'Potrebna je svježa prijava prije povezivanja računa. Nema automatske migracije.',
      'opg/redirect-unsupported':'Redirect nije podržan na ovoj GitHub Pages/različitoj authDomain adresi. Koristi popup; Authorized domains sam nije dovoljan.',
      'opg/redirect-state':'Stanje redirect prijave nije pouzdano dostupno. Koristi popup; anonimni račun ne prenosimo automatski.',
      'opg/link-uid-changed':'Povezivanje je neočekivano vratilo drugi UID. Pristup podacima je zaustavljen; računi i ovlasti nisu migrirani.',
      'opg/anonymous-signout':'Odjava anonimnog računa zahtijeva potvrdu jer povratak istog UID-a možda neće biti moguć.'
    };
    return messages[error?.code]||'Prijava nije dovršena. Provjeri Firebase konfiguraciju i pokušaj ponovno. Tajni podaci pogreške nisu prikazani.';
  }
  const failure=code=>Object.assign(new Error(code),{code});
  function createController({sdk,auth,origin,authDomain,storage,onSession=()=>{},onUser=()=>{},onMessage=()=>{},onBusy=()=>{}}){
    const key='opg_google_redirect_v1';let busy=false,stop=null,signature=null,expectedUid=null,quarantined=false,disposed=false;
    const userInfo=user=>user?{uid:user.uid,isAnonymous:user.isAnonymous===true,displayName:user.displayName||'',email:user.email||'',providers:(user.providerData||[]).map(p=>p.providerId),quarantined}:null;
    async function apply(user,force=false){
      if(disposed)return;
      if(expectedUid&&user&&user.uid!==expectedUid){quarantined=true;onMessage(message(failure('opg/link-uid-changed')));}
      const info=userInfo(user),next=JSON.stringify(info);
      if(!force&&signature===next)return;signature=next;onUser(info);
      await onSession(quarantined?null:user);
    }
    async function run(action){if(disposed||busy)return false;busy=true;onBusy(true);try{return await action();}catch(error){if(!disposed)onMessage(message(error));return false;}finally{busy=false;if(!disposed)onBusy(false);}}
    async function start(){
      return run(async()=>{
        const initial=await new Promise((resolve,reject)=>{const unsubscribe=sdk.onAuthStateChanged(auth,user=>queueMicrotask(()=>{unsubscribe();resolve(user);}),reject);});
        if(disposed)return false;
        let intent=null;try{intent=JSON.parse(storage?.getItem(key)||'null');}catch(_){onMessage(message(failure('opg/redirect-state')));}
        if(intent){
          if(!redirectSupported(origin,authDomain)||intent.projectId!==auth.app.options.projectId||!Number.isFinite(intent.at)||Date.now()-intent.at<0||Date.now()-intent.at>3600000){quarantined=true;onMessage(message(failure('opg/redirect-state')));}
          else {
            expectedUid=intent.kind==='link'?intent.uid:null;
            try{const result=await sdk.getRedirectResult(auth);if(result?.user&&expectedUid&&result.user.uid!==expectedUid)throw failure('opg/link-uid-changed');storage.removeItem(key);}
            catch(error){if(error.code==='opg/link-uid-changed')quarantined=true;onMessage(message(error));}
          }
        }
        stop=(sdk.onIdTokenChanged||sdk.onAuthStateChanged)(auth,user=>{apply(user).catch(()=>onMessage('Ovlasti nije moguće provjeriti. Pristup podacima ostaje zatvoren.'));});
        await apply(auth.currentUser||initial);expectedUid=null;
        // Do not silently create a new anonymous UID after a logout or failed redirect.
        if(!auth.currentUser&&!intent)onMessage('Odjavljeni ste. Odaberite Google prijavu ili izričito nastavite anonimno.');
        return true;
      });
    }
    async function login(redirect=false){return run(async()=>{
      const previous=auth.currentUser,link=previous?.isAnonymous===true;
      const provider=new sdk.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
      expectedUid=link?previous.uid:null;
      if(redirect){
        if(!redirectSupported(origin,authDomain))throw failure('opg/redirect-unsupported');
        try{storage.setItem(key,JSON.stringify({kind:link?'link':'signin',uid:previous?.uid||null,projectId:auth.app.options.projectId,at:Date.now()}));}catch(_){throw failure('opg/redirect-state');}
        try{await (link?sdk.linkWithRedirect(previous,provider):sdk.signInWithRedirect(auth,provider));return true;}
        catch(error){try{storage.removeItem(key);}catch(_){}expectedUid=null;throw error;}
      }
      try{
        const result=await (link?sdk.linkWithPopup(previous,provider):sdk.signInWithPopup(auth,provider));
        if(disposed)return false;
        if(link&&result.user.uid!==previous.uid){quarantined=true;await apply(result.user,true);throw failure('opg/link-uid-changed');}
        quarantined=false;expectedUid=null;try{storage?.removeItem(key);}catch(_){}await apply(result.user,true);
        onMessage(link?'Google račun je povezan; postojeći Firebase UID je sačuvan. Dopuštenja provjerava server.':'Google prijava je uspješna. Prijava sama ne dodjeljuje poslovne ili administratorske ovlasti.');return true;
      }finally{expectedUid=null;}
    });}
    async function anonymous(){return run(async()=>{if(auth.currentUser)return false;const result=await sdk.signInAnonymously(auth);quarantined=false;await apply(result.user);onMessage('Anonimni račun je otvoren. Prava se ne dodjeljuju automatski.');return true;});}
    async function logout(confirmed=false){return run(async()=>{
      if(auth.currentUser?.isAnonymous&&!confirmed)throw failure('opg/anonymous-signout');
      await onSession(null); // Detach all readers before the SDK changes identities.
      try{await sdk.signOut(auth);}catch(error){await apply(auth.currentUser,true);throw error;}
      expectedUid=null;quarantined=false;try{storage?.removeItem(key);}catch(_){}await apply(null,true);onMessage('Odjavljeni ste. Poslovni podaci nisu obrisani niti preneseni drugom računu.');return true;
    });}
    return {start,login,anonymous,logout,refresh:()=>run(()=>apply(auth.currentUser,true)),dispose:()=>{disposed=true;stop?.();},redirectAvailable:redirectSupported(origin,authDomain),current:()=>userInfo(auth.currentUser)};
  }
  function mount(host){
    const doc=host.ownerDocument,el=(tag,text)=>{const e=doc.createElement(tag);if(text)e.textContent=text;return e;};
    host.className='opg-auth-panel';const identity=el('p','Firebase nije povezan.'),uid=el('p'),status=el('p'),rights=el('p');status.setAttribute('role','status');rights.setAttribute('aria-live','polite');uid.className='opg-auth-uid';
    let controller=null,busy=false,info=null;
    const button=(label,fn)=>{const b=el('button',label);b.type='button';b.className='opg-submit secondary';b.addEventListener('click',fn);return b;};
    const google=button('Prijavi se Google računom',()=>controller?.login());google.id='opg-google-login';
    const redirect=button('Google prijava preusmjeravanjem',()=>controller?.login(true));redirect.id='opg-google-redirect';
    const anon=button('Nastavi anonimno',()=>controller?.anonymous());anon.id='opg-anonymous-login';
    const refresh=button('Osvježi provjeru ovlasti',()=>controller?.refresh());refresh.id='opg-auth-refresh';
    const out=button('Odjavi se',()=>{if(info?.isAnonymous&&!scope.confirm('Odjava može onemogućiti povratak istog anonimnog UID-a. Prvo ga poveži s Googleom ili zabilježi UID za administratora. Poslovni podaci se ne brišu. Nastaviti?'))return;controller?.logout(true);});out.id='opg-auth-logout';
    const help=el('details'),summary=el('summary','Prijava na iPhoneu i razlika između prijave i ovlasti');help.append(summary,el('p','Na GitHub Pagesu koristi popup. Redirect nije automatska zamjena za blokirani popup; Authorized domains ne postavlja /__/auth helper. U PWA i Safariju pohrana može biti odvojena: prije promjene preglednika zabilježi postojeći UID. Nema automatskog prijenosa anonimnog računa, podataka ili prava.'));
    const ownerPanel=el('details'),ownerSummary=el('summary','OWNER · upravljanje MEMBER računom'),target=el('input');target.placeholder='Neovisno provjereni Firebase UID';target.setAttribute('aria-label','Firebase UID MEMBER korisnika');target.maxLength=128;ownerPanel.hidden=true;
    async function manage(enabled){const actorUid=info?.uid;if(!scope.confirm((enabled?'Odobriti':'Opozvati')+' MEMBER ulogu za točno ovaj UID: '+target.value+'?'))return;const uid=target.value;status.textContent='Server provjerava OWNER ovlasti…';try{const apps=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),f=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js');await f.httpsCallable(f.getFunctions(apps.getApps()[0],'europe-west1'),'opgManageMember')({uid,enabled});if(info?.uid===actorUid)status.textContent='MEMBER ovlasti spremljene na serveru.';}catch(_){if(info?.uid===actorUid)status.textContent='Promjena nije potvrđena. Provjeri OWNER ovlasti i stvarni UID; ne ponavljaj naslijepo.';}}
    ownerPanel.append(ownerSummary,button('Provjeri trenutačni MEMBER UID',async()=>{const actor=info?.uid;try{const apps=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),fs=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),snap=await fs.getDocFromServer(fs.doc(fs.getFirestore(apps.getApps()[0]),'access_control','member'));if(info?.uid===actor)status.textContent=snap.exists()?'MEMBER veza: '+snap.data().uid:'Nema aktivne MEMBER veze.';}catch(_){if(info?.uid===actor)status.textContent='MEMBER vezu nije moguće potvrditi na serveru.';}}),target,button('Odobri MEMBER pristup',()=>manage(true)),button('Opozovi MEMBER pristup',()=>manage(false)));
    for(const control of ['ai','fis_sync'])for(const enabled of [true,false])ownerPanel.append(button((enabled?'Uključi ':'Isključi ')+(control==='ai'?'AI analizu':'FIS sinkronizaciju'),async()=>{const actor=info?.uid;if(!scope.confirm('Potvrdi promjenu '+control+' enabled='+enabled+'?'))return;try{const apps=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),f=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js');await f.httpsCallable(f.getFunctions(apps.getApps()[0],'europe-west1'),'opgSecurityControl')({control,enabled});if(info?.uid===actor)status.textContent='Serverska kontrola je spremljena.';}catch(_){if(info?.uid===actor)status.textContent='Serverska kontrola nije potvrđena. Provjeri ovlasti i stanje prije ponavljanja.';}}));
    host.append(identity,uid,google,redirect,anon,out,refresh,status,rights,ownerPanel,help);
    function render(){identity.textContent=info?(info.isAnonymous?'Anonimni korisnik':((info.providers.includes('google.com')?'Google · ':'')+[info.displayName,info.email].filter(Boolean).join(' · ')||'Prijavljeni korisnik')):'Odjavljeni ste';uid.textContent=info?'Firebase UID: '+info.uid:'';google.textContent=info?.isAnonymous?'Poveži anonimni račun s Googleom':info?'Promijeni Google račun':'Prijavi se Google računom';google.disabled=busy||!controller;redirect.disabled=busy||!controller?.redirectAvailable;anon.hidden=!!info;anon.disabled=busy||!controller;out.hidden=!info;out.disabled=busy||!controller;refresh.hidden=!info;refresh.disabled=busy||!controller;}
    render();return {bind:c=>{controller=c;render();},user:u=>{if(info?.uid!==u?.uid){target.value='';ownerPanel.hidden=true;}info=u;render();},message:text=>{status.textContent=text;},busy:value=>{busy=value;render();},access:a=>{ownerPanel.hidden=a?.role!=='OWNER';rights.textContent=a?.enabled?(a.administrator?'OWNER · glavni administrator.':'MEMBER · puni poslovni pristup bez upravljanja korisnicima i sigurnošću.'):'Nema potvrđenih poslovnih ovlasti. Google prijava sama nije odobrenje pristupa.';}};
  }
  const api={PERMISSIONS,access,redirectSupported,message,createController,mount};if(typeof module!=='undefined'&&module.exports)module.exports=api;else scope.OpgAuth=api;
})(typeof window==='undefined'?globalThis:window);
