const test = require('node:test');
const assert = require('node:assert/strict');
const { safety, alice, bob, source, storage, runtime } = require('./runtime.cjs');
const { PinStore, canEdit, canStatus, editablePatch } = safety;
test('owner, editor, assignee and protection have distinct permissions', () => {
  const p = { ...source(), editors: [bob] };
  assert.equal(canEdit(p, bob), true);
  assert.equal(canEdit({ ...p, protected: true }, bob), false);
  assert.equal(canEdit({ ...p, protected: true }, alice), true);
  assert.equal(canEdit({ ...source(), assignee: bob }, bob), false);
  assert.equal(canStatus({ ...source(), assignee: bob }, bob), true);
  assert.equal(canEdit({ ...p, deletedAt: 1 }, alice), false);
  assert.equal(canEdit(p, null), false);
});
test('spoofed UPDATE_PIN cannot change author, editors, node or protection', () => {
  const p = { ...source(), revision: 'v1' };
  const next = editablePatch(p, { ...p, title: 'Updated', author: bob, editors: [bob], protected: true, pinNodeId: 'evil' }, alice);
  assert.equal(next.author.id, 'alice'); assert.equal(next.pinNodeId, p.pinNodeId);
  assert.equal(next.editors, undefined); assert.equal(next.protected, undefined);
  assert.throws(() => editablePatch(p, { ...p, content: '' }, bob), /작성자/);
  assert.throws(() => editablePatch(p, { ...p, revision: 'old' }, alice), /다른 변경/);
});
test('migration never claims existing pins and is idempotent', () => {
  const s = new PinStore(storage()); s.migrate([source()]); s.migrate([source()]);
  assert.equal(s.all().length, 1); assert.equal(s.all()[0].author, undefined); assert.equal(s.history('p1').length, 1);
});
test('large Unicode records are chunked and recover exactly', () => {
  const s = new PinStore(storage()); const p = source(); p.content = '한국어🧷'.repeat(25000);
  s.commit(p, alice, 'create'); assert.equal(s.get(p.id).content, p.content);
});
test('failed partial write keeps the previous version readable', () => {
  const mem = storage(); const s = new PinStore(mem); const p = s.commit(source(), alice, 'create');
  const original = mem.set; mem.set = (k, v) => { if (k.endsWith('.1')) throw Error('disk full'); original(k, v); };
  assert.throws(() => s.commit({ ...p, content: 'x'.repeat(30000) }, alice, 'edit', p.revision), /disk full/);
  assert.equal(s.get(p.id).content, p.content);
});
test('stale write rejected; other pins are never overwritten', () => {
  const s = new PinStore(storage()); const p = s.commit(source(), alice, 'create');
  s.commit(source('p2'), alice, 'create');
  s.commit({ ...p, title: 'Latest' }, alice, 'edit', p.revision);
  assert.throws(() => s.commit({ ...p, title: 'Stale' }, alice, 'edit', p.revision), /다른 변경/);
  assert.equal(s.get('p2').title, 'Original'); assert.equal(s.get('p1').title, 'Latest');
});
test('simultaneous branches remain in history rather than disappearing', () => {
  const a = storage(); const s = new PinStore(a); const p = s.commit(source(), alice, 'create');
  const b = storage(); for (const [k, v] of a.data) b.data.set(k, v);
  s.commit({ ...p, title: 'Writer A' }, alice, 'A', p.revision);
  new PinStore(b).commit({ ...p, title: 'Writer B' }, bob, 'B', p.revision);
  for (const [k, v] of b.data) if (!a.data.has(k)) a.data.set(k, v);
  assert.equal(s.history(p.id).length, 3); assert.equal(s.history(p.id).filter(r => r.conflict).length, 1);
  assert.equal(s.get(p.id).conflictCount, 1);
});
test('purge removes bodies and history and keeps a resurrection tombstone', () => {
  const mem = storage(); const s = new PinStore(mem); const p = s.commit({ ...source(), deletedAt: 10 }, alice, 'delete');
  s.purge(p, alice, 'confirmed');
  assert.equal(s.all().length, 0); assert.equal(s.history(p.id).length, 0);
  assert.equal([...mem.data.values()].join('').includes('Important content'), false);
  assert.throws(() => s.commit(source(), alice, 'resurrect'), /영구 삭제/);
});

