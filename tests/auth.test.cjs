const {test}=require('node:test'),assert=require('node:assert/strict');
const {createController,access,redirectSupported,message}=require('../auth');
function harness(initial=null,options={}){
  const auth={currentUser:initial,app:{options:{projectId:'opg-ojka'}}},listeners=new Set(),store=new Map(),calls=[],sessions=[],users=[],messages=[];
  const change=user=>{auth.currentUser=user;listeners.forEach(fn=>queueMicrotask(()=>fn(user)));};
  const google=uid=>({uid,isAnonymous:false,displayName:'Google member',email:'person@example.test',providerData:[{providerId:'google.com'}]});
  const sdk={GoogleAuthProvider:class{setCustomParameters(p){calls.push(['parameters',p]);}},
    onAuthStateChanged:(_,fn)=>{queueMicrotask(()=>fn(auth.currentUser));return()=>{};},onIdTokenChanged:(_,fn)=>{listeners.add(fn);return()=>listeners.delete(fn);},
    signInAnonymously:async()=>{calls.push(['anonymous']);const user={uid:'new-anon',isAnonymous:true,providerData:[]};change(user);return{user};},
    linkWithPopup:async user=>{calls.push(['link',user.uid]);if(options.linkError)throw Object.assign(new Error('hidden-token'),{code:options.linkError});const linked=google(options.wrongUid?'unexpected':user.uid);change(linked);return{user:linked};},
    signInWithPopup:async()=>{calls.push(['signin']);const user=google('google-existing');change(user);return{user};},
    signOut:async()=>{calls.push(['signout']);change(null);},linkWithRedirect:async user=>{calls.push(['linkRedirect',user.uid]);},signInWithRedirect:async()=>calls.push(['signinRedirect']),
    getRedirectResult:async()=>{calls.push(['redirectResult']);return options.redirectResult||null;}};
  const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  const c=createController({sdk,auth,storage,origin:options.origin||'https://opgojdanic-lang.github.io',authDomain:options.authDomain||'opg-ojka.firebaseapp.com',onSession:u=>sessions.push(u?.uid||null),onUser:u=>users.push(u),onMessage:m=>messages.push(m)});
  return{c,sdk,auth,store,calls,sessions,users,messages,change,google};
}
test('existing anonymous UID links to Google without creating, deleting or migrating a user',async()=>{
  const h=harness({uid:'original-anon',isAnonymous:true,providerData:[]});await h.c.start();await h.c.login();
  assert.equal(h.auth.currentUser.uid,'original-anon');assert.equal(h.auth.currentUser.isAnonymous,false);assert.ok(h.calls.some(c=>c[0]==='link'));assert.ok(!h.calls.some(c=>['signin','anonymous','signout'].includes(c[0])));assert.ok(h.sessions.every(uid=>uid==='original-anon'));assert.deepEqual(h.calls.find(c=>c[0]==='parameters')[1],{prompt:'select_account'});
});
test('Google credential conflict retains anonymous session and never falls back to another account',async()=>{
  const h=harness({uid:'preserve-anon',isAnonymous:true,providerData:[]},{linkError:'auth/credential-already-in-use'});await h.c.start();assert.equal(await h.c.login(),false);assert.equal(h.auth.currentUser.uid,'preserve-anon');assert.equal(h.calls.some(c=>c[0]==='signin'),false);assert.ok(h.messages.at(-1).includes('nisu spojeni'));assert.ok(!h.messages.join('').includes('hidden-token'));
});
test('unexpected UID from linking quarantines all data access',async()=>{
  const h=harness({uid:'preserve-anon',isAnonymous:true,providerData:[]},{wrongUid:true});await h.c.start();assert.equal(await h.c.login(),false);assert.equal(h.sessions.at(-1),null);assert.ok(h.users.at(-1).quarantined);
});
test('signed-out startup and logout never silently create a new anonymous UID',async()=>{
  const h=harness();await h.c.start();assert.deepEqual(h.calls,[]);await h.c.login();assert.equal(h.auth.currentUser.uid,'google-existing');await h.c.logout();assert.equal(h.auth.currentUser,null);assert.equal(h.sessions.at(-1),null);assert.equal(h.calls.some(c=>c[0]==='anonymous'),false);
});
test('anonymous creation and loss of its session require explicit actions',async()=>{
  const h=harness();await h.c.start();await h.c.anonymous();assert.equal(h.auth.currentUser.uid,'new-anon');assert.equal(await h.c.logout(),false);assert.equal(h.auth.currentUser.uid,'new-anon');await h.c.logout(true);assert.equal(h.auth.currentUser,null);
});
test('GitHub Pages cannot enable redirect by changing authDomain or blocking a popup',async()=>{
  for(const authDomain of ['opgojdanic-lang.github.io','opg-ojka.firebaseapp.com'])assert.equal(redirectSupported('https://opgojdanic-lang.github.io',authDomain),false);
  const h=harness({uid:'anon',isAnonymous:true},{linkError:'auth/popup-blocked'});await h.c.start();await h.c.login();assert.ok(!h.calls.some(c=>c[0].includes('Redirect')));assert.equal(await h.c.login(true),false);assert.equal(h.store.size,0);
});
test('same-origin Firebase Hosting redirect keeps a link intent and verifies the resumed UID',async()=>{
  const origin='https://opg-ojka.firebaseapp.com',h=harness({uid:'anon',isAnonymous:true},{origin});await h.c.start();assert.equal(await h.c.login(true),true);assert.ok(h.calls.some(c=>c[0]==='linkRedirect'));assert.equal(JSON.parse(h.store.get('opg_google_redirect_v1')).uid,'anon');
  const bad=harness({uid:'unexpected',isAnonymous:false},{origin,redirectResult:{user:{uid:'unexpected'}}});bad.store.set('opg_google_redirect_v1',JSON.stringify({kind:'link',uid:'anon',projectId:'opg-ojka',at:Date.now()}));await bad.c.start();assert.equal(bad.sessions.at(-1),null);
});
test('roles require Google identity and a versioned server record, legacy scopes grant nothing',()=>{
 const google={isAnonymous:false,emailVerified:true,providerData:[{providerId:'google.com'}]};
 for(const record of [null,{enabled:true,administrator:true,permissions:['finance_read']},{enabled:true,role:'OWNER'},{enabled:false,roleVersion:1,role:'OWNER'}])assert.equal(access(record,google).enabled,false);
 for(const role of ['OWNER','MEMBER']){const r=access({enabled:true,roleVersion:1,role},google);assert.equal(r.role,role);assert.ok(r.permissions.includes('finance_write'));assert.equal(r.permissions.includes('users_manage'),role==='OWNER');assert.equal(access({enabled:true,roleVersion:1,role},{...google,isAnonymous:true}).enabled,false);}
});
test('auth errors show known Croatian messages, not credentials or raw provider payloads',()=>{
  for(const code of ['auth/popup-blocked','auth/unauthorized-domain','auth/network-request-failed','auth/account-exists-with-different-credential','unknown'])assert.ok(!message({code,message:'hidden-token',customData:{credential:'hidden-token'}}).includes('hidden-token'));
});
const {plan}=require('../scripts/grant-administrator.cjs');
test('operator bootstrap pins one verified Google OWNER and refuses automatic owner replacement',()=>{
 const user={uid:'verified-google',emailVerified:true,providerData:[{providerId:'google.com'}]},args={projectId:'opg-ojka',uid:user.uid,user};
 assert.deepEqual(plan(args),{enabled:true,role:'OWNER',roleVersion:1});
 for(const change of [{projectId:'other'},{existingOwner:{uid:'other'}},{existing:{role:'MEMBER'}},{user:{...user,emailVerified:false}},{user:{...user,disabled:true}},{user:{...user,providerData:[]}},{uid:'other'}])assert.throws(()=>plan({...args,...change}));
});
test('disposed auth observers cannot restore a previous identity after configuration changes',async()=>{
  const h=harness({uid:'old-anon',isAnonymous:true});await h.c.start();const count=h.sessions.length;h.change(h.google('old-callback'));h.c.dispose();await new Promise(r=>setTimeout(r,0));assert.equal(h.sessions.length,count);assert.equal(await h.c.login(),false);
});
test('failed logout locks first and rechecks only the unchanged current identity',async()=>{
  const h=harness({uid:'existing',isAnonymous:false});await h.c.start();h.sdk.signOut=async()=>{throw Object.assign(new Error('hidden-token'),{code:'auth/network-request-failed'});};assert.equal(await h.c.logout(),false);assert.ok(h.sessions.includes(null));assert.equal(h.sessions.at(-1),'existing');assert.equal(h.auth.currentUser.uid,'existing');
});
test('redirect refuses unavailable session storage before invoking any provider navigation',async()=>{
  const h=harness({uid:'anon',isAnonymous:true},{origin:'https://opg-ojka.firebaseapp.com'});await h.c.start();h.store.set=()=>{throw new Error('storage unavailable');};assert.equal(await h.c.login(true),false);assert.equal(h.calls.some(c=>c[0]==='linkRedirect'),false);assert.equal(h.auth.currentUser.uid,'anon');
});
