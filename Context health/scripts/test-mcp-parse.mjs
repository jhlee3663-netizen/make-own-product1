/* MCP 조회 서버의 순수 로직 검증: 세트 파싱(원문 보존), 추정 1RM, 날짜(KST) 처리,
   그리고 도구 구현에 쓰기 호출이 없다는 읽기 전용 보장. 에뮬레이터 없이 실행된다. */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const {
  parseSetLine, parseExercise, estimate1rm, resolveRange, weekStart, kstDateKey, kstDayStartMs, normalizeName,
} = require('../functions/mcp/parse.js');

const results = [];
function check(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${pass ? '' : ` — 기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`}`);
}
function throws(name, fn) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  results.push(threw);
  console.log(`${threw ? 'PASS' : 'FAIL'} ${name}`);
}

/* 1. AI 정리 표기: 세트 번호는 배수가 아니다 */
{
  const r = parseSetLine('• 세트 3: 60kg 10회');
  check('AI 표기 raw 보존', r.raw, '• 세트 3: 60kg 10회');
  check('AI 표기 set_no', r.set_no, 3);
  check('AI 표기 parsed', r.parsed, [{ weight_kg: 60, reps: 10, set_count: 1 }]);
}

/* 2. 세트 배수 표기 */
check('60kg 10회 3세트', parseSetLine('60kg 10회 3세트').parsed, [{ weight_kg: 60, reps: 10, set_count: 3 }]);
check('60kg 3세트 10회', parseSetLine('60kg 3세트 10회').parsed, [{ weight_kg: 60, reps: 10, set_count: 3 }]);
check('60kg 10회 x3', parseSetLine('60kg 10회 x3').parsed, [{ weight_kg: 60, reps: 10, set_count: 3 }]);
check('60kg x 10', parseSetLine('60kg x 10').parsed, [{ weight_kg: 60, reps: 10, set_count: 1 }]);
check('소수 무게', parseSetLine('62.5kg 8회').parsed, [{ weight_kg: 62.5, reps: 8, set_count: 1 }]);

/* 3. 괄호 표기는 숫자로 읽지 않고 notes/flags로만 남긴다 */
{
  const r = parseSetLine('• 세트 4: 70kg 6회 (보조4회)');
  check('(보조4회) 횟수는 6', r.parsed, [{ weight_kg: 70, reps: 6, set_count: 1 }]);
  check('(보조4회) notes', r.notes, ['보조4회']);
  check('(보조4회) flags', r.flags, ['assisted_reps']);
  check('(보조4회) assisted_reps', r.assisted_reps, 4);
}
{
  const r = parseSetLine('60kg 8회 (드랍)');
  check('(드랍) flags', r.flags, ['drop']);
  check('(드랍) parsed', r.parsed, [{ weight_kg: 60, reps: 8, set_count: 1 }]);
}
check('한 줄 드랍 두 구간', parseSetLine('60kg 8회 → 40kg 6회 (드랍)').parsed,
  [{ weight_kg: 60, reps: 8, set_count: 1 }, { weight_kg: 40, reps: 6, set_count: 1 }]);

/* 4. 읽지 못하는 줄은 추측하지 않는다 */
check('단위 없는 60 x 10은 parsed null', parseSetLine('60 x 10').parsed, null);
check('코멘트 줄은 parsed null', parseSetLine('어깨가 좀 뻐근했음').parsed, null);
check('코멘트 줄 raw 보존', parseSetLine('어깨가 좀 뻐근했음').raw, '어깨가 좀 뻐근했음');
check('빈 줄은 건너뜀', parseSetLine('   '), null);

/* 5. 맨몸·단위·좌우 */
check('맨몸 10회 3세트', parseSetLine('10회 3세트').parsed, [{ weight_kg: null, reps: 10, set_count: 3 }]);
check('파운드 환산', parseSetLine('100lbs 10회').parsed, [{ weight_kg: 45.36, reps: 10, set_count: 1, written_as: '100lbs' }]);
check('칸 환산', parseSetLine('8칸 12회').parsed, [{ weight_kg: 40, reps: 12, set_count: 1, written_as: '8칸' }]);
check('양쪽 표기', parseSetLine('양쪽 12kg 15회').per_side, true);
check('유산소 시간', parseSetLine('런닝 1시간 30분').duration_min, 90);

/* 6. 추정 1RM (Epley) */
check('e1RM 60kg×10', estimate1rm(60, 10), 80);
check('e1RM 1회는 그대로', estimate1rm(100, 1), 100);
check('e1RM 15회 초과는 null', estimate1rm(40, 20), null);

/* 7. 종목 집계: 드랍·보조 세트는 best 1RM에서 제외하되 원문과 세트별 값은 남긴다 */
{
  const ex = parseExercise({ title: '벤치프레스 프리', body: '• 세트 1: 60kg 10회\n• 세트 2: 70kg 5회\n• 세트 3: 80kg 8회 (보조4회)\n• 세트 4: 50kg 12회 (드랍)\n오늘 컨디션 좋음' }, '가슴');
  check('종목명 원문 유지', ex.name, '벤치프레스 프리');
  check('모든 줄 보존', ex.sets.length, 5);
  check('볼륨', ex.parsed_volume_kg, 60 * 10 + 70 * 5 + 80 * 8 + 50 * 12);
  check('세트 수', ex.set_count, 4);
  check('최고 무게', ex.top_weight_kg, 80);
  check('best e1RM은 보조·드랍 제외', ex.best_est_1rm_kg, estimate1rm(70, 5));
  check('보조 세트에도 세트별 e1RM은 제공', ex.sets[2].parsed[0].est_1rm_kg, estimate1rm(80, 8));
}
{
  const ex = parseExercise({ title: '어시스티드 풀업', body: '20kg 10회 3세트' }, '등');
  check('어시스티드는 보조 무게라 볼륨 null', ex.parsed_volume_kg, null);
  check('어시스티드 표시', ex.weight_is_assistance, true);
  check('어시스티드 e1RM 없음', ex.best_est_1rm_kg, null);
}
{
  const ex = parseExercise({ title: '덤벨 컬', body: '양쪽 12kg 10회' }, '이두');
  check('양쪽은 볼륨 2배', ex.parsed_volume_kg, 240);
}

/* 8. 날짜 (KST) */
check('KST 자정 직전은 전날이 아님', kstDateKey(Date.parse('2026-09-30T15:30:00Z')), '2026-10-01');
check('KST 하루 시작', new Date(kstDayStartMs('2026-10-01')).toISOString(), '2026-09-30T15:00:00.000Z');
check('주 시작(월) — 목요일', weekStart('2026-10-01'), '2026-09-28');
check('주 시작(월) — 일요일', weekStart('2026-10-04'), '2026-09-28');
check('기본 기간', resolveRange({}, { defaultDays: 7, maxDays: 400, now: Date.parse('2026-10-02T03:00:00Z') }), { from: '2026-09-26', to: '2026-10-02', days: 7 });
throws('잘못된 날짜 형식 거절', () => resolveRange({ from: '2026/04/01' }, { defaultDays: 7, maxDays: 400 }));
throws('없는 날짜 거절', () => resolveRange({ from: '2026-02-30', to: '2026-03-01' }, { defaultDays: 7, maxDays: 400 }));
throws('역순 기간 거절', () => resolveRange({ from: '2026-05-01', to: '2026-04-01' }, { defaultDays: 7, maxDays: 400 }));
throws('최대 기간 초과 거절', () => resolveRange({ from: '2024-01-01', to: '2026-04-01' }, { defaultDays: 7, maxDays: 400 }));
check('종목명 비교용 정규화', normalizeName(' 벤치 프레스 '), '벤치프레스');

/* 9. 읽기 전용 보장: 도구 구현에는 Firestore 쓰기 호출이 없어야 한다 */
{
  const source = readFileSync(new URL('../functions/mcp/tools.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const writeCalls = source.match(/\.(set|update|delete|add|create|batch|runTransaction|bulkWriter|recursiveDelete)\s*\(/g) || [];
  check('tools.js에 Firestore 쓰기 호출 없음', writeCalls.filter(c => !/^\.(set|delete|add)\s*\($/.test(c)), []);
  /* Map/Set의 .set/.add/.delete는 로컬 자료구조용이다. Firestore 참조(.doc/.collection) 뒤에 붙은 쓰기만 따로 확인한다. */
  const refWrites = source.match(/\.(doc|collection)\([^)]*\)\s*\.(set|update|delete|add|create)\s*\(/g) || [];
  check('tools.js에 문서/컬렉션 참조 쓰기 없음', refWrites, []);
  check('tools.js가 문서 참조(.ref)를 꺼내 쓰지 않음', /\.ref\b/.test(source), false);
  /* 도구에 넘기는 db 창구는 get 계열만 노출한다 */
  const { readOnlyDb } = require('../functions/mcp/readonly.js');
  const calls = [];
  const fakeQuery = { where: () => fakeQuery, orderBy: () => fakeQuery, limit: () => fakeQuery, get: () => 'q', add: () => calls.push('add') };
  const fakeDb = {
    collection: () => fakeQuery,
    doc: () => ({ get: () => 'd', set: () => calls.push('set'), update: () => calls.push('update'), delete: () => calls.push('delete') }),
    batch: () => calls.push('batch'),
    runTransaction: () => calls.push('tx'),
  };
  const ro = readOnlyDb(fakeDb);
  check('읽기 창구 db 메서드', Object.keys(ro).sort(), ['collection', 'doc']);
  check('읽기 창구 doc 메서드', Object.keys(ro.doc('a/b')), ['get']);
  check('읽기 창구 query 메서드', Object.keys(ro.collection('a').where('x', '==', 1).orderBy('x').limit(1)).sort(), ['get', 'limit', 'orderBy', 'where']);
  check('읽기 창구 조회는 통과', [ro.doc('a/b').get(), ro.collection('a').get()], ['d', 'q']);
  const { TOOLS } = require('../functions/mcp/tools.js');
  check('도구는 전부 조회용 이름', TOOLS.every(t => /^(get|list)_/.test(t.name)), true);
  check('도구는 전부 readOnlyHint', TOOLS.every(t => t.annotations?.readOnlyHint === true), true);
}

/* 10. uid 허용 목록: 비어 있으면 아무도 통과하지 못한다 */
{
  const { isAllowedUid } = require('../functions/mcp/oauth.js');
  delete process.env.MCP_ALLOWED_UIDS;
  check('허용 목록 미설정 → 전부 거절', [isAllowedUid('anyone'), isAllowedUid('')], [false, false]);
  process.env.MCP_ALLOWED_UIDS = ' uid-a , uid-b ';
  check('허용 목록 일치만 통과', [isAllowedUid('uid-a'), isAllowedUid('uid-b'), isAllowedUid('uid-c'), isAllowedUid('uid'), isAllowedUid(undefined)], [true, true, false, false, false]);
}

const failed = results.filter(pass => !pass).length;
console.log(`\n${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);
