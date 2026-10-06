import assert from 'node:assert/strict';
import { calculateMacroCalories, hasManualMacroValues, parseManualMacroText } from '../src/utils/manualMacroEntry.js';

assert.deepEqual(
  parseManualMacroText('약 1,200kcal, 탄수화물 130g, 단백질 70g, 지방 45g'),
  { kcal: 1200, carb: 130, protein: 70, fat: 45 },
);

assert.deepEqual(
  parseManualMacroText('열량: 850 / 탄 90 / 단 55 / 지 30'),
  { kcal: 850, carb: 90, protein: 55, fat: 30 },
);

assert.deepEqual(
  parseManualMacroText('130g 탄수화물, 70g 단백질, 45g 지방'),
  { kcal: null, carb: 130, protein: 70, fat: 45 },
);

assert.equal(calculateMacroCalories({ carb: 130, protein: 70, fat: 45 }), 1205);
assert.equal(calculateMacroCalories({ carb: '', protein: '', fat: '' }), 0);
assert.equal(hasManualMacroValues({ kcal: 0, carb: 0, protein: 0, fat: 0 }), false);
assert.equal(hasManualMacroValues({ kcal: 500, carb: 0, protein: 0, fat: 0 }), true);

console.log('manual macro entry tests passed');
