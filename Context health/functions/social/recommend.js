/* 피드 맞춤 순서.
   점수 = 최신성 + 목표 맞음 + 수준 맞음 + 성별·나이 맞음 + 내 관심(박수·저장한 글, 최근 운동 부위) + 인기
   그다음 다양성: 같은 계정·같은 채널이 연달아 나오지 않게, 운동:식단이 2:1 근처가 되게 섞는다.
   개인정보: 온보딩 프로필(users/{uid}.profile)과 이 앱 안의 행동만 쓴다. 성별·나이는 가산점에만 쓰고 걸러내지 않는다. */
const { db } = require('./store');

const DAY = 24 * 60 * 60 * 1000;

/* 온보딩 목표 → 영상 태그 */
const GOAL_TAGS = {
  '체중 감량': ['다이어트', '체력', '유산소'],
  '근육 증량': ['근비대', '근력', '벌크업', '린매스업'],
  '체형 유지': ['체력', '린매스업', '건강식'],
  '건강 증진': ['체력', '관절·재활', '건강식'],
};
const LEVEL_BY_ACTIVITY = { sedentary: '초급', light: '초급', moderate: '중급', active: '상급' };

async function viewerSignals(uid) {
  const [userSnap, clapSnap, savedSnap, logSnap, prefSnap] = await Promise.all([
    db().doc(`users/${uid}`).get(),
    db().collection('claps').where('uid', '==', uid).limit(80).get(),
    db().collection(`users/${uid}/saved`).limit(80).get(),
    db().collection('logs').where('uid', '==', uid).orderBy('timestamp', 'desc').limit(30).get(),
    db().doc(`users/${uid}/prefs/feed`).get(),
  ]);
  const prefs = prefSnap.exists ? prefSnap.data() : {};
  const profile = userSnap.exists ? userSnap.data().profile || {} : {};
  const liked = new Set();
  clapSnap.docs.forEach((d) => liked.add(d.data().key));
  savedSnap.docs.forEach((d) => d.data().key && liked.add(d.data().key));
  const parts = {};
  let dietLogs = 0;
  let gymLogs = 0;
  logSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.type === 'diet') dietLogs += 1;
    /* 무게(kg)를 적은 운동 기록이 있으면 헬스장 운동을 하는 사람으로 본다 */
    if (data.type === 'workout' && /\d\s*(kg|lbs?|칸)/i.test(JSON.stringify(data.sections || []))) gymLogs += 1;
    (data.sections || []).forEach((s) => { if (s.part) parts[s.part] = (parts[s.part] || 0) + 1; });
  });
  return {
    gender: profile.gender === 'female' ? '여성' : profile.gender === 'male' ? '남성' : null,
    age: Number(profile.age) || null,
    goalTags: GOAL_TAGS[profile.goal] || [],
    level: LEVEL_BY_ACTIVITY[profile.activityLevel] || null,
    liked,
    parts,
    dietLean: dietLogs >= 5,
    gymGoer: gymLogs >= 2,
    weights: prefs.weights || {},
    hidden: new Set(prefs.hidden || []),
    likedMore: new Set(prefs.liked || []),
  };
}

/* 좋아한 글들의 태그·부위·채널을 모아 취향을 만든다 */
function tasteFrom(signals, posts) {
  const taste = { parts: { ...signals.parts }, goals: {}, channels: {}, kinds: { workout: 0, diet: 0 } };
  posts.forEach((p) => {
    if (!signals.liked.has(p.key) || !p.video) return;
    const v = p.video;
    (v.parts || []).forEach((x) => { taste.parts[x] = (taste.parts[x] || 0) + 2; });
    (v.tags?.goals || []).forEach((g) => { taste.goals[g] = (taste.goals[g] || 0) + 1; });
    taste.channels[v.channelId] = (taste.channels[v.channelId] || 0) + 1;
    taste.kinds[v.kind || 'workout'] += 1;
  });
  return taste;
}

/* 새로고침 때 지난번 위쪽에 보여준 글은 내린다. 6시간이 지나면 거의 원래 자리로 */
const SHOWN_PENALTY = 4;
const SHOWN_DECAY_MS = 6 * 60 * 60 * 1000;

