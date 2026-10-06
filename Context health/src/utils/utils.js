import { BODYWEIGHT_BASES } from './exerciseData';

function isBodyweightBase(title) {
  if (!title) return false;
  const base = title.replace(/^(어시스티드|가중)\s*/u, '').trim();
  return BODYWEIGHT_BASES.has(base);
}

/* QA-11: "10회 3세트"처럼 세트 수가 따로 적힌 표기를 총 횟수에 반영한다.
   "세트 1: ..."처럼 숫자가 뒤에 오는 AI 정리 표기는 세트 배수로 오인하지 않는다. */
export function countRepsInLine(line) {
  if (!line) return 0;
  const text = String(line);
  const repMatches = [...text.matchAll(/(\d+)\s*회/g)];
  const side = /양쪽|각\s*사이드/i.test(text) ? 2 : 1;

  if (repMatches.length === 0) {
    let xReps = 0;
    for (const m of text.matchAll(/[x×]\s*(\d+)/gi)) xReps += parseInt(m[1]);
    return xReps * side;
  }

  const reps = repMatches.reduce((sum, m) => sum + parseInt(m[1]), 0);
  const setMatch = text.match(/(\d+)\s*세트/);
  if (setMatch) return reps * parseInt(setMatch[1]) * side;
  const xMatch = text.match(/[x×]\s*(\d+)/i);
  if (xMatch) return reps * parseInt(xMatch[1]) * side;
  return reps * side;
}

export function sumReps(body) {
  if (!body) return 0;
  return String(body).split('\n').reduce((total, line) => total + countRepsInLine(line), 0);
}

/* 한 줄의 세트 배수와 좌우 배수. 무게가 붙은 계산 경로에서 공통으로 쓴다.
   "x3"은 횟수 표기와 구분이 어려우므로, 같은 줄에 명시적인 "N회"가 있을 때만 세트로 본다. */
function lineMultiplier(line) {
  const side = /양쪽|각\s*사이드/i.test(line) ? 2 : 1;
  const setMatch = line.match(/(\d+)\s*세트/);
  if (setMatch) return parseInt(setMatch[1]) * side;
  if (/(\d+)\s*회/.test(line)) {
    const xMatch = line.match(/[x×]\s*(\d+)/i);
    if (xMatch) return parseInt(xMatch[1]) * side;
  }
  return side;
}

/* 종목 하나의 볼륨. parseVolume과 같은 세트·좌우 배수 규칙을 쓴다(QA-11). */
export function parseVolumeFromBody(body) {
  if (!body) return 0;
  let total = 0;
  for (const line of String(body).split('\n')) {
    const mult = lineMultiplier(line);
    for (const m of line.matchAll(/(\d+(?:\.\d+)?)\s*kg\s*(?:(\d+)\s*회|[x×]\s*(\d+))/g))
      total += parseFloat(m[1]) * parseInt(m[2] || m[3]) * mult;
    for (const m of line.matchAll(/(\d+(?:\.\d+)?)\s*(?:lbs?|파운드)\s*(?:(\d+)\s*회|[x×]\s*(\d+))/gi))
      total += parseFloat(m[1]) * 0.453592 * parseInt(m[2] || m[3]) * mult;
    for (const m of line.matchAll(/(\d+(?:\.\d+)?)\s*칸\s*(?:(\d+)\s*회|[x×]\s*(\d+))/g))
      total += parseFloat(m[1]) * 5 * parseInt(m[2] || m[3]) * mult;
  }
  return total;
}

