import assert from 'node:assert/strict';
import { splitFoodMemoLocally } from '../src/utils/nutritionLookup.js';

const commaSeparated = splitFoodMemoLocally('풀무원그릭요거트1개, 블루베리 1회분, 바나나1개');
assert.deepEqual(
  commaSeparated.map(item => item.name),
  ['풀무원그릭요거트1개', '블루베리 1회분', '바나나1개'],
);

const mixedSeparators = splitFoodMemoLocally('닭가슴살 100g\n밥 120g + 김치 50g');
assert.deepEqual(
  mixedSeparators.map(item => item.name),
  ['닭가슴살 100g', '밥 120g', '김치 50g'],
);

const modifier = splitFoodMemoLocally('라면 1개, 국물 안 먹음');
assert.equal(modifier.length, 1);
assert.equal(modifier[0].name, '라면 1개');
assert.deepEqual(modifier[0].modifiers.map(item => item.type), ['broth_none']);

console.log('food memo split tests passed');
