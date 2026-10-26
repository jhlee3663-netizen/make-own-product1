import React, { useEffect, useMemo, useState } from 'react';
import { socialCall, socialErrorMessage } from '../../lib/socialApi';
import { appendSections, describeLog, dietFoodsToItems, loadMyRecentLogs, rowsToSections, todayLogOf } from '../../lib/importPlan';
import { exerciseKey } from '../../lib/strengthProgress';
import { Btn, Sheet, SheetTitle, Spinner } from './ui';
import { Segmented, useWeightPlan, WeightRowList } from './WeightRows';
import { IcCheck } from './SocialIcons';

/* 가져오기 (IA 8장, Figma 06-3). 어디서 누르든 같은 흐름이다.
   운동: 무게 맞추기(08) → 오늘 메모가 있으면 붙일지 묻기(09) → 운동 메모 열기
   식단: 끼니 고르기(10) → 식단 기록 열기 */

/* 서버 응답에서 가져올 종목·원래 무게·출처 이름 */
export function importSource(detail) {
  if (detail.curation?.kind === 'routine') {
    return { items: detail.curation.items, sourceWeights: {}, sourceName: '', part: detail.curation.parts?.join(', '), hasSource: false };
  }
  if (detail.routine) {
    const w = {};
    Object.entries(detail.ownerWeights || {}).forEach(([k, v]) => { w[exerciseKey(k)] = v; });
    return { items: detail.routine.items, sourceWeights: w, sourceName: detail.owner?.name || '친구', part: detail.routine.parts?.join(', '), hasSource: Object.keys(w).length > 0 };
  }
  if (detail.workout) {
    const items = detail.workout.exercises.map((e) => ({ name: e.name, part: e.part, sets: e.setCount, reps: e.reps || '10', weightKg: e.weightKg }));
    const w = {};
    items.forEach((it) => { if (it.weightKg) w[exerciseKey(it.name)] = it.weightKg; });
    return { items, sourceWeights: w, sourceName: detail.owner?.name || '친구', part: '', hasSource: Object.keys(w).length > 0 };
  }
  if (detail.video) {
    const w = {};
    detail.video.items.forEach((it) => { if (it.weightKg) w[exerciseKey(it.name)] = it.weightKg; });
    return { items: detail.video.items, sourceWeights: w, sourceName: '영상', part: detail.video.parts?.join(', '), hasSource: Object.keys(w).length > 0 };
  }
  return null;
}

export function modeOptions(src) {
  return src?.hasSource
    ? [{ id: 'mine', label: '내 기록 기준' }, { id: 'source', label: `${src.sourceName} 무게 그대로` }, { id: 'empty', label: '무게 비우기' }]
    : [{ id: 'mine', label: '내 기록 기준' }, { id: 'empty', label: '무게 비우기' }];
}

