// Real Firebase Web SDK/Auth emulator linking. No Google consent UI, production accounts or business writes.
const assert=require('node:assert/strict');
(async()=>{
  if(process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')throw new Error('Only the isolated loopback demo Auth emulator is allowed');
  const {initializeApp,deleteApp}=require('firebase/app'),sdk=require('firebase/auth');
  const app=initializeApp({projectId:'demo-opg-auth',apiKey:'demo-public-web-config',authDomain:'demo-opg-auth.firebaseapp.com'},'uid-link-test-'+Date.now());
  const auth=sdk.getAuth(app);sdk.connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
  const jwt=subject=>['eyJhbGciOiJub25lIn0',Buffer.from(JSON.stringify({sub:subject,email:subject+'@example.test',email_verified:true,iss:'https://accounts.google.com',aud:'demo-client',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),''].join('.');
  try{
    const anonymous=await sdk.signInAnonymously(auth),uid=anonymous.user.uid;
    const linked=await sdk.linkWithCredential(anonymous.user,sdk.GoogleAuthProvider.credential(jwt('link-'+Date.now())));
    assert.equal(linked.user.uid,uid);assert.equal(linked.user.isAnonymous,false);assert.ok(linked.user.providerData.some(p=>p.providerId==='google.com'));
    await sdk.signOut(auth);assert.equal(auth.currentUser,null);
    const separate=await sdk.signInAnonymously(auth);assert.notEqual(separate.user.uid,uid);
    const existing=await sdk.signInWithCredential(auth,sdk.GoogleAuthProvider.credential(jwt('existing-'+Date.now()))),googleUid=existing.user.uid,token=await existing.user.getIdToken();assert.ok(token);await sdk.signOut(auth);
    const preserve=await sdk.signInAnonymously(auth),preservedUid=preserve.user.uid;
    // Use the same test provider subject a second time to force a real credential conflict.
    const idToken=jwt('conflict-'+Date.now());await sdk.signOut(auth);const owner=await sdk.signInWithCredential(auth,sdk.GoogleAuthProvider.credential(idToken));assert.notEqual(owner.user.uid,preservedUid);await sdk.signOut(auth);
    const retry=await sdk.signInAnonymously(auth),retryUid=retry.user.uid;
    await assert.rejects(sdk.linkWithCredential(retry.user,sdk.GoogleAuthProvider.credential(idToken)),e=>e.code==='auth/credential-already-in-use');assert.equal(auth.currentUser.uid,retryUid);assert.equal(auth.currentUser.isAnonymous,true);assert.notEqual(googleUid,retryUid);
    console.log('PASS: real Firebase Auth emulator preserves anonymous UID on Google linking, isolates a new account after logout and leaves the anonymous UID intact on conflict');
  }finally{await sdk.signOut(auth);await deleteApp(app);}
})().catch(()=>{console.error('Auth emulator test failed; no credentials or provider tokens are printed');process.exitCode=1;});
