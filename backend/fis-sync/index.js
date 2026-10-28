'use strict';
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const logger = require('firebase-functions/logger');
const { syncStocks } = require('./sync');
initializeApp();
exports.fisSyncDaily = onSchedule({
  schedule: '0 6 * * *', timeZone: 'Europe/Zagreb', region: 'europe-west1',
  memory: '256MiB', timeoutSeconds: 540, maxInstances: 1, concurrency: 1, retryCount: 0
}, async () => {
  const db = getFirestore();
  try { logger.info('Dnevna FIS provjera', await syncStocks(db, { logger })); }
  catch (error) {
    await db.doc('fis_sync_status/daily').set({ outcome: 'failed', startedAt: null, scanned: null, linked: null, unlinked: null, products: null, invalidLinks: null, errorsByKind: null, checked: null, failed: null, changed: null, updated: null, attempted: null, finishedAt: null, error: 'Dnevna FIS provjera nije dovršena.', lastAttemptAt: new Date().toISOString() }, { merge: true });
    logger.error('Dnevna FIS provjera nije dovršena', { reason: 'sync_failed' }); throw error;
  }
});
