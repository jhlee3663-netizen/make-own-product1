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

export function normalizeFoodKey(value) {
  return compact(value)
    .replace(/[()（）]/g, '')
    .replace(/그램/g, 'g')
    .replace(/피스|pcs?/g, 'ps')
    .replace(/한스푼/g, '1스푼')
    .replace(/한숟가락/g, '1숟가락');
}

export function findCustomFood(customFoods, text) {
  const key = normalizeFoodKey(text);
  if (!key) return null;
  return (customFoods || []).find(food => food?.key === key || normalizeFoodKey(food?.name) === key) || null;
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

function extractCountAmount(text, fallback = 1) {
  const value = String(text || '').toLowerCase();
  const countMatch = value.match(/(\d+(?:\.\d+)?)\s*(?:개|피스|pieces?|pcs?|ps|p|조각|점|줄)/);
  if (countMatch) return Math.max(1, Math.round(Number(countMatch[1])));
  if (/반\s*(?:개|피스|ps|인분)/.test(value)) return 0.5;
  return fallback;
}

function getAmountHint(text) {
  const value = String(text || '').toLowerCase();
  const gramMatch = value.match(/(\d+(?:\.\d+)?)\s*(kg|g|그램)/);
  const countMatch = value.match(/(\d+(?:\.\d+)?)\s*(개|피스|pieces?|pcs?|ps|p|조각|점|줄|봉|팩|회)/);
  const portionMatch = value.match(/(\d+(?:\.\d+)?)\s*(인분|회\s*제공량|회분)/);
  return {
    text: value,
    grams: gramMatch
      ? Math.round(Number(gramMatch[1]) * (gramMatch[2] === 'kg' ? 1000 : 1))
      : null,
    count: countMatch ? Number(countMatch[1]) : null,
    countUnit: countMatch ? countMatch[2] : null,
    portions: portionMatch ? Number(portionMatch[1]) : null,
    hasHalf: /반\s*(?:개|피스|ps|인분|공기|봉|팩)/.test(value),
  };
}

function getServingGram(serving) {
  const value = String(serving || '').toLowerCase();
  const kgMatch = value.match(/(\d+(?:\.\d+)?)\s*kg/);
  if (kgMatch) return Math.round(Number(kgMatch[1]) * 1000);
  const gramMatch = value.match(/(\d+(?:\.\d+)?)\s*(?:g|그램)/);
  return gramMatch ? Math.round(Number(gramMatch[1])) : null;
}

function getServingCount(serving) {
  const value = String(serving || '').toLowerCase();
  const countMatch = value.match(/(\d+(?:\.\d+)?)\s*(?:개|피스|pieces?|pcs?|ps|p|조각|점|줄|봉|팩|회|인분)/);
  if (countMatch) return Number(countMatch[1]);
  if (/1\s*회\s*제공량|총\s*내용량|1\s*봉|1\s*팩/.test(value)) return 1;
  return null;
}

function scaleNutritionItem(item, ratio, matchedSuffix) {
  const scaled = {
    ...item,
    kcal: Math.round(Number(item.kcal || 0) * ratio),
    carb: Math.round(Number(item.carb || 0) * ratio),
    protein: Math.round(Number(item.protein || 0) * ratio),
    fat: Math.round(Number(item.fat || 0) * ratio),
  };
  return reconcileNutrition({
    ...scaled,
    matchedName: matchedSuffix
      ? `${item.matchedName || item.name} · ${matchedSuffix}`
      : item.matchedName,
  });
}

function adjustNutritionForAmount(item, amountText) {
  const amount = getAmountHint(amountText);
  const servingText = `${item.serving || ''} ${item.name || ''}`;
  const servingGram = getServingGram(servingText);
  const servingCount = getServingCount(servingText);

  if (amount.grams && servingGram) {
    const ratio = amount.grams / servingGram;
    if (ratio > 0 && Math.abs(ratio - 1) > 0.05) {
      return scaleNutritionItem(item, ratio, `${amount.grams}g 환산`);
    }
  }

  if (amount.count && servingCount) {
    const ratio = amount.count / servingCount;
    if (ratio > 0 && Math.abs(ratio - 1) > 0.05) {
      return scaleNutritionItem(item, ratio, `${amount.count}${amount.countUnit || '개'} 환산`);
    }
  }

  if (amount.portions && servingCount && /인분|회/.test(servingText)) {
    const ratio = amount.portions / servingCount;
    if (ratio > 0 && Math.abs(ratio - 1) > 0.05) {
      return scaleNutritionItem(item, ratio, `${amount.portions}인분 환산`);
    }
  }

  return item;
}

function isAmountCompatibleWithMfds(item, amountText) {
  const amount = getAmountHint(amountText);
  const servingText = `${item.serving || ''} ${item.name || ''}`;
  if (amount.count && !getServingCount(servingText)) return false;
  if (amount.grams && !getServingGram(servingText)) return false;
  return true;
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

function macroKcalOf(item) {
  return Math.round(Number(item.carb || 0) * 4 + Number(item.protein || 0) * 4 + Number(item.fat || 0) * 9);
}

function reconcileNutrition(item) {
  const kcal = toNumber(item.kcal);
  const macroKcal = macroKcalOf(item);
  if (!kcal || !macroKcal || item.source === 'custom') return { ...item, kcal };

  const gap = Math.abs(kcal - macroKcal);
  const gapRatio = gap / Math.max(kcal, macroKcal);
  if (gap < 35 || gapRatio < 0.08) return { ...item, kcal };

  return {
    ...item,
    kcal: macroKcal,
    calorieAdjusted: true,
    matchedName: item.matchedName ? `${item.matchedName} · kcal 보정` : '탄단지 기준 kcal 보정',
  };
}

function makeStandardFood({ name, rawName, serving, kcal, carb, protein, fat, matchedName, score = 210 }) {
  return reconcileNutrition({
    name,
    rawName,
    serving,
    kcal,
    carb,
    protein,
    fat,
    source: 'standard',
    matchedName,
    score,
  });
}

function getStandardFood(query, amountText = query) {
  const normalized = compact(query);
  const fullText = `${query} ${amountText || ''}`;

  if (/초밥|스시|sushi/.test(normalized)) {
    const pieces = extractCountAmount(fullText, /모듬|세트|1\s*인분|일인분|한\s*접시/.test(fullText) ? 10 : 1);
    const macros = {
      kcal: Math.round(48 * pieces),
      carb: Math.round(7.8 * pieces),
      protein: Math.round(3.0 * pieces),
      fat: Math.round(1.0 * pieces),
    };
    return makeStandardFood({
      name: `초밥 ${pieces}피스`,
      rawName: '초밥',
      serving: `${pieces}피스`,
      ...macros,
      matchedName: '초밥 1피스 평균 기준',
      score: 220,
    });
  }

  if (/우동|udon/.test(normalized)) {
    const portion = /반|0\.5|1\/2/.test(fullText) ? 0.5 : 1;
    const macros = {
      kcal: Math.round(420 * portion),
      carb: Math.round(78 * portion),
      protein: Math.round(12 * portion),
      fat: Math.round(6 * portion),
    };
    return makeStandardFood({
      name: portion === 0.5 ? '우동 반개' : '우동 1인분',
      rawName: '우동',
      serving: portion === 0.5 ? '0.5인분' : '1인분',
      ...macros,
      matchedName: '우동 1인분 평균 기준',
      score: 210,
    });
  }

  if (/카레|커리|curry/.test(normalized)) {
    const portion = /반|0\.5|1\/2/.test(fullText) ? 0.5 : 1;
    const hasMeat = /고기|소고기|돼지고기|닭|비프|포크|치킨/.test(fullText);
    const base = hasMeat
      ? { kcal: 285, carb: 28, protein: 13, fat: 13 }
      : { kcal: 235, carb: 31, protein: 6, fat: 9 };
    const macros = {
      kcal: Math.round(base.kcal * portion),
      carb: Math.round(base.carb * portion),
      protein: Math.round(base.protein * portion),
      fat: Math.round(base.fat * portion),
    };
    return makeStandardFood({
      name: hasMeat ? '카레 고기 포함 1인분' : '카레 1인분',
      rawName: '카레',
      serving: portion === 0.5 ? '0.5인분' : '1인분',
      ...macros,
      matchedName: hasMeat ? '카레 고기 포함 평균 기준' : '카레 소스 평균 기준',
      score: 215,
    });
  }

  if (/소시지|소세지|sausage|핫바|프랑크/.test(normalized)) {
    const count = extractCountAmount(fullText, 1);
    const isLong = /긴|롱|프랑크|핫바/.test(fullText);
    const base = isLong
      ? { kcal: 190, carb: 4, protein: 8, fat: 16 }
      : { kcal: 120, carb: 3, protein: 6, fat: 10 };
    const macros = {
      kcal: Math.round(base.kcal * count),
      carb: Math.round(base.carb * count),
      protein: Math.round(base.protein * count),
      fat: Math.round(base.fat * count),
    };
    return makeStandardFood({
      name: `${isLong ? '긴 소시지' : '소시지'} ${count}개`,
      rawName: '소시지',
      serving: `${count}개`,
      ...macros,
      matchedName: isLong ? '긴 소시지 1개 평균 기준' : '소시지 1개 평균 기준',
      score: 215,
    });
  }

  if (!/(^|[^가-힣])(밥|쌀밥|흰쌀밥|백미밥|공기밥)([^가-힣]|$)/.test(` ${normalized} `)) return null;
  if (/(국밥|김밥|볶음밥|덮밥|비빔밥|주먹밥|초밥|밥버거|밥맛)/.test(normalized)) return null;

  const grams = extractGramAmount(`${query} ${amountText}`, 210);
  const macros = scaleByGram({ kcal: 166, carb: 37.3, protein: 3.4, fat: 0.3 }, grams);
  return makeStandardFood({
    name: `밥 ${grams}g`,
    rawName: '쌀밥',
    serving: `${grams}g`,
    ...macros,
    matchedName: '쌀밥 100g 기준',
    score: 200,
  });
}

function extractJson(raw, fallbackPattern) {
  const match = raw.match(fallbackPattern);
  if (!match) throw new Error('JSON 파싱 실패');
  return JSON.parse(match[0]);
}

const geminiCache = new Map();

async function callGeminiJson(prompt, pattern) {
  const key = import.meta.env.VITE_GEMINI_KEY;
  if (!key) throw new Error('Gemini 키 없음');

  if (geminiCache.has(prompt)) return geminiCache.get(prompt);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: controller.signal,
      }
    );
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json();
  const cp = json.candidates?.[0]?.content?.parts;
  if (!cp) throw new Error('AI 응답 없음');
  const raw = (cp.find(p => !p.thought) ?? cp[cp.length - 1]).text;
  const result = extractJson(raw, pattern);
  geminiCache.set(prompt, result);
  return result;
}

