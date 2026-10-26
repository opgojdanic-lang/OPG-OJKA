const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalize, stale } = require('../fis.js');
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
