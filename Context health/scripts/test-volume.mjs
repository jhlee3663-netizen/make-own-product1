/* QA-11 검증: 세트 배수·좌우 배수가 맨몸/보조/가중/일반 경로에서 일관되게 반영되는지.
   AI가 정리한 "• 세트 N: ..." 표기를 세트 배수로 오인하지 않는지도 함께 확인한다. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

/* utils.js는 확장자 없는 import를 쓰므로 기존 isolated-probes와 같은 방식으로 번들해서 불러온다. */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = path.join(os.tmpdir(), 'context-health-volume-test.mjs');
execFileSync(
  path.join(root, 'node_modules/.bin/esbuild'),
  [path.join(root, 'src/utils/utils.js'), '--bundle', '--platform=node', '--format=esm', `--outfile=${bundle}`],
  { stdio: 'pipe' },
);
const { parseVolume, parseVolumeFromBody, sumReps } = await import(`file://${bundle}?t=${Date.now()}`);

const results = [];
function check(name, actual, expected) {
  const pass = actual === expected;
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} — 기대 ${expected}, 실제 ${actual}`);
}

const item = (title, body) => [{ part: '테스트', items: [{ title, body }] }];
const BW = 70;

/* 1. QA-11 원문 사례: 맨몸 풀업 10회 3세트, 체중 70kg */
check('맨몸 풀업 10회 3세트', parseVolume(item('풀업', '10회 3세트'), BW), 2100);

/* 2. 같은 의미의 다른 표기들이 같은 값을 낸다 */
check('맨몸 풀업 10회 x3', parseVolume(item('풀업', '10회 x3'), BW), 2100);
check('맨몸 풀업 개별 세트 3줄', parseVolume(item('풀업', '10회\n10회\n10회'), BW), 2100);

/* 3. 세트 표기가 없으면 그대로 */
check('맨몸 풀업 10회', parseVolume(item('풀업', '10회'), BW), 700);

/* 4. 보조(어시스티드): 체중에서 보조 무게를 뺀 값에 세트 배수 */
check('어시스티드 풀업 20kg 10회 3세트',
  parseVolume(item('어시스티드 풀업', '20kg 10회 3세트'), BW), (70 - 20) * 10 * 3);

/* 5. 가중: 체중 + 추가 무게에 세트 배수 */
check('가중 풀업 10kg 10회 3세트',
  parseVolume(item('가중 풀업', '10kg 10회 3세트'), BW), (70 + 10) * 10 * 3);

/* 6. 일반 웨이트: 기존 동작 유지 */
check('벤치프레스 60kg 10회 3세트', parseVolume(item('벤치프레스', '60kg 10회 3세트'), 0), 1800);
check('벤치프레스 60kg 10회', parseVolume(item('벤치프레스', '60kg 10회'), 0), 600);

/* 7. AI 정리 표기의 "세트 N:"을 배수로 오인하지 않는다 */
check('AI 정리 표기 3줄',
  parseVolume(item('벤치프레스', '• 세트 1: 60kg 10회\n• 세트 2: 60kg 10회\n• 세트 3: 60kg 10회'), 0), 1800);

/* 8. 좌우(양쪽) 표기 */
check('양쪽 덤벨 10kg 12회', parseVolume(item('덤벨 킥백', '양쪽 10kg 12회'), 0), 240);
check('양쪽 + 세트 배수', parseVolume(item('덤벨 킥백', '양쪽 10kg 12회 3세트'), 0), 720);

/* 9. sumReps도 세트 배수를 반영 */
check('sumReps 10회 3세트', sumReps('10회 3세트'), 30);
check('sumReps 10회 x3', sumReps('10회 x3'), 30);
check('sumReps x12 (횟수 표기)', sumReps('x12'), 12);
check('sumReps 여러 줄', sumReps('10회\n8회'), 18);
check('sumReps AI 정리 표기', sumReps('• 세트 1: 10회\n• 세트 2: 8회'), 18);

/* 10. 종목별 볼륨(저번대비 칩)이 총 볼륨과 같은 규칙을 쓴다 */
check('parseVolumeFromBody 60kg 10회 3세트', parseVolumeFromBody('60kg 10회 3세트'), 1800);
check('parseVolumeFromBody 60kg 10회 x3', parseVolumeFromBody('60kg 10회 x3'), 1800);
check('parseVolumeFromBody 양쪽', parseVolumeFromBody('양쪽 10kg 12회'), 240);
assert.equal(
  parseVolumeFromBody('60kg 10회 3세트'),
  parseVolume(item('벤치프레스', '60kg 10회 3세트'), 0),
  'parseVolumeFromBody와 parseVolume이 같은 입력에서 달라지면 안 된다',
);
console.log('PASS parseVolumeFromBody와 parseVolume 일치');
results.push(true);

const failed = results.filter(r => !r).length;
console.log(`\nvolume regression: ${failed === 0 ? 'PASS' : 'FAIL'} (${results.length - failed}/${results.length})`);
process.exit(failed === 0 ? 0 : 1);
