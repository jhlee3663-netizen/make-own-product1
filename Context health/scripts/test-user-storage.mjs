import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class MemoryStorage {
  constructor(entries = []) { this.data = new Map(entries); }
  get length() { return this.data.size; }
  key(index) { return [...this.data.keys()][index] ?? null; }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

globalThis.localStorage = new MemoryStorage([
  ['diet_custom_foods', 'legacy-current-user-food'],
  ['coaching_insight_workout', 'legacy-current-user-insight'],
  ['coach_msgs_chat_legacy', 'legacy-current-user-room'],
  ['coaching_insight_dismissed_diet', '1234'],
  ['weekly_routine', 'legacy-current-user-routine'],
  ['theme', 'dark'],
]);

const {
  clearUserStorage,
  getUserStorage,
  getUserStorageKeys,
  prepareUserStorage,
  setUserStorage,
} = await import('../src/lib/userStorage.js');

setUserStorage('user-A', 'coaching_insight_workout', 'A-insight');
setUserStorage('user-B', 'diet_custom_foods', 'B-food');
setUserStorage('user / 특수', 'diet_recent_foods', 'encoded-uid-food');

prepareUserStorage('user-A', 'user-A');

assert.equal(getUserStorage('user-A', 'diet_custom_foods'), 'legacy-current-user-food');
assert.equal(getUserStorage('user-B', 'diet_custom_foods'), 'B-food');
assert.equal(getUserStorage('user-A', 'coaching_insight_workout'), 'A-insight');
assert.equal(getUserStorage('user-B', 'coaching_insight_workout'), null);
assert.equal(getUserStorage('user-A', 'coach_msgs_chat_legacy'), 'legacy-current-user-room');
assert.equal(getUserStorage('user-A', 'coaching_insight_dismissed_diet'), '1234');
assert.equal(getUserStorage('user-A', 'weekly_routine'), 'legacy-current-user-routine');
assert.equal(getUserStorage('user / 특수', 'diet_recent_foods'), 'encoded-uid-food');
assert.deepEqual(getUserStorageKeys('user-A').sort(), [
  'coach_msgs_chat_legacy',
  'coaching_insight_dismissed_diet',
  'coaching_insight_workout',
  'diet_custom_foods',
  'weekly_routine',
]);

localStorage.setItem('diet_recent_foods', 'unknown-owner-recent');
prepareUserStorage('user-B', 'user-A');
assert.equal(localStorage.getItem('diet_custom_foods'), null);
assert.equal(localStorage.getItem('coaching_insight_workout'), null);
assert.equal(localStorage.getItem('diet_recent_foods'), null);
assert.equal(getUserStorage('user-B', 'diet_recent_foods'), null);
assert.equal(localStorage.getItem('theme'), 'dark');
assert.equal(getUserStorage('user-A', 'diet_custom_foods'), 'legacy-current-user-food');

clearUserStorage('user-A');
assert.equal(getUserStorage('user-A', 'diet_custom_foods'), null);
assert.equal(getUserStorage('user-A', 'coaching_insight_workout'), null);
assert.equal(getUserStorage('user-B', 'diet_custom_foods'), 'B-food');

// 공급자 로그인 성공 콜백은 캐시 소유자 기준인 auth_user를 먼저 바꾸지 않는다.
// 실제 계정 확정과 레거시 이전은 Firebase onAuthStateChanged 경로에서만 수행한다.
const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const loginHandler = appSource.match(/function handleLogin\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
assert.equal(loginHandler.includes('localStorage'), false);
assert.equal(loginHandler.includes('setUser('), false);

console.log('user-storage regression: PASS');