export function parseVolume(sections, bodyWeight = 0) {
  let total = 0;
  const bw = bodyWeight || 0;

  sections.forEach(s => {
    (s.items || []).forEach(it => {
      const body = it.body || "";
      const title = it.title || "";
      const isAssisted = /어시스티드/i.test(title);
      const isWeighted = /가중/i.test(title);
      const isBW = isBodyweightBase(title);
      const hasKg = /\d+\s*kg/i.test(body);

      if (isAssisted && bw > 0) {
        if (hasKg) {
          for (const line of body.split('\n')) {
            const mult = lineMultiplier(line);
            for (const m of line.matchAll(/(\d+(?:\.\d+)?)\s*kg\s*(?:(\d+)\s*회|[x×]\s*(\d+))/gi))
              total += Math.max(0, bw - parseFloat(m[1])) * parseInt(m[2] || m[3]) * mult;
          }
        } else {
          total += bw * sumReps(body);
        }
        return;
      }

      if (isWeighted && isBW && bw > 0 && hasKg) {
        for (const line of body.split('\n')) {
          const mult = lineMultiplier(line);
          for (const m of line.matchAll(/(\d+(?:\.\d+)?)\s*kg\s*(?:(\d+)\s*회|[x×]\s*(\d+))/gi))
            total += (bw + parseFloat(m[1])) * parseInt(m[2] || m[3]) * mult;
        }
        return;
      }

      if (isBW && bw > 0 && !hasKg) {
        total += bw * sumReps(body);
        return;
      }

      for (const line of body.split('\n')) {
        const side = /양쪽|각\s*사이드/i.test(line) ? 2 : 1;
        for (const m of line.matchAll(/(\d+(?:\.\d+)?)\s*kg\s*(?:(\d+)\s*회|[x×]\s*(\d+))\s*(?:(?:(\d+)\s*세트|[x×]\s*(\d+)))?/gi))
          total += parseFloat(m[1]) * parseInt(m[2] || m[3]) * (m[4] ? parseInt(m[4]) : m[5] ? parseInt(m[5]) : 1) * side;
        for (const m of line.matchAll(/(\d+(?:\.\d+)?)\s*(?:lbs?|파운드)\s*(?:(\d+)\s*회|[x×]\s*(\d+))\s*(?:(?:(\d+)\s*세트|[x×]\s*(\d+)))?/gi))
          total += parseFloat(m[1]) * 0.453592 * parseInt(m[2] || m[3]) * (m[4] ? parseInt(m[4]) : m[5] ? parseInt(m[5]) : 1) * side;
        for (const m of line.matchAll(/(\d+(?:\.\d+)?)\s*칸\s*(?:(\d+)\s*회|[x×]\s*(\d+))\s*(?:(?:(\d+)\s*세트|[x×]\s*(\d+)))?/gi))
          total += parseFloat(m[1]) * 5 * parseInt(m[2] || m[3]) * (m[4] ? parseInt(m[4]) : m[5] ? parseInt(m[5]) : 1) * side;
      }
    });
  });
  return Math.round(total);
}

