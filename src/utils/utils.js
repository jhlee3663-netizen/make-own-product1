/* =========================================================
   Utility: parseVolume
   Extracts Weight * Reps * Sets (Tonnage)
   ========================================================= */
export function parseVolume(sections) {
  let total = 0;
  sections.forEach(s => {
    (s.items || []).forEach(it => {
      const body = it.body || "";
      // 60.5kg 10회 3세트 형태 추출
      const matches = body.match(/(\d+(?:\.\d+)?)\s*kg\s*(\d+)\s*회\s*(?:(\d+)\s*세트)?/gi);
      if (matches) {
        matches.forEach(m => {
          const parts = m.match(/(\d+(?:\.\d+)?)\s*kg\s*(\d+)\s*회\s*(?:(\d+)\s*세트)?/i);
          if (parts) {
            const weight = parseFloat(parts[1]);
            const reps = parseInt(parts[2]);
            const sets = parts[3] ? parseInt(parts[3]) : 1;
            total += weight * reps * sets;
          }
        });
      }
    });
  });
  return total;
}
