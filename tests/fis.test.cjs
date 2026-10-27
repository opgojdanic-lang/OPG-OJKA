const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalize, stale, verified, findProducts } = require('../fis.js');
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
  const checkedAt=new Date().toISOString(), product={status:'REGISTRIRAN'};
  assert.equal(verified({product,checkedAt}),true);
  for(const r of [{product},{product,checkedAt,error:'offline'},{product:{status:'UKINUT'},checkedAt},{product:{status:'NIJE REGISTRIRAN'},checkedAt},{product:{status:'Status nije naveden'},checkedAt}])assert.equal(verified(r),false);
});

test('Laser SC alias offers only catalogue-confirmed LASER 374 without inventing registration',()=>{
  const laser={pppId:374,productName:'LASER'};
  assert.deepEqual(findProducts([laser],' Laser SC '),[laser]);
  assert.deepEqual(findProducts([{pppId:99,productName:'LASER'}],'Laser SC'),[]);
  assert.deepEqual(findProducts([{pppId:374,productName:'Different'}],'Laser SC'),[]);
  assert.deepEqual(findProducts([],'Laser SC'),[]);
  assert.equal(laser.productRegistrationNumber,undefined);
});
