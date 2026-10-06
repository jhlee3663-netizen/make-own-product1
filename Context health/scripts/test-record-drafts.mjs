import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.data = new Map(); }
  get length() { return this.data.size; }
  key(index) { return [...this.data.keys()][index] ?? null; }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

globalThis.localStorage = new MemoryStorage();
const { clearRecordDraft, loadRecordDraft, saveRecordDraft, withSaveTimeout } = await import('../src/lib/recordDrafts.js');

const now = 2_000_000_000_000;
saveRecordDraft('user-A', 'workout', 'new', { sections: [{ part: '등' }], pendingDocId: 'stable-1' }, now);
assert.deepEqual(loadRecordDraft('user-A', 'workout', 'new', now + 1000), {
  sections: [{ part: '등' }], pendingDocId: 'stable-1',
});
assert.equal(loadRecordDraft('user-B', 'workout', 'new', now + 1000), null);
assert.equal(loadRecordDraft('user-A', 'diet', 'new', now + 1000), null);
assert.equal(loadRecordDraft('user-A', 'workout', 'new', now + 31 * 24 * 60 * 60 * 1000), null);

saveRecordDraft('user-A', 'diet', 'doc-1', { goalKcal: 2000 }, now);
clearRecordDraft('user-A', 'diet', 'doc-1');
assert.equal(loadRecordDraft('user-A', 'diet', 'doc-1', now), null);

assert.equal(await withSaveTimeout(Promise.resolve('ack'), 20), 'ack');
await assert.rejects(withSaveTimeout(new Promise(() => {}), 20), /작성 내용은 이 기기에 보관/);

console.log('record-drafts regression: PASS');
