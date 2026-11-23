// Prepare only aiGenerate in a disposable directory. This avoids loading unrelated
// functions during discovery and prevents other in-progress work entering this deploy.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'tukfit-ai-deploy-'));
const source = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
const corsStart = source.indexOf('const ALLOWED_ORIGINS =');
const corsEnd = source.indexOf('function cleanText', corsStart);
const aiStart = source.indexOf('/* AI 기능별 정책');
const aiEnd = source.indexOf('async function migrateAnonymousData', aiStart);
if ([corsStart, corsEnd, aiStart, aiEnd].some(index => index < 0)) throw new Error('Cannot locate the canonical AI entry point');
fs.mkdirSync(path.join(stage, 'functions'));
fs.cpSync(path.join(root, 'functions/ai'), path.join(stage, 'functions/ai'), { recursive: true });
for (const file of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(root, 'functions', file), path.join(stage, 'functions', file));
fs.writeFileSync(path.join(stage, 'functions/index.js'), `const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp();
${source.slice(corsStart, corsEnd)}
${source.slice(aiStart, aiEnd)}`);
fs.writeFileSync(path.join(stage, 'firebase.json'), JSON.stringify({ functions: { source: 'functions', ignore: ['node_modules', '*.log'] } }, null, 2));
console.log(stage);
