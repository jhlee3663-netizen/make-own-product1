import { BODYWEIGHT_BASES } from './exerciseData';

function isBodyweightBase(title) {
  if (!title) return false;
  const base = title.replace(/^(어시스티드|가중)\s*/u, '').trim();
  return BODYWEIGHT_BASES.has(base);
}

export function sumReps(body) {
  let reps = 0;
  for (const m of body.matchAll(/(?:(\d+)\s*회|[x×]\s*(\d+))/gi))
    reps += parseInt(m[1] || m[2]);
  return reps;
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
          for (const m of body.matchAll(/(\d+(?:\.\d+)?)\s*kg\s*(?:(\d+)\s*회|[x×]\s*(\d+))/gi))
            total += Math.max(0, bw - parseFloat(m[1])) * parseInt(m[2] || m[3]);
        } else {
          total += bw * sumReps(body);
        }
        return;
      }

      if (isWeighted && isBW && bw > 0 && hasKg) {
        for (const m of body.matchAll(/(\d+(?:\.\d+)?)\s*kg\s*(?:(\d+)\s*회|[x×]\s*(\d+))/gi))
          total += (bw + parseFloat(m[1])) * parseInt(m[2] || m[3]);
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
