import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { auth } from '../src/lib/firebase';
import FeedScreen from '../src/components/social/FeedScreen';
import SocialLayer, { BellButton } from '../src/components/social/SocialLayer';
import BottomNav from '../src/components/common/BottomNav';
import Toast from '../src/components/common/Toast';
import { InvitePreviewPage } from '../src/components/social/InviteParts';
import { MyTab } from '../src/components/social/ProfileScreen';

/* 피드·친구 화면 미리보기 (더미 데이터, 서버 대신 fetch를 가로챈다). Figma 06과 비교용.
   ?s=feed | feed-empty | feed-offline | feed-error | story | story-me | youtube | youtube-loading | youtube-result | youtube-fail
      | channel | import | import-today | import-diet | search | search-none | profile-friend | profile-none | profile-incoming | profile-me
      | profile-best | profile-routines | invite-share | invite-receive | invite-web | notifications | setup | setup-2 | edit | visibility
      | friends | requests | blocks | routine-cur | routine-friend | diet-cur | post | saved | routine-draft | push-ask */
const params = new URLSearchParams(location.search);
const s = params.get('s') || 'feed';

try { Object.defineProperty(auth, 'currentUser', { configurable: true, get: () => ({ uid: 'me', getIdToken: async () => 'preview', _startProactiveRefresh() {}, _stopProactiveRefresh() {} }) }); } catch { /* 미리보기 전용 */ }

const NOW = Date.now();
const P = {
  me: { uid: 'me', handle: 'jh_lifts', name: '이재현', bio: '무분할 · 아침 공복 운동', color: '#7171FF', photoUrl: '' },
  minsu: { uid: 'minsu', handle: 'minsu_lift', name: '민수', bio: '3분할 · 벤치 100 목표 · 주 5회', color: '#FF8A9B', photoUrl: '' },
  jihun: { uid: 'jihun', handle: 'jihoon_legs', name: '지훈', bio: '', color: '#3ECF8E', photoUrl: '' },
  seoyeon: { uid: 'seoyeon', handle: 'seoyeon.run', name: '서연', bio: '', color: '#FFB547', photoUrl: '' },
  haeun: { uid: 'haeun', handle: 'haeun', name: '하은', bio: '', color: '#5BB8FF', photoUrl: '' },
  doyun: { uid: 'doyun', handle: 'doyun', name: '도윤', bio: '', color: '#9B8AFB', photoUrl: '' },
  mina: { uid: 'mina', handle: 'mina_squat', name: 'mina_squat', bio: '스쿼트 좋아함 · 주 4회', color: '#ADB5BD', photoUrl: '' },
  minjun: { uid: 'minjun', handle: 'minjun99', name: '민준', bio: '같은 헬스장 · 저녁 7시 운동', color: '#5BB8FF', photoUrl: '' },
};

