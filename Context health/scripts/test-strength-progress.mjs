/* 탑세트 추정 1RM·유효 세트·과부하 판정 검증 (src/lib/strengthProgress.js) */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { parseSets, parseRepSets, bodyweightEffectiveSets, analyzeExercise, compareWithPrevious, gradeSession, buildStrengthMessage } = await import(path.join(root, 'src/lib/strengthProgress.js'));

const results = [];
function check(name, fn) {
  try { fn(); results.push(true); console.log(`PASS ${name}`); } catch (e) { results.push(false); console.log(`FAIL ${name} — ${e.message}`); }
}
const log = (items, part = '가슴') => ({ sections: [{ part, items: items.map(([title, body]) => ({ title, body })) }] });

check('AI 정리 표기 "• 세트 N:"는 세트 배수가 아니다', () => {
  assert.equal(parseSets('• 세트 1: 60kg 10회\n• 세트 2: 80kg 8회').length, 2);
});
check('"10회 3세트"는 세트 3개', () => {
  assert.equal(parseSets('60kg 10회 3세트').length, 3);
});
check('"60kg 10회, 3세트"처럼 떨어져 있어도 3개', () => {
  assert.equal(parseSets('60kg 10회, 3세트').length, 3);
});
check('x 표기 "80kg x8"', () => {
  assert.deepEqual(parseSets('80kg x8').map(s => s.reps), [8]);
});

check('탑세트는 추정 1RM이 가장 높은 세트', () => {
  const r = analyzeExercise('벤치프레스', '60kg 10회\n80kg 6회\n85kg 3회');
  assert.equal(r.top.weight, 80);
  assert.equal(r.top.reps, 6);
});
check('16회 이상은 탑세트 후보에서 뺀다', () => {
  const r = analyzeExercise('레그 익스텐션', '40kg 20회\n50kg 12회');
  assert.equal(r.top.weight, 50);
});
check('유효 세트: 워밍업(60% 미만)과 목표보다 2회 이상 적은 세트 제외', () => {
  // 탑세트 100kg×8 → 목표 8회. 40kg(워밍업), 100kg 6회(−2) 제외 → 100×8, 100×7, 90×8 = 3
  const r = analyzeExercise('스쿼트', '40kg 10회\n100kg 8회\n100kg 7회\n100kg 6회\n90kg 8회');
  assert.equal(r.effectiveSets, 3);
});
check('"웜업" 표시 줄은 무게와 상관없이 워밍업', () => {
  const r = analyzeExercise('데드리프트', '웜업 100kg 5회\n120kg 5회');
  assert.equal(r.effectiveSets, 1);
});
check('맨몸·무게 없는 종목은 분석하지 않는다', () => {
  assert.equal(analyzeExercise('풀업', '10회 3세트'), null);
  assert.equal(analyzeExercise('어시스티드 풀업', '20kg 10회'), null);
});

const prev = log([['벤치프레스', '80kg 6회'], ['인클라인 덤벨프레스', '24kg 10회']]);
check('직전 같은 종목 대비 상승/하락/유지 판정', () => {
  const r = compareWithPrevious(log([['벤치프레스', '82.5kg 6회'], ['인클라인 덤벨프레스', '24kg 10회']]).sections, [prev]);
  assert.equal(r.up, 1);
  assert.equal(r.same, 1);
  assert.equal(gradeSession(r), 'success');
});
check('±1% 안은 유지', () => {
  // 80×6 = 96.0, 81×5 = 94.5 → −1.6% 하락 / 80×6 → 유지
  const r = compareWithPrevious(log([['벤치프레스', '80kg 6회']]).sections, [prev]);
  assert.equal(r.same, 1);
});
check('떨어진 종목이 더 많으면 아쉬움', () => {
  const r = compareWithPrevious(log([['벤치프레스', '70kg 6회'], ['인클라인 덤벨프레스', '20kg 10회']]).sections, [prev]);
  assert.equal(r.down, 2);
  assert.equal(gradeSession(r), 'meh');
  assert.equal(gradeSession(r, { deload: true }), 'success');
});
check('총 볼륨이 줄어도 1RM이 오르면 성공 (세트 수가 줄어든 날)', () => {
  const before = log([['스쿼트', '100kg 5회\n100kg 5회\n100kg 5회\n100kg 5회']]);
  const r = compareWithPrevious(log([['스쿼트', '105kg 5회']]).sections, [before]);
  assert.equal(gradeSession(r), 'success');
});
check('처음 하는 종목뿐이면 성공 + "첫 기록" 문구', () => {
  const r = compareWithPrevious(log([['스쿼트', '100kg 5회']]).sections, [prev]);
  assert.equal(gradeSession(r), 'success');
  assert.match(buildStrengthMessage(r), /^첫 기록 · 스쿼트 100kg×5 · 유효 1세트$/);
});
check('요약 문구: 가장 많이 오른 종목 + 갱신 수 + 유효 세트', () => {
  const r = compareWithPrevious(log([['벤치프레스', '82.5kg 6회'], ['인클라인 덤벨프레스', '24kg 10회']]).sections, [prev]);
  assert.equal(buildStrengthMessage(r), '벤치프레스 1RM 99kg (+3) · 갱신 1 · 유효 2세트');
});
check('직전 세션에 없던 종목은 더 예전 기록과 비교한다', () => {
  const older = log([['스쿼트', '100kg 5회']], '하체');
  const r = compareWithPrevious(log([['스쿼트', '102.5kg 5회']], '하체').sections, [prev, older]);
  assert.equal(r.up, 1);
});

check('맨몸 "5회씩 5세트"는 세트 5개', () => {
  assert.equal(parseRepSets('5회씩 5세트').length, 5);
  assert.equal(bodyweightEffectiveSets('풀업', '5회씩 5세트'), 5);
});
check('맨몸: 최고 횟수보다 2회 이상 적은 세트·웜업은 빼고 센다', () => {
  assert.equal(bodyweightEffectiveSets('딥스', '• 세트 1: 5회 (웜업)\n• 세트 2: 12회\n• 세트 3: 11회\n• 세트 4: 8회'), 2);
});
check('가중 풀업(무게 있음)은 맨몸으로 두 번 세지 않는다', () => {
  assert.equal(bodyweightEffectiveSets('가중 풀업', '10kg 8회 3세트'), 0);
});
check('맨몸이 아닌 종목은 횟수만 있어도 세지 않는다', () => {
  assert.equal(bodyweightEffectiveSets('벤치프레스', '10회 3세트'), 0);
});
check('슈퍼세트 풀업+딥스가 나뉘면 유효 세트에 더해진다 (데드 4 + OHP 4 + 풀업 5 + 딥스 5)', () => {
  const sets = n => Array.from({ length: n }, (_, i) => `• 세트 ${i + 1}: 5회 (슈퍼세트)`).join('\n');
  const sections = [
    { part: '등', items: [{ title: '데드리프트', body: '100kg 4회 4세트' }] },
    { part: '어깨', items: [{ title: 'OHP', body: '40kg 4회 4세트' }, { title: '풀업', body: sets(5), supersetGroup: 1 }, { title: '딥스', body: sets(5), supersetGroup: 1 }] },
  ];
  const r = compareWithPrevious(sections, []);
  assert.equal(r.effectiveSets, 18);
  assert.equal(r.exercises.length, 2);
});

const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);