test('backend rejects foreign edit/delete including bulk and number paths', async () => {
  const r = await runtime(); await r.send({ type: 'ADD_PIN', category: 'design', group: '' }); const p = r.store.all()[0];
  r.figma.currentUser = bob;
  for (const msg of [{ type: 'UPDATE_PIN', pin: { ...p, content: '' } }, { type: 'DELETE_PIN', id: p.id }, { type: 'SET_PIN_NUMBER', id: p.id, number: 9 }, { type: 'COMPACT_NUMBERS' }, { type: 'REPOSITION_PINS', pageId: 'page' }, { type: 'RENAME_PAGE_GROUP', pageId: 'page', newName: 'Oops' }, { type: 'REORDER_PINS', orderKey: 'x', order: [p.id], renumbers: [{ id: p.id, number: 9 }] }]) {
    const messages = await r.send(msg); assert.ok(messages.some(m => m.type === 'ERROR'), msg.type);
  }
  assert.equal(r.store.get(p.id).number, 1); assert.equal(r.store.get(p.id).deletedAt, undefined);
});
test('delete saves body before removing badge; restore survives plugin restart state', async () => {
  const r = await runtime(); await r.send({ type: 'ADD_PIN', category: 'design', group: '' }); const p = r.store.all()[0];
  await r.send({ type: 'UPDATE_PIN', pin: { ...p, content: 'Keep me' } });
  await r.send({ type: 'DELETE_PIN', id: p.id });
  assert.ok(r.store.get(p.id).deletedAt); assert.equal(r.nodes.has(p.pinNodeId), false);
  assert.ok(r.messages.some(m => m.undoIds?.includes(p.id)));
  await r.send({ type: 'SAFETY', action: 'restore', id: p.id });
  const restored = r.store.get(p.id); assert.equal(restored.content, 'Keep me'); assert.equal(restored.deletedAt, undefined); assert.ok(r.nodes.has(restored.pinNodeId));
});
test('failed delete persistence never removes badge or announces success', async () => {
  const r = await runtime(); await r.send({ type: 'ADD_PIN', category: 'design', group: '' }); const p = r.store.all()[0];
  const original = r.mem.set; r.mem.set = (k, v) => { if (k.startsWith('sp2-r-')) throw Error('full'); original(k, v); };
  await r.send({ type: 'DELETE_PIN', id: p.id });
  assert.equal(r.nodes.has(p.pinNodeId), true); assert.equal(r.store.get(p.id).deletedAt, undefined);
  assert.equal(r.messages.some(m => m.undoIds), false);
});
test('canvas deletion preserves text and does not blame the observing user', async () => {
  const r = await runtime(); await r.send({ type: 'ADD_PIN', category: 'design', group: '' }); const p = r.store.all()[0]; r.nodes.delete(p.pinNodeId); r.figma.currentUser = bob;
  await r.poll(); assert.equal(r.store.all().length, 1); assert.equal(r.store.get(p.id).deletedBy, undefined);
  assert.equal(r.messages.filter(m => m.type === 'PINS_LOADED').at(-1).pins[0].badgeMissing, true);
});
test('legacy owner claiming requires administrator approval', async () => {
  const r = await runtime(alice, 'figma', [source()]); let p = r.store.all()[0]; assert.equal(p.author, undefined);
  await r.send({ type: 'SAFETY', action: 'request', id: p.id, value: { kind: 'claim', text: 'I wrote this' } });
  p = r.store.get(p.id); const request = p.requests[0];
  await r.send({ type: 'SAFETY', action: 'resolve', id: p.id, value: { id: request.id, accept: true }, reason: 'checked' });
  assert.equal(r.store.get(p.id).author, undefined);
  await r.send({ type: 'SAFETY', action: 'setupAdmin', reason: 'Team agreed' });
  await r.send({ type: 'SAFETY', action: 'resolve', id: p.id, value: { id: request.id, accept: true }, reason: 'checked' });
  assert.equal(r.store.get(p.id).author.id, 'alice');
});
test('read-only mode rejects forged mutation messages and never migrates storage', async () => {
  const r = await runtime(alice, 'dev', [source()]); const before = JSON.stringify([...r.mem.data]);
  await r.send({ type: 'DELETE_PIN', id: 'p1' }); assert.ok(r.messages.some(m => m.type === 'ERROR'));
  assert.equal(JSON.stringify([...r.mem.data]), before);
});
test('backup import creates new owned IDs without restoring privileged metadata', async () => {
  const r = await runtime(); const p = { ...source(), author: bob, editors: [bob], protected: true };
  await r.send({ type: 'SAFETY', action: 'import', value: JSON.stringify({ format: 'SMARTPIN_BACKUP_V2', pins: [p] }) });
  const imported = r.store.all()[0]; assert.notEqual(imported.id, p.id); assert.equal(imported.author.id, 'alice'); assert.equal(imported.editors, undefined); assert.equal(imported.protected, undefined);
});