const CUR_BACK = {
  id: 'back-pullup-width', kind: 'routine', publishedAt: NOW - 2 * 3600000, tag: '루틴', title: '등 넓이 키우는\n풀업 중심 루틴', summary: '등 · 6종목 · 약 70분 · 중급', parts: ['등'], level: '중급', minutes: 70,
  description: '풀업으로 광배를 먼저 지치게 한 뒤, 머신으로 넓이를 마무리하는 구성이에요.', caption: '등 넓이는 풀업 볼륨에서 나와요. 첫 세트는 실패 직전까지, 나머지는 같은 무게로 버티기.', source: '공개된 자료를 정리했어요',
  items: [
    { name: '풀업', sets: 5, reps: '실패 직전까지', restSec: 120 }, { name: '랫풀다운 와이드', sets: 4, reps: '10–12', restSec: 90 }, { name: '시티드 로우', sets: 4, reps: '10', restSec: 90 },
    { name: '원암 덤벨 로우', sets: 3, reps: '12', restSec: 60 }, { name: '스트레이트 암 풀다운', sets: 3, reps: '15', restSec: 60 }, { name: '페이스 풀', sets: 3, reps: '15', restSec: 60 },
  ],
};
const CUR_DIET = {
  id: 'cvs-protein-150', kind: 'diet', publishedAt: NOW - 3 * 86400000, tag: '식단', title: '편의점으로\n단백질 150g 채우는 하루', summary: '1,850kcal · 탄 180 단 152 지 48',
  caption: '편의점만으로 단백질 150g, 생각보다 어렵지 않아요.', totals: { kcal: 1850, carb: 180, protein: 152, fat: 48 },
  meals: [
    { id: 'breakfast', name: '아침', foods: [{ name: '그릭요거트 200g', kcal: 180, carb: 12, protein: 20, fat: 5 }, { name: '바나나 1개', kcal: 90, carb: 23, protein: 1, fat: 0 }, { name: '아몬드 10알', kcal: 50, carb: 2, protein: 2, fat: 4 }] },
    { id: 'lunch', name: '점심', foods: [{ name: '닭가슴살 도시락', kcal: 480, carb: 55, protein: 38, fat: 11 }, { name: '단백질 우유 1팩', kcal: 160, carb: 12, protein: 24, fat: 2 }] },
    { id: 'dinner', name: '저녁', foods: [{ name: '훈제란 3개', kcal: 210, carb: 2, protein: 18, fat: 14 }, { name: '닭가슴살 샐러드', kcal: 190, carb: 10, protein: 22, fat: 4 }, { name: '군고구마 1개', kcal: 120, carb: 28, protein: 2, fat: 0 }] },
  ],
};
const WORKOUT = {
  id: 'w1', uid: 'minsu', at: NOW - 40 * 60000, title: '가슴, 어깨', exerciseCount: 4, volume: 12400, comment: '벤치프레스 1RM 105kg (+2.5) · 갱신 2 · 유효 16세트',
  exercises: [
    { name: '벤치프레스', part: '가슴', sets: '90kg × 5 × 5', setCount: 5, reps: 5, weightKg: 90, best1rm: 105 },
    { name: '인클라인 덤벨 프레스', part: '가슴', sets: '30kg × 10 × 3', setCount: 3, reps: 10, weightKg: 30, best1rm: 40 },
    { name: '오버헤드 프레스', part: '어깨', sets: '50kg × 8 × 4', setCount: 4, reps: 8, weightKg: 50, best1rm: 63.3 },
    { name: '사이드 레터럴 레이즈', part: '어깨', sets: '10kg × 15 × 4', setCount: 4, reps: 15, weightKg: 10, best1rm: null },
  ],
};
const VIDEO = {
  videoId: 'aB3xYzzzzzz', url: 'https://www.youtube.com/watch?v=aB3xYzzzzzz', title: '프로 보디빌더의 하체 볼륨 루틴', routineTitle: '프로 보디빌더의 하체 볼륨 루틴', channelName: '○○핏', channelId: '@oofit', channelUrl: 'https://youtube.com/@oofit',
  thumbnail: '', durationMin: 18, parts: ['하체'], imports: 128, at: NOW - 86400000,
  items: [
    { name: '스쿼트', part: '하체', sets: 4, reps: '8', weightKg: 140, restSec: null, at: '2:10', note: '' },
    { name: '레그프레스', part: '하체', sets: 3, reps: '12', weightKg: 280, restSec: null, at: '5:40', note: '' },
    { name: '루마니안 데드리프트', part: '하체', sets: 3, reps: '10', weightKg: 100, restSec: null, at: '10:30', note: '' },
    { name: '레그 익스텐션', part: '하체', sets: 3, reps: '15', weightKg: 60, restSec: null, at: '14:00', note: '' },
    { name: '시티드 카프 레이즈', part: '하체', sets: 4, reps: '15', weightKg: 40, restSec: null, at: '16:20', note: '드랍세트 포함' },
  ],
  tips: ['스쿼트는 내려갈 때 3초, 바닥에서 멈추지 않기'],
};
const ROUTINE = { id: 'r1', uid: 'minsu', title: '민수표 3분할 · 가슴/어깨 날', parts: ['가슴', '어깨'], memo: '벤치는 마지막 세트 실패 직전까지. 사레레는 드랍 1번.', status: 'public', at: NOW - 5 * 86400000, sessionCount: 12,
  items: [{ name: '벤치프레스', sets: 5, reps: '5' }, { name: '인클라인 덤벨 프레스', sets: 3, reps: '10' }, { name: '오버헤드 프레스', sets: 4, reps: '8' }, { name: '사이드 레터럴 레이즈', sets: 4, reps: '15' }, { name: '케이블 플라이', sets: 3, reps: '15' }] };

