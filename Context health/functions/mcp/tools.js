/* MCP 도구 정의와 조회 로직. 이 파일은 읽기 전용이다.
   Admin SDK는 보안 규칙을 우회하므로 규칙이 아니라 코드로 읽기 전용을 보장한다:
   여기 넘어오는 db는 get만 되는 창구(./readonly)이고, scripts/test-mcp-parse.mjs가 쓰기 호출이 없는지도 검사한다.
   uid는 항상 검증된 토큰에서 오며 도구 인자로 받지 않는다. */
const { Timestamp } = require('firebase-admin/firestore');
const {
  ToolInputError, addDays, kstDateKey, kstDayStartMs, kstTime, normalizeName,
  parseExercise, resolveRange, round, weekStart,
} = require('./parse');

const MAX_RANGE_DAYS = 400;
const MAX_LOG_DOCS = 1500;
const MAX_FREE_TEXT_CHARS = 3000;

const PRE_WORKOUT_MEAL_LABELS = {
  fasted: '공복',
  carb_lt1h: '탄수 섭취 후 1시간 이내',
  carb_1_2h: '탄수 섭취 후 1~2시간',
  carb_gt2h: '탄수 섭취 후 2시간 이상',
};

const INBODY_DEVICE_LABELS = { 270: 'InBody 270 (헬스장)', 770: 'InBody 770 (검진)' };
const INBODY_CONDITION_LABELS = { fasted: '공복', evening: '저녁' };

/* Firestore 필드명 → 응답 필드명. 시드 스크립트(functions/scripts/seed-inbody.js)와 같은 목록을 쓴다. */
const INBODY_FIELDS = {
  weightKg: 'weight_kg',
  skeletalMuscleKg: 'skeletal_muscle_kg',
  bodyFatKg: 'body_fat_kg',
  bodyFatPct: 'body_fat_pct',
  bodyWaterL: 'body_water_l',
  proteinKg: 'protein_kg',
  mineralKg: 'mineral_kg',
  bmi: 'bmi',
  bmrKcal: 'bmr_kcal',
  visceralFatLevel: 'visceral_fat_level',
  waistHipRatio: 'waist_hip_ratio',
  inbodyScore: 'inbody_score',
};

const DATE_PROP = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };

const TOOLS = [
  {
    name: 'list_exercises',
    description: '운동 기록에 등장한 종목명을 적힌 그대로 나열한다(등장 횟수, 첫/마지막 날짜, 부위). '
      + '종목명은 통합·정규화하지 않았다. "벤치프레스"와 "벤치프레스 프리"처럼 표기가 다르거나 오타가 섞인 항목이 같은 종목인지는 직접 판단하고, 애매하면 사용자에게 물어라. '
      + 'get_workouts의 exercise 필터에 넣을 이름을 고를 때 먼저 호출한다. 기간을 생략하면 전체 기록.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { ...DATE_PROP, description: '시작일(KST, 포함). 생략 시 전체 기간' },
        to: { ...DATE_PROP, description: '종료일(KST, 포함). 생략 시 오늘' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_workouts',
    description: '운동 기록 조회. granularity=session(기본)은 세션별·종목별·세트별 기록을, week는 주간 볼륨 집계(부위별·종목별)를 준다. '
      + '세트는 항상 원문(raw)과 파싱 결과(parsed)가 같이 온다. parsed가 null이면 서버가 읽지 못한 줄이니 raw를 직접 읽어라. '
      + 'est_1rm_kg는 Epley 공식(무게×(1+횟수/30), 15회 이하만)이고, best_est_1rm_kg는 드랍·보조·강제반복 표기가 없는 세트만으로 구한 값이다. '
      + 'parsed_volume_kg는 적힌 무게×횟수×세트 합계라 맨몸 종목은 0이고, app_total_volume_kg는 앱이 저장한 값(맨몸 종목에 프로필 체중 반영)이라 둘이 다를 수 있다. '
      + 'exercise는 공백·대소문자를 무시한 부분 일치이며 어떤 이름이 걸렸는지 matched_exercise_names로 알려준다. '
      + 'date/recorded_time은 운동 시각이 아니라 기록을 저장한 시각(KST)이다. pre_workout_meal은 사용자가 직접 고른 값이고 없으면 미기록이다. '
      + '기간 기본값은 최근 28일, 최대 400일.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { ...DATE_PROP, description: '시작일(KST, 포함)' },
        to: { ...DATE_PROP, description: '종료일(KST, 포함)' },
        exercise: { type: 'string', description: '종목명 부분 일치 필터 (예: "벤치프레스")' },
        part: { type: 'string', description: '부위 부분 일치 필터 (예: "가슴", "하체")' },
        granularity: { type: 'string', enum: ['session', 'week'], description: '기본 session' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'session일 때 최대 세션 수. 기본 40. 넘치면 최신 날짜부터 주고 next_to를 알려준다.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_diet',
    description: '식단 기록 조회. granularity=day(기본)는 날짜별 총 kcal·탄수·단백질·지방과 끼니 슬롯(아침/오전간식/점심/오후간식/저녁/야식)별 항목을, week는 주간 평균과 목표 칼로리 대비를 준다. '
      + '주간 평균은 기록이 있는 날만으로 계산한다(days_logged 참고). 식사 시각은 저장되지 않으며 끼니 슬롯만 있다. '
      + '목표는 칼로리만 앱에 저장돼 있다. 기간 기본값은 최근 7일, 최대 400일.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { ...DATE_PROP, description: '시작일(KST, 포함)' },
        to: { ...DATE_PROP, description: '종료일(KST, 포함)' },
        granularity: { type: 'string', enum: ['day', 'week'], description: '기본 day' },
        include_items: { type: 'boolean', description: 'day일 때 음식 항목까지 포함할지. 기본 true. 긴 기간은 false 권장.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_morning_weight',
    description: '아침 공복 체중 기록(날짜별 kg). 인바디 체중과는 측정 조건이 달라 별도 도구로 분리돼 있으니 섞어서 추이를 내지 마라. 인바디는 get_body_composition. 기간 기본값은 최근 28일.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { ...DATE_PROP, description: '시작일(KST, 포함)' },
        to: { ...DATE_PROP, description: '종료일(KST, 포함)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_body_composition',
    description: '인바디(체성분) 측정 기록. 측정마다 기기(device: 270=헬스장, 770=검진)와 측정 조건(condition: fasted=공복, evening=저녁)이 붙는다. '
      + '기기가 다르면 값이 달라지므로 같은 기기끼리만 추이를 비교하고, 다른 기기 값을 함께 볼 때는 그 사실을 밝혀라. 체수분(body_water_l)과 측정 조건도 해석에 반영해라. '
      + '여기의 weight_kg는 인바디 측정 시 체중이며 아침 공복 체중(get_morning_weight)과 다르다. 기간 기본값은 최근 365일.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { ...DATE_PROP, description: '시작일(KST, 포함)' },
        to: { ...DATE_PROP, description: '종료일(KST, 포함)' },
        device: { type: 'string', enum: ['270', '770'], description: '기기 필터' },
        condition: { type: 'string', enum: ['fasted', 'evening'], description: '측정 조건 필터' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_profile',
    description: '프로필과 목표: 키, 나이, 성별, 운동 목표, 활동량, 목표 체중, 일일 목표 칼로리. profile_weight_kg는 사용자가 프로필에 직접 적은 값이라 최신 측정치가 아닐 수 있다.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
].map(tool => ({ ...tool, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } }));

function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== ''));
}

function num(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function timestampMs(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (Number.isFinite(value.seconds)) return value.seconds * 1000;
  return null;
}

async function fetchLogs(db, uid, range) {
  let q = db.collection('logs').where('uid', '==', uid);
  if (range) {
    q = q
      .where('timestamp', '>=', Timestamp.fromMillis(kstDayStartMs(range.from)))
      .where('timestamp', '<', Timestamp.fromMillis(kstDayStartMs(addDays(range.to, 1))));
  }
  const snap = await q.orderBy('timestamp', 'desc').limit(MAX_LOG_DOCS).get();
  const logs = [];
  snap.docs.forEach((d) => {
    const data = d.data();
    const ms = timestampMs(data.timestamp);
    if (data.deletedAt || ms == null) return;
    logs.push({ id: d.id, ms, date: kstDateKey(ms), data });
  });
  return { logs, capped: snap.size === MAX_LOG_DOCS };
}

/* 앱과 같은 기준: type이 없는 레거시 문서는 운동 기록으로 본다. */
const isWorkout = log => !log.data.type || log.data.type === 'workout';
const isDiet = log => log.data.type === 'diet';

function workoutExercises(data) {
  const out = [];
  (Array.isArray(data.sections) ? data.sections : []).forEach((section) => {
    (Array.isArray(section?.items) ? section.items : []).forEach((item) => {
      if (!item?.title && !item?.body) return;
      out.push(parseExercise(item, section.part));
    });
  });
  return out;
}

async function listExercises(db, uid, args) {
  const range = args.from || args.to
    ? resolveRange({ from: args.from ?? '2000-01-01', to: args.to }, { defaultDays: 1, maxDays: 100000 })
    : null;
  const { logs, capped } = await fetchLogs(db, uid, range);
  const byName = new Map();
  let freeMemoSessions = 0;
  logs.filter(isWorkout).forEach((log) => {
    const exercises = workoutExercises(log.data);
    if (exercises.length === 0) { freeMemoSessions += 1; return; }
    const seen = new Set();
    exercises.forEach((ex) => {
      if (!ex.name || seen.has(ex.name)) return;
      seen.add(ex.name);
      const entry = byName.get(ex.name) || { name: ex.name, parts: new Set(), sessions: 0, first_date: log.date, last_date: log.date };
      if (ex.part) entry.parts.add(ex.part);
      entry.sessions += 1;
      if (log.date < entry.first_date) entry.first_date = log.date;
      if (log.date > entry.last_date) entry.last_date = log.date;
      byName.set(ex.name, entry);
    });
  });
  const exercises = [...byName.values()]
    .map(e => ({ ...e, parts: [...e.parts] }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return compact({
    range: range ? { from: range.from, to: range.to } : 'all',
    note: '종목명은 기록된 그대로이며 서버에서 통합하지 않았다. 이름순 정렬이라 표기가 비슷한 항목이 인접해 있다.',
    exercise_count: exercises.length,
    exercises,
    sessions_without_structured_exercises: freeMemoSessions || null,
    truncated: capped || null,
  });
}

function buildSession(log, filters) {
  const data = log.data;
  let exercises = workoutExercises(data);
  const freeText = data.mode === 'free' && typeof data.originalText === 'string' ? data.originalText : '';
  let matchedFreeText = false;

  if (filters.exercise) {
    exercises = exercises.filter(ex => normalizeName(ex.name).includes(filters.exercise));
    matchedFreeText = exercises.length === 0 && normalizeName(freeText).includes(filters.exercise);
    if (exercises.length === 0 && !matchedFreeText) return null;
  }
  if (filters.part) {
    exercises = exercises.filter(ex => normalizeName(ex.part).includes(filters.part));
    if (exercises.length === 0) return null;
  }

  const meal = data.preWorkoutMeal;
  const session = compact({
    id: log.id,
    date: log.date,
    recorded_time: kstTime(log.ms),
    title: data.title,
    app_total_volume_kg: num(data.totalVolume),
    cardio_minutes: num(data.cardioMinutes) || null,
    pre_workout_meal: meal ? { code: meal, label: PRE_WORKOUT_MEAL_LABELS[meal] || meal } : null,
    ai_summary_pending: data.aiStatus === 'processing' ? true : null,
    exercises,
  });
  /* 자유 메모로 쓴 기록은 AI가 정리하기 전의 사용자 원문도 같이 준다. */
  if (freeText) {
    session.original_memo = freeText.slice(0, MAX_FREE_TEXT_CHARS);
    if (freeText.length > MAX_FREE_TEXT_CHARS) session.original_memo_truncated = true;
    if (matchedFreeText) session.matched_in = 'original_memo';
  }
  return session;
}

function summarizeWeeks(sessions) {
  const weeks = new Map();
  sessions.forEach((s) => {
    const key = weekStart(s.date);
    const week = weeks.get(key) || {
      week_start: key, week_end: addDays(key, 6), sessions: 0,
      app_total_volume_kg: 0, cardio_minutes: 0, parts: new Map(), exercises: new Map(),
    };
    week.sessions += 1;
    week.app_total_volume_kg += s.app_total_volume_kg || 0;
    week.cardio_minutes += s.cardio_minutes || 0;
    (s.exercises || []).forEach((ex) => {
      const partKey = ex.part || '미분류';
      const part = week.parts.get(partKey) || { part: partKey, parsed_volume_kg: 0, set_count: 0 };
      part.parsed_volume_kg += ex.parsed_volume_kg || 0;
      part.set_count += ex.set_count;
      week.parts.set(partKey, part);

      const item = week.exercises.get(ex.name) || {
        name: ex.name, part: ex.part, sessions: 0, parsed_volume_kg: 0, set_count: 0,
        top_weight_kg: null, best_est_1rm_kg: null,
      };
      item.sessions += 1;
      item.parsed_volume_kg += ex.parsed_volume_kg || 0;
      item.set_count += ex.set_count;
      if (ex.top_weight_kg != null && (item.top_weight_kg == null || ex.top_weight_kg > item.top_weight_kg)) item.top_weight_kg = ex.top_weight_kg;
      if (ex.best_est_1rm_kg != null && (item.best_est_1rm_kg == null || ex.best_est_1rm_kg > item.best_est_1rm_kg)) item.best_est_1rm_kg = ex.best_est_1rm_kg;
      week.exercises.set(ex.name, item);
    });
    weeks.set(key, week);
  });
  return [...weeks.values()]
    .sort((a, b) => a.week_start.localeCompare(b.week_start))
    .map(w => ({
      week_start: w.week_start,
      week_end: w.week_end,
      sessions: w.sessions,
      app_total_volume_kg: round(w.app_total_volume_kg),
      cardio_minutes: w.cardio_minutes,
      by_part: [...w.parts.values()].map(p => ({ ...p, parsed_volume_kg: round(p.parsed_volume_kg) })),
      by_exercise: [...w.exercises.values()].map(e => compact({ ...e, parsed_volume_kg: round(e.parsed_volume_kg) })),
    }));
}

async function getWorkouts(db, uid, args) {
  const range = resolveRange(args, { defaultDays: 28, maxDays: MAX_RANGE_DAYS });
  const granularity = args.granularity || 'session';
  if (!['session', 'week'].includes(granularity)) throw new ToolInputError('granularity는 session 또는 week입니다.');
  const filters = {
    exercise: args.exercise ? normalizeName(args.exercise) : '',
    part: args.part ? normalizeName(args.part) : '',
  };
  const { logs, capped } = await fetchLogs(db, uid, range);
  const sessions = logs.filter(isWorkout).map(log => buildSession(log, filters)).filter(Boolean);

  const matchedNames = filters.exercise
    ? [...new Set(sessions.flatMap(s => (s.exercises || []).map(ex => ex.name)))].sort((a, b) => a.localeCompare(b, 'ko'))
    : null;
  const base = compact({
    range: { from: range.from, to: range.to, timezone: 'Asia/Seoul' },
    filters: compact({ exercise: args.exercise, part: args.part }),
    matched_exercise_names: matchedNames,
    session_count: sessions.length,
    truncated_by_server_cap: capped || null,
  });

  if (granularity === 'week') {
    return {
      ...base,
      note: '주간 값은 세트 텍스트를 서버가 파싱해 더한 것이다. 수치가 이상하면 granularity=session으로 원문을 확인하라.',
      weeks: summarizeWeeks(sessions),
    };
  }

  /* 최신 날짜부터 limit개까지. 같은 날짜의 세션은 쪼개지 않는다. */
  const limit = Math.min(100, Math.max(1, Number.isInteger(args.limit) ? args.limit : 40));
  let cut = sessions.length;
  if (sessions.length > limit) {
    cut = limit;
    while (cut < sessions.length && sessions[cut].date === sessions[cut - 1].date) cut += 1;
  }
  const page = sessions.slice(0, cut);
  const truncated = cut < sessions.length;
  return {
    ...base,
    ...(truncated ? {
      truncated: true,
      next_to: addDays(page[page.length - 1].date, -1),
      truncated_note: '세션이 limit을 넘어 최신 날짜부터 일부만 반환했다. 나머지는 to=next_to로 다시 호출하라.',
    } : {}),
    sessions: page,
  };
}

function dietItem(item) {
  const portion = item?.portion && typeof item.portion === 'object'
    ? compact({ mode: item.portion.mode, grams: num(item.portion.grams), unit: item.portion.unit, grams_known: item.portion.gramsKnown })
    : null;
  return compact({
    name: String(item?.name || ''),
    kcal: num(item?.kcal),
    carb_g: num(item?.carb),
    protein_g: num(item?.protein),
    fat_g: num(item?.fat),
    portion,
    source: item?.source,
  });
}

function sumMacros(items) {
  return items.reduce((acc, it) => ({
    kcal: acc.kcal + (num(it?.kcal) || 0),
    carb_g: acc.carb_g + (num(it?.carb) || 0),
    protein_g: acc.protein_g + (num(it?.protein) || 0),
    fat_g: acc.fat_g + (num(it?.fat) || 0),
  }), { kcal: 0, carb_g: 0, protein_g: 0, fat_g: 0 });
}

function roundMacros(m) {
  return { kcal: round(m.kcal, 0), carb_g: round(m.carb_g), protein_g: round(m.protein_g), fat_g: round(m.fat_g) };
}

async function getDiet(db, uid, args) {
  const range = resolveRange(args, { defaultDays: 7, maxDays: MAX_RANGE_DAYS });
  const granularity = args.granularity || 'day';
  if (!['day', 'week'].includes(granularity)) throw new ToolInputError('granularity는 day 또는 week입니다.');
  const includeItems = args.include_items !== false;

  const [{ logs, capped }, userSnap] = await Promise.all([
    fetchLogs(db, uid, range),
    db.doc(`users/${uid}`).get(),
  ]);
  const profile = userSnap.exists ? userSnap.data()?.profile || {} : {};
  const profileGoal = num(profile.targetKcal) || null;

  /* 같은 날짜에 식단 문서가 여러 개면 합친다. */
  const days = new Map();
  logs.filter(isDiet).forEach((log) => {
    const data = log.data;
    const day = days.get(log.date) || { date: log.date, totals: { kcal: 0, carb_g: 0, protein_g: 0, fat_g: 0 }, goal_kcal: null, meals: new Map(), unparsed: [] };
    const sections = Array.isArray(data.sections) ? data.sections : [];
    const allItems = sections.flatMap(s => (Array.isArray(s?.items) ? s.items : []));
    /* 문서에 저장된 합계가 화면에 보이는 값이므로 우선한다. 없으면 항목 합으로 대신한다. */
    const itemSum = sumMacros(allItems);
    day.totals.kcal += num(data.kcal) ?? itemSum.kcal;
    day.totals.carb_g += num(data.carb) ?? itemSum.carb_g;
    day.totals.protein_g += num(data.protein) ?? itemSum.protein_g;
    day.totals.fat_g += num(data.fat) ?? itemSum.fat_g;
    if (num(data.goal)) day.goal_kcal = num(data.goal);
    sections.forEach((section) => {
      const items = Array.isArray(section?.items) ? section.items : [];
      if (items.length === 0) return;
      const slot = section.name || section.id || '기타';
      const meal = day.meals.get(slot) || { slot, items: [] };
      meal.items.push(...items);
      day.meals.set(slot, meal);
    });
    Object.entries(data.unparsedInputs || {}).forEach(([slot, text]) => {
      if (String(text || '').trim()) day.unparsed.push({ slot, text: String(text).slice(0, 500) });
    });
    days.set(log.date, day);
  });

  const dayList = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const base = compact({
    range: { from: range.from, to: range.to, timezone: 'Asia/Seoul' },
    targets: compact({
      kcal: profileGoal,
      note: '앱에 저장된 목표는 칼로리뿐이다. 탄단지 목표는 저장돼 있지 않다.',
    }),
    days_logged: dayList.length,
    truncated_by_server_cap: capped || null,
  });

  if (granularity === 'week') {
    const weeks = new Map();
    dayList.forEach((day) => {
      const key = weekStart(day.date);
      const week = weeks.get(key) || { week_start: key, week_end: addDays(key, 6), days: [] };
      week.days.push(day);
      weeks.set(key, week);
    });
    return {
      ...base,
      note: '주간 평균은 기록이 있는 날(days_logged)만으로 계산했다.',
      weeks: [...weeks.values()].map((week) => {
        const n = week.days.length;
        const total = week.days.reduce((acc, d) => ({
          kcal: acc.kcal + d.totals.kcal, carb_g: acc.carb_g + d.totals.carb_g,
          protein_g: acc.protein_g + d.totals.protein_g, fat_g: acc.fat_g + d.totals.fat_g,
        }), { kcal: 0, carb_g: 0, protein_g: 0, fat_g: 0 });
        const avg = roundMacros({ kcal: total.kcal / n, carb_g: total.carb_g / n, protein_g: total.protein_g / n, fat_g: total.fat_g / n });
        const goals = week.days.map(d => d.goal_kcal || profileGoal).filter(Boolean);
        const goal = goals.length ? round(goals.reduce((a, b) => a + b, 0) / goals.length, 0) : null;
        const macroKcal = avg.carb_g * 4 + avg.protein_g * 4 + avg.fat_g * 9;
        return compact({
          week_start: week.week_start,
          week_end: week.week_end,
          days_logged: n,
          avg_kcal: avg.kcal,
          avg_carb_g: avg.carb_g,
          avg_protein_g: avg.protein_g,
          avg_fat_g: avg.fat_g,
          goal_kcal: goal,
          avg_kcal_vs_goal_pct: goal ? round((avg.kcal / goal) * 100) : null,
          macro_kcal_ratio_pct: macroKcal > 0 ? {
            carb: round((avg.carb_g * 4 / macroKcal) * 100),
            protein: round((avg.protein_g * 4 / macroKcal) * 100),
            fat: round((avg.fat_g * 9 / macroKcal) * 100),
          } : null,
        });
      }),
    };
  }

  return {
    ...base,
    days: dayList.map((day) => {
      const goal = day.goal_kcal || profileGoal;
      const totals = roundMacros(day.totals);
      return compact({
        date: day.date,
        ...totals,
        goal_kcal: goal,
        kcal_vs_goal_pct: goal ? round((totals.kcal / goal) * 100) : null,
        meals: [...day.meals.values()].map(meal => compact({
          slot: meal.slot,
          ...roundMacros(sumMacros(meal.items)),
          items: includeItems ? meal.items.map(dietItem) : null,
          item_count: includeItems ? null : meal.items.length,
        })),
        unparsed_inputs: day.unparsed.length ? day.unparsed : null,
      });
    }),
  };
}

async function fetchBodyLogs(db, uid, range, kind) {
  const snap = await db.collection(`users/${uid}/bodyLogs`)
    .where('date', '>=', range.from)
    .where('date', '<=', range.to)
    .orderBy('date')
    .get();
  return snap.docs.map(d => d.data()).filter(d => d.kind === kind);
}

async function getMorningWeight(db, uid, args) {
  const range = resolveRange(args, { defaultDays: 28, maxDays: MAX_RANGE_DAYS });
  const entries = (await fetchBodyLogs(db, uid, range, 'morning_weight'))
    .map(d => ({ date: d.date, weight_kg: num(d.weightKg) }))
    .filter(e => e.weight_kg != null);
  const weights = entries.map(e => e.weight_kg);
  return compact({
    range: { from: range.from, to: range.to, timezone: 'Asia/Seoul' },
    measurement: '아침 공복 체중 (사용자가 앱에 직접 입력)',
    count: entries.length,
    stats: weights.length ? {
      first_kg: weights[0],
      last_kg: weights[weights.length - 1],
      change_kg: round(weights[weights.length - 1] - weights[0], 2),
      avg_kg: round(weights.reduce((a, b) => a + b, 0) / weights.length, 2),
      min_kg: Math.min(...weights),
      max_kg: Math.max(...weights),
    } : null,
    entries,
  });
}

async function getBodyComposition(db, uid, args) {
  const range = resolveRange(args, { defaultDays: 365, maxDays: 1500 });
  if (args.device && !INBODY_DEVICE_LABELS[args.device]) throw new ToolInputError('device는 270 또는 770입니다.');
  if (args.condition && !INBODY_CONDITION_LABELS[args.condition]) throw new ToolInputError('condition은 fasted 또는 evening입니다.');
  const entries = (await fetchBodyLogs(db, uid, range, 'inbody'))
    .filter(d => (!args.device || String(d.device) === args.device) && (!args.condition || d.condition === args.condition))
    .map((d) => {
      const metrics = {};
      Object.entries(INBODY_FIELDS).forEach(([field, key]) => { metrics[key] = num(d[field]); });
      return compact({
        date: d.date,
        measured_time: d.measuredTime,
        date_is_approximate: d.dateApprox ? true : null,
        device: String(d.device),
        device_label: INBODY_DEVICE_LABELS[d.device] || null,
        condition: d.condition,
        condition_label: INBODY_CONDITION_LABELS[d.condition] || null,
        ...metrics,
        note: d.note,
      });
    });
  const devices = [...new Set(entries.map(e => e.device))];
  return compact({
    range: { from: range.from, to: range.to, timezone: 'Asia/Seoul' },
    filters: compact({ device: args.device, condition: args.condition }),
    count: entries.length,
    devices_in_result: devices,
    caution: devices.length > 1
      ? '서로 다른 기기의 측정이 섞여 있다. 기기 간 값은 직접 비교하지 말고 같은 기기끼리 추이를 봐라.'
      : null,
    entries,
  });
}

async function getProfile(db, uid) {
  const snap = await db.doc(`users/${uid}`).get();
  const p = snap.exists ? snap.data()?.profile || {} : {};
  return compact({
    height_cm: num(p.height),
    age: num(p.age),
    gender: p.gender,
    goal: p.goal,
    activity_level: p.activityLevel,
    profile_weight_kg: num(p.weight),
    goal_weight_kg: num(p.goalWeight),
    target_kcal: num(p.targetKcal),
    note: 'profile_weight_kg는 프로필에 직접 적은 값이다. 측정 추이는 get_morning_weight / get_body_composition을 써라.',
  });
}

const HANDLERS = {
  list_exercises: listExercises,
  get_workouts: getWorkouts,
  get_diet: getDiet,
  get_morning_weight: getMorningWeight,
  get_body_composition: getBodyComposition,
  get_profile: getProfile,
};

async function callTool(db, uid, name, args) {
  const handler = HANDLERS[name];
  if (!handler) throw new ToolInputError(`알 수 없는 도구: ${name}`);
  return handler(db, uid, args && typeof args === 'object' ? args : {});
}

module.exports = { TOOLS, INBODY_FIELDS, callTool };