function WorkoutImport({ nav, request, detail, onClose }) {
  const src = useMemo(() => importSource(detail), [detail]);
  const { rows, myLogs } = useWeightPlan(nav.uid, src?.items, src || {});
  const [mode, setMode] = useState(request.preset?.mode || 'mine');
  const [overrides, setOverrides] = useState(request.preset?.overrides || {});
  const [step, setStep] = useState(request.preset ? 'check' : 'weights');
  const [append, setAppend] = useState(true);
  const today = myLogs ? todayLogOf(myLogs) : undefined;

  const sections = rows ? rowsToSections(rows, mode, overrides, src?.part) : null;

  function open(withToday) {
    socialCall('import-record', { key: request.key }).catch(() => {});
    const initialData = withToday
      ? { ...today, sections: appendSections(today.sections, sections), imported: true }
      : { sections, imported: true };
    onClose();
    nav.openMemo(initialData);
  }

  function next() {
    if (!sections) return;
    if (today) setStep('today'); else open(false);
  }

  useEffect(() => {
    if (step === 'check' && myLogs) {
      if (todayLogOf(myLogs)) setStep('today'); else open(false);
    }
  }, [step, myLogs]); // eslint-disable-line react-hooks/exhaustive-deps

  if (step === 'check') return <Sheet open onClose={onClose}><div className="flex justify-center py-8"><Spinner /></div></Sheet>;

  if (step === 'today' && today) {
    const d = describeLog(today);
    const added = sections.reduce((n, s) => n + s.items.length, 0);
    return (
      <Sheet open onClose={onClose} label="오늘 운동 메모가 이미 있어요">
        <SheetTitle title="오늘 운동 메모가 이미 있어요" sub="가져온 루틴을 어디에 넣을까요?" />
        <div className="rounded-[16px] bg-ui-1 px-4 py-4 flex flex-col gap-1">
          <span className="font-pretendard text-[12px] leading-[18px] text-typo-alternative">오늘 메모 · {d.time}</span>
          <span className="font-pretendard font-bold text-[16px] leading-6 text-typo-strong">{d.title}</span>
          <span className="font-pretendard text-[13px] leading-5 text-typo-alternative truncate">{d.detail}</span>
        </div>
        <div className="flex flex-col gap-2">
          {[{ id: true, title: '뒤에 붙이기', sub: `오늘 메모 아래에 ${added}종목을 이어 붙여요` }, { id: false, title: '새 메모로', sub: '오늘 기록을 하나 더 만들어요' }].map((o) => (
            <button key={String(o.id)} type="button" onClick={() => setAppend(o.id)} className={`flex items-center gap-3 px-4 py-4 rounded-[16px] border text-left transition-colors ${append === o.id ? 'border-brand bg-[rgba(113,113,255,0.04)]' : 'border-ui-3'}`}>
              <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${append === o.id ? 'border-brand' : 'border-ui-5'}`}>{append === o.id && <span className="w-2.5 h-2.5 rounded-full bg-brand" />}</span>
              <span className="flex flex-col gap-0.5">
                <span className="font-pretendard font-semibold text-[15px] leading-[22px] text-typo-strong">{o.title}</span>
                <span className="font-pretendard text-[13px] leading-5 text-typo-alternative">{o.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <Btn onClick={() => open(append)}>가져오기</Btn>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} label="무게 맞추기">
      <SheetTitle title="내 무게로 맞춰서 가져올게요" sub={`세트·횟수는 ${src?.hasSource ? `${src.sourceName} 루틴` : '루틴'} 그대로, 무게만 나에게 맞춰요`} />
      <div className="flex flex-col gap-2">
        <Segmented options={modeOptions(src)} value={mode} onChange={(m) => { setMode(m); setOverrides({}); }} />
        <WeightRowList rows={rows} mode={mode} overrides={overrides} setOverrides={setOverrides} />
        <p className="font-pretendard text-[12px] leading-[18px] text-typo-alternative">무게를 누르면 바로 고칠 수 있어요</p>
      </div>
      <Btn onClick={next} disabled={!rows}>오늘 메모로 가져오기</Btn>
    </Sheet>
  );
}

function DietImport({ nav, request, detail, onClose }) {
  const c = detail.curation || { title: detail.video.routineTitle, meals: detail.video.meals };
  const [picked, setPicked] = useState(() => new Set(c.meals.map((m) => m.id)));
  const [today, setToday] = useState(undefined);
  useEffect(() => {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
    Promise.race([loadMyRecentLogs(nav.uid, 'diet', 10), timeout]).then((logs) => setToday(todayLogOf(logs))).catch(() => setToday(null));
  }, [nav.uid]);

  const chosen = c.meals.filter((m) => picked.has(m.id));
  const sum = chosen.flatMap((m) => m.foods).reduce((a, f) => ({ kcal: a.kcal + f.kcal, protein: a.protein + f.protein }), { kcal: 0, protein: 0 });

  function existingIn(mealId) {
    const sec = (today?.sections || []).find((s) => s.id === mealId);
    return sec?.items?.length ? sec.items : null;
  }

  function confirm() {
    socialCall('import-record', { key: request.key }).catch(() => {});
    const base = today ? today.sections || [] : [];
    const sections = [...new Set([...base.map((s) => s.id), ...chosen.map((m) => m.id)])].map((id) => {
      const prev = base.find((s) => s.id === id);
      const add = chosen.find((m) => m.id === id);
      return { id, items: [...(prev?.items || []), ...(add ? dietFoodsToItems(add.foods) : [])] };
    });
    onClose();
    nav.openDiet(today ? { ...today, sections, imported: true } : { sections, imported: true }, chosen[0]?.id);
  }

  return (
    <Sheet open onClose={onClose} label="끼니 고르기">
      <SheetTitle title="어느 끼니에 넣을까요?" sub={`${c.title.replace(/\n/g, ' ')} · 오늘`} />
      <div className="flex flex-col">
        {c.meals.map((m) => {
          const on = picked.has(m.id);
          const prev = existingIn(m.id);
          return (
            <button key={m.id} type="button" onClick={() => setPicked((s) => { const n = new Set(s); if (on) n.delete(m.id); else n.add(m.id); return n; })} className="flex items-start gap-3 py-3 text-left">
              <span className={`mt-0.5 w-6 h-6 rounded-[7px] flex-none flex items-center justify-center transition-colors ${on ? 'bg-brand text-white' : 'border-2 border-ui-4 text-transparent'}`}><IcCheck size={14} /></span>
              <span className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="flex items-center gap-2">
                  <span className="font-pretendard font-bold text-[15px] leading-[22px] text-typo-strong">{m.name}</span>
                  <span className="font-pretendard text-[13px] text-typo-alternative">{m.foods.reduce((s, f) => s + f.kcal, 0)}kcal</span>
                </span>
                <span className="font-pretendard text-[13px] leading-5 text-typo-normal">{m.foods.map((f) => f.name.replace(/\s*\d+.*$/, '')).join(' + ')}</span>
                {prev && on && <span className="font-pretendard text-[12px] leading-[18px] text-red-orange">이미 {prev[0].name}{prev.length > 1 ? ` 외 ${prev.length - 1}개` : ''}가 있어요 · 뒤에 추가돼요</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between font-pretendard text-[14px]">
          <span className="text-typo-alternative">넣을 칼로리</span>
          <span className="font-semibold text-brand">{sum.kcal.toLocaleString()}kcal · 단백질 {sum.protein}g</span>
        </div>
        <Btn onClick={confirm} disabled={!chosen.length || today === undefined}>{chosen.length}끼 가져오기</Btn>
      </div>
    </Sheet>
  );
}

export default function ImportFlow({ nav, request, onClose }) {
  const [detail, setDetail] = useState(request.detail || null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (request.detail) return;
    socialCall('post', { key: request.key }).then(setDetail).catch(setError);
  }, [request.key]);

  useEffect(() => {
    if (error) { nav.toast(socialErrorMessage(error)); onClose(); }
  }, [error]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!detail) return <Sheet open onClose={onClose}><div className="flex justify-center py-10"><Spinner /></div></Sheet>;
  if (detail.curation?.kind === 'diet' || detail.video?.kind === 'diet') return <DietImport nav={nav} request={request} detail={detail} onClose={onClose} />;
  return <WorkoutImport nav={nav} request={request} detail={detail} onClose={onClose} />;
}
