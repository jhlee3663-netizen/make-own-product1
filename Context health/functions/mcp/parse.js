/* MCP 조회용 순수 함수: 날짜(KST) 처리와 운동 세트 텍스트 파싱.
   파싱은 원문을 대체하지 않는다. 모든 줄은 raw와 함께 나가고, 읽지 못한 줄은 parsed: null로 둔다. */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LB_TO_KG = 0.453592;
/* 앱의 볼륨 계산(src/utils/utils.js)과 같은 환산: 머신 1칸 = 5kg */
const PLATE_STEP_KG = 5;

function isDateKey(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function kstDateKey(ms) {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function kstTime(ms) {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(11, 16);
}

/* KST 기준 그날 0시의 epoch ms */
function kstDayStartMs(dateKey) {
  return Date.parse(`${dateKey}T00:00:00Z`) - KST_OFFSET_MS;
}

function addDays(dateKey, days) {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(fromKey, toKey) {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / DAY_MS);
}

/* 월요일 시작 주 */
function weekStart(dateKey) {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay(); // 0=일
  return addDays(dateKey, day === 0 ? -6 : 1 - day);
}

class ToolInputError extends Error {}

/* from/to가 없으면 오늘(KST)까지 defaultDays일. 범위가 너무 길면 조용히 자르지 않고 오류로 알린다. */
function resolveRange(args, { defaultDays, maxDays, now = Date.now() }) {
  const today = kstDateKey(now);
  const to = args?.to ?? today;
  if (!isDateKey(to)) throw new ToolInputError('to는 YYYY-MM-DD 형식이어야 합니다.');
  const from = args?.from ?? addDays(to, -(defaultDays - 1));
  if (!isDateKey(from)) throw new ToolInputError('from은 YYYY-MM-DD 형식이어야 합니다.');
  if (from > to) throw new ToolInputError('from이 to보다 늦습니다.');
  const days = daysBetween(from, to) + 1;
  if (days > maxDays) {
    throw new ToolInputError(`조회 기간이 ${days}일입니다. 한 번에 최대 ${maxDays}일까지 조회할 수 있으니 기간을 나눠서 호출하세요.`);
  }
  return { from, to, days };
}

function round(value, digits = 1) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/* Epley 추정 1RM. 15회를 넘는 세트는 추정이 부정확해 계산하지 않는다. */
function estimate1rm(weightKg, reps) {
  if (!(weightKg > 0) || !(reps > 0) || reps > 15) return null;
  if (reps === 1) return round(weightKg);
  return round(weightKg * (1 + reps / 30));
}

function toKg(value, unit) {
  const u = unit.toLowerCase();
  if (u === 'kg') return value;
  if (u === '칸') return value * PLATE_STEP_KG;
  return round(value * LB_TO_KG, 2);
}

function normalizeName(name) {
  return String(name || '').replace(/\s+/g, '').toLowerCase();
}

const WEIGHT_REPS_RE = /(\d+(?:\.\d+)?)\s*(kg|lbs?|파운드|칸)\s*(?:[x×*]\s*)?(\d+)(?!\d)(?!\s*세트)\s*(?:회|개|reps?)?/gi;
const WEIGHT_ONLY_RE = /(\d+(?:\.\d+)?)\s*(kg|lbs?|파운드|칸)/i;
const REPS_RE = /(\d+)\s*(?:회|개)/g;

/* 한 줄을 읽는다. 괄호 안 표기((드랍), (보조4회) 등)는 숫자로 해석하지 않고 notes로만 남긴다. */
function parseSetLine(rawLine) {
  const raw = String(rawLine || '').trim();
  if (!raw) return null;

  let text = raw.replace(/^[•·\-*]\s*/, '');
  const out = { raw };

  const prefix = text.match(/^(?:세트\s*(\d+)|(\d+)\s*세트)\s*[:：.)]\s*/);
  if (prefix) {
    out.set_no = Number(prefix[1] || prefix[2]);
    text = text.slice(prefix[0].length);
  }

  const notes = [...text.matchAll(/[(（]([^)）]*)[)）]/g)].map(m => m[1].trim()).filter(Boolean);
  const body = text.replace(/[(（][^)）]*[)）]/g, ' ');

  const flags = [];
  if (/드랍|드롭|drop/i.test(raw)) flags.push('drop');
  if (/슈퍼\s*세트|superset/i.test(raw)) flags.push('superset');
  if (/강제\s*반복/.test(raw)) flags.push('forced_reps');
  const assisted = raw.match(/보조\s*(\d+)\s*(?:회|개)?/);
  if (assisted) {
    flags.push('assisted_reps');
    out.assisted_reps = Number(assisted[1]);
  } else if (/보조/.test(raw)) {
    flags.push('assisted_reps');
  }
  const perSide = /양쪽|각\s*사이드/.test(raw);
  if (perSide) out.per_side = true;

  let setCount = 1;
  const setMatch = body.match(/(\d+)\s*세트/);
  const xAfterReps = body.match(/\d+\s*(?:회|개)\s*[x×*]\s*(\d+)/i);
  if (setMatch) setCount = Number(setMatch[1]);
  else if (xAfterReps) setCount = Number(xAfterReps[1]);

  const parsed = [];
  for (const m of body.matchAll(WEIGHT_REPS_RE)) {
    const weightKg = toKg(parseFloat(m[1]), m[2]);
    const reps = Number(m[3]);
    const entry = { weight_kg: weightKg, reps, set_count: setCount };
    if (m[2].toLowerCase() !== 'kg') entry.written_as = `${m[1]}${m[2]}`;
    parsed.push(entry);
  }

  if (parsed.length === 0) {
    const weight = body.match(WEIGHT_ONLY_RE);
    const repMatches = [...body.matchAll(REPS_RE)];
    if (weight && repMatches.length > 0) {
      /* "60kg 3세트 10회"처럼 무게와 횟수가 떨어져 있는 표기 */
      const weightKg = toKg(parseFloat(weight[1]), weight[2]);
      for (const r of repMatches) {
        const entry = { weight_kg: weightKg, reps: Number(r[1]), set_count: setCount };
        if (weight[2].toLowerCase() !== 'kg') entry.written_as = `${weight[1]}${weight[2]}`;
        parsed.push(entry);
      }
    } else if (!weight) {
      for (const r of repMatches) parsed.push({ weight_kg: null, reps: Number(r[1]), set_count: setCount });
    }
  }

  let minutes = 0;
  for (const m of body.matchAll(/(\d+(?:\.\d+)?)\s*시간/g)) minutes += parseFloat(m[1]) * 60;
  for (const m of body.matchAll(/(\d+(?:\.\d+)?)\s*분/g)) minutes += parseFloat(m[1]);
  if (minutes > 0) out.duration_min = round(minutes);

  out.parsed = parsed.length > 0 ? parsed : null;
  if (notes.length) out.notes = notes;
  if (flags.length) out.flags = flags;
  return out;
}

