const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const compiled = new Map();
function compile(file) {
  if (!compiled.has(file)) compiled.set(file, ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText);
  return compiled.get(file);
}
const safety = {};
vm.runInNewContext(compile('safety.ts'), { exports: safety, require, Date, Math, Map, Set });
const alice = { id: 'alice', name: 'Alice' }, bob = { id: 'bob', name: 'Bob' };
const source = (id = 'p1') => ({ id, nodeId: 'target', pinNodeId: `badge-${id}`, pageId: 'page', pageName: 'Page', number: 1, title: 'Original', content: 'Important content', category: 'design', status: 'todo', createdAt: 1, author: alice });
function storage() {
  const data = new Map();
  return { data, keys: () => [...data.keys()].filter(k => data.get(k)), get: k => data.get(k) || '', set: (k, v) => data.set(k, v) };
}
async function runtime(user = alice, editorType = 'figma', legacy = []) {
  const mem = storage(), messages = [], intervals = [], nodes = new Map(); let seq = 0;
  const make = type => {
    const node = { id: `n${++seq}`, type, name: '', children: [], x: 0, y: 0, parent: null, fills: [],
      setSharedPluginData() {}, getSharedPluginData() { return ''; }, getPluginData() { return ''; },
      resize() {}, appendChild(child) { child.parent = this; this.children.push(child); },
      remove() { nodes.delete(this.id); } };
    nodes.set(node.id, node); return node;
  };
  const page = make('PAGE'); page.id = 'page'; nodes.set('page', page); page.name = 'Page'; page.selection = []; page.findAll = () => [];
  const target = make('FRAME'); target.id = 'target'; target.absoluteBoundingBox = { x: 0, y: 0, width: 100, height: 100 }; target.parent = page; nodes.set('target', target); page.selection = [target];
  const root = { children: [page], getSharedPluginDataKeys: () => mem.keys(), getSharedPluginData: (_, k) => mem.get(k), setSharedPluginData: (_, k, v) => mem.set(k, v), getPluginData: () => '', setPluginData() {} };
  if (legacy.length) mem.set('smart-pin-v1', JSON.stringify(legacy));
  const client = new Map();
  const figma = { root, currentPage: page, currentUser: user, editorType, ui: { postMessage: m => messages.push(m), resize() {} }, showUI() {}, on() {}, loadAllPagesAsync: async () => {}, getNodeByIdAsync: async id => nodes.get(id) || null,
    clientStorage: { getAsync: async k => client.get(k), setAsync: async (k, v) => { client.set(k, v); } },
    loadFontAsync: async () => {}, createFrame: () => make('FRAME'), createEllipse: () => make('ELLIPSE'), createText: () => make('TEXT'), setCurrentPageAsync: async p => { figma.currentPage = p; }, viewport: { scrollAndZoomIntoView() {} }, openExternal() {} };
  vm.runInNewContext(compile('code.ts'), { exports: {}, require: n => n === './safety' ? safety : require(n), figma, __html__: '', setInterval: f => intervals.push(f), console });
  const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
  await settle();
  const send = async msg => { messages.length = 0; figma.ui.onmessage(msg); await settle(); return messages; };
  return { mem, client, figma, nodes, messages, store: new safety.PinStore(mem), send, settle, poll: async () => { intervals.forEach(f => f()); await settle(); } };
}
module.exports = { safety, alice, bob, source, storage, runtime };