test('coeditor cannot delete or override a protection lock; assignee is status-only', async () => {
  const r = await runtime();
  let p = r.store.commit({ ...source(), editors: [bob] }, alice, 'create');
  r.figma.currentUser = bob;
  await r.send({ type: 'UPDATE_PIN', pin: { ...p, content: 'Coedited' } });
  assert.equal(r.store.get(p.id).content, 'Coedited');
  await r.send({ type: 'DELETE_PIN', id: p.id }); assert.equal(r.store.get(p.id).deletedAt, undefined);
  p = r.store.get(p.id); r.figma.currentUser = alice;
  await r.send({ type: 'SAFETY', action: 'protect', id: p.id, value: true });
  p = r.store.get(p.id); r.figma.currentUser = bob;
  await r.send({ type: 'UPDATE_PIN', pin: { ...p, content: 'Blocked' } }); assert.equal(r.store.get(p.id).content, 'Coedited');
  const assigned = r.store.commit({ ...source('assigned'), assignee: bob }, alice, 'create');
  await r.send({ type: 'UPDATE_PIN', pin: { ...assigned, status: 'done' } }); assert.equal(r.store.get(assigned.id).status, 'done');
  await r.send({ type: 'UPDATE_PIN', pin: { ...r.store.get(assigned.id), title: 'Blocked' } }); assert.equal(r.store.get(assigned.id).title, 'Original');
});
test('ownership transfer clears grants, logs a reason, and revokes prior owner', async () => {
  const r = await runtime(); let p = r.store.commit({ ...source(), editors: [bob], assignee: bob }, alice, 'create');
  await r.send({ type: 'SAFETY', action: 'transfer', id: p.id, value: 'bob', reason: 'Handoff' });
  p = r.store.get(p.id); assert.equal(p.author.id, 'bob'); assert.equal(p.editors.length, 0); assert.equal(p.assignee, undefined);
  await r.send({ type: 'UPDATE_PIN', pin: { ...p, content: 'Blocked' } }); assert.equal(r.store.get(p.id).content, 'Important content');
  assert.ok(r.store.history(p.id).some(r => r.action.includes('Handoff')));
});
test('rollback restores content only, not historical ownership or collaborators', async () => {
  const r = await runtime(); const original = r.store.commit(source(), alice, 'create');
  const changed = r.store.commit({ ...original, title: 'Changed', author: bob }, alice, 'transfer', original.revision);
  r.figma.currentUser = bob;
  await r.send({ type: 'SAFETY', action: 'rollback', id: changed.id, value: original.revision, reason: 'Restore wording' });
  assert.equal(r.store.get(changed.id).title, 'Original'); assert.equal(r.store.get(changed.id).author.id, 'bob');
});
test('page deletion only moves owned pins; foreign pins survive', async () => {
  const r = await runtime(); r.store.commit(source(), alice, 'create'); r.store.commit({ ...source('foreign'), author: bob }, bob, 'create');
  await r.send({ type: 'DELETE_PAGE_GROUP', pageId: 'page' });
  assert.ok(r.store.get('p1').deletedAt); assert.equal(r.store.get('foreign').deletedAt, undefined);
});
test('approved deletion request is resolved and remains resolved after restore', async () => {
  const r = await runtime(); r.store.commit(source(), alice, 'create'); r.figma.currentUser = bob;
  await r.send({ type: 'SAFETY', action: 'request', id: 'p1', value: { kind: 'delete', text: 'Obsolete' } });
  const req = r.store.get('p1').requests[0]; r.figma.currentUser = alice;
  await r.send({ type: 'SAFETY', action: 'resolve', id: 'p1', value: { id: req.id, accept: true }, reason: 'Agreed' });
  assert.ok(r.store.get('p1').deletedAt); assert.ok(r.store.get('p1').requests[0].resolvedAt);
  await r.send({ type: 'SAFETY', action: 'restore', id: 'p1' }); assert.ok(r.store.get('p1').requests[0].resolvedAt);
});
test('restore preserves full text when target and page are gone', async () => {
  const r = await runtime(); r.store.commit({ ...source(), nodeId: 'gone', pageId: 'gone', deletedAt: 1 }, alice, 'trash');
  await r.send({ type: 'SAFETY', action: 'restore', id: 'p1' });
  assert.equal(r.store.get('p1').content, 'Important content'); assert.equal(r.store.get('p1').deletedAt, undefined); assert.equal(r.store.get('p1').badgeMissing, true);
});
test('empty trash rejects a mixed unauthorized batch before any deletion', async () => {
  const r = await runtime(); r.store.commit({ ...source(), deletedAt: 1 }, alice, 'trash'); r.store.commit({ ...source('foreign'), author: bob, deletedAt: 1 }, bob, 'trash');
  await r.send({ type: 'SAFETY', action: 'emptyTrash', value: ['p1', 'foreign'], reason: 'Clear' }); assert.equal(r.store.all().length, 2);
  await r.send({ type: 'SAFETY', action: 'emptyTrash', value: ['p1'], reason: 'Clear my pin' }); assert.equal(r.store.all().length, 1);
});
test('anonymous sessions cannot migrate or write', async () => {
  const r = await runtime({ id: 'temporary', name: 'Anonymous' }, 'figma', [source()]);
  assert.equal(r.store.ready, false); await r.send({ type: 'ADD_PIN', category: 'design', group: '' }); assert.equal(r.store.all().length, 0);
});
test('future schema is refused instead of remigrated', () => {
  const mem = storage(); mem.set('sp2-ready', '3'); const s = new PinStore(mem); assert.throws(() => s.ready, /업데이트/);
});
test('emoji surrogate pairs are never split across stored chunks', () => {
  const mem = storage(); const original = mem.set;
  mem.set = (k, v) => { if (k.includes('.')) { assert.ok(!(v.charCodeAt(v.length - 1) >= 0xD800 && v.charCodeAt(v.length - 1) <= 0xDBFF)); assert.ok(!(v.charCodeAt(0) >= 0xDC00 && v.charCodeAt(0) <= 0xDFFF)); } original(k, v); };
  const s = new PinStore(mem); const p = s.commit({ ...source(), content: '🧷'.repeat(20000) }, alice, 'create'); assert.equal(s.get(p.id).content, p.content);
});
test('restoration resolves a number collision without changing another pin', async () => {
  const r = await runtime(); r.store.commit({ ...source(), deletedAt: 1 }, alice, 'trash'); r.store.commit({ ...source('other'), author: bob }, bob, 'create');
  await r.send({ type: 'SAFETY', action: 'restore', id: 'p1' }); assert.equal(r.store.get('other').number, 1); assert.equal(r.store.get('p1').number, 2);
});