const counts = (claps, comments, imports, clapped = false) => ({ claps, comments, imports, clapped });

function feed() {
  const empty = s === 'feed-empty';
  return {
    hasProfile: true,
    friendCount: empty ? 0 : 5,
    stories: empty ? [] : [{ ...P.me, self: true, hasToday: false }, { ...P.minsu, latestAt: NOW, storyKey: 'k1' }, { ...P.jihun, latestAt: NOW, storyKey: 'k2' }, { ...P.seoyeon, storyKey: 'seen1' }, { ...P.haeun, storyKey: 'seen2' }, { ...P.doyun, storyKey: 'seen3' }],
    posts: [
      { key: 'cur:back-pullup-width', kind: 'cur-routine', at: CUR_BACK.publishedAt, curation: CUR_BACK },
      ...(empty ? [] : [{ key: 'post:p1', kind: 'youtube', at: NOW - 86400000, author: P.jihun, caption: '프로 보디빌더의 하체 볼륨 루틴, AI가 정리해 줘서 그대로 따라 했어요', video: VIDEO }]),
      ...(empty ? [] : [{ key: 'log:w1', kind: 'friend-log', at: WORKOUT.at, author: P.minsu, workout: { ...WORKOUT, comment: '벤치 드디어 90 다섯 개 다섯 세트 ㅠ' } }]),
      { key: 'cur:cvs-protein-150', kind: 'cur-diet', at: CUR_DIET.publishedAt, curation: CUR_DIET },
    ],
    counts: { 'cur:back-pullup-width': counts(24, 3, 128), 'post:p1': counts(8, 1, 12), 'log:w1': counts(3, 1, 2, true), 'cur:cvs-protein-150': counts(17, 2, 56) },
  };
}

function profile(uid) {
  const rel = s === 'profile-none' ? 'none' : s === 'profile-incoming' ? 'incoming' : uid === 'me' ? 'self' : 'friend';
  const p = rel === 'none' ? P.mina : rel === 'incoming' ? P.minjun : uid === 'me' ? P.me : P.minsu;
  const base = { relation: rel, profile: p, stats: { workouts: rel === 'friend' ? 142 : rel === 'self' ? 98 : null, routines: rel === 'none' ? 2 : 3, friends: rel === 'friend' ? 5 : rel === 'self' ? 3 : null }, routines: [] };
  if (rel === 'none' || rel === 'incoming') return { ...base, routines: [{ ...ROUTINE, id: 'r2', title: '스쿼트 5×5 12주 프로그램' }, { ...ROUTINE, id: 'r3', title: '하체 고반복 데이' }], publicRoutineCount: 2 };
  return {
    ...base,
    routines: rel === 'self' ? [{ ...ROUTINE, uid: 'me', title: '가슴 · 어깨 날', id: 'mine1' }] : [ROUTINE, { ...ROUTINE, id: 'r4', title: '민수표 3분할 · 등 날', parts: ['등'] }, { ...ROUTINE, id: 'r5', title: '민수표 3분할 · 하체 날', parts: ['하체'] }],
    week: { mondayKey: new Date(NOW - ((new Date().getDay() + 6) % 7) * 86400000 + 9 * 3600000).toISOString().slice(0, 10), days: (() => { const o = {}; const m = new Date(NOW - ((new Date().getDay() + 6) % 7) * 86400000); [[0, ['하체']], [1, ['등']], [2, ['가슴']]].forEach(([i, parts]) => { o[new Date(m.getTime() + i * 86400000 + 9 * 3600000).toISOString().slice(0, 10)] = parts; }); return o; })() },
    workouts: [WORKOUT],
    counts: { 'log:w1': counts(2, 2, 0) },
    best: { big3: { bench: { weightKg: 92.5 }, squat: { weightKg: 140 }, dead: { weightKg: 170 } }, list: [
      { id: 'b1', name: '벤치프레스', weightKg: 92.5, reps: 3, est1rm: 100, date: '2026-10-11', isNew: true },
      { id: 'b2', name: '인클라인 덤벨 프레스', weightKg: 34, reps: 8, est1rm: 42, date: '2026-10-08' },
      { id: 'b3', name: '오버헤드 프레스', weightKg: 60, reps: 5, est1rm: 67, date: '2026-09-30' },
      { id: 'b4', name: '바벨 로우', weightKg: 90, reps: 6, est1rm: 105, date: '2026-10-14' },
    ] },
    drafts: rel === 'self' ? [{ key: '등·이두', title: '등 · 이두 날', parts: ['등', '이두'], items: [{ name: '데드리프트', sets: 5, reps: 3 }, { name: '바벨 로우', sets: 4, reps: 8 }, { name: '랫풀다운', sets: 4, reps: 12 }, { name: '시티드 로우', sets: 3, reps: 12 }, { name: '바벨 컬', sets: 3, reps: 10 }, { name: '해머 컬', sets: 3, reps: 12 }], sessionCount: 8 }, { key: '하체', title: '하체 날', parts: ['하체'], items: [{ name: '스쿼트', sets: 5, reps: 5 }], sessionCount: 5 }] : undefined,
  };
}

