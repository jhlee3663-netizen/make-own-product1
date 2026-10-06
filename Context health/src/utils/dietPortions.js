const NUTRITION_FIELDS = ['kcal', 'carb', 'protein', 'fat'];
const DEFAULT_BASE_GRAMS = 100;
const WEIGHT_STEP_GRAMS = 10;
const MAX_GRAMS = 100000;
const MAX_COUNT = 1000;

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function roundAmount(value) {
  return Math.round(Number(value) * 10) / 10;
}

function cleanNutrition(item) {
  return Object.fromEntries(NUTRITION_FIELDS.map(field => [field, Math.max(0, Number(item?.[field] || 0))]));
}

export function extractFoodGrams(...values) {
  const text = values.filter(Boolean).join(' ').toLowerCase();
  const kgMatch = text.match(/(\d+(?:\.\d+)?)\s*kg\b/);
  if (kgMatch) return roundAmount(Number(kgMatch[1]) * 1000);
  const gramMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:g|그램)\b/);
  return gramMatch ? roundAmount(Number(gramMatch[1])) : null;
}

function extractFoodCount(...values) {
  const text = values.filter(Boolean).join(' ').toLowerCase();
  const match = text.match(/(\d+(?:\.\d+)?)\s*(개|팩|봉|병|캔|조각|인분|회분)\b/);
  return match ? { value: Number(match[1]), unit: match[2] } : null;
}

export function getPortionDisplayName(name) {
  const original = String(name || '').trim();
  const cleaned = original
    .replace(/\s*\(?\d+(?:\.\d+)?\s*(?:kg|g|그램)\)?\s*$/i, '')
    .replace(/\s*\(?\d+(?:\.\d+)?\s*(?:개|팩|봉|병|캔|조각|인분|회분)\)?\s*$/i, '')
    .trim();
  return cleaned || original;
}

function inferPortion(item) {
  const explicitGrams = extractFoodGrams(item?.name, item?.serving);
  const inferredCount = extractFoodCount(item?.name, item?.serving);
  const count = finitePositive(inferredCount?.value, 1);
  if (!explicitGrams) {
    return {
      mode: 'count',
      grams: count,
      baseGrams: 1,
      gramsKnown: false,
      unit: inferredCount?.unit || '회',
      baseNutrition: Object.fromEntries(
        NUTRITION_FIELDS.map(field => [field, Number(item?.[field] || 0) / count])
      ),
    };
  }
  const inferredGrams = explicitGrams;
  const baseGrams = roundAmount(inferredGrams / count);
  return {
    mode: inferredCount ? 'count' : 'weight',
    grams: roundAmount(inferredGrams),
    baseGrams: finitePositive(baseGrams, DEFAULT_BASE_GRAMS),
    gramsKnown: true,
    unit: inferredCount?.unit || '개',
    baseNutrition: Object.fromEntries(
      NUTRITION_FIELDS.map(field => [field, Number(item?.[field] || 0) / count])
    ),
  };
}

export function ensureFoodPortion(item) {
  const inferred = inferPortion(item);
  const saved = item?.portion;
  if (!saved || !['count', 'weight'].includes(saved.mode)) {
    return { ...item, portion: inferred };
  }

  const baseGrams = finitePositive(saved.baseGrams, inferred.baseGrams);
  const grams = finitePositive(saved.grams, inferred.grams);
  const fallbackBase = cleanNutrition(item);
  const baseNutrition = Object.fromEntries(NUTRITION_FIELDS.map(field => [
    field,
    Number.isFinite(Number(saved.baseNutrition?.[field]))
      ? Math.max(0, Number(saved.baseNutrition[field]))
      : fallbackBase[field] * (baseGrams / grams),
  ]));

  return {
    ...item,
    portion: {
      mode: saved.mode,
      grams: roundAmount(grams),
      baseGrams: roundAmount(baseGrams),
      gramsKnown: saved.gramsKnown !== false,
      unit: String(saved.unit || inferred.unit || '개'),
      baseNutrition,
    },
  };
}

export function scaleFoodToGrams(item, requestedGrams, mode) {
  const normalized = ensureFoodPortion(item);
  const grams = Math.min(MAX_GRAMS, Math.max(1, roundAmount(requestedGrams)));
  const ratio = grams / normalized.portion.baseGrams;
  const nutrition = Object.fromEntries(NUTRITION_FIELDS.map(field => [
    field,
    Math.max(0, Math.round(Number(normalized.portion.baseNutrition[field] || 0) * ratio)),
  ]));

  return {
    ...normalized,
    ...nutrition,
    portion: {
      ...normalized.portion,
      mode: mode || normalized.portion.mode,
      grams,
    },
  };
}

