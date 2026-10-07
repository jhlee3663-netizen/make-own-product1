/* 운동 메모를 AI가 정리할 때 사용자가 적은 말(느낌·메모)이 사라지지 않게 지킨다.
   1) 프롬프트에 원문 보존 규칙을 넣고  2) 그래도 빠진 문장은 여기서 찾아 note에 되돌려 넣는다. */

export const KEEP_REMARKS_RULE = '[가장 중요] 사용자가 "-" 등으로 시작해 적은 메모 줄이나 세트 기록이 아닌 문장은 한 글자도 바꾸거나 빼지 말고 해당 종목의 note에 원문 그대로 넣어. 요약·삭제·의역 금지. 여러 줄이면 줄바꿈(\\n)으로 이어 붙여.';

const SET_PATTERN = /\d+\s*(회|개|reps?|세트|set|분|초|km)|[x×*]\s*\d+/i;
const SET_TYPE_ONLY = /^\(?\s*(드랍|슈퍼|컴파운드|강제\s*반복|저\s*중량)[^가-힣]*세?트?\)?$/;
const FIELD_LINE = /^(종목|기록|부위)\s*:/;
const MARKER = /^\s*(?:[-–—*※>•·]+|ㄴ|💬|\/\/)\s*/u;

const normalize = text => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function letterRatio(text) {
  const compact = text.replace(/\s/g, '');
  if (!compact) return 0;
  return (compact.match(/\p{L}/gu) || []).length / compact.length;
}

function asRemark(line, requireMarker) {
  const hasMarker = MARKER.test(line);
  const text = line.replace(MARKER, '').trim();
  if (requireMarker && !hasMarker) return null;
  if (text.length < 2 || FIELD_LINE.test(text)) return null;
  if (SET_PATTERN.test(text) || SET_TYPE_ONLY.test(text)) return null;
  if (letterRatio(text) < 0.6) return null;
  return text;
}

function bigrams(text) {
  const set = new Set();
  for (let i = 0; i < text.length - 1; i += 1) set.add(text.slice(i, i + 2));
  return set;
}

function similar(a, b) {
  if (!a || !b) return 0;
  const x = bigrams(a); const y = bigrams(b);
  if (!x.size || !y.size) return 0;
  let hit = 0;
  x.forEach((gram) => { if (y.has(gram)) hit += 1; });
  return (2 * hit) / (x.size + y.size);
}

/* source: 원본 sections 배열 또는 자유 메모 문자열 */
function collectRemarks(source) {
  const remarks = [];
  if (typeof source === 'string') {
    // 자유 메모에서는 종목 이름과 헷갈리지 않게, 표시(-, ※ 등)로 시작한 줄만 메모로 본다.
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      const remark = asRemark(line, true);
      // 메모 바로 위쪽 줄들을 거슬러 올라가며 어느 종목 아래에 적힌 말인지 찾는다
      if (remark) remarks.push({ text: remark, hints: lines.slice(0, index).reverse() });
    });
    return remarks;
  }
  (source || []).forEach((section, sectionIndex) => {
    (section.items || []).forEach((item, itemIndex) => {
      String(item.body || '').split('\n').forEach((line) => {
        const remark = asRemark(line, false);
        if (remark) remarks.push({ text: remark, hints: [item.title || ''], sectionIndex, itemIndex });
      });
    });
  });
  return remarks;
}

export function preserveUserRemarks(aiSections, source) {
  const sections = (aiSections || []).map(section => ({ ...section, items: (section.items || []).map(item => ({ ...item })) }));
  const items = sections.flatMap(section => section.items);
  if (!items.length) return sections;

  const kept = () => {
    const chunks = items.flatMap(item => [item.note, item.body].flatMap(text => String(text || '').split(/\n|(?<=[.!?。])\s+/)));
    return { all: normalize(items.map(item => `${item.note || ''}${item.body || ''}`).join('')), chunks: chunks.map(normalize).filter(Boolean) };
  };

  collectRemarks(source).forEach((remark) => {
    const key = normalize(remark.text);
    if (!key) return;
    const state = kept();
    if (state.all.includes(key) || state.chunks.some(chunk => similar(chunk, key) >= 0.72)) return;

    let target = null;
    for (const line of remark.hints) {
      const hint = normalize(line);
      if (hint.length < 2) continue;
      target = items.find((item) => {
        const title = normalize(item.title);
        return title && (title.includes(hint) || hint.includes(title));
      });
      if (target) break;
    }
    if (!target && remark.sectionIndex !== undefined) target = sections[remark.sectionIndex]?.items?.[remark.itemIndex];
    if (!target) target = items[items.length - 1];
    target.note = target.note ? `${target.note}\n${remark.text}` : remark.text;
  });
  return sections;
}
