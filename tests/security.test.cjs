const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {parseFirebaseConfig,escapeHtml}=require('../security');
test('Firebase console/JSON config parses as flat data without executing pasted JavaScript',()=>{
  assert.deepEqual(parseFirebaseConfig('const firebaseConfig = {apiKey:"public-web-config",projectId:"demo-project",authDomain:"demo.test",}; ignored();'),{apiKey:'public-web-config',projectId:'demo-project',authDomain:'demo.test'});
  assert.deepEqual(parseFirebaseConfig('{"apiKey":"public","projectId":"demo"}'),{apiKey:'public',projectId:'demo'});
  for(const input of ['{apiKey:evil(),projectId:"demo"}','{apiKey:"x",projectId:"demo",apiKey:"y"}','{apiKey:"x",projectId:"demo",__proto__:"bad"}','{apiKey:"x"}','{apiKey:"x",projectId:"demo",nested:{}}'])assert.throws(()=>parseFirebaseConfig(input));
});
test('HTML text and attribute delimiters are encoded',()=>{assert.equal(escapeHtml('<img src=x onerror="bad()">&\''),'&lt;img src=x onerror=&quot;bad()&quot;&gt;&amp;&#39;');});
test('production HTML has no embedded private seed and CSP permits only reviewed scripts',()=>{
  const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
  for(const name of ['SEED_PRODAJA','SEED_HISTORY_2024_2025','SEED_LICENCE','SEED_PARCELE'])assert.equal(html.includes(name),false,'private initial data marker must not ship');
  assert.equal(/\boib\s*:\s*['"]\d{11}['"]/.test(html),false,'personal identifier literal must not ship');
  assert.equal(/new Function\s*\(|\beval\s*\(/.test(html),false);
  const policy=html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.ok(!policy.includes("'unsafe-inline'")&&!policy.includes("'unsafe-eval'"));
  for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc=/.test(script[1]))assert.ok(policy.includes("'sha256-"+createHash('sha256').update(script[2]).digest('base64')+"'"),'run node scripts/update-csp.cjs after editing inline app code');
});
