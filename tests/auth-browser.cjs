const {chromium,webkit,devices}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
(async()=>{
  const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
  await new Promise(r=>server.listen(8768,'127.0.0.1',r));server.unref();
  const engine=process.env.BROWSER_ENGINE==='webkit'?'webkit':'chromium';
  const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='webkit'&&process.env.WEBKIT_PATH?{executablePath:process.env.WEBKIT_PATH}:{}),...(engine==='chromium'&&process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']}: {})});
  const page=await browser.newPage({...engine==='webkit'?devices['iPhone 13']:{},viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    localStorage.setItem('opg_fb_config',JSON.stringify({projectId:'opg-ojka',apiKey:'demo-public-web-config',authDomain:'opg-ojka.firebaseapp.com'}));
    localStorage.setItem('opg_prodaja',JSON.stringify([{id:'legacy-local',proizvod:'PRIVATE LEGACY DATA',datum:'2026-10-01',kg:1,cijena_kg:1}]));
  });
  await page.route('https://www.gstatic.com/firebasejs/10.12.2/**',route=>{
    const name=route.request().url().split('/').at(-1);let body='';
    if(name==='firebase-app.js')body=`export const getApps=()=>window.testApp?[window.testApp]:[];export const initializeApp=options=>(window.testApp={options});`;
    else if(name==='firebase-auth.js')body=`
      const stored=sessionStorage.getItem('test-auth-user');const auth={app:window.testApp,currentUser:stored?JSON.parse(stored):{uid:'anon-original',isAnonymous:true,providerData:[]}};window.testAuth=auth;window.authCalls=[];const listeners=new Set();
      const change=user=>{auth.currentUser=user;sessionStorage.setItem('test-auth-user',JSON.stringify(user));listeners.forEach(fn=>queueMicrotask(()=>fn(user)));};window.testChangeUser=change;
      const google=uid=>({uid,isAnonymous:false,emailVerified:true,email:uid+'@example.test',displayName:'Google account',providerData:[{providerId:'google.com'}]});
      export const getAuth=()=>auth;export const onAuthStateChanged=(_,fn)=>{queueMicrotask(()=>fn(auth.currentUser));return()=>{};};export const onIdTokenChanged=(_,fn)=>{listeners.add(fn);return()=>listeners.delete(fn);};
      export class GoogleAuthProvider{setCustomParameters(p){window.providerParameters=p;}}
      export const linkWithPopup=async user=>{window.authCalls.push('link');if(window.linkError)throw Object.assign(new Error('do-not-display-provider-secret'),{code:window.linkError});const linked=google(user.uid);change(linked);return{user:linked};};
      export const signInWithPopup=async()=>{window.authCalls.push('google');const user=google(window.nextGoogle||'google-unapproved');change(user);return{user};};
      export const signInAnonymously=async()=>{window.authCalls.push('anonymous');const user={uid:'new-anon',isAnonymous:true,providerData:[]};change(user);return{user};};export const signOut=async()=>{window.authCalls.push('logout');change(null);};
      export const signInWithRedirect=async()=>{window.authCalls.push('redirect');throw new Error('redirect must not run');};export const linkWithRedirect=signInWithRedirect;export const getRedirectResult=async()=>null;
    `;
    else if(name==='firebase-firestore.js')body=`
      const permissions=['finance_read','finance_write','inventory_read','inventory_write','treatments_read','treatments_write','licenses_read','licenses_write','farm_read','farm_write','settings_read','settings_manage','protection_read','activities_read','activities_create','notifications_write'];
      const grants={'anon-original':{enabled:true,roleVersion:1,role:'MEMBER'},'google-admin':{enabled:true,roleVersion:1,role:'OWNER'}};
      const data=ref=>ref.path.startsWith('access_members/')?(window.testGrants||grants)[ref.path.split('/')[1]]:ref.path==='settings/app'?{prag_pdv:60000}:ref.path==='access_control/member'?{uid:'anon-original'}:{};
      const snapshot=ref=>({metadata:{fromCache:false,hasPendingWrites:false},exists:()=>!!data(ref),data:()=>data(ref),docs:ref.path==='prodaja'?[{id:'shared-sale',data:()=>({proizvod:'APPROVED SHARED DATA',kupac:'RIBOLA',datum:'2026-10-01',kg:2,cijena_kg:3,placeno:true})}]:[]});
      window.testSubscriptions=[];window.testReads=[];window.testWrites=[];
      export const getFirestore=()=>({});export const doc=(_, ...parts)=>({path:parts.join('/')});export const collection=(_, ...parts)=>({path:parts.join('/'),collection:true});
      export const getDocFromServer=async ref=>{window.testReads.push({path:ref.path,uid:window.testAuth.currentUser?.uid});return snapshot(ref);};
      export const getDocsFromServer=async ref=>{const uid=window.testAuth.currentUser?.uid;window.testReads.push({path:ref.path,uid});if(window.holdActivities)return await new Promise(resolve=>window.releaseOldActivities=()=>resolve({docs:[{data:()=>({tekst:'LATE OLD PRIVATE EVENT',unio:'old',auth_uid:'other',ts:Date.now()})}]}));return{docs:[]};};
      export function onSnapshot(ref,...args){const next=typeof args[0]==='function'?args[0]:args[1];const sub={path:ref.path,uid:window.testAuth.currentUser?.uid,active:true,next};window.testSubscriptions.push(sub);queueMicrotask(()=>{if(sub.active)next(snapshot(ref));});return()=>sub.active=false;}
      export const getDocs=getDocsFromServer;export const setDoc=async(ref,value)=>window.testWrites.push({path:ref.path,value});export const updateDoc=setDoc;export const deleteDoc=async ref=>window.testWrites.push({path:ref.path,deleted:true});
      export const writeBatch=()=>({set:setDoc,commit:async()=>{}});
    `;
    else if(name==='firebase-functions.js')body=`export const getFunctions=()=>({});export const httpsCallable=(_,name)=>async data=>{if(name==='opgManageMember'&&window.testAuth.currentUser?.uid==='google-admin'){(window.managementCalls||=[]).push({name,data});return{data:{uid:data.uid,role:'MEMBER',enabled:data.enabled}};}throw new Error('No paid AI during auth tests');};`;
    else return route.abort();
    return route.fulfill({contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body});
  });
  await page.goto('http://127.0.0.1:8768/');
  await page.waitForFunction(()=>window.testAuth?.currentUser?.uid==='anon-original');
  await page.locator('#opg-google-login').waitFor();
  assert.equal(await page.locator('#opg-root').getAttribute('data-access'),'locked','even a legacy anonymous UID with a role record is rejected');
  assert.equal(await page.evaluate(()=>window.testSubscriptions.some(s=>!s.path.startsWith('access_members/'))),false);
  await page.locator('#opg-google-login').click();
  await page.waitForFunction(()=>window.OpgAuth?.session?.uid==='anon-original');
  assert.equal(await page.locator('#opg-root').getAttribute('data-access'),'authorized');
  assert.equal(await page.getByText('OWNER · upravljanje MEMBER računom',{exact:true}).isVisible(),false);
  assert.ok(!(await page.locator('#opg-content').textContent()).includes('PRIVATE LEGACY DATA'));
  assert.ok((await page.locator('#opg-content').textContent()).includes('APPROVED SHARED DATA'));
  for(const name of ['pocetna','plan','financije','proizvodnja','zastita','pregled'])await page.locator('[data-tab="'+name+'"]').click();
  await page.locator('[data-tab="zastita"]').click();await page.locator('#protect-note').fill('Unsent observation on the same UID');
  await page.evaluate(()=>{window.holdActivities=true;window.OpgAuth.controller.refresh();});
  await page.waitForFunction(()=>!!window.releaseOldActivities);
  await page.locator('#opg-auth-refresh').click();await page.waitForFunction(()=>window.testAuth.currentUser?.isAnonymous===false&&window.OpgAuth.session?.uid==='anon-original');
  assert.equal(await page.locator('#protect-note').inputValue(),'Unsent observation on the same UID');
  assert.equal(await page.locator('#opg-google-redirect').isDisabled(),true);assert.equal(await page.evaluate(()=>window.authCalls.includes('redirect')),false);
  await page.evaluate(()=>{window.nextGoogle='google-unapproved';window.holdActivities=false;document.getElementById('isk-fullscreen-name').textContent='OLD PRIVATE LICENSE';});await page.locator('#opg-google-login').click();
  await page.waitForFunction(()=>window.testAuth.currentUser?.uid==='google-unapproved'&&document.getElementById('opg-root').dataset.access==='locked');
  assert.equal(await page.locator('#isk-fullscreen-name').textContent(),'');
  assert.equal(await page.evaluate(()=>window.OpgAuth.session),null);assert.ok((await page.locator('#opg-auth').textContent()).includes('Nema potvrđenih poslovnih ovlasti'));
  await page.evaluate(()=>{window.releaseOldActivities?.();const sub=window.testSubscriptions.find(s=>s.uid==='anon-original'&&s.path==='prodaja');sub?.next({metadata:{fromCache:false},docs:[{id:'late',data:()=>({proizvod:'LATE OLD DATA',datum:'2026-10-01'})}]});});
  assert.ok(!(await page.locator('#opg-content').textContent()).includes('APPROVED SHARED DATA'));assert.ok(!(await page.locator('#opg-content').textContent()).includes('LATE OLD DATA'));assert.equal(await page.locator('#activity-modal-list').textContent(),'');
  assert.equal(await page.evaluate(()=>window.testSubscriptions.some(s=>s.uid==='google-unapproved'&&!s.path.startsWith('access_members/'))),false);
  await page.evaluate(()=>window.nextGoogle='google-admin');await page.locator('#opg-google-login').click();await page.waitForFunction(()=>window.OpgAuth.session?.uid==='google-admin');
  assert.equal(await page.evaluate(()=>Object.isFrozen(window.OpgAuth.session)&&Object.isFrozen(window.OpgAuth.session.permissions)),true);
  assert.ok((await page.locator('#opg-auth').textContent()).includes('OWNER · glavni administrator'));assert.equal(await page.locator('#f-prodaja-submit').isDisabled(),false);
  assert.equal(await page.getByText('OWNER · upravljanje MEMBER računom',{exact:true}).isVisible(),true);
  await page.getByText('OWNER · upravljanje MEMBER računom',{exact:true}).click();
  await page.getByRole('button',{name:'Provjeri trenutačni MEMBER UID',exact:true}).click();await page.getByText('MEMBER veza: anon-original',{exact:true}).waitFor();
  await page.getByLabel('Firebase UID MEMBER korisnika',{exact:true}).fill('brother-google');page.on('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Odobri MEMBER pristup',exact:true}).click();await page.getByText('MEMBER ovlasti spremljene na serveru.',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.managementCalls),[{name:'opgManageMember',data:{uid:'brother-google',enabled:true}}]);
  await page.locator('#opg-auth-logout').click();await page.waitForFunction(()=>window.testAuth.currentUser===null&&document.getElementById('opg-root').dataset.access==='locked');
  assert.equal(await page.evaluate(()=>window.authCalls.includes('anonymous')),false);assert.equal(await page.evaluate(()=>window.testSubscriptions.some(s=>s.active)),false);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('opg_prodaja'))[0].proizvod),'PRIVATE LEGACY DATA');
  await page.reload();await page.locator('#opg-google-login').waitFor();assert.equal(await page.locator('#opg-root').getAttribute('data-access'),'locked');assert.equal(await page.evaluate(()=>window.authCalls.includes('anonymous')),false);
  // Explicit anonymous action, then conflict: no automatic sign-in to the pre-existing Google UID.
  await page.locator('#opg-anonymous-login').click();await page.waitForFunction(()=>window.testAuth.currentUser?.uid==='new-anon');
  await page.evaluate(()=>window.linkError='auth/credential-already-in-use');await page.locator('#opg-google-login').click();await page.getByText(/Google račun već pripada drugom Firebase UID-u/).waitFor();
  assert.equal(await page.evaluate(()=>window.testAuth.currentUser.uid),'new-anon');assert.equal(await page.evaluate(()=>window.authCalls.includes('google')),false);
  assert.ok(!(await page.locator('#opg-auth').textContent()).includes('do-not-display-provider-secret'));assert.deepEqual(errors,[]);
  await browser.close();server.close();console.log(engine+': PASS full app anonymous UID linking, Google without rights, server-granted OWNER and MEMBER, account switching, stale callback isolation, logout/reload, preserved legacy data and all module navigation');
})().catch(error=>{console.error(error);process.exit(1);});
