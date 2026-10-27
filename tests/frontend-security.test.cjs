const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('browser assets keep OpenAI secrets and direct provider calls on the server',()=>{
  const root=path.resolve(__dirname,'..');
  for(const file of fs.readdirSync(root).filter(f=>/\.(html|js|css)$/.test(f))){
    const source=fs.readFileSync(path.join(root,file),'utf8');
    // Report filenames only; never echo a matching credential.
    assert.equal(source.includes('OPG_OPENAI_API_KEY'),false,file+': server secret binding in browser asset');
    assert.equal(source.includes('firebase-admin'),false,file+': privileged SDK imported by browser asset');
    assert.equal(source.includes('setCustomUserClaims'),false,file+': privileged claims mutation in browser asset');
    assert.equal(/-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(source),false,file+': private key material in browser asset');
    assert.equal(source.includes('api.openai.com'),false,file+': direct provider request in browser asset');
    assert.equal(/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/.test(source),false,file+': possible provider credential in browser asset');
  }
});