function scorePost(p, s, taste, counts) {
  const ageDays = Math.max(0, (Date.now() - (p.at || 0)) / DAY);
  let score = Math.exp(-ageDays / 4) * 3; // 최신성 (4일이 지나면 1/e)
  const c = counts?.[p.key] || {};
  score += Math.log1p((c.claps || 0) + 2 * (c.imports || 0)) * 0.35; // 인기
  if (p.kind === 'friend-log' || p.kind === 'friend-routine') score += 6; // 친구 글은 늘 위쪽
  const v = p.video || (p.curation ? { kind: p.curation.kind === 'diet' ? 'diet' : 'workout', parts: p.curation.parts, tags: { goals: p.curation.kind === 'diet' ? ['다이어트'] : [], level: p.curation.level } } : null);
  if (!v) return score;
  const tags = v.tags || {};
  const goals = tags.goals || [];
  if (goals.some((g) => s.goalTags.includes(g))) score += 1.2;
  goals.forEach((g) => { score += Math.min(1, (taste.goals[g] || 0) * 0.3); });
  if (s.level && tags.level) score += tags.level === s.level ? 0.6 : (s.level === '초급' && tags.level === '상급' ? -0.6 : 0);
  /* 대상 성별이 다르면 꽤 아래로 (빼지는 않는다) */
  if (s.gender && tags.audience && tags.audience !== '무관') score += tags.audience === s.gender ? 0.5 : -1.2;
  /* 헬스장에서 무게 치는 사람에게 홈트는 아래로 */
  if (s.gymGoer && tags.place === '홈트') score -= 0.8;
  /* 관심 있어요/없어요로 쌓인 점수 */
  const w = s.weights || {};
  const feat = (f, k) => (w[f] || 0) * k;
  score += feat(`ch:${v.channelId}`, 0.8) + feat(`aud:${tags.audience}`, 0.9) + feat(`place:${tags.place}`, 0.9) + feat(`kind:${v.kind || 'workout'}`, 0.4) + feat(`author:${p.author?.uid}`, 0.5);
  (v.parts || []).forEach((x) => { score += feat(`part:${x}`, 0.4); });
  if (s.likedMore?.has(p.key)) score += 0.5;
  if (s.age >= 45 && (goals.includes('관절·재활') || tags.level === '초급')) score += 0.5;
  (v.parts || []).forEach((x) => { score += Math.min(0.8, (taste.parts[x] || 0) * 0.1); });
  if (v.channelId) score += Math.min(0.8, (taste.channels[v.channelId] || 0) * 0.4);
  if (v.kind === 'diet' && (s.dietLean || s.goalTags.includes('다이어트'))) score += 0.4;
  if (s.liked.has(p.key)) score -= 1.5; // 이미 좋아한 글은 조금 아래로
  return score;
}

/* 점수 순으로 고르되 같은 계정·채널 연속을 피하고 운동:식단을 2:1 근처로 */
function diversify(scored) {
  const pool = [...scored].sort((a, b) => b.score - a.score);
  const out = [];
  const kindCount = { workout: 0, diet: 0 };
  while (pool.length) {
    const last = out[out.length - 1];
    const last2 = out[out.length - 2];
    const wantDiet = kindCount.diet * 2 < kindCount.workout - 1;
    const wantWorkout = kindCount.workout < kindCount.diet * 2 - 1;
    let pickIndex = pool.findIndex((x) => {
      if (last && x.author && last.author && x.author === last.author) return false;
      if (x.channel && (x.channel === last?.channel || x.channel === last2?.channel)) return false;
      if (wantDiet && x.kind === 'workout' && pool.some((y) => y.kind === 'diet')) return false;
      if (wantWorkout && x.kind === 'diet' && pool.some((y) => y.kind === 'workout')) return false;
      return true;
    });
    if (pickIndex < 0) pickIndex = 0;
    const [picked] = pool.splice(pickIndex, 1);
    if (picked.kind) kindCount[picked.kind] += 1;
    out.push(picked);
  }
  return out;
}

async function rankPosts(uid, posts, counts, { shown = null } = {}) {
  let signals;
  try { signals = await viewerSignals(uid); } catch { signals = { goalTags: [], liked: new Set(), parts: {} }; }
  const taste = tasteFrom(signals, posts);
  const scored = posts.filter((p) => !signals.hidden?.has(p.key)).map((p) => ({
    post: p,
    score: scorePost(p, signals, taste, counts) + (shown ? refreshAdjust(p.key, shown) : 0),
    author: p.author?.uid || (p.curation ? 'curation' : null),
    channel: p.video?.channelId || null,
    kind: p.video ? (p.video.kind || 'workout') : p.curation ? (p.curation.kind === 'diet' ? 'diet' : 'workout') : null,
  }));
  return diversify(scored).map((x) => x.post);
}

/* 본 글은 내리고, 매번 같은 순서가 되지 않게 약간 섞는다 */
function refreshAdjust(key, shown) {
  const at = shown[key];
  const penalty = at ? SHOWN_PENALTY * Math.exp(-(Date.now() - at) / SHOWN_DECAY_MS) : 0;
  return Math.random() * 0.8 - penalty;
}

module.exports = { rankPosts };