export function formatCardioDuration(minutes) {
  if (!minutes) return '0분';
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}시간`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
  return `${minutes}분`;
}

/* 오늘이 속한 주의 월~일 7일을 고정 순서로 반환한다 (요일 라벨이 매일 밀리지 않도록) */
export function getCurrentWeekDays() {
  const today = new Date();
  const day = today.getDay(); // 0=일 .. 6=토
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function hasWeightedVolumePattern(line) {
  return /(\d+(?:\.\d+)?)\s*(?:kg|lbs?|파운드|칸)\s*(?:(\d+)\s*회|[x×]\s*(\d+))/i.test(line);
}

function hasRepSetPattern(line) {
  return /(?:\d+\s*회|[x×]\s*\d+)/i.test(line) && /(?:세트|set|sets?)/i.test(line);
}

export function parseCardioMinutes(sections) {
  let total = 0;

  sections.forEach(s => {
    (s.items || []).forEach(it => {
      const text = `${it.title || ''}\n${it.body || ''}`;
      const seenLines = new Set();
      text.split('\n').forEach(rawLine => {
        const line = rawLine.trim();
        if (!line || hasWeightedVolumePattern(line) || hasRepSetPattern(line)) return;
        if (seenLines.has(line)) return;
        seenLines.add(line);

        const hourMatches = [...line.matchAll(/(\d+(?:\.\d+)?)\s*(?:시간|hours?\b|hrs?\b|hr\b|h\b)/gi)];
        const minuteMatches = [...line.matchAll(/(\d+(?:\.\d+)?)\s*(?:분|minutes?\b|mins?\b|min\b)/gi)];

        hourMatches.forEach(match => { total += parseFloat(match[1]) * 60; });
        minuteMatches.forEach(match => { total += parseFloat(match[1]); });
      });
    });
  });

  return Math.round(total);
}

export function getWorkoutSignature(workoutSections = [], workoutTitle = '') {
  const parts = new Set();
  const exercises = new Set();
  String(workoutTitle || '').split(',').forEach(part => {
    const token = String(part || '').replace(/\s+/g, '').toLowerCase();
    if (token) parts.add(token);
  });
  workoutSections.forEach(section => {
    const part = String(section.part || '').replace(/\s+/g, '').toLowerCase();
    if (part) parts.add(part);
    (section.items || []).forEach(item => {
      const title = String(item.title || '').replace(/\s+/g, '').toLowerCase();
      if (title) exercises.add(title);
    });
  });
  return { parts, exercises };
}

export function hasComparableWorkout(currentSig, prevSections = [], prevTitle = '') {
  const prevSig = getWorkoutSignature(prevSections, prevTitle);
  for (const exercise of currentSig.exercises) {
    if (prevSig.exercises.has(exercise)) return true;
  }
  for (const part of currentSig.parts) {
    if (prevSig.parts.has(part)) return true;
  }
  return false;
}

export function findComparableLastVolumeFromLogs(logs, currentSections, currentTitle, currentDocId) {
  const currentSig = getWorkoutSignature(currentSections, currentTitle);
  const prev = logs.find(log =>
    log.id !== currentDocId &&
    log.docId !== currentDocId &&
    log.totalVolume > 0 &&
    hasComparableWorkout(currentSig, log.sections || [], log.title || '')
  );
  return prev?.totalVolume || 0;
}

/* 홈 카드 상단 성공/아쉬움 뱃지 판정. 디로딩 세션은 항상 성공으로 취급하고,
   그 외에는 직전 비교 가능한 기록 대비 볼륨을 유지/증가했는지로 판정한다. */
export function getWorkoutPerfGrade(log, olderLogs = []) {
  const isDeload = /디로딩/.test(log.overloadMsg || log.aiComment || '');
  if (isDeload) return 'success';
  const totalVolume = log.totalVolume || 0;
  if (totalVolume === 0) return 'success';
  const lastVolume = findComparableLastVolumeFromLogs(olderLogs, log.sections || [], log.title || '', log.docId || log.id);
  if (!lastVolume) return 'success';
  return totalVolume >= lastVolume ? 'success' : 'meh';
}

export function buildWorkoutSummaryMessage(totalVolume, lastVolume = 0, mode = 'overload', cardioMinutes = 0) {
  if (totalVolume === 0 && cardioMinutes > 0) {
    return `오늘 유산소 ${formatCardioDuration(cardioMinutes)} 기록!`;
  }
  if (lastVolume > 0) {
    const diff = totalVolume - lastVolume;
    const pct = ((diff / lastVolume) * 100).toFixed(1);
    return mode === 'deload'
      ? (diff <= 0 ? `오늘 볼륨 ${totalVolume.toLocaleString()}kg, 같은 운동 대비 디로딩 성공! (${Math.abs(pct)}% 감량)` : `오늘 볼륨 ${totalVolume.toLocaleString()}kg, 같은 운동 대비 디로딩 목표 미달 (${pct}% 증가)`)
      : `오늘 볼륨 ${totalVolume.toLocaleString()}kg, 같은 운동 대비 ${Math.abs(pct)}% 과부하 ${diff >= 0 ? "성공" : "실패"}!`;
  }
  return totalVolume > 0
    ? `오늘 첫 비교 기록 볼륨 ${totalVolume.toLocaleString()}kg 달성!`
    : "운동 기록 저장 완료!";
}