export async function parseFoodMemo(text) {
  const prompt = `다음 식단 메모를 음식 항목 단위로만 분리해 순수 JSON 배열만 반환해라.
영양성분은 추정하지 마라. 음식명과 수량만 정리해라.
브랜드명이나 제품명이 명확한 가공식품은 query에 제품명을 줄이지 말고 최대한 그대로 보존해라.
형식: [{"name":"음식명","amount":"수량 또는 1인분","query":"검색용 핵심 음식명"}]
예: "뼈찜 1인분, 공기밥 반공기" -> [{"name":"뼈찜","amount":"1인분","query":"뼈찜"},{"name":"공기밥","amount":"반공기","query":"밥"}]
예: "투데이넛 너트한줌 프리미엄" -> [{"name":"투데이넛 너트한줌 프리미엄","amount":"1개","query":"투데이넛 너트한줌 프리미엄"}]
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
    .filter(item => isAmountCompatibleWithMfds(item, query))
    .map(item => adjustNutritionForAmount(item, query))
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
  return reconcileNutrition({
    name: String(item.name || text),
    kcal: toNumber(item.kcal),
    carb: toNumber(item.carb || item.carbohydrate),
    protein: toNumber(item.protein),
    fat: toNumber(item.fat),
    source: 'ai',
  });
}

export async function estimateMealNutrition(text, customFoods = []) {
  const foods = await parseFoodMemo(text);
  const resolved = await Promise.all(foods.map(food => resolveFoodNutrition(food, customFoods)));
  return resolved.filter(item => item.name);
}

export async function resolveFoodNutrition(food, customFoods = []) {
  const foodText = `${food.name}${food.amount ? ` ${food.amount}` : ''}`.trim();
  const customFood = findCustomFood(customFoods, foodText) || findCustomFood(customFoods, food.query || food.name);
  if (customFood) {
    return {
      ...customFood,
      name: customFood.name || foodText,
      source: 'custom',
      matchedName: '내가 수정한 기준',
    };
  }

  const standardFood = getStandardFood(`${food.name} ${food.amount || ''}`, food.amount);
  if (standardFood) return standardFood;

  try {
    const mfdsItems = await searchMfdsFoods(foodText);
    if (mfdsItems.length === 0 && food.query && food.query !== foodText) {
      mfdsItems.push(...await searchMfdsFoods(food.query));
    }
    const best = mfdsItems[0];
    const second = mfdsItems[1];
    const isConfident = best && best.score >= 60 && (!second || best.score - second.score >= 15 || best.score >= 90);
    if (isConfident && isAmountCompatibleWithMfds(best, foodText)) {
      const adjusted = adjustNutritionForAmount(best, foodText);
      return {
        ...adjusted,
        name: `${food.name}${food.amount ? ` ${food.amount}` : ''}`,
        matchedName: adjusted.matchedName || best.name,
      };
    }
  } catch (e) {
    console.warn('식약처 DB 검색 실패, AI 추정으로 대체:', e.message);
  }

  return estimateFoodNutrition(`${food.name} ${food.amount || ''}`.trim());
}