/* 종목 하나(title + body). 종목명은 원문 그대로 두고 통합하지 않는다. */
function parseExercise(item, part) {
  const name = String(item?.title || '').trim();
  const lines = String(item?.body || '').split('\n').map(parseSetLine).filter(Boolean);
  /* 어시스티드 머신은 적힌 kg이 보조 무게라서 부하로 계산하지 않는다. */
  const assistedMachine = /어시스티드|assisted/i.test(name);

  let volume = 0;
  let setCount = 0;
  let totalReps = 0;
  let best1rm = null;
  let topWeight = null;

  for (const line of lines) {
    if (!line.parsed) continue;
    const side = line.per_side ? 2 : 1;
    const clean = !(line.flags || []).some(f => f === 'drop' || f === 'assisted_reps' || f === 'forced_reps');
    for (const entry of line.parsed) {
      setCount += entry.set_count;
      totalReps += entry.reps * entry.set_count * side;
      if (entry.weight_kg == null || assistedMachine) continue;
      volume += entry.weight_kg * entry.reps * entry.set_count * side;
      if (topWeight == null || entry.weight_kg > topWeight) topWeight = entry.weight_kg;
      const est = estimate1rm(entry.weight_kg, entry.reps);
      if (est != null) {
        entry.est_1rm_kg = est;
        if (clean && (best1rm == null || est > best1rm)) best1rm = est;
      }
    }
  }

  const out = { name, part: part || null, sets: lines };
  if (item?.note) out.note = String(item.note);
  if (assistedMachine) out.weight_is_assistance = true;
  out.set_count = setCount;
  out.total_reps = totalReps;
  out.parsed_volume_kg = assistedMachine ? null : round(volume);
  out.top_weight_kg = topWeight;
  out.best_est_1rm_kg = best1rm;
  return out;
}

module.exports = {
  ToolInputError,
  addDays,
  daysBetween,
  estimate1rm,
  isDateKey,
  kstDateKey,
  kstDayStartMs,
  kstTime,
  normalizeName,
  parseExercise,
  parseSetLine,
  resolveRange,
  round,
  weekStart,
};
