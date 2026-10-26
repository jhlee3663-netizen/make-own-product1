/* MCP 쓰기 도구. 조회 도구(tools.js)는 계속 읽기 전용 창구만 받고, 기록을 바꾸는 일은 전부 이 파일에서만 한다.
   - uid는 항상 검증된 토큰에서 오며 도구 인자로 받지 않는다.
   - 다른 사람의 기록을 건드리지 않도록, 문서를 고치기 전에 반드시 소유자를 확인한다.
   - 삭제는 앱의 휴지통과 같은 방식(deletedAt)이라 30일 안에 앱에서 되살릴 수 있다.
   - 이 도구로 쓴 기록에는 via: 'mcp'를 남겨 어디서 들어온 기록인지 알 수 있게 한다. */
const crypto = require('crypto');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { ToolInputError, addDays, kstDateKey, kstDayStartMs, parseExercise, round } = require('./parse');
const { contributeFood } = require('../foods');

const DATE_PROP = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ITEMS = 40;
const MAX_TEXT = 200;
const MAX_BODY = 2000;

const MEALS = {
  breakfast: '아침', am_snack: '오전간식', lunch: '점심', pm_snack: '오후간식', dinner: '저녁', night_snack: '야식',
};
const MEAL_ORDER = Object.keys(MEALS);

const FOOD_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: '음식 이름. 사용자가 부르는 이름 그대로 (예: "미트리 저당 홀그레인")' },
    kcal: { type: 'number', description: '먹은 양 전체의 열량(kcal)' },
    carb_g: { type: 'number', description: '탄수화물(g)' },
    protein_g: { type: 'number', description: '단백질(g)' },
    fat_g: { type: 'number', description: '지방(g)' },
    amount: { type: 'string', description: '먹은 양을 사람이 읽는 말로 (예: "1팩", "200g"). 선택' },
  },
  required: ['name', 'kcal'],
};

const WRITE_TOOLS = [
  {
    name: 'add_diet_items',
    description: '식단 기록에 음식을 추가한다. 그 날짜·끼니에 이미 있는 음식은 그대로 두고 뒤에 붙인다. '
      + '영양 수치는 먹은 양 전체 기준으로 넣어라(100g당 값이 아니다). 성분을 모르면 먼저 찾아본 뒤 넣고, 추정값이면 사용자에게 추정이라고 알려라.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { ...DATE_PROP, description: '날짜(KST). 생략 시 오늘' },
        meal: { type: 'string', enum: MEAL_ORDER, description: 'breakfast=아침, am_snack=오전간식, lunch=점심, pm_snack=오후간식, dinner=저녁, night_snack=야식' },
        items: { type: 'array', minItems: 1, maxItems: MAX_ITEMS, items: FOOD_ITEM_SCHEMA },
      },
      required: ['meal', 'items'],
    },
  },
  {
    name: 'replace_diet_meal',
    description: '한 끼니의 음식 목록을 통째로 바꾼다. 수정하거나 일부를 뺄 때 쓴다: get_diet로 지금 목록을 읽고, 고친 전체 목록을 넘겨라. '
      + 'items를 빈 배열로 주면 그 끼니가 비워진다.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { ...DATE_PROP, description: '날짜(KST). 생략 시 오늘' },
        meal: { type: 'string', enum: MEAL_ORDER },
        items: { type: 'array', maxItems: MAX_ITEMS, items: FOOD_ITEM_SCHEMA },
      },
      required: ['meal', 'items'],
    },
  },
  {
    name: 'add_workout',
    description: '운동 기록을 새로 만든다. 세트는 종목마다 body에 한 줄씩 "• 세트 1: 60kg 10회" 형식으로 적어라(유산소는 "• 30분"). '
      + '종목명은 사용자가 평소 쓰는 표기를 list_exercises로 확인해 맞춰라. 볼륨은 서버가 계산한다.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { ...DATE_PROP, description: '날짜(KST). 생략 시 오늘' },
        title: { type: 'string', description: '기록 제목. 보통 부위를 쉼표로 (예: "가슴, 삼두"). 생략 시 부위에서 만든다' },
        sections: {
          type: 'array', minItems: 1, maxItems: 10,
          items: {
            type: 'object',
            properties: {
              part: { type: 'string', description: '부위 (가슴, 등, 하체, 어깨, 이두, 삼두, 코어, 전신, 유산소)' },
              exercises: {
                type: 'array', minItems: 1, maxItems: 20,
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: '종목명' },
                    body: { type: 'string', description: '세트 기록. 줄마다 "• 세트 N: 무게kg 횟수회"' },
                    note: { type: 'string', description: '사용자가 남긴 느낌·메모. 선택' },
                  },
                  required: ['name'],
                },
              },
            },
            required: ['part', 'exercises'],
          },
        },
        cardio_minutes: { type: 'number', description: '유산소 총 시간(분). 선택' },
      },
      required: ['sections'],
    },
  },
  {
    name: 'replace_workout',
    description: '이미 있는 운동 기록의 내용을 통째로 바꾼다. get_workouts가 주는 log_id로 고를 것. 날짜는 바뀌지 않는다.',
    inputSchema: {
      type: 'object',
      properties: {
        log_id: { type: 'string' },
        title: { type: 'string' },
        sections: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'object' }, description: 'add_workout의 sections와 같은 형식' },
        cardio_minutes: { type: 'number' },
      },
      required: ['log_id', 'sections'],
    },
  },
  {
    name: 'delete_log',
    description: '운동 또는 식단 기록 하나를 휴지통으로 보낸다(앱의 마이페이지 휴지통에서 30일 안에 되살릴 수 있다). '
      + '사용자가 분명히 지워달라고 했을 때만 쓰고, 지우기 전에 어떤 기록인지 말해 확인받아라.',
    inputSchema: {
      type: 'object',
      properties: { log_id: { type: 'string', description: 'get_workouts / get_diet가 주는 log_id' } },
      required: ['log_id'],
    },
  },
  {
    name: 'set_morning_weight',
    description: '아침 공복 체중을 기록한다(하루 한 건, 같은 날짜에 다시 쓰면 덮어쓴다). weight_kg를 null로 주면 그 날짜 기록을 지운다.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { ...DATE_PROP, description: '날짜(KST). 생략 시 오늘' },
        weight_kg: { type: ['number', 'null'], minimum: 20, maximum: 300 },
      },
      required: ['weight_kg'],
    },
  },
  {
    name: 'update_profile',
    description: '프로필과 목표를 고친다. 넘긴 항목만 바뀐다. 목표 칼로리를 바꾸면 홈의 섭취 칼로리 기준이 같이 바뀐다.',
    inputSchema: {
      type: 'object',
      properties: {
        target_kcal: { type: 'number', minimum: 800, maximum: 6000, description: '일일 목표 칼로리' },
        goal_weight_kg: { type: 'number', minimum: 20, maximum: 300, description: '목표 체중' },
        profile_weight_kg: { type: 'number', minimum: 20, maximum: 300, description: '프로필의 현재 체중' },
        height_cm: { type: 'number', minimum: 100, maximum: 250 },
        age: { type: 'number', minimum: 10, maximum: 100 },
      },
    },
  },
];

