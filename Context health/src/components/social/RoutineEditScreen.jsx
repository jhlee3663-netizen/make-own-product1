import React, { useEffect, useState } from 'react';
import { socialCall, socialErrorMessage } from '../../lib/socialApi';
import ConfirmModal from '../common/ConfirmModal';
import { Btn, FadeLine, Screen, Spinner, TopBar } from './ui';
import { IcGrip, IcPlusSmall, IcX } from './SocialIcons';

/* 루틴 초안 확인하고 공개 (Figma 41). 초안(draft) · 내 루틴 고치기(id) · 새로 만들기 모두 이 화면. */

export default function RoutineEditScreen({ nav, draft, id, leaving }) {
  const [form, setForm] = useState(() => draft
    ? { title: `${nav.me?.profile?.name || '내'}표 ${draft.title}`.slice(0, 30), items: draft.items.map((i) => ({ ...i, reps: String(i.reps) })), memo: '', parts: draft.parts, draftKey: draft.key, sessionCount: draft.sessionCount }
    : { title: '', items: [], memo: '', parts: [] });
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [adding, setAdding] = useState('');

  useEffect(() => {
    if (!id) return;
    socialCall('post', { key: `rt:${id}` }).then((d) => {
      const r = d.routine;
      setForm({ title: r.title, items: r.items.map((i) => ({ ...i, reps: String(i.reps) })), memo: r.memo, parts: r.parts, draftKey: r.draftKey, status: r.status });
      setLoading(false);
    }).catch((e) => { nav.toast(socialErrorMessage(e)); nav.pop(); });
  }, [id]);

  const setItem = (i, patch) => setForm((f) => ({ ...f, items: f.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const move = (i, dir) => setForm((f) => {
    const items = [...f.items];
    const j = i + dir;
    if (j < 0 || j >= items.length) return f;
    [items[i], items[j]] = [items[j], items[i]];
    return { ...f, items };
  });

  async function save(status) {
    setSaving(true);
    try {
      await nav.requireProfile(async () => {
        await socialCall('routine-save', { id, ...form, status });
        nav.toast(status === 'public' ? '친구에게 공개했어요' : '나만 보기로 저장했어요');
        nav.pop();
      });
    } catch (e) { nav.toast(socialErrorMessage(e)); }
    setSaving(false);
  }

  async function remove() {
    setConfirmDelete(false);
    if (!id) {
      if (draft) socialCall('draft-dismiss', { draftKey: draft.key }).catch(() => {});
      nav.pop();
      return;
    }
    try { await socialCall('routine-delete', { id }); nav.toast('루틴을 지웠어요'); nav.pop(); } catch (e) { nav.toast(socialErrorMessage(e)); }
  }

  function addItem() {
    const name = adding.trim();
    if (!name) return;
    setForm((f) => ({ ...f, items: [...f.items, { name, sets: 3, reps: '10' }] }));
    setAdding('');
  }

  const title = draft ? '루틴 초안' : id ? '루틴 고치기' : '새 루틴';
  return (
    <Screen leaving={leaving}>
      <TopBar onBack={() => nav.pop()} title={title} right={(id || draft) ? <button type="button" onClick={() => setConfirmDelete(true)} className="font-pretendard font-medium text-[14px] text-typo-alternative">삭제</button> : null} />
      {loading ? <div className="py-16 flex justify-center"><Spinner /></div> : (
        <>
          <div className="flex-1 overflow-y-auto px-5 pt-2 pb-6 flex flex-col gap-8">
            <div className="flex flex-col gap-2">
              <span className="font-pretendard font-medium text-[13px] text-typo-normal">루틴 이름</span>
              <input value={form.title} maxLength={30} placeholder="예: 등 · 이두 날" onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="h-[52px] px-4 rounded-[14px] border border-brand font-pretendard font-semibold text-[16px] text-typo-strong outline-none" />
            </div>
            <div className="flex flex-col gap-3">
              {draft && <span className="font-pretendard font-semibold text-[13px] ai-text">최근 {draft.sessionCount}번 기록에서 자주 한 종목·세트로 만들었어요</span>}
              <div className="flex flex-col">
                {form.items.map((it, i) => (
                  <React.Fragment key={`${it.name}-${i}`}>
                    {i > 0 && <FadeLine />}
                    <div className="flex items-center gap-2 py-2.5">
                      <span className="flex flex-col text-ui-5">
                        <button type="button" aria-label="위로" onClick={() => move(i, -1)} className="h-3 leading-none">▴</button>
                        <IcGrip size={14} />
                        <button type="button" aria-label="아래로" onClick={() => move(i, 1)} className="h-3 leading-none">▾</button>
                      </span>
                      <input value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} className="flex-1 min-w-0 bg-transparent font-pretendard font-medium text-[15px] text-typo-strong outline-none" />
                      <span className="h-9 px-2 rounded-[10px] bg-ui-2 flex items-center gap-0.5 font-pretendard font-semibold text-[14px] text-typo-normal">
                        <input value={it.sets} inputMode="numeric" onChange={(e) => setItem(i, { sets: e.target.value.replace(/\D/g, '').slice(0, 2) })} className="w-5 bg-transparent text-right outline-none" aria-label="세트" />
                        ×
                        <input value={it.reps} onChange={(e) => setItem(i, { reps: e.target.value.slice(0, 8) })} className="w-8 bg-transparent outline-none" aria-label="횟수" />
                      </span>
                      <button type="button" aria-label={`${it.name} 빼기`} onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, j) => j !== i) }))} className="text-ui-5"><IcX size={16} /></button>
                    </div>
                  </React.Fragment>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && addItem()} placeholder="종목 추가" className="flex-1 min-w-0 h-11 px-4 rounded-[14px] border border-ui-4 font-pretendard text-[14px] outline-none focus:border-brand" />
                <button type="button" onClick={addItem} className="h-11 px-4 rounded-[14px] border border-ui-4 flex items-center gap-1 font-pretendard font-semibold text-[14px] text-typo-normal"><IcPlusSmall size={14} />추가</button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-pretendard font-medium text-[13px] text-typo-normal">메모 (선택)</span>
              <textarea value={form.memo} maxLength={100} rows={2} placeholder="따라 하는 친구에게 보일 한마디" onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} className="px-4 py-3 rounded-[14px] border border-ui-4 font-pretendard text-[14px] leading-5 outline-none resize-none focus:border-brand" />
            </div>
          </div>
          <div className="flex-none flex gap-2 px-5 pt-3" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
            <Btn kind="secondary" disabled={saving || !form.items.length} onClick={() => save('draft')}>나만 보기로 저장</Btn>
            <Btn disabled={saving || !form.items.length || !form.title.trim()} onClick={() => save('public')}>친구에게 공개</Btn>
          </div>
        </>
      )}
      <ConfirmModal isOpen={confirmDelete} title={id ? '이 루틴을 지울까요?' : '초안을 버릴까요?'} subtitle={id ? '가져간 친구의 메모는 그대로 남아요' : '같은 조합으로는 다시 만들지 않아요'} confirmText="지우기" confirmVariant="danger" onConfirm={remove} onCancel={() => setConfirmDelete(false)} />
    </Screen>
  );
}
