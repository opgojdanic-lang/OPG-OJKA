'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const {requireRole,RoleError}=require('./roles');
const {manageMember,getMemberStatus,securityControl}=require('./administration');
const { getFirestore } = require('firebase-admin/firestore');
const { AnalysisError, analyze, status } = require('./analysis');
initializeApp();
const apiKey=defineSecret('OPG_OPENAI_API_KEY');
const options={region:'europe-west1',memory:'256MiB',timeoutSeconds:90,maxInstances:1,concurrency:4,minInstances:0,cors:['https://opgojdanic-lang.github.io']};
async function handle(fn){try{return await fn();}catch(e){if(e instanceof AnalysisError || e instanceof RoleError)throw new HttpsError(e.code,e.message);throw new HttpsError('internal','Zahtjev nije dovršen. Provjeri status prije ponovnog slanja.');}}
exports.pestPhotoAnalyze=onCall({...options,secrets:[apiKey]},request=>handle(async()=>{const db=getFirestore();await requireRole(db,request.auth);return analyze(db,request.auth.uid,request.data,{apiKey:apiKey.value()});}));
exports.pestPhotoUsage=onCall(options,request=>handle(async()=>{const db=getFirestore();await requireRole(db,request.auth);return status(db,request.auth.uid);}));

exports.opgManageMember=onCall(options,request=>handle(()=>manageMember(getFirestore(),getAuth(),request.auth,request.data)));
exports.opgGetMemberStatus=onCall(options,request=>handle(()=>getMemberStatus(getFirestore(),request.auth,request.data)));
exports.opgSecurityControl=onCall(options,request=>handle(()=>securityControl(getFirestore(),request.auth,request.data)));
