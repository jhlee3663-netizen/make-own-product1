import assert from 'node:assert/strict';
import {
  applyIntakeModifiers,
  estimateFoodNutrition,
  parseIntakeDescription,
} from '../src/utils/nutritionLookup.js';

const brothLess = parseIntakeDescription('해물 짬뽕 1인분 국물 적게');
assert.equal(brothLess.baseText, '해물 짬뽕 1인분');
assert.deepEqual(brothLess.modifiers.map(item => item.type), ['broth_less']);

const jjamppong = await estimateFoodNutrition('해물 짬뽕 1인분 국물 적게');
assert.deepEqual(
  {
    kcal: jjamppong.kcal,
    carb: jjamppong.carb,
    protein: jjamppong.protein,
    fat: jjamppong.fat,
  },
  { kcal: 577, carb: 108, protein: 28, fat: 12 },
);
assert.equal(jjamppong.adjustmentNote, '국물 약 25% 섭취');

const noBroth = await estimateFoodNutrition('해물 짬뽕 1인분 국물 안 먹음');
assert.deepEqual(
  {
    kcal: noBroth.kcal,
    carb: noBroth.carb,
    protein: noBroth.protein,
    fat: noBroth.fat,
  },
  { kcal: 530, carb: 104, protein: 26, fat: 9 },
);

assert.deepEqual(
  parseIntakeDescription('라면 1개 국물은 거의 안 먹었음').modifiers.map(item => item.type),
  ['broth_none'],
);
assert.deepEqual(
  parseIntakeDescription('샐러드 1인분 드레싱 찍지 않음').modifiers.map(item => item.type),
  ['sauce_none'],
);

const fatRemoved = parseIntakeDescription('삼겹살 200g 비계 제거하고 먹음');
assert.equal(fatRemoved.baseText, '삼겹살 200g');
assert.deepEqual(fatRemoved.modifiers.map(item => item.type), ['visible_fat_removed']);

const adjustedChicken = applyIntakeModifiers(
  { name: '닭다리 1개', kcal: 220, carb: 0, protein: 24, fat: 14 },
  parseIntakeDescription('닭다리 1개 껍질 벗기고 먹음').modifiers,
);
assert.deepEqual(
  {
    kcal: adjustedChicken.kcal,
    carb: adjustedChicken.carb,
    protein: adjustedChicken.protein,
    fat: adjustedChicken.fat,
  },
  { kcal: 187, carb: 0, protein: 24, fat: 6 },
);

console.log('nutrition modifier tests passed');