/* ── 공통 ── */

function todayKey() { return kstDateKey(Date.now()); }

function resolveDate(value) {
  if (value == null || value === '') return todayKey();
  if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new ToolInputError('date는 YYYY-MM-DD 형식이어야 합니다.');
  }
  if (value > todayKey()) throw new ToolInputError('아직 오지 않은 날짜에는 기록할 수 없습니다.');
  return value;
}

/* 오늘 기록은 지금 시각으로, 지난 날짜 기록은 그날 낮 12시(KST)로 남긴다. */
function timestampFor(dateKey) {
  return dateKey === todayKey() ? Timestamp.now() : Timestamp.fromMillis(kstDayStartMs(dateKey) + 12 * 3600 * 1000);
}

function text(value, max = MAX_TEXT) { return String(value == null ? '' : value).trim().slice(0, max); }

function amount(value, label, { max = 100000 } = {}) {
  if (value == null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new ToolInputError(`${label} 값이 올바르지 않습니다.`);
  return Math.round(n * 10) / 10;
}

const newId = () => crypto.randomBytes(6).toString('hex');

async function ownedLog(db, uid, logId) {
  if (typeof logId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(logId)) throw new ToolInputError('log_id가 올바르지 않습니다.');
  const ref = db.collection('logs').doc(logId);
  const snap = await ref.get();
  if (!snap.exists || snap.data().uid !== uid || snap.data().deletedAt) throw new ToolInputError('그 log_id의 기록을 찾을 수 없습니다.');
  return { ref, data: snap.data() };
}

/* ── 식단 ── */

function toFoodItem(raw) {
  const name = text(raw?.name);
  if (!name) throw new ToolInputError('음식 이름이 비어 있습니다.');
  const item = {
    id: newId(),
    name,
    kcal: amount(raw.kcal, `${name}의 kcal`, { max: 20000 }),
    carb: amount(raw.carb_g, `${name}의 탄수화물`, { max: 5000 }),
    protein: amount(raw.protein_g, `${name}의 단백질`, { max: 5000 }),
    fat: amount(raw.fat_g, `${name}의 지방`, { max: 5000 }),
    source: 'mcp',
  };
  const note = text(raw.amount, 40);
  if (note) item.adjustmentNote = note;
  return item;
}

function dietTotals(sections) {
  const total = { kcal: 0, carb: 0, protein: 0, fat: 0 };
  sections.forEach(section => (section.items || []).forEach((item) => {
    total.kcal += Number(item.kcal || 0); total.carb += Number(item.carb || 0);
    total.protein += Number(item.protein || 0); total.fat += Number(item.fat || 0);
  }));
  return { kcal: Math.round(total.kcal), carb: round(total.carb), protein: round(total.protein), fat: round(total.fat) };
}

async function findDietLog(db, uid, dateKey) {
  const snap = await db.collection('logs')
    .where('uid', '==', uid)
    .where('timestamp', '>=', Timestamp.fromMillis(kstDayStartMs(dateKey)))
    .where('timestamp', '<', Timestamp.fromMillis(kstDayStartMs(addDays(dateKey, 1))))
    .orderBy('timestamp', 'desc')
    .limit(50)
    .get();
  const doc = snap.docs.find(d => d.data().type === 'diet' && !d.data().deletedAt);
  return doc ? { ref: doc.ref, data: doc.data() } : null;
}

async function writeDietMeal(db, uid, args, mode) {
  const dateKey = resolveDate(args.date);
  if (!MEALS[args.meal]) throw new ToolInputError(`meal은 ${MEAL_ORDER.join(', ')} 중 하나여야 합니다.`);
  if (!Array.isArray(args.items)) throw new ToolInputError('items는 배열이어야 합니다.');
  if (mode === 'add' && args.items.length === 0) throw new ToolInputError('추가할 음식이 없습니다.');
  if (args.items.length > MAX_ITEMS) throw new ToolInputError(`한 번에 최대 ${MAX_ITEMS}개까지 넣을 수 있습니다.`);
  const incoming = args.items.map(toFoodItem);

  const existing = await findDietLog(db, uid, dateKey);
  const sections = MEAL_ORDER.map((id) => {
    const found = (existing?.data.sections || []).find(section => section.id === id);
    return { id, name: MEALS[id], items: Array.isArray(found?.items) ? found.items : [] };
  });
  const target = sections.find(section => section.id === args.meal);
  target.items = mode === 'add' ? [...target.items, ...incoming] : incoming;
  if (target.items.length > MAX_ITEMS * 2) throw new ToolInputError('한 끼니에 음식이 너무 많습니다.');

  const totals = dietTotals(sections);
  const payload = { ...totals, sections, aiComment: existing?.data.aiComment || '식단이 기록되었습니다.', updatedVia: 'mcp', updatedAt: FieldValue.serverTimestamp() };
  let logId;
  if (existing) {
    await existing.ref.update(payload);
    logId = existing.ref.id;
  } else {
    if (incoming.length === 0) return { date: dateKey, meal: args.meal, changed: false, note: '그 날짜에는 식단 기록이 없어 바꿀 것이 없습니다.' };
    const profileSnap = await db.doc(`users/${uid}`).get();
    const goal = Number(profileSnap.data()?.profile?.targetKcal) || 0;
    const ref = db.collection('logs').doc();
    await ref.set({ type: 'diet', uid, timestamp: timestampFor(dateKey), goal, unparsedInputs: {}, via: 'mcp', ...payload });
    logId = ref.id;
  }
  // Claude가 찾아 넣은 값은 공용 음식 사전에도 반영한다 (등급: AI 추정보다 위, 사람이 고친 값보다 아래)
  await Promise.all(incoming.map(item => contributeFood(db, uid, item, 'claude').catch(() => 'error')));
  return {
    log_id: logId, date: dateKey, meal: args.meal, changed: true,
    meal_items: target.items.map(item => ({ name: item.name, kcal: item.kcal })),
    day_total: { kcal: totals.kcal, carb_g: totals.carb, protein_g: totals.protein, fat_g: totals.fat },
  };
}

/* ── 운동 ── */

function toWorkoutSections(raw) {
  if (!Array.isArray(raw) || raw.length === 0) throw new ToolInputError('sections가 비어 있습니다.');
  return raw.slice(0, 10).map((section, i) => {
    const part = text(section?.part, 30);
    const exercises = Array.isArray(section?.exercises) ? section.exercises : [];
    if (!part) throw new ToolInputError('부위(part)가 비어 있는 섹션이 있습니다.');
    if (exercises.length === 0) throw new ToolInputError(`${part}에 종목이 없습니다.`);
    return {
      id: i + 1,
      part,
      items: exercises.slice(0, 20).map((exercise, j) => {
        const title = text(exercise?.name, 80);
        if (!title) throw new ToolInputError(`${part}에 이름 없는 종목이 있습니다.`);
        const item = { id: j + 1, title, body: text(exercise.body, MAX_BODY) };
        const note = text(exercise.note, 500);
        if (note) item.note = note;
        return item;
      }),
    };
  });
}

function workoutFields(sections, args) {
  let volume = 0;
  sections.forEach(section => section.items.forEach((item) => { volume += parseExercise(item, section.part).parsed_volume_kg || 0; }));
  const totalVolume = Math.round(volume);
  const cardioMinutes = Math.round(amount(args.cardio_minutes, 'cardio_minutes', { max: 1440 }));
  const title = text(args.title, 60) || [...new Set(sections.map(section => section.part))].join(', ');
  return {
    title,
    sections,
    exercises: sections.flatMap(section => section.items.map(item => ({ name: item.title }))),
    totalVolume,
    cardioMinutes,
    overloadMsg: totalVolume > 0 ? `오늘 볼륨 ${totalVolume.toLocaleString('en-US')}kg 기록 완료!` : '',
    aiStatus: 'done',
  };
}

async function addWorkout(db, uid, args) {
  const dateKey = resolveDate(args.date);
  const fields = workoutFields(toWorkoutSections(args.sections), args);
  const ref = db.collection('logs').doc();
  await ref.set({ type: 'workout', uid, timestamp: timestampFor(dateKey), via: 'mcp', ...fields });
  return { log_id: ref.id, date: dateKey, title: fields.title, total_volume_kg: fields.totalVolume, cardio_minutes: fields.cardioMinutes };
}

async function replaceWorkout(db, uid, args) {
  const { ref, data } = await ownedLog(db, uid, args.log_id);
  if (data.type && data.type !== 'workout') throw new ToolInputError('운동 기록이 아닙니다. 식단은 replace_diet_meal을 쓰세요.');
  const fields = workoutFields(toWorkoutSections(args.sections), args);
  await ref.update({ ...fields, updatedVia: 'mcp', updatedAt: FieldValue.serverTimestamp() });
  return { log_id: ref.id, title: fields.title, total_volume_kg: fields.totalVolume, cardio_minutes: fields.cardioMinutes };
}

async function deleteLog(db, uid, args) {
  const { ref, data } = await ownedLog(db, uid, args.log_id);
  await ref.update({ deletedAt: FieldValue.serverTimestamp(), deletedVia: 'mcp' });
  return { log_id: ref.id, type: data.type || 'workout', deleted: true, note: '앱의 마이페이지 휴지통에서 30일 안에 되살릴 수 있습니다.' };
}

/* ── 체중 · 프로필 ── */

async function setMorningWeight(db, uid, args) {
  const dateKey = resolveDate(args.date);
  const ref = db.doc(`users/${uid}/bodyLogs/mw_${dateKey}`);
  if (args.weight_kg === null) {
    await ref.delete();
    return { date: dateKey, deleted: true };
  }
  const weightKg = Number(args.weight_kg);
  if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 300) throw new ToolInputError('weight_kg는 20~300 사이여야 합니다.');
  const value = Math.round(weightKg * 10) / 10;
  await ref.set({ kind: 'morning_weight', date: dateKey, weightKg: value, updatedAt: FieldValue.serverTimestamp(), via: 'mcp' });
  return { date: dateKey, weight_kg: value };
}