const RESP = {
  me: () => ({ profile: { ...P.me, visibility: { workout: true, best: true, diet: false, weight: false }, push: { comment: true }, friendCount: 3, handleChangedAt: 0 }, requestCount: 2, unreadCount: 3 }),
  feed,
  /* 사람마다 장 수가 다르다: 민수 2장(운동·식단), 지훈 1장, 하체 장인(큐레이터) 1장 — 넘김 확인용 */
  story: (b) => {
    if (s === 'story-me') return { profile: P.me, self: true, items: [{ ...WORKOUT, type: 'workout', uid: 'me', title: '등, 이두', exerciseCount: 6, comment: '볼륨 14,820kg' }], counts: { 'log:w1': counts(2, 1, 1) } };
    if (b.uid === 'jihun') return { profile: P.jihun, items: [{ ...WORKOUT, type: 'workout', id: 'w9', uid: 'jihun', at: NOW - 3600000, title: '하체' }], counts: {} };
    if (b.uid === 'ch-legday') return { profile: { uid: 'ch-legday', name: '하체 장인', handle: 'legday.lab', color: '#7171FF' }, official: true, items: [{ type: 'youtube', id: 'p1', key: 'post:p1', at: NOW - 7200000, kind: 'workout', title: '스쿼트 중심 하체 볼륨 루틴', channelName: '○○핏', caption: '오늘은 하체. 스쿼트는 실패 직전까지.', exercises: [{ name: '스쿼트', sets: '5세트 × 5' }, { name: '레그 프레스', sets: '4세트 × 10' }], exerciseCount: 2, meals: [], kcal: 0 }], counts: {} };
    return { profile: P.minsu, items: [{ ...WORKOUT, type: 'workout' }, { type: 'diet', id: 'd1', at: NOW - 20 * 60000, kcal: 1850, carb: 210, protein: 112, fat: 58, meals: 3, goal: 2100 }], counts: { 'log:w1': counts(2, 1, 1) } };
  },
  post: (b) => {
    if (b.key.startsWith('cur:back')) return { key: b.key, kind: 'cur', curation: CUR_BACK, comments: [], counts: counts(24, 3, 128), followers: { total: 128, friendName: '민수', mine: false } };
    if (b.key.startsWith('cur:cvs')) return { key: b.key, kind: 'cur', curation: CUR_DIET, comments: [], counts: counts(17, 2, 56), followers: { total: 56 } };
    if (b.key.startsWith('rt:')) return { key: b.key, kind: 'rt', owner: P.minsu, routine: ROUTINE, comments: [], counts: counts(3, 0, 3), followers: { total: 3, friendName: '지훈' }, ownerWeights: { 벤치프레스: 90, 인클라인덤벨프레스: 30, 오버헤드프레스: 50 } };
    if (b.key.startsWith('post:') || b.key.startsWith('yt:')) return { key: b.key, kind: 'yt', video: VIDEO, comments: [], counts: counts(8, 1, 12), followers: { total: 128 } };
    return { key: b.key, kind: 'log', owner: P.minsu, isMine: false, workout: WORKOUT, counts: counts(2, 3, 1, true), comments: [
      { id: 'c1', uid: 'jihun', text: '벤치 90 5x5 실화냐', at: NOW - 40 * 60000, author: P.jihun },
      { id: 'c2', uid: 'minsu', text: '@지훈 마지막 세트 4개 겨우 ㅋㅋ 다음주 92.5 간다', at: NOW - 32 * 60000, author: P.minsu },
      { id: 'c3', uid: 'me', text: '인클라인 덤벨 순서 앞으로 빼는 거 좋다 나도 해봐야지', at: NOW - 30000, author: P.me, mine: true },
    ] };
  },
  profile: (b) => profile(b.uid),
  search: (b) => (s === 'search-none' ? { friends: [], others: [], results: [] } : b.tab === 'people'
    ? { friends: [{ ...P.minsu, relation: 'friend' }, { ...P.haeun, name: '민지', handle: 'minji.fit', relation: 'friend' }], others: [{ ...P.mina, relation: 'none' }, { ...P.minjun, relation: 'requested' }] }
    : { results: [{ kind: 'cur', id: 'back-pullup-width', title: '등 넓이 키우는 풀업 중심 루틴', sub: '등 · 6종목' }] }),
  friends: () => ({ friends: [{ ...P.minsu, since: NOW - 42 * 86400000 }, { ...P.seoyeon, since: NOW - 3 * 86400000 }, { ...P.jihun, since: NOW - 20 * 86400000 }] }),
  requests: () => ({ requests: [{ ...P.minjun, at: NOW - 2 * 3600000 }, { ...P.doyun, name: 'kyu_bench', handle: 'kyu_bench', at: NOW - 86400000 }] }),
  blocks: () => ({ blocks: [{ uid: 'spam', name: 'spam_gym', handle: 'spam_gym', color: '#ADB5BD', at: NOW - 20 * 86400000 }] }),
  'invite-create': () => ({ code: 'jhlifts-7Kq2', expiresAt: NOW + 7 * 86400000 }),
  'invite-preview': () => ({ status: 'ok', inviter: { ...P.minsu, weekCount: 3 } }),
  'handle-check': (b) => (b.handle === 'jh_lifts' ? { available: false, reason: 'taken', suggestions: ['jh_lifts2', 'jh.lifts'] } : { available: true }),
  'youtube-import': () => new Promise((resolve, reject) => setTimeout(() => (s === 'youtube-fail' ? reject(Object.assign(new Error(), { code: 'not-routine' })) : resolve({ video: VIDEO })), s === 'youtube-loading' ? 999999 : 1200)),
  'youtube-get': () => ({ video: VIDEO }),
  channel: () => ({ channel: { channelId: '@oofit', name: '○○핏', url: '' }, routines: [VIDEO, { ...VIDEO, videoId: 'x2', routineTitle: '등 두께 만드는 로우 4종', parts: ['등'], imports: 96, items: VIDEO.items.slice(0, 4) }], totalImports: 312, following: false }),
  clap: () => ({ clapped: true, counts: counts(4, 1, 1, true) }),
};

