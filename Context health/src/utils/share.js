export async function shareText(title, text) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function buildWorkoutShareText(data) {
  const dt = data.timestamp ? new Date(data.timestamp.seconds * 1000) : new Date();
  const dateStr = `${dt.getFullYear()}.${dt.getMonth() + 1}.${dt.getDate()}`;
  const lines = [`💪 ${data.title || '오늘의 운동'} (${dateStr})`];
  const comment = data.aiComment || data.overloadMsg;
  if (comment) lines.push(comment);

  const sections = (data.sections || []).filter(s => (s.items || []).some(it => it.title || it.body));
  if (sections.length > 0) {
    sections.forEach(s => {
      lines.push('', `[${s.part || '운동'}]`);
      (s.items || []).forEach(it => {
        if (!it.title) return;
        lines.push(it.title);
        if (it.body) lines.push(it.body);
        if (it.note) lines.push(`💬 ${it.note}`);
      });
    });
  } else if (data.exercises?.length) {
    lines.push('', ...data.exercises.map(e => `- ${e.name}`));
  }
  return lines.join('\n');
}

export function buildDietShareText(data) {
  const dt = data.timestamp ? new Date(data.timestamp.seconds * 1000) : new Date();
  const dateStr = `${dt.getFullYear()}.${dt.getMonth() + 1}.${dt.getDate()}`;
  return [
    `🍽️ 오늘의 식단 (${dateStr})`,
    `${(data.kcal || 0).toLocaleString()} kcal`,
    `탄수화물 ${data.carb || 0}g · 단백질 ${data.protein || 0}g · 지방 ${data.fat || 0}g`,
  ].join('\n');
}
