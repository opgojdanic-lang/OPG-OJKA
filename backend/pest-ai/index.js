'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { AnalysisError, analyze, status } = require('./analysis');
initializeApp();
const apiKey=defineSecret('OPG_OPENAI_API_KEY');
const options={region:'europe-west1',memory:'256MiB',timeoutSeconds:90,maxInstances:1,concurrency:4,minInstances:0,cors:['https://opgojdanic-lang.github.io']};
async function handle(fn){try{return await fn();}catch(e){if(e instanceof AnalysisError)throw new HttpsError(e.code,e.message);throw new HttpsError('internal','Zahtjev nije dovršen. Provjeri status prije ponovnog slanja.');}}
exports.pestPhotoAnalyze=onCall({...options,secrets:[apiKey]},request=>handle(()=>analyze(getFirestore(),request.auth?.uid,request.data,{apiKey:apiKey.value()})));
exports.pestPhotoUsage=onCall(options,request=>handle(()=>status(getFirestore(),request.auth?.uid)));
