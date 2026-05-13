const GEMINI_MODEL = 'gemini-2.5-flash';
const MFDS_ENDPOINT = 'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02';

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  const n = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function compact(value) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

function pick(row, keys) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '') return row[key];
  }
  return undefined;
}

function extractGramAmount(text, fallback = 100) {
  const value = String(text || '').toLowerCase();
  const kgMatch = value.match(/(\d+(?:\.\d+)?)\s*kg/);
  if (kgMatch) return Math.round(Number(kgMatch[1]) * 1000);
  const gramMatch = value.match(/(\d+(?:\.\d+)?)\s*(?:g|그램)/);
  if (gramMatch) return Math.round(Number(gramMatch[1]));
  if (/(반\s*공기|0\.5\s*공기|1\/2\s*공기)/.test(value)) return 105;
  if (/(한\s*공기|1\s*공기|공기밥)/.test(value)) return 210;
  return fallback;
}

function scaleByGram(base, grams) {
  const ratio = grams / 100;
  return {
    kcal: Math.round(base.kcal * ratio),
    carb: Math.round(base.carb * ratio),
    protein: Math.round(base.protein * ratio),
    fat: Math.round(base.fat * ratio),
  };
}

function getStandardFood(query, amountText = query) {
  const normalized = compact(query);
  if (!/(^|[^가-힣])(밥|쌀밥|흰쌀밥|백미밥|공기밥)([^가-힣]|$)/.test(` ${normalized} `)) return null;
  if (/(국밥|김밥|볶음밥|덮밥|비빔밥|주먹밥|초밥|밥버거|밥맛)/.test(normalized)) return null;

  const grams = extractGramAmount(`${query} ${amountText}`, 210);
  const macros = scaleByGram({ kcal: 166, carb: 37.3, protein: 3.4, fat: 0.3 }, grams);
  return {
    name: `밥 ${grams}g`,
    rawName: '쌀밥',
    serving: `${grams}g`,
    ...macros,
    source: 'standard',
    matchedName: '쌀밥 100g 기준',
    score: 200,
  };
}

function extractJson(raw, fallbackPattern) {
  const match = raw.match(fallbackPattern);
  if (!match) throw new Error('JSON 파싱 실패');
  return JSON.parse(match[0]);
}

async function callGeminiJson(prompt, pattern) {
  const key = import.meta.env.VITE_GEMINI_KEY;
  if (!key) throw new Error('Gemini 키 없음');
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  const json = await res.json();
  const cp = json.candidates?.[0]?.content?.parts;
  if (!cp) throw new Error('AI 응답 없음');
  const raw = (cp.find(p => !p.thought) ?? cp[cp.length - 1]).text;
  return extractJson(raw, pattern);
}

export async function parseFoodMemo(text) {
  const prompt = `다음 식단 메모를 음식 항목 단위로만 분리해 순수 JSON 배열만 반환해라.
영양성분은 추정하지 마라. 음식명과 수량만 정리해라.
형식: [{"name":"음식명","amount":"수량 또는 1인분","query":"검색용 핵심 음식명"}]
예: "뼈찜 1인분, 공기밥 반공기" -> [{"name":"뼈찜","amount":"1인분","query":"뼈찜"},{"name":"공기밥","amount":"반공기","query":"밥"}]
메모: "${text}"`;
  try {
    const items = await callGeminiJson(prompt, /\[[\s\S]*\]/);
    return items.map(item => ({
      name: String(item.name || item.query || text).trim(),
      amount: String(item.amount || '1인분').trim(),
      query: String(item.query || item.name || text).trim(),
    })).filter(item => item.name);
  } catch {
    return [{ name: text, amount: '1인분', query: text }];
  }
}

const LOW_CONFIDENCE_TERMS = ['소스', '양념', '드레싱', '시즈닝', '분말', '가루', '베이스', '농축', '엑기스', '즙'];

function scoreMfdsRow(item, query) {
  const normalizedName = compact(item.rawName || item.name);
  const normalizedQuery = compact(query);
  let score = 0;

  if (!normalizedName || !normalizedQuery) return 0;
  if (normalizedName === normalizedQuery) score += 120;
  if (normalizedName.includes(normalizedQuery)) score += 80;
  if (normalizedQuery.includes(normalizedName)) score += 35;

  normalizedQuery.split(/[,+/]/).filter(Boolean).forEach(term => {
    if (normalizedName.includes(term)) score += 8;
  });

  const hasLowConfidenceTerm = LOW_CONFIDENCE_TERMS.some(term => normalizedName.includes(term));
  const queryHasLowConfidenceTerm = LOW_CONFIDENCE_TERMS.some(term => normalizedQuery.includes(term));
  if (hasLowConfidenceTerm && !queryHasLowConfidenceTerm) score -= 70;
  if (item.kcal > 0 && (item.carb > 0 || item.protein > 0 || item.fat > 0)) score += 10;

  return score;
}