const PROFILE_FIELDS = {
  target_kcal: ['targetKcal', 800, 6000],
  goal_weight_kg: ['goalWeight', 20, 300],
  profile_weight_kg: ['weight', 20, 300],
  height_cm: ['height', 100, 250],
  age: ['age', 10, 100],
};

async function updateProfile(db, uid, args) {
  const changes = {};
  const changed = {};
  Object.entries(PROFILE_FIELDS).forEach(([key, [field, min, max]]) => {
    if (args[key] == null) return;
    const n = Number(args[key]);
    if (!Number.isFinite(n) || n < min || n > max) throw new ToolInputError(`${key}는 ${min}~${max} 사이여야 합니다.`);
    changes[`profile.${field}`] = n;
    changed[key] = n;
  });
  if (Object.keys(changes).length === 0) throw new ToolInputError('바꿀 항목이 없습니다.');
  await db.doc(`users/${uid}`).set({}, { merge: true });
  await db.doc(`users/${uid}`).update(changes);
  return { changed };
}

const WRITE_HANDLERS = {
  add_diet_items: (db, uid, args) => writeDietMeal(db, uid, args, 'add'),
  replace_diet_meal: (db, uid, args) => writeDietMeal(db, uid, args, 'replace'),
  add_workout: addWorkout,
  replace_workout: replaceWorkout,
  delete_log: deleteLog,
  set_morning_weight: setMorningWeight,
  update_profile: updateProfile,
};

const isWriteTool = name => Object.prototype.hasOwnProperty.call(WRITE_HANDLERS, name);

async function callWriteTool(db, uid, name, args) {
  return WRITE_HANDLERS[name](db, uid, args && typeof args === 'object' ? args : {});
}

module.exports = { WRITE_TOOLS, isWriteTool, callWriteTool };
