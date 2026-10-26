/* 유튜브 영상 → 운동 루틴. 같은 영상은 한 번만 정리하고 youtubeRoutines/{videoId}에 저장해 다시 쓴다.
   영상 정보는 oEmbed(키 없음), 루틴 정리는 Gemini가 영상을 직접 본다(fileData.fileUri). */
const { db, SocialError } = require('./store');

const MODEL = 'gemini-3.6-flash';
const UPSTREAM_TIMEOUT_MS = 240000;

function parseVideoId(input) {
  const text = String(input || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) return text;
  let url;
  try { url = new URL(text.startsWith('http') ? text : `https://${text}`); } catch { return null; }
  const host = url.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtu.be') return url.pathname.slice(1, 12) || null;
  if (host === 'youtube.com' || host === 'music.youtube.com') {
    if (url.searchParams.get('v')) return url.searchParams.get('v').slice(0, 11);
    const m = url.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
  }
  return null;
}

function channelIdFrom(authorUrl, authorName) {
  const m = String(authorUrl || '').match(/youtube\.com\/(@[^/?#]+|channel\/[^/?#]+|c\/[^/?#]+|user\/[^/?#]+)/);
  const raw = m ? decodeURIComponent(m[1]) : `name:${authorName || 'unknown'}`;
  return raw.replace(/[/.#$[\]]/g, '_').slice(0, 120);
}

/* AI를 부르기 전에 영상 길이를 확인한다 (긴 영상은 비용이 크다). 못 읽으면 null */
async function fetchVideoLength(videoId) {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, { headers: { 'Accept-Language': 'ko-KR', 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/"lengthSeconds":"(\d+)"/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

async function fetchVideoInfo(videoId) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`);
  if (res.status === 401 || res.status === 403 || res.status === 404) throw new SocialError('video-unavailable', 422);
  if (!res.ok) throw new SocialError('video-info-failed', 502);
  const data = await res.json();
  return {
    videoId,
    url: watchUrl,
    title: String(data.title || '').slice(0, 200),
    channelName: String(data.author_name || '').slice(0, 100),
    channelUrl: String(data.author_url || ''),
    channelId: channelIdFrom(data.author_url, data.author_name),
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

const PROMPT = `이 유튜브 영상에서 운동 루틴을 뽑아 JSON 하나로만 답하세요.
규칙:
- 영상이 운동 루틴(헬스 종목과 세트·횟수를 순서대로 보여주는 영상)이 아니면 {"isRoutine": false, "reason": "브이로그|식단|정보 부족|기타 중 하나"}.
- 영상 길이가 60분을 넘으면 {"isRoutine": false, "reason": "too-long"}.
- 루틴이면 {"isRoutine": true, "title": "짧은 한국어 제목(20자 이내)", "parts": ["가슴"...], "durationSec": 영상 길이(초, 정수. 쇼츠면 60 이하), "summary": "피드에 보일 한 줄 소개(40자 이내, ~해요체)", "items": [...], "tips": ["영상 속 핵심 팁, 한 줄씩, 최대 3개"], "tags": {"level": "초급|중급|상급", "place": "헬스장|홈트", "goals": ["다이어트|근비대|근력|체력|관절·재활 중 해당하는 것"], "audience": "여성|남성|무관 (영상이 주로 누구를 대상으로 하는지, 모르면 무관)"}}.
- items의 각 항목: {"name": "한국어 종목명(헬스장에서 흔히 부르는 이름)", "part": "부위", "sets": 세트 수(정수), "reps": "횟수(예: 10, 8–12, 실패 직전까지)", "weightKg": 영상에 나온 무게(kg, 숫자, 모르면 null), "restSec": 휴식(초, 모르면 null), "at": "종목이 시작되는 영상 시간 mm:ss(모르면 null)", "note": "드랍세트 포함 같은 짧은 메모(없으면 빈 문자열)"}.
- 파운드는 kg으로 바꾸고 2.5 단위로 반올림. 영상에 없는 종목을 지어내지 마세요.`;

const DIET_PROMPT = `이 유튜브 영상에서 따라 먹을 수 있는 식단을 뽑아 JSON 하나로만 답하세요.
규칙:
- 영상이 식단·요리·식사 구성(무엇을 얼마나 먹는지)을 보여주지 않으면 {"isDiet": false, "reason": "식단 아님|정보 부족 중 하나"}.
- 식단이면 {"isDiet": true, "title": "짧은 한국어 제목(20자 이내)", "summary": "피드에 보일 한 줄 소개(40자 이내, ~해요체)", "meals": [...], "tips": ["핵심 팁, 최대 3개"], "tags": {"goals": ["다이어트|벌크업|린매스업|건강식 중 해당하는 것"], "style": "편의점|도시락|요리|외식|간식 중 하나", "audience": "여성|남성|무관"}}.
- meals의 각 끼니: {"id": "breakfast|am_snack|lunch|pm_snack|dinner|night_snack 중 하나", "name": "아침/오전간식/점심/오후간식/저녁/야식", "foods": [{"name": "음식 이름과 양(예: 닭가슴살 100g, 현미밥 반 공기)", "kcal": 숫자, "carb": 탄수화물g, "protein": 단백질g, "fat": 지방g}]}.
- 레시피 하나를 만드는 영상이면 그 음식을 점심(lunch) 한 끼로 넣는다.
- 영양 수치는 영상에 나온 값이 있으면 그 값, 없으면 일반적인 성분표 기준 추정치(정수).`;

async function analyzeVideo(info, apiKey, upstreamBase, prompt = PROMPT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(`${upstreamBase}/models/${MODEL}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ fileData: { fileUri: info.url, mimeType: 'video/*' } }, { text: prompt }] }],
        /* 루틴을 뽑는 데는 높은 화질이 필요 없다. 낮은 화질로 읽으면 영상 토큰이 약 1/3로 준다. */
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2, mediaResolution: 'MEDIA_RESOLUTION_LOW' },
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      console.error('youtube analyze upstream', { status: res.status, message: data?.error?.message });
      if (res.status === 429) throw new SocialError('ai-rate-limited', 429);
      if (res.status === 400) throw new SocialError('video-unavailable', 422);
      throw new SocialError('ai-failed', 502);
    }
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = (parts.find((p) => !p.thought && typeof p.text === 'string') || {}).text || '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new SocialError('ai-failed', 502);
    return JSON.parse(text.slice(start, end + 1));
  } catch (error) {
    if (error instanceof SocialError) throw error;
    if (error.name === 'AbortError') throw new SocialError('ai-timeout', 504);
    throw new SocialError('ai-failed', 502);
  } finally {
    clearTimeout(timer);
  }
}

function cleanItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 15).map((it) => ({
    name: String(it?.name || '').slice(0, 40),
    part: String(it?.part || '').slice(0, 10),
    sets: Math.max(1, Math.min(10, parseInt(it?.sets, 10) || 3)),
    reps: String(it?.reps ?? '').slice(0, 20) || '10',
    weightKg: Number.isFinite(Number(it?.weightKg)) && Number(it.weightKg) > 0 ? Math.round(Number(it.weightKg) * 10) / 10 : null,
    restSec: Number.isFinite(Number(it?.restSec)) && Number(it.restSec) > 0 ? Math.round(Number(it.restSec)) : null,
    at: /^\d{1,2}:\d{2}$/.test(String(it?.at || '')) ? String(it.at) : null,
    note: String(it?.note || '').slice(0, 40),
  })).filter((it) => it.name);
}

/* 정리 결과를 돌려준다. 캐시가 있으면 AI를 다시 부르지 않는다. */
const MEAL_IDS = { breakfast: '아침', am_snack: '오전간식', lunch: '점심', pm_snack: '오후간식', dinner: '저녁', night_snack: '야식' };
const num = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));

function cleanMeals(meals) {
  const out = [];
  (Array.isArray(meals) ? meals : []).forEach((m) => {
    const id = MEAL_IDS[m?.id] ? m.id : null;
    if (!id) return;
    const foods = (Array.isArray(m.foods) ? m.foods : []).slice(0, 10).map((f) => ({
      name: String(f?.name || '').slice(0, 40),
      kcal: num(f?.kcal, 3000), carb: num(f?.carb, 500), protein: num(f?.protein, 300), fat: num(f?.fat, 300),
    })).filter((f) => f.name && f.kcal > 0);
    if (!foods.length) return;
    const prev = out.find((x) => x.id === id);
    if (prev) prev.foods.push(...foods);
    else out.push({ id, name: MEAL_IDS[id], foods });
  });
  const order = Object.keys(MEAL_IDS);
  return out.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

function cleanTags(tags) {
  const t = tags && typeof tags === 'object' ? tags : {};
  const pick = (v, allowed) => (allowed.includes(v) ? v : null);
  return {
    level: pick(t.level, ['초급', '중급', '상급']),
    place: pick(t.place, ['헬스장', '홈트']),
    style: pick(t.style, ['편의점', '도시락', '요리', '외식', '간식']),
    goals: (Array.isArray(t.goals) ? t.goals : []).map((g) => String(g).slice(0, 10)).slice(0, 4),
    audience: pick(t.audience, ['여성', '남성', '무관']) || '무관',
  };
}

/* 식단 영상 정리 (kind: diet). 끼니·음식·영양(추정) */
async function finishDiet(ref, info, lengthSec, result) {
  if (!result?.isDiet) {
    await ref.set({ ...info, status: 'rejected', reason: String(result?.reason || '식단 아님'), at: Date.now() });
    throw new SocialError('not-routine', 422, { reason: '식단 아님' });
  }
  const meals = cleanMeals(result.meals);
  if (!meals.length) {
    await ref.set({ ...info, status: 'rejected', reason: '정보 부족', at: Date.now() });
    throw new SocialError('not-routine', 422, { reason: '정보 부족' });
  }
  const totals = meals.flatMap((m) => m.foods).reduce((a, f) => ({ kcal: a.kcal + f.kcal, carb: a.carb + f.carb, protein: a.protein + f.protein, fat: a.fat + f.fat }), { kcal: 0, carb: 0, protein: 0, fat: 0 });
  const doc = {
    ...info,
    kind: 'diet',
    status: 'done',
    routineTitle: String(result.title || info.title).slice(0, 40),
    summary: String(result.summary || '').slice(0, 60),
    meals,
    totals,
    items: [],
    parts: [],
    tips: (Array.isArray(result.tips) ? result.tips : []).map((t) => String(t).slice(0, 80)).slice(0, 3),
    tags: cleanTags(result.tags),
    durationSec: lengthSec || null,
    imports: 0,
    at: Date.now(),
  };
  await ref.set(doc);
  return doc;
}

/* kind: 'workout'(기본) | 'diet'. 운동으로 봤는데 식단 영상이면(dietFallback) 식단으로 한 번 더 본다. */
async function importVideo(url, { apiKey, upstreamBase, beforeAi, maxSec = 3600, rememberTooLong = true, kind = 'workout', dietFallback = true }) {
  const videoId = parseVideoId(url);
  if (!videoId) throw new SocialError('not-youtube', 422);
  const ref = db().doc(`youtubeRoutines/${videoId}`);
  const cached = await ref.get();
  if (cached.exists && cached.data().status === 'done') return { ...cached.data(), cached: true };
  if (cached.exists && cached.data().status === 'rejected') {
    throw new SocialError('not-routine', 422, { reason: cached.data().reason || '' });
  }

  let info;
  try {
    info = await fetchVideoInfo(videoId);
  } catch (error) {
    /* 퍼가기가 막혔거나 볼 수 없는 영상은 다시 보지 않도록 기록해 둔다 */
    if (error.code === 'video-unavailable') await ref.set({ videoId, status: 'rejected', reason: 'unavailable', at: Date.now() });
    throw error;
  }
  const lengthSec = await fetchVideoLength(videoId);
  if (lengthSec && lengthSec > maxSec) {
    if (rememberTooLong && maxSec >= 3600) await ref.set({ ...info, status: 'rejected', reason: 'too-long', durationSec: lengthSec, at: Date.now() });
    throw new SocialError('too-long', 422, { reason: 'too-long' });
  }
  if (beforeAi) await beforeAi();
  if (kind === 'diet') return finishDiet(ref, info, lengthSec, await analyzeVideo(info, apiKey, upstreamBase, DIET_PROMPT));
  const result = await analyzeVideo(info, apiKey, upstreamBase);
  if (!result?.isRoutine && dietFallback && /식단/.test(String(result?.reason || ''))) {
    return finishDiet(ref, info, lengthSec, await analyzeVideo(info, apiKey, upstreamBase, DIET_PROMPT));
  }
  if (!result?.isRoutine) {
    const reason = String(result?.reason || '');
    await ref.set({ ...info, status: 'rejected', reason, at: Date.now() });
    throw new SocialError(reason === 'too-long' ? 'too-long' : 'not-routine', 422, { reason });
  }
  const items = cleanItems(result.items);
  if (items.length < 2) {
    await ref.set({ ...info, status: 'rejected', reason: '정보 부족', at: Date.now() });
    throw new SocialError('not-routine', 422, { reason: '정보 부족' });
  }
  const doc = {
    ...info,
    status: 'done',
    routineTitle: String(result.title || info.title).slice(0, 40),
    parts: (Array.isArray(result.parts) ? result.parts : []).map((p) => String(p).slice(0, 10)).slice(0, 5),
    durationSec: lengthSec || parseInt(result.durationSec, 10) || null,
    summary: String(result.summary || '').slice(0, 60),
    items,
    tips: (Array.isArray(result.tips) ? result.tips : []).map((t) => String(t).slice(0, 80)).slice(0, 3),
    tags: cleanTags(result.tags),
    kind: 'workout',
    imports: 0,
    at: Date.now(),
  };
  await ref.set(doc);
  return doc;
}

module.exports = { fetchVideoInfo, importVideo, parseVideoId };