function normalizeMfdsRow(row, fallbackName) {
  const name = String(pick(row, ['FOOD_NM_KR', 'FOOD_NM', 'DESC_KOR', 'foodNm', 'foodNmKr']) || fallbackName || '').trim();
  const serving = pick(row, ['SERVING_SIZE', 'SERVING_UNIT', 'NUTR_CONT_SERVING_SIZE', 'servingSize']);
  return {
    rawName: name,
    name: serving ? `${name} (${serving})` : name,
    serving: serving || '',
    kcal: toNumber(pick(row, ['NUTR_CONT1', 'AMT_NUM1', 'ENERC', 'ENERGY', 'KCAL', 'enerc', 'kcal'])),
    carb: toNumber(pick(row, ['NUTR_CONT2', 'AMT_NUM6', 'CHOCDF', 'CARBOHYDRATE', 'carb'])),
    protein: toNumber(pick(row, ['NUTR_CONT3', 'AMT_NUM3', 'PROT', 'PROTEIN', 'protein'])),
    fat: toNumber(pick(row, ['NUTR_CONT4', 'AMT_NUM4', 'FATCE', 'FAT', 'fat'])),
    source: 'mfds',
  };
}

function getMfdsRows(json) {
  const body = json?.body || json?.response?.body;
  const items = body?.items || body?.item || json?.items;
  if (Array.isArray(items)) return items;
  if (Array.isArray(items?.item)) return items.item;
  if (items && typeof items === 'object') return [items];
  return [];
}

export async function searchMfdsFoods(query) {
  const key = import.meta.env.VITE_MFDS_SERVICE_KEY;
  if (!key || !query?.trim()) return [];
  const standardFood = getStandardFood(query);
  if (standardFood) return [standardFood];

  const url = new URL(MFDS_ENDPOINT);
  url.searchParams.set('serviceKey', key);
  url.searchParams.set('type', 'json');
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '10');
  url.searchParams.set('FOOD_NM_KR', query.trim());

  const res = await fetch(url);
  if (!res.ok) throw new Error(`식약처 DB 응답 오류(${res.status})`);
  const json = await res.json();
  return getMfdsRows(json)
    .map(row => normalizeMfdsRow(row, query))
    .filter(item => item.name && (item.kcal || item.carb || item.protein || item.fat))
    .map(item => ({ ...item, score: scoreMfdsRow(item, query) }))
    .sort((a, b) => b.score - a.score);
}

export async function estimateFoodNutrition(text) {
  const standardFood = getStandardFood(text);
  if (standardFood) return standardFood;

  const prompt = `음식 "${text}"의 섭취량 기준 영양성분을 추정해 순수 JSON 객체만 반환해라.
반드시 음식명에 적힌 g, ml, 공기, 인분 등 수량을 반영해라.
한국에서 통용되는 일반 영양성분 기준을 우선하고, 확실하지 않으면 낮게 잡지 말고 보수적으로 잡아라.
밥/쌀밥은 100g당 약 166kcal, 탄수화물 37g, 단백질 3g, 지방 0g 기준으로 수량에 맞춰 계산해라.
외식/배달/양념 음식은 칼로리와 지방을 낮게 잡지 말고 평균보다 약간 보수적으로 잡아라.
형식: {"name":"음식명(수량포함)","kcal":숫자,"carb":숫자,"protein":숫자,"fat":숫자}
모든 수치는 정수. 설명 없이 JSON만.`;
  const item = await callGeminiJson(prompt, /\{[\s\S]*\}/);
  return {
    name: String(item.name || text),
    kcal: toNumber(item.kcal),
    carb: toNumber(item.carb || item.carbohydrate),
    protein: toNumber(item.protein),
    fat: toNumber(item.fat),
    source: 'ai',
  };
}

export async function resolveFoodNutrition(food) {
  const standardFood = getStandardFood(`${food.name} ${food.amount || ''}`, food.amount);
  if (standardFood) return standardFood;

  try {
    const mfdsItems = await searchMfdsFoods(food.query || food.name);
    const best = mfdsItems[0];
    const second = mfdsItems[1];
    const isConfident = best && best.score >= 60 && (!second || best.score - second.score >= 15 || best.score >= 90);
    if (isConfident) {
      return {
        ...best,
        name: `${food.name}${food.amount ? ` ${food.amount}` : ''}`,
        matchedName: best.name,
      };
    }
  } catch (e) {
    console.warn('식약처 DB 검색 실패, AI 추정으로 대체:', e.message);
  }

  return estimateFoodNutrition(`${food.name} ${food.amount || ''}`.trim());
}