const lastPins = r => [...r.messages].reverse().find(m => m.type === 'PINS_LOADED').pins;

test('duplicated badges are reported, never auto-removed, and cleaned only on request', async () => {
  const r = await runtime(); await r.send({ type: 'ADD_PIN', category: 'design', group: '' }); const p = r.store.all()[0];
  const original = r.nodes.get(p.pinNodeId); const copyA = original.clone(); const copyB = original.clone();
  await r.poll();
  assert.equal(lastPins(r).find(x => x.id === p.id).duplicateBadges, 2);
  assert.ok(r.nodes.has(copyA.id) && r.nodes.has(copyB.id), 'poll must not delete anything');
  assert.equal(r.store.get(p.id).duplicateBadges, undefined, 'diagnostics are never stored');
  await r.send({ type: 'BADGE_CLEANUP', ids: [p.id] });
  assert.equal(r.nodes.has(copyA.id) || r.nodes.has(copyB.id), false);
  assert.ok(r.nodes.has(original.id));
  assert.equal(r.store.get(p.id).pinNodeId, original.id);
});

test('when the original badge is gone, cleanup adopts a surviving copy instead of making another', async () => {
  const r = await runtime(); await r.send({ type: 'ADD_PIN', category: 'design', group: '' }); const p = r.store.all()[0];
  const original = r.nodes.get(p.pinNodeId); const copyA = original.clone(); const copyB = original.clone(); original.remove();
  await r.send({ type: 'BADGE_CLEANUP', ids: [p.id] });
  const pin = r.store.get(p.id);
  assert.equal(pin.pinNodeId, copyA.id); assert.equal(pin.badgeMissing, false);
  assert.ok(r.nodes.has(copyA.id)); assert.equal(r.nodes.has(copyB.id), false);
  assert.match(r.store.history(p.id)[0].action, /복제된 배지/);
});

