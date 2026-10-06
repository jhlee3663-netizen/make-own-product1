/* QA-16 검증: 음수·NaN·Infinity·과대 수치가 저장 경로에서 차단되는지.
   DietDetailScreen에서 순수 함수만 추출해 실행한다(React 렌더 없음). */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/components/screens/DietDetailScreen.jsx'), 'utf8');

/* 대상 함수 두 개와 상수만 떼어내 임시 모듈로 만든다. 앱 소스는 수정하지 않는다. */
function extract(name) {
  const start = source.indexOf(`export function ${name}`);
  assert.notEqual(start, -1, `${name} 를 찾지 못했다`);
  let depth = 0, i = source.indexOf('{', start);
  const from = i;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) break; }
  }
  return source.slice(start, i + 1).replace('export function', 'function');
}

const constLine = source.match(/const NUTRITION_MAX = \{[^}]*\};/)[0];
const modulePath = path.join(os.tmpdir(), `context-health-nutrition-guard-${Date.now()}.mjs`);
fs.writeFileSync(modulePath, `${constLine}\n${extract('sanitizeNutritionValue')}\n${extract('isValidNutritionInput')}\nexport { sanitizeNutritionValue, isValidNutritionInput };\n`);
const { sanitizeNutritionValue, isValidNutritionInput } = await import(`file://${modulePath}`);

const results = [];
function check(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} — 기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`);
}

/* 값 정규화 */
check('음수 탄수화물 → 0', sanitizeNutritionValue(-10, 'carb'), 0);
check('음수 kcal → 0', sanitizeNutritionValue(-1, 'kcal'), 0);
check('NaN → 0', sanitizeNutritionValue('abc', 'kcal'), 0);
/* Infinity는 상한으로 바꾸지 않고 0으로 버린다. 그럴듯한 큰 수로 둔갑하면 합계가 조용히 오염된다. */
check('Infinity → 0 (값으로 인정하지 않음)', sanitizeNutritionValue(Infinity, 'kcal'), 0);
check('-Infinity → 0', sanitizeNutritionValue(-Infinity, 'kcal'), 0);
check('과대 kcal → 상한', sanitizeNutritionValue(999999, 'kcal'), 20000);
check('과대 단백질 → 상한', sanitizeNutritionValue(999999, 'protein'), 3000);
check('정상값 유지', sanitizeNutritionValue(120, 'kcal'), 120);
check('소수점 반올림', sanitizeNutritionValue(23.6, 'protein'), 24);
check('빈 값 → 0', sanitizeNutritionValue('', 'fat'), 0);
check('null → 0', sanitizeNutritionValue(null, 'fat'), 0);

/* 입력 검증(저장 버튼 활성화 조건) */
check('음수 입력은 무효', isValidNutritionInput({ kcal: 100, carb: -10, protein: 24, fat: 2 }), false);
check('NaN 입력은 무효', isValidNutritionInput({ kcal: 100, carb: 'x', protein: 1, fat: 1 }), false);
check('과대 입력은 무효', isValidNutritionInput({ kcal: 999999, carb: 1, protein: 1, fat: 1 }), false);
check('정상 입력은 유효', isValidNutritionInput({ kcal: 120, carb: 3, protein: 24, fat: 2 }), true);
check('빈 칸은 허용(0으로 저장)', isValidNutritionInput({ kcal: 120, carb: '', protein: '', fat: '' }), true);

fs.unlinkSync(modulePath);
const failed = results.filter(r => !r).length;
console.log(`\nnutrition guard regression: ${failed === 0 ? 'PASS' : 'FAIL'} (${results.length - failed}/${results.length})`);
process.exit(failed === 0 ? 0 : 1);