const realFetch = window.fetch.bind(window);
window.fetch = async (url, init) => {
  const m = String(url).match(/\/api\/social\/([a-z-]+)/);
  if (!m) return realFetch(url, init);
  const action = m[1];
  if (s === 'feed-error' && action === 'feed') return new Response('{"error":"server-error"}', { status: 500 });
  const body = JSON.parse(init?.body || '{}');
  if (action === 'youtube-import' && s === 'youtube-fail') return new Response('{"error":"not-routine"}', { status: 422 });
  const fn = RESP[action];
  const data = fn ? await fn(body) : { ok: true };
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
if (s === 'feed-offline') {
  Object.defineProperty(navigator, 'onLine', { get: () => false });
  localStorage.setItem('context_health_user:me:feed_cache', JSON.stringify(feed()));
}
localStorage.setItem('context_health_user:me:story_seen', JSON.stringify(['seen1', 'seen2', 'seen3'])); // 스토리 장 기록은 매번 새로 시작

const INITIAL = {
  story: [['story', { uid: 'minsu', queue: [{ uid: 'minsu' }, { uid: 'jihun' }, { uid: 'ch-legday' }], start: 0 }]], 'story-me': [['story', { uid: 'me' }]],
  youtube: [['youtube', {}]], 'youtube-loading': [['youtube', { url: 'https://youtu.be/aB3xYzzzzzz' }]], 'youtube-result': [['youtube', { videoId: 'aB3xYzzzzzz' }]], 'youtube-fail': [['youtube', { url: 'https://youtu.be/zz91abcdefg' }]],
  channel: [['channel', { channelId: '@oofit' }]], search: [['search', {}]], 'search-none': [['search', {}]],
  'profile-friend': [['profile', { uid: 'minsu' }]], 'profile-none': [['profile', { uid: 'mina' }]], 'profile-incoming': [['profile', { uid: 'minjun' }]], 'profile-me': [['profile', { uid: 'me', tab: 'routines' }]],
  'profile-best': [['profile', { uid: 'minsu', tab: 'best' }]], 'profile-routines': [['profile', { uid: 'minsu', tab: 'routines' }]],
  notifications: [['notifications', {}]], setup: [['setup', {}]], edit: [['profileEdit', {}]], visibility: [['visibility', {}]],
  friends: [['friends', {}]], requests: [['friends', { tab: 'requests' }]], blocks: [['friends', { tab: 'blocks' }]],
  'routine-cur': [['routine', { key: 'cur:back-pullup-width' }]], 'routine-friend': [['routine', { key: 'rt:r1' }]], 'diet-cur': [['diet', { key: 'cur:cvs-protein-150' }]],
  post: [['post', { key: 'log:w1' }]], saved: [['saved', {}]], 'routine-draft': [['routineEdit', { draft: profile('me').drafts[0] }]],
};

function Harness() {
  const [stack, setStack] = useState(() => (INITIAL[s] || []).map(([type, props], i) => ({ id: `${type}-${i}`, type, props })));
  const [toast, setToast] = useState('');
  const [importReq, setImportReq] = useState(s === 'import' ? { key: 'rt:r1' } : s === 'import-diet' ? { key: 'cur:cvs-protein-150' } : null);
  const [share, setShare] = useState(s === 'invite-share');
  const [invite, setInvite] = useState(s === 'invite-receive' ? 'jhlifts-7Kq2' : null);
  const [pushAsk, setPushAsk] = useState(s === 'push-ask' ? { name: '서연' } : null);
  const nav = {
    renderSettings: () => <div className="p-6">설정(마이) 화면</div>,
    uid: 'me', authName: '이재현', me: RESP.me(),
    toast: (m) => { setToast(m); setTimeout(() => setToast(''), 2500); },
    push: (type, props) => setStack((st) => [...st, { id: `${type}-${Date.now()}`, type, props }]),
    pop: () => setStack((st) => st.slice(0, -1)),
    refreshMe: async () => RESP.me(), goTab: () => {},
    requireProfile: async (fn) => fn(), finishSetup: () => setStack((st) => st.slice(0, -1)), cancelSetup: () => setStack((st) => st.slice(0, -1)),
    startImport: setImportReq, openInviteShare: () => setShare(true), openRecord: () => nav.toast('운동 메모 열기'),
    openMemo: (d) => nav.toast(`메모 열기 · ${d.sections.map((x) => x.items.length).reduce((a, b) => a + b, 0)}종목`), openDiet: () => nav.toast('식단 열기'), enablePush: async () => true,
  };
  if (s === 'invite-web') return <div style={{ width: 402, height: 874, margin: '0 auto', position: 'relative', overflow: 'hidden', background: '#fff' }}><InvitePreviewPage code="jhlifts-7Kq2" onStart={() => {}} /></div>;
  if (s === 'setup-2') setTimeout(() => document.querySelector('input[placeholder="영문으로 정해 주세요"]') && null, 0);
  return (
    <div style={{ width: Number(params.get('w')) || 402, height: Number(params.get('h')) || 874, margin: '0 auto', position: 'relative', overflow: 'hidden', background: '#fff' }}>
      {s === 'my' ? <MyTab nav={nav} active /> : <FeedScreen nav={nav} active />}
      {!stack.length && <BottomNav activeId={s === 'my' ? 'my' : 'feed'} onChange={() => {}} onMemo={() => {}} />}
      <SocialLayer stack={stack} nav={nav} importReq={importReq} onImportClose={() => setImportReq(null)} inviteShareOpen={share} onInviteShareClose={() => setShare(false)} inviteCode={invite} onInviteClose={() => setInvite(null)} pushAsk={pushAsk} onPushAskClose={() => setPushAsk(null)} />
      <div id="app-overlay" className="absolute inset-0 z-[70] pointer-events-none" />
      <Toast show={Boolean(toast)} message={toast} />
      {s === 'home-bell' && <div className="absolute top-4 right-4 bg-brand rounded-full"><BellButton unread={3} onClick={() => {}} /></div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
