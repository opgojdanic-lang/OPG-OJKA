/* Explicit, authenticated photo analysis. No provider key or automatic spraying. */
(function(scope){
  'use strict';
  function mount({photo,crop,note,upload,save,getPhotos,isPreparing}){
    const el=(tag,value,cls)=>{const e=document.createElement(tag);if(value!=null)e.textContent=value;if(cls)e.className=cls;return e;};
    const box=el('section',null,'protect-ai');box.append(el('h4','Pomoć pri prepoznavanju problema'));
    const hint=el('p','Jedna analiza obuhvaća do tri fotografije. Mjesečni limit: 100 pokušaja za cijeli OPG.','protect-muted');
    const consentLabel=el('label',null,'protect-ai-consent');const consent=el('input');consent.type='checkbox';consent.id='protect-ai-consent';
    consentLabel.append(consent,el('span','Želim poslati odabrane fotografije, kulturu i opis OpenAI servisu radi analize. Fotografije se ne spremaju u Firebase.'));
    const controls=el('div'),status=el('p','Prvo provjeri je li AI analiza omogućena za ovaj uređaj.','protect-muted');status.setAttribute('role','status');status.id='protect-ai-status';
    const usage=el('p','','protect-muted');usage.id='protect-ai-usage';const result=el('div');result.id='protect-ai-result';
    const setup=el('details');setup.append(el('summary','Podaci za uključivanje ovog uređaja'));const uidText=el('p','Poveži Firebase za prikaz identifikatora uređaja.','protect-muted');setup.append(uidText);
    const makeButton=(label,fn)=>{const b=el('button',label,'protect-button');b.type='button';b.addEventListener('click',fn);return b;};
    const check=makeButton('Provjeri dostupnost AI-ja',async()=>{await loadUsage();});check.id='protect-ai-check';
    const analyze=makeButton('Analiziraj fotografije',run);analyze.id='protect-ai-analyze';
    const newAttempt=makeButton('Novi pokušaj — koristi novi zahtjev',()=>{requestId=null;lastInput=null;current=null;result.replaceChildren();newAttempt.hidden=true;status.textContent='Spreman novi pokušaj. I on ulazi u mjesečni limit.';});newAttempt.hidden=true;
    controls.append(check,analyze,newAttempt);box.append(hint,consentLabel,controls,status,usage,result,setup);photo.append(box);
    let busy=false,requestId=null,lastInput=null,current=null,functions=null;
    const snapshot=()=>JSON.stringify({culture:crop.value,note:note.value.trim(),photos:getPhotos()});
    function setBusy(value){busy=value;[check,analyze,newAttempt,crop,note,upload,save,consent].forEach(e=>e.disabled=value);}
    function reset(){if(busy)return;requestId=null;lastInput=null;current=null;result.replaceChildren();newAttempt.hidden=true;consent.checked=false;}
    [crop,note,upload].forEach(e=>e.addEventListener('change',reset));note.addEventListener('input',reset);
    async function sdk(){
      if(!localStorage.getItem('opg_fb_config'))throw new Error('Poveži aplikaciju s Firebaseom prije AI analize.');
      const [apps,auth,fn]=await Promise.all([import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js')]);
      const app=apps.getApps()[0],user=app&&auth.getAuth(app).currentUser;
      if(!user)throw new Error('Pričekaj da se dovrši prijava u Firebase.');
      uidText.textContent='Firebase UID ovog uređaja: '+user.uid+'. Dodaje se u dopuštene uređaje pri postavljanju.';
      functions={fn,instance:fn.getFunctions(app,'europe-west1')};return functions;
    }
    async function call(name,data){const {fn,instance}=await sdk();return (await fn.httpsCallable(instance,name,{timeout:85000})(data)).data;}
    function showUsage(u){
      if(!u||!Number.isFinite(u.attempts)||!Number.isFinite(u.limit))throw new Error('Status potrošnje nije dostupan.');
      const money=n=>Number(n||0).toFixed(4)+' USD';
      usage.textContent=`${u.month} · ${u.attempts}/${u.limit} pokušaja · preostalo ${u.remaining}. Procjena AI troška: ${money(u.estimatedUsd)} (bez Firebasea i poreza).`;
      if(u.sampleCount)usage.textContent+=` Uzorak prvih ${u.sampleCount}/20 obračunatih odgovora: ${money(u.sampleUsd)}; prosjek ${money(u.sampleUsd/u.sampleCount)} po odgovoru.`;
      if(u.unaccounted)usage.textContent+=` Za ${u.unaccounted} pokušaja trošak još nije poznat; nisu uključeni u procjenu.`;
      if(u.sampleCount===20)usage.textContent+=' Uzorak od 20 odgovora je spreman za provjeru troška i kvalitete.';
    }
    function errorMessage(e){
      const code=String(e.code||'');
      if(code.endsWith('not-found'))return 'AI funkcija još nije objavljena u Firebaseu.';
      if(code.endsWith('permission-denied'))return 'AI analiza nije omogućena za ovaj uređaj. Otvori podatke za uključivanje uređaja.';
      if(code.endsWith('internal'))return 'Zahtjev nije dovršen. Provjeri potrošnju prije novog pokušaja.';
      return e.message||'Povezivanje nije uspjelo.';
    }
    async function loadUsage(){
      if(busy||isPreparing())return;setBusy(true);
      try{showUsage(await call('pestPhotoUsage',{}));status.textContent='AI je dostupan. Provjeri fotografije i opis prije slanja.';}
      catch(e){status.textContent=errorMessage(e);}
      finally{setBusy(false);}
    }
    function renderResult(r){
      result.replaceChildren(el('h4','Rezultat AI analize — mogući uzroci'));
      const summary=el('details');summary.append(el('summary','Sažetak analize'),el('p',r.summary));result.append(summary);
      result.append(el('p','Ovo nije potvrđena dijagnoza niti preporuka prskanja.','protect-disclaimer'));
      const addList=(title,items)=>{if(!items?.length)return;result.append(el('h4',title));const list=el('ul');items.forEach(x=>list.append(el('li',x)));result.append(list);};
      const causes=r.possibleCauses||[], primary=causes[0];
      result.append(el('h4','1. Najvjerojatniji uzrok'),el('p',primary?primary.name+' — AI pretpostavka, nije potvrđena dijagnoza.':'Nije moguće izdvojiti uzrok iz fotografija.'));
      result.append(el('h4','2. Razina pouzdanosti'),el('p',primary?(primary.confidence==='moderate'?'Umjerena':'Niska')+' — procjena AI-ja, bez potvrde u nasadu.':'Nedovoljno podataka za procjenu.'));
      addList('3. Vidljivi simptomi — opažanja AI-ja na fotografiji',r.visibleSigns.length?r.visibleSigns:['Nema jasno izdvojenih vidljivih simptoma.']);
      addList('4. Što provjeriti u nasadu',[...new Set([...causes.map(c=>c.check),...(r.fieldChecks?.length?r.fieldChecks:['Pregledaj više biljaka i zabilježi razvoj simptoma.'])])]);
      const hypothesis=(c,parent)=>{
        const d=el('div',null,'protect-candidate');d.append(el('h4',c.name+' · '+(c.confidence==='moderate'?'umjerena':'niska')+' sigurnost'),el('p','AI pretpostavka i obrazloženje: '+c.evidence));
        if(c.kind!=='abiotic'){
          const label=el('label',null,'protect-ai-consent'),confirmed=el('input');confirmed.type='checkbox';label.append(confirmed,el('span','Pregledao sam nasad i želim provjeriti FIS zapise za ovaj mogući uzrok.'));
          const open=makeButton('Pretraži FIS za: '+c.name,()=>{if(!confirmed.checked)return;const input=document.getElementById('protect-problem');input.value=c.name;input.dispatchEvent(new Event('input'));document.querySelector('#zastita-subnav [data-sub="zastita-prijedlozi"]')?.click();});open.disabled=true;confirmed.addEventListener('change',()=>open.disabled=!confirmed.checked);d.append(label,open);
        }parent.append(d);
      };
      const alternatives=el('details');alternatives.append(el('summary','5. Alternativni mogući uzroci'));
      if(causes.length<2)alternatives.append(el('p','Analiza nije izdvojila dodatne uzroke. To ih ne isključuje.'));
      causes.slice(1).forEach(c=>hypothesis(c,alternatives));result.append(alternatives);
      result.append(el('h4','6. Sljedeći preporučeni korak'),el('p','Pregledaj više biljaka i provjeri navedene znakove. Ako uzrok ostane nejasan, zatraži stručni pregled. FIS pretraga nakon potvrde opažanja nije automatska preporuka za prskanje.'));
      if(primary)hypothesis(primary,result);
      const more=el('details');more.append(el('summary','Dodatne fotografije za provjeru'));(r.nextPhotos||[]).forEach(x=>more.append(el('p',x)));result.append(more);
    }
    async function run(){
      if(busy||isPreparing())return;
      if(!getPhotos().length){status.textContent='Dodaj barem jednu fotografiju problema.';return;}
      if(!note.value.trim()){status.textContent='Kratko opiši što primjećuješ.';return;}
      if(!consent.checked){status.textContent='Potvrdi slanje fotografija i opisa na AI analizu.';return;}
      const encoded=snapshot();if(encoded!==lastInput){requestId=crypto.randomUUID();lastInput=encoded;current=null;result.replaceChildren();}
      setBusy(true);newAttempt.hidden=true;status.textContent='Analiziram fotografije… Nemoj zatvoriti aplikaciju.';
      try{
        const response=await call('pestPhotoAnalyze',{...JSON.parse(encoded),requestId});
        if(!response?.result)throw new Error('Nije dobiven rezultat analize.');
        current=response.result;renderResult(current);showUsage(response.usage);status.textContent=response.replayed?'Prikazan je već dobiven rezultat, bez nove AI analize.':'Analiza je završena. Provjeri moguće uzroke u nasadu; rezultat možeš spremiti uz opažanje.';
      }catch(e){status.textContent=errorMessage(e)+' Ponovno slanje istog zahtjeva neće pokrenuti novu analizu ako je već zaprimljen.';newAttempt.hidden=false;
        try{showUsage(await call('pestPhotoUsage',{}));}catch(_){}
      }finally{setBusy(false);}
    }
    return {reset,current:()=>lastInput===snapshot()?current:null};
  }
  scope.OpgPestAi={mount};
})(window);
