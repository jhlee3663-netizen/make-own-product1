export function parseVolume(sections) {
  let total = 0;
  sections.forEach(s => {
    (s.items || []).forEach(it => {
      const body = it.body || "";
      for (const m of body.matchAll(/(\d+(?:\.\d+)?)\s*kg\s*(?:(\d+)\s*회|[x×]\s*(\d+))\s*(?:(?:(\d+)\s*세트|[x×]\s*(\d+)))?/gi))
        total += parseFloat(m[1]) * parseInt(m[2] || m[3]) * (m[4] ? parseInt(m[4]) : m[5] ? parseInt(m[5]) : 1);
      for (const m of body.matchAll(/(\d+(?:\.\d+)?)\s*(?:lbs?|파운드)\s*(?:(\d+)\s*회|[x×]\s*(\d+))\s*(?:(?:(\d+)\s*세트|[x×]\s*(\d+)))?/gi))
        total += parseFloat(m[1]) * 0.453592 * parseInt(m[2] || m[3]) * (m[4] ? parseInt(m[4]) : m[5] ? parseInt(m[5]) : 1);
      for (const m of body.matchAll(/(\d+(?:\.\d+)?)\s*칸\s*(?:(\d+)\s*회|[x×]\s*(\d+))\s*(?:(?:(\d+)\s*세트|[x×]\s*(\d+)))?/gi))
        total += parseFloat(m[1]) * 5 * parseInt(m[2] || m[3]) * (m[4] ? parseInt(m[4]) : m[5] ? parseInt(m[5]) : 1);
    });
  });
  return total;
}
