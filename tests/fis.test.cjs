const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalize, stale, verified, cultureMatches, organismMatches, findProducts } = require('../fis.js');
test('missing or malformed regulatory payload is rejected', () => {
  assert.throws(() => normalize({}, 1));
  assert.throws(() => normalize({ basicInfo: { productName: 'X' } }, 1));
});
test('textual PHI and absent limits are preserved without inventing a dose', () => {
  const r = normalize({ basicInfo: { productName: '<X>', registrationStatus: 'REGISTRIRAN' },
    culturesAndHarmfulOrganisms: [{ culture: { name: { hr: 'Paprika' }, safetyPeriod: 'Osigurana vremenom primjene' },
      harmfulOrganisms: [{ name: { hr: 'Primjer' }, maxNumberOfTreatmentsPerSeason: 0 }] }] }, 42);
  assert.equal(r.uses[0].phi, 'Osigurana vremenom primjene');
  assert.equal(r.uses[0].organisms[0].max, 0);
  assert.equal(r.uses[0].organisms[0].usage, '');
  assert.equal(r.id, '42');
});
test('failed, future, missing or day-old timestamps cannot appear fresh', () => {
  const now = Date.now();
  for (const checkedAt of [null, 'bad', new Date(now + 1000).toISOString(), new Date(now - 86400000).toISOString()])
    assert.equal(stale({ checkedAt }, now), true);
  assert.equal(stale({ checkedAt: new Date(now - 1000).toISOString() }, now), false);
});

test('only fresh, successful, explicitly registered records qualify for candidates',()=>{
  const checkedAt=new Date().toISOString(), product={id:'374',name:'LASER',registration:'TEST',status:'REGISTRIRAN'};
  assert.equal(verified({product,checkedAt}),true);
  for(const r of [{product:{...product,status:{}},checkedAt},{product:{...product,registration:''},checkedAt},{product:{...product,id:'undefined'},checkedAt},{product},{product,checkedAt,error:'offline'},{product:{...product,status:'UKINUT'},checkedAt},{product:{...product,status:'NIJE REGISTRIRAN'},checkedAt},{product:{...product,status:'Status nije naveden'},checkedAt}])assert.equal(verified(r),false);
});

test('Laser SC alias offers only catalogue-confirmed LASER 374 without inventing registration',()=>{
  const laser={pppId:374,productName:'LASER'};
  assert.deepEqual(findProducts([laser],' Laser SC '),[laser]);
  assert.deepEqual(findProducts([{pppId:99,productName:'LASER'}],'Laser SC'),[]);
  assert.deepEqual(findProducts([{pppId:374,productName:'Different'}],'Laser SC'),[]);
  assert.deepEqual(findProducts([],'Laser SC'),[]);
  assert.equal(laser.productRegistrationNumber,undefined);
});

test('crop matching keeps cultivar and cultivation qualifiers without broad squash or substring matches',()=>{
  for(const label of ['Paprika','Paprika babura','Paprika (u zaštićenom prostoru)']) assert.equal(cultureMatches(label,'PAPRIKA BABURA'),true,label);
  for(const label of ['Ukrasna paprika','Paprika (ukrasna)','Ljuta paprika','Krumpir']) assert.equal(cultureMatches(label,'PAPRIKA BABURA'),false,label);
  assert.equal(cultureMatches('Tikvice (na otvorenom)','TIKVICA'),true);
  for(const label of ['Tikva','Tikvice','Muškatna tikva','Tikvasta paprika','Tikva (osim butternut)'])assert.equal(cultureMatches(label,'BUTTERNUT TIKVA'),false,label);
  for(const label of ['Tikva butternut','Butternut tikva','Tikva (butternut)'])assert.equal(cultureMatches(label,'BUTTERNUT TIKVA'),true,label);
  assert.equal(cultureMatches('Tikva butternut','TIKVICA'),false);
});
test('organism search handles whole terms and explicit Latin names, never unverified synonyms',()=>{
  const trips={name:'kalifornijski trips',nameLat:'Frankliniella occidentalis'};
  assert.equal(organismMatches(trips,'TRIPS'),true);
  assert.equal(organismMatches(trips,'Trips (Frankliniella occidentalis)'),true);
  assert.equal(organismMatches(trips,'tripsi'),false);
  assert.equal(organismMatches(trips,'ips'),false);
  assert.equal(organismMatches(trips,'Thrips tabaci'),false);
  assert.equal(organismMatches({name:'Pepelnica'},'pepélnica'),true);
  assert.equal(organismMatches({name:'Zelena breskvina uš'},'lisne uši'),false);
});
test('client and server reject malformed nested FIS data and invalid IDs consistently',()=>{
  const {prepare}=require('../backend/fis-sync/sync');
  const base={basicInfo:{productName:'Test',registrationStatus:'REGISTRIRAN'},culturesAndHarmfulOrganisms:[]};
  for(const rows of [[1],[null],[{harmfulOrganisms:[1]}],[{harmfulOrganisms:{}}],[{harmfulOrganisms:[null]}],[{harmfulOrganisms:[{usage:{}}]}]]){
    assert.throws(()=>normalize({...base,culturesAndHarmfulOrganisms:rows},374));
    assert.throws(()=>prepare({...base,culturesAndHarmfulOrganisms:rows},374));
  }
  assert.throws(()=>normalize(base,'undefined'));
  assert.deepEqual(findProducts([{productName:'Test'}],'Test'),[]);
});
