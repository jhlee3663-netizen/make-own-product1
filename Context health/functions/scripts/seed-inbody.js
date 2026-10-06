/* 인바디 과거 기록 일회성 이관.
   users/{uid}/bodyLogs/inbody_{date}_{device} 로 넣는다. 같은 날짜·기기는 덮어쓴다(재실행 안전).

   사용법 (functions 디렉터리에서):
     node scripts/seed-inbody.js --uid <uid> --file scripts/inbody-seed.json            # 검증만 (기본)
     node scripts/seed-inbody.js --uid <uid> --file scripts/inbody-seed.json --apply    # 실제 기록

   운영 DB에 쓰려면 관리자 인증이 필요하다: gcloud auth application-default login
   에뮬레이터에 쓰려면 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 과 --project demo-context-health 를 준다.
   입력 형식은 scripts/inbody-seed.example.json 참고. */
const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { INBODY_FIELDS } = require('../mcp/tools');
const { isDateKey } = require('../mcp/parse');

const DEVICES = ['270', '770'];
const CONDITIONS = ['fasted', 'evening'];
const META_KEYS = ['date', 'dateApprox', 'device', 'condition', 'measuredTime', 'note'];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function validate(entry, index) {
  const errors = [];
  const where = `#${index + 1}${entry?.date ? ` (${entry.date})` : ''}`;
  if (!entry || typeof entry !== 'object') return { errors: [`${where}: 객체가 아님`] };
  if (!isDateKey(entry.date)) errors.push(`${where}: date는 YYYY-MM-DD`);
  const device = String(entry.device ?? '');
  if (!DEVICES.includes(device)) errors.push(`${where}: device는 270 또는 770`);
  if (!CONDITIONS.includes(entry.condition)) errors.push(`${where}: condition은 fasted(공복) 또는 evening(저녁)`);
  if (entry.measuredTime != null && !/^\d{2}:\d{2}$/.test(entry.measuredTime)) errors.push(`${where}: measuredTime은 HH:MM`);

  const doc = { kind: 'inbody', date: entry.date, device, condition: entry.condition };
  if (entry.dateApprox) doc.dateApprox = true;
  if (entry.measuredTime) doc.measuredTime = entry.measuredTime;
  if (entry.note) doc.note = String(entry.note).slice(0, 500);

  let metricCount = 0;
  Object.keys(entry).forEach((key) => {
    if (META_KEYS.includes(key)) return;
    if (!(key in INBODY_FIELDS)) { errors.push(`${where}: 알 수 없는 필드 "${key}" (허용: ${Object.keys(INBODY_FIELDS).join(', ')})`); return; }
    if (entry[key] == null) return;
    if (typeof entry[key] !== 'number' || !Number.isFinite(entry[key]) || entry[key] < 0) { errors.push(`${where}: ${key}는 0 이상의 숫자`); return; }
    doc[key] = entry[key];
    metricCount += 1;
  });
  if (metricCount === 0) errors.push(`${where}: 측정값이 하나도 없음`);
  return { errors, id: `inbody_${entry.date}_${device}`, doc };
}

async function main() {
  const uid = arg('uid');
  const file = arg('file');
  const apply = process.argv.includes('--apply');
  if (!uid || !file) {
    console.error('사용법: node scripts/seed-inbody.js --uid <uid> --file <json> [--apply] [--project <id>]');
    process.exit(1);
  }

  const entries = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('JSON 배열이 비어 있습니다.');

  const results = entries.map(validate);
  const errors = results.flatMap(r => r.errors);
  const ids = results.map(r => r.id).filter(Boolean);
  ids.filter((id, i) => ids.indexOf(id) !== i).forEach(id => errors.push(`중복: ${id} (같은 날짜·기기가 두 번 있음)`));
  if (errors.length) {
    errors.forEach(e => console.error(`오류 ${e}`));
    process.exit(1);
  }

  results.forEach(r => console.log(`${apply ? '기록' : '검증'} users/${uid}/bodyLogs/${r.id}`, JSON.stringify(r.doc)));
  if (!apply) {
    console.log(`\n${results.length}건 검증 통과. 실제로 기록하려면 --apply 를 붙여 다시 실행하세요.`);
    return;
  }

  initializeApp({ projectId: arg('project') || process.env.GCLOUD_PROJECT || 'context-health-3eb84' });
  const db = getFirestore();
  const batch = db.batch();
  results.forEach(r => batch.set(db.doc(`users/${uid}/bodyLogs/${r.id}`), { ...r.doc, seededAt: FieldValue.serverTimestamp() }));
  await batch.commit();
  console.log(`\n${results.length}건 기록 완료.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
