// 포트폴리오 캡처 전용 in-memory Firestore 대체 모듈
import { seedDocs } from './seed.js';

class Ts {
  constructor(s, ns = 0) { this.seconds = s; this.nanoseconds = ns; }
  toDate() { return new Date(this.seconds * 1000); }
  toMillis() { return this.seconds * 1000; }
  valueOf() { return this.seconds; }
  static fromDate(d) { return new Ts(Math.floor(d.getTime() / 1000)); }
  static fromMillis(m) { return new Ts(Math.floor(m / 1000)); }
  static now() { return Ts.fromDate(new Date()); }
}
export const Timestamp = Ts;

const SERVER_TS = { __serverTs: true };
const DEL = { __delete: true };
export const serverTimestamp = () => SERVER_TS;
export const deleteField = () => DEL;

const store = new Map();
const listeners = new Set();
let autoN = 0;
const autoId = () => `auto${Date.now()}${autoN++}`;

for (const [path, data] of Object.entries(seedDocs(Ts))) store.set(path, data);

export const getFirestore = () => ({ path: '' });
export const connectFirestoreEmulator = () => {};
export const clearIndexedDbPersistence = () => Promise.resolve();
export const terminate = () => Promise.resolve();

const join = (base, segs) => [base, ...segs].filter(Boolean).join('/');
export function collection(parent, ...segs) {
  const path = join(parent.path, segs);
  return { type: 'collection', path, id: path.split('/').pop() };
}
export function doc(parent, ...segs) {
  if (parent.type === 'collection' && segs.length === 0) segs = [autoId()];
  const path = join(parent.path, segs);
  return { type: 'document', path, id: path.split('/').pop() };
}

export const where = (f, op, v) => ({ k: 'where', f, op, v });
export const orderBy = (f, dir = 'asc') => ({ k: 'orderBy', f, dir });
export const limit = n => ({ k: 'limit', n });
export const startAfter = s => ({ k: 'startAfter', s });
export const query = (ref, ...c) => ({ type: 'query', path: ref.path, c });

const clone = v => (v instanceof Ts ? v : Array.isArray(v) ? v.map(clone) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v);
const getF = (o, f) => f.split('.').reduce((a, k) => a?.[k], o);
const cmpV = v => (v instanceof Ts ? v.seconds : v);

function docSnap(path) {
  const data = store.get(path);
  const ref = { type: 'document', path, id: path.split('/').pop() };
  return { id: ref.id, ref, exists: () => data !== undefined, data: () => (data ? clone(data) : undefined), get: f => getF(data, f) };
}

function runQuery(q) {
  const c = q.c || [];
  const depth = q.path.split('/').length + 1;
  let paths = [...store.keys()].filter(p => p.startsWith(q.path + '/') && p.split('/').length === depth);
  for (const w of c.filter(x => x.k === 'where')) {
    paths = paths.filter(p => {
      const v = cmpV(getF(store.get(p), w.f)); const t = cmpV(w.v);
      switch (w.op) {
        case '==': return v === t; case '!=': return v !== t;
        case '<': return v < t; case '<=': return v <= t; case '>': return v > t; case '>=': return v >= t;
        case 'in': return w.v.includes(v); case 'array-contains': return (v || []).includes(t);
        default: return true;
      }
    });
  }
  for (const o of c.filter(x => x.k === 'orderBy').reverse()) {
    paths.sort((a, b) => {
      const x = cmpV(getF(store.get(a), o.f)) ?? 0, y = cmpV(getF(store.get(b), o.f)) ?? 0;
      return (x < y ? -1 : x > y ? 1 : 0) * (o.dir === 'desc' ? -1 : 1);
    });
  }
  const sa = c.find(x => x.k === 'startAfter');
  if (sa?.s?.ref) { const i = paths.indexOf(sa.s.ref.path); if (i >= 0) paths = paths.slice(i + 1); }
  const lim = c.find(x => x.k === 'limit');
  if (lim) paths = paths.slice(0, lim.n);
  const docs = paths.map(docSnap);
  return { docs, size: docs.length, empty: !docs.length, forEach: fn => docs.forEach(fn), docChanges: () => [] };
}

function resolve(data, prev = {}) {
  const out = { ...prev };
  for (const [k, v] of Object.entries(data)) {
    if (v === DEL) { delete out[k]; continue; }
    const val = v === SERVER_TS ? Ts.now() : v;
    if (k.includes('.')) {
      const ks = k.split('.'); let o = out;
      ks.slice(0, -1).forEach(x => { o[x] = { ...(o[x] || {}) }; o = o[x]; });
      o[ks.at(-1)] = val;
    } else out[k] = val;
  }
  return out;
}
const notify = () => setTimeout(() => listeners.forEach(l => l()), 0);

export async function getDoc(ref) { return docSnap(ref.path); }
export async function getDocs(q) { return runQuery(q); }
export async function setDoc(ref, data, opts) {
  store.set(ref.path, resolve(data, opts?.merge ? store.get(ref.path) : {})); notify();
}
export async function updateDoc(ref, data) { store.set(ref.path, resolve(data, store.get(ref.path))); notify(); }
export async function addDoc(col, data) { const ref = doc(col); await setDoc(ref, data); return ref; }
export async function deleteDoc(ref) { store.delete(ref.path); notify(); }
export async function runTransaction(_db, fn) {
  return fn({ get: getDoc, update: (r, d) => updateDoc(r, d), set: (r, d, o) => setDoc(r, d, o), delete: deleteDoc });
}
export function onSnapshot(ref, next) {
  const fire = () => next(ref.type === 'document' ? docSnap(ref.path) : runQuery(ref));
  listeners.add(fire); setTimeout(fire, 0);
  return () => listeners.delete(fire);
}