test('cleanup of someone else\'s pin is refused and touches nothing', async () => {
  const r = await runtime(alice);
  const badge = r.figma.createFrame(); badge.name = '📌 Pin #2'; r.figma.currentPage.appendChild(badge);
  badge.setSharedPluginData('smart_pin', 'smartPinId', 'p2');
  r.store.commit({ ...source('p2'), author: bob, number: 2, pinNodeId: badge.id }, bob, 'create');
  await r.send({ type: 'INIT' });
  const copy = badge.clone();
  const msgs = await r.send({ type: 'BADGE_CLEANUP', ids: ['p2'] });
  assert.ok(msgs.some(m => m.type === 'ERROR'));
  assert.ok(r.nodes.has(copy.id) && r.nodes.has(badge.id));
});

test('drifted and reparented badges are reported, and moved back only when asked', async () => {
  const r = await runtime(); await r.send({ type: 'ADD_PIN', category: 'design', group: '' }); const p = r.store.all()[0];
  const badge = r.nodes.get(p.pinNodeId); const home = { x: badge.x, y: badge.y };
  badge.x += 80; badge.y += 40;
  await r.poll();
  assert.equal(lastPins(r).find(x => x.id === p.id).badgeDrift, true);
  assert.deepEqual({ x: badge.x, y: badge.y }, { x: home.x + 80, y: home.y + 40 }, 'poll must not move badges');
  await r.send({ type: 'REPOSITION_PINS', pageId: p.pageId, ids: [p.id] });
  assert.deepEqual({ x: badge.x, y: badge.y }, home);
  // Dragged into a frame: Figma reparents it. Re-placing must bring it back to page level.
  r.nodes.get('target').appendChild(badge); badge.x = 5; badge.y = 5;
  await r.poll();
  assert.equal(lastPins(r).find(x => x.id === p.id).badgeDrift, true);
  await r.send({ type: 'REPOSITION_PINS', pageId: p.pageId, ids: [p.id] });
  assert.equal(badge.parent.type, 'PAGE'); assert.deepEqual({ x: badge.x, y: badge.y }, home);
  await r.poll();
  assert.equal(lastPins(r).find(x => x.id === p.id).badgeDrift, undefined);
});
