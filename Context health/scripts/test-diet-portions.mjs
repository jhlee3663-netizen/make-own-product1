import assert from 'node:assert/strict';
import {
  adjustFoodPortion,
  ensureFoodPortion,
  getFoodPortionAmount,
  getPortionDisplayName,
  mergeFoodPortionItems,
  setFoodPortionAmount,
  switchFoodPortionMode,
} from '../src/utils/dietPortions.js';

const chicken = ensureFoodPortion({
  id: 'chicken', name: '닭가슴살 100g', kcal: 110, carb: 2, protein: 21, fat: 2,
});
assert.equal(chicken.portion.mode, 'weight');
assert.equal(chicken.portion.grams, 100);
assert.equal(getPortionDisplayName(chicken.name), '닭가슴살');

const chickenCount = switchFoodPortionMode(chicken);
assert.equal(chickenCount.portion.mode, 'count');
assert.equal(getFoodPortionAmount(chickenCount), 1);

const threeChicken = setFoodPortionAmount(chickenCount, 3);
assert.equal(threeChicken.portion.grams, 300);
assert.equal(threeChicken.kcal, 330);
assert.equal(threeChicken.protein, 63);

const exactChicken = setFoodPortionAmount(switchFoodPortionMode(threeChicken), 110);
assert.equal(exactChicken.portion.mode, 'weight');
assert.equal(exactChicken.portion.grams, 110);
assert.equal(exactChicken.kcal, 121);

const rice = ensureFoodPortion({ id: 'rice', name: '밥 200g', kcal: 300, carb: 66, protein: 6, fat: 0 });
const rice120 = setFoodPortionAmount(rice, 120);
assert.equal(rice120.kcal, 180);
assert.equal(rice120.carb, 40);
assert.equal(adjustFoodPortion(rice120, 1).portion.grams, 130);

const merged = mergeFoodPortionItems([], [chicken, chicken, chicken]);
assert.equal(merged.length, 1);
assert.equal(merged[0].portion.grams, 300);
assert.equal(merged[0].kcal, 330);

const manualEntry = { id: 'buffet', name: '뷔페 저녁', kcal: 1200, carb: 130, protein: 70, fat: 45, entryType: 'manualMacros' };
const withManualEntry = mergeFoodPortionItems([], [manualEntry]);
assert.equal(withManualEntry.length, 1);
assert.equal(withManualEntry[0].entryType, 'manualMacros');
assert.equal(withManualEntry[0].portion, undefined);

assert.equal(setFoodPortionAmount(chickenCount, 0), null);

const unknownWeight = ensureFoodPortion({ id: 'shake', name: '프로틴 한스푼', kcal: 120, carb: 3, protein: 23, fat: 2 });
assert.equal(unknownWeight.portion.mode, 'count');
assert.equal(unknownWeight.portion.gramsKnown, false);
assert.equal(unknownWeight.portion.unit, '회');
assert.equal(switchFoodPortionMode(unknownWeight).portion.mode, 'count');
console.log('diet portion tests passed');
