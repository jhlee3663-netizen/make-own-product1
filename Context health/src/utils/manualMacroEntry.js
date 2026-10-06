const FIELD_PATTERNS = {
  kcal: [
    /(?:칼로리|열량)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:kcal|칼로리)?/i,
    /(\d+(?:\.\d+)?)\s*(?:kcal|칼로리)/i,
  ],
  carb: [
    /(?:탄수화물|탄수|탄)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*g?/i,
    /(\d+(?:\.\d+)?)\s*g\s*(?:탄수화물|탄수|탄)/i,
  ],
  protein: [
    /(?:단백질|단백|단)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*g?/i,
    /(\d+(?:\.\d+)?)\s*g\s*(?:단백질|단백|단)/i,
  ],
  fat: [
    /(?:지방|지질|지)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*g?/i,
    /(\d+(?:\.\d+)?)\s*g\s*(?:지방|지질|지)/i,
  ],
};

export function parseManualMacroText(value) {
  const text = String(value || '').replace(/(\d),(?=\d)/g, '$1');
  return Object.fromEntries(Object.entries(FIELD_PATTERNS).map(([field, patterns]) => {
    const match = patterns.map(pattern => text.match(pattern)).find(Boolean);
    return [field, match ? Number(match[1]) : null];
  }));
}

export function calculateMacroCalories({ carb, protein, fat }) {
  const safe = value => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  };
  return Math.round((safe(carb) * 4) + (safe(protein) * 4) + (safe(fat) * 9));
}

export function hasManualMacroValues(form) {
  return ['kcal', 'carb', 'protein', 'fat'].some(field => Number(form?.[field]) > 0);
}