export function getFoodPortionAmount(item) {
  const normalized = ensureFoodPortion(item);
  return normalized.portion.mode === 'count'
    ? roundAmount(normalized.portion.grams / normalized.portion.baseGrams)
    : roundAmount(normalized.portion.grams);
}

export function setFoodPortionAmount(item, requestedAmount) {
  const normalized = ensureFoodPortion(item);
  const max = normalized.portion.mode === 'count' ? MAX_COUNT : MAX_GRAMS;
  const amount = Math.min(max, Math.max(0, roundAmount(requestedAmount)));
  if (amount <= 0) return null;
  const grams = normalized.portion.mode === 'count'
    ? normalized.portion.baseGrams * amount
    : amount;
  return scaleFoodToGrams(normalized, grams);
}

export function adjustFoodPortion(item, direction) {
  const normalized = ensureFoodPortion(item);
  const current = getFoodPortionAmount(normalized);
  const step = normalized.portion.mode === 'count' ? 1 : WEIGHT_STEP_GRAMS;
  return setFoodPortionAmount(normalized, current + (direction * step));
}

export function switchFoodPortionMode(item) {
  const normalized = ensureFoodPortion(item);
  if (!normalized.portion.gramsKnown) return normalized;
  const mode = normalized.portion.mode === 'count' ? 'weight' : 'count';
  return scaleFoodToGrams(normalized, normalized.portion.grams, mode);
}

export function rebaseFoodPortionNutrition(item) {
  const normalized = ensureFoodPortion(item);
  const ratio = normalized.portion.grams / normalized.portion.baseGrams;
  const baseNutrition = Object.fromEntries(NUTRITION_FIELDS.map(field => [
    field,
    ratio > 0 ? Number(item?.[field] || 0) / ratio : Number(item?.[field] || 0),
  ]));
  return { ...normalized, portion: { ...normalized.portion, baseNutrition } };
}

function mergeKey(item) {
  return getPortionDisplayName(item?.name).toLowerCase().replace(/\s+/g, '');
}

function nutritionPerGram(item) {
  const normalized = ensureFoodPortion(item);
  return Number(normalized.portion.baseNutrition.kcal || 0) / normalized.portion.baseGrams;
}

function canMerge(left, right) {
  if (left?.entryType === 'manualMacros' || right?.entryType === 'manualMacros') return false;
  if (!mergeKey(left) || mergeKey(left) !== mergeKey(right)) return false;
  const leftRate = nutritionPerGram(left);
  const rightRate = nutritionPerGram(right);
  if (!leftRate && !rightRate) return true;
  return Math.abs(leftRate - rightRate) / Math.max(leftRate, rightRate) <= 0.12;
}

export function mergeFoodPortionItems(currentItems, incomingItems) {
  const merged = [...(currentItems || [])];
  (incomingItems || []).forEach(rawItem => {
    if (rawItem?.entryType === 'manualMacros') {
      merged.push(rawItem);
      return;
    }
    const incoming = ensureFoodPortion(rawItem);
    const index = merged.findIndex(existing => canMerge(existing, incoming));
    if (index < 0) {
      merged.push(incoming);
      return;
    }
    const existing = ensureFoodPortion(merged[index]);
    merged[index] = scaleFoodToGrams(existing, existing.portion.grams + incoming.portion.grams);
  });
  return merged;
}

export function sanitizeFoodPortion(portion) {
  if (!portion || !['count', 'weight'].includes(portion.mode)) return null;
  const baseGrams = finitePositive(portion.baseGrams, DEFAULT_BASE_GRAMS);
  const grams = finitePositive(portion.grams, baseGrams);
  return {
    mode: portion.mode,
    grams: roundAmount(grams),
    baseGrams: roundAmount(baseGrams),
    gramsKnown: portion.gramsKnown !== false,
    unit: String(portion.unit || '개'),
    baseNutrition: Object.fromEntries(NUTRITION_FIELDS.map(field => [
      field,
      Math.max(0, Number(portion.baseNutrition?.[field] || 0)),
    ])),
  };
}
