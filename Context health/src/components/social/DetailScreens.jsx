import React, { useEffect, useRef, useState } from 'react';
import { socialCall, socialErrorMessage, timeAgo } from '../../lib/socialApi';
import { isSaved, toggleSaved, watchSaved } from '../../lib/socialLocal';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Avatar, Btn, EmptyState, FadeLine, Screen, Skeleton, Spinner, Tag, TopBar } from './ui';
import { ActionBar, CURATOR, videoLength, YoutubePlayer } from './FeedPost';
import { IcDown, IcMoreDots, IxBookmark, IxHeart, IxPlay } from './SocialIcons';
import ReportSheet from './ReportSheet';

/* 상세 화면들 (Figma 06-9: 33 큐레이션 루틴 · 37 친구 루틴 · 38 큐레이션 식단, 06-6: 16 기록 상세·댓글, 06-2: 19 채널)
   상세 화면에만 큰 '가져오기' 버튼을 둔다. */

function useDetail(key) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = () => socialCall('post', { key }).then(setData).catch(setError);
  useEffect(() => { load(); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, setData, error, reload: load };
}

function useSaved(uid, key) {
  const [items, setItems] = useState(new Map());
  useEffect(() => watchSaved(uid, setItems), [uid]);
  return isSaved(items, key);
}

function DetailSkeleton() {
  return (
    <div className="px-5 pt-2 flex flex-col gap-6">
      <div className="flex flex-col gap-3"><Skeleton className="w-40 h-4" /><Skeleton className="w-56 h-8" /><Skeleton className="w-48 h-8" /></div>
      {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
    </div>
  );
}

function DetailError({ error, onRetry }) {
  return <EmptyState className="pt-32 px-8" title={socialErrorMessage(error)} sub={error?.code === 'not-found' ? '지운 글이거나 더 이상 볼 수 없어요' : ''} action={error?.code !== 'not-found' && <Btn size="S" full={false} className="px-5" onClick={onRetry}>다시 시도</Btn>} />;
}

/* 아래 고정: [하트(저장)] [큰 가져오기] */
function BottomAction({ label, saved, onSave, onImport, note }) {
  return (
    <div className="flex-none px-5 pt-3 flex flex-col gap-3" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
      {note && <p className="text-center font-pretendard text-[13px] leading-5 text-typo-alternative">{note}</p>}
      <div className="flex gap-2">
        {onSave && (
          <button type="button" onClick={onSave} aria-pressed={saved} aria-label={saved ? '저장 취소' : '저장'} className={`flex-none w-[52px] h-[52px] rounded-[16px] bg-ui-2 flex items-center justify-center ${saved ? 'text-brand' : 'text-typo-normal'}`}>
            <IxBookmark size={22} filled={saved} />
          </button>
        )}
        <Btn onClick={onImport}><IcDown size={15} />{label}</Btn>
      </div>
    </div>
  );
}

function followersNote(f, verb = '가져갔어요') {
  if (!f?.total) return '';
  const head = f.friendName ? `${f.friendName}${f.total > 1 ? ` 외 ${f.total - 1}명이` : '이'} 따라 하는 중` : `${f.total.toLocaleString()}명이 ${verb}`;
  return f.mine ? `${head} · 나도 가져왔어요` : head;
}

/* 영상: 누르면 그 자리에서 재생한다 */
function VideoBox({ video }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="relative w-full aspect-video rounded-[16px] overflow-hidden bg-ui-3">
      {playing ? <YoutubePlayer videoId={video.videoId} /> : (
        <button type="button" onClick={() => setPlaying(true)} aria-label="영상 재생" className="absolute inset-0">
          <img src={video.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center"><span className="w-12 h-12 rounded-full bg-black/55 text-white flex items-center justify-center"><IxPlay size={20} /></span></span>
        </button>
      )}
    </div>
  );
}

/* 댓글 묶음 (루틴·식단 상세 안). 피드의 댓글 아이콘을 누르면 여기로 내려온다.
   ["댓글 N" 머리말 + 목록 16] · 입력 */
function CommentSection({ nav, routeKey, data, reload, focus }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if (focus && data) setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350); }, [Boolean(data)]); // eslint-disable-line react-hooks/exhaustive-deps
  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await nav.requireProfile(async () => { await socialCall('comment-add', { key: routeKey, text: body }); setText(''); await reload(); });
    } catch (e) { nav.toast(socialErrorMessage(e)); }
    setSending(false);
  }
  async function remove(id) {
    try { await socialCall('comment-delete', { id }); await reload(); } catch (e) { nav.toast(socialErrorMessage(e)); }
  }
  const comments = data?.comments || [];
  return (
    <div ref={ref} className="flex flex-col gap-4 scroll-mt-4">
      <span className="font-pretendard font-medium text-[13px] text-typo-alternative">댓글 {comments.length}</span>
      {comments.map((c) => (
        <div key={c.id} className="flex gap-2">
          <Avatar profile={c.author} size={32} onClick={c.author.gone ? undefined : () => nav.push('profile', { uid: c.uid })} />
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <span className="flex items-center gap-2 font-pretendard text-[13px]">
              <span className="font-semibold text-typo-strong">{c.mine ? '나' : c.author.name}</span>
              <span className="text-ui-6">{timeAgo(c.at)}</span>
              {c.mine && <button type="button" onClick={() => remove(c.id)} className="ml-auto text-ui-6 text-[12px]">지우기</button>}
            </span>
            <p className="font-pretendard text-[14px] leading-5 text-typo-normal whitespace-pre-wrap break-words">{c.text}</p>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && send()}
          placeholder={comments.length ? '댓글 달기' : '첫 댓글을 남겨 보세요'}
          maxLength={300}
          className="flex-1 min-w-0 h-[42px] px-4 rounded-full bg-ui-2 font-pretendard text-[14px] text-typo-strong placeholder:text-ui-6 outline-none"
        />
        <button type="button" onClick={send} disabled={!text.trim() || sending} className={`h-[42px] px-4 rounded-full font-pretendard font-semibold text-[14px] text-white ${text.trim() ? 'bg-brand' : 'bg-[rgba(113,113,255,0.3)]'}`}>올리기</button>
      </div>
    </div>
  );
}

/* 루틴 상세: 큐레이션(cur) · 친구 루틴(rt) · 유튜브(yt/post) */
export function RoutineDetailScreen({ nav, routeKey, leaving, focusComments }) {
  const { data, error, reload } = useDetail(routeKey);
  const saved = useSaved(nav.uid, routeKey);
  const c = data?.curation;
  const r = data?.routine;
  const v = data?.video;
  /* 공유 링크(/p/cur:…)로 들어온 식단 큐레이션은 식단 상세로 그린다 */
  if (c?.kind === 'diet' || v?.kind === 'diet') return <DietDetailCurationScreen nav={nav} routeKey={routeKey} leaving={leaving} focusComments={focusComments} />;
  const title = c?.title || r?.title || v?.routineTitle || '';
  const items = c?.items || r?.items || v?.items || [];
  const tags = c ? [...(c.parts || []), `${items.length}종목`, `약 ${c.minutes}분`, c.level] : r ? [...(r.parts || []), `${items.length}종목`] : v ? [...(v.parts || []), `${items.length}종목`, videoLength(v) ? `${videoLength(v)} 영상` : null] : [];

  async function save() {
    const on = !saved;
    const meta = c ? { kind: 'routine', title: title.replace(/\n/g, ' '), sub: `큐레이션 · ${items.length}종목`, tag: '루틴' }
      : r ? { kind: 'routine', title, sub: `${data.owner?.name} · ${items.length}종목`, tag: '루틴' }
      : { kind: 'youtube', title, sub: `유튜브 · ${v.channelName} · ${items.length}종목`, thumbnail: v.thumbnail };
    try { await toggleSaved(nav.uid, routeKey, meta, on); nav.toast(on ? '저장했어요' : '저장을 취소했어요'); } catch { nav.toast('저장하지 못했어요'); }
  }

  return (
    <Screen leaving={leaving}>
      <TopBar onBack={() => nav.pop()} title="" right={r && data?.isMine ? <button type="button" onClick={() => nav.push('routineEdit', { id: r.id })} className="font-pretendard font-semibold text-[15px] text-brand">고치기</button> : <span className="text-typo-alternative"><IcMoreDots size={22} /></span>} />
      {error ? <DetailError error={error} onRetry={reload} /> : !data ? <DetailSkeleton /> : (
        <>
          <div className="flex-1 overflow-y-auto px-5 pt-1 pb-6 flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                {c && <span className="flex items-center gap-2 font-pretendard text-[13px] text-typo-normal"><Avatar profile={CURATOR} size={22} />루틴 소믈리에 · 이번 주</span>}
                {r && (
                  <button type="button" onClick={() => nav.push('profile', { uid: data.owner.uid })} className="flex items-center gap-2 font-pretendard text-[13px] text-left">
                    <Avatar profile={data.owner} size={22} />
                    <span className="font-semibold text-typo-strong">{data.owner.name}</span>
                    {r.sessionCount && <span className="text-typo-alternative">· 실제 기록 {r.sessionCount}회에서 만듦</span>}
                  </button>
                )}
                {v && (
                  <button type="button" onClick={() => nav.push('channel', { channelId: v.channelId })} className="flex items-center gap-2 font-pretendard text-[13px] text-left">
                    <img src="/brand/youtube.png" alt="" className="w-[22px]" />
                    <span className="font-semibold text-typo-strong">{v.channelName}</span><span className="text-typo-alternative">· 유튜브</span>
                  </button>
                )}
                <h2 className="font-pretendard font-bold text-[28px] leading-9 tracking-[-0.7px] text-typo-strong whitespace-pre-line">{title}</h2>
              </div>
              <div className="flex flex-wrap gap-1.5">{tags.filter(Boolean).map((t, i) => <Tag key={t} tone={i < (c?.parts || r?.parts || v?.parts || []).length ? 'purple' : 'gray'}>{t}</Tag>)}</div>
              {(c?.description || r?.memo) && <p className="font-pretendard text-[14px] leading-[22px] text-typo-normal">{c?.description || r?.memo}</p>}
              {v && (
                <VideoBox video={v} />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col">
                {items.map((it, i) => (
                  <React.Fragment key={`${it.name}-${i}`}>
                    {i > 0 && <FadeLine />}
                    <div className="flex items-center gap-3 py-3">
                      <span className="w-6 h-6 rounded-full bg-ui-2 flex-none flex items-center justify-center font-pretendard font-semibold text-[12px] text-typo-secondary">{i + 1}</span>
                      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <span className="font-pretendard font-semibold text-[15px] leading-[22px] text-typo-strong">{it.name}</span>
                        {(it.restSec || it.at || it.note) && (
                          <span className="font-pretendard text-[12px] leading-[18px] text-ui-6">{[it.at && `영상 ${it.at}`, it.restSec && `휴식 ${it.restSec >= 60 ? `${Math.round(it.restSec / 6) / 10}분` : `${it.restSec}초`}`, it.note].filter(Boolean).join(' · ')}</span>
                        )}
                      </span>
                      <span className="font-pretendard font-medium text-[14px] text-typo-normal flex-none">{/^\d/.test(String(it.reps)) ? `${it.sets} × ${it.reps}` : `${it.sets}세트 · ${it.reps}`}</span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
              {c?.source && <p className="font-pretendard text-[12px] leading-[18px] text-ui-6">출처 · {c.source}</p>}
            </div>
            {v?.tips?.length > 0 && (
              <div className="rounded-[14px] bg-ui-1 px-4 py-3 flex flex-col gap-1">
                <span className="font-pretendard font-medium text-[12px] text-typo-alternative">영상 속 팁</span>
                {v.tips.map((t) => <p key={t} className="font-pretendard text-[14px] leading-5 text-typo-normal">{t}</p>)}
              </div>
            )}
            <CommentSection nav={nav} routeKey={routeKey} data={data} reload={reload} focus={focusComments} />
          </div>
          <BottomAction
            label={r && data.owner ? '내 무게로 가져오기' : '내 메모로 가져오기'}
            saved={saved}
            onSave={data.isMine ? null : save}
            onImport={() => nav.startImport({ key: routeKey, detail: data })}
            note={followersNote(data.followers)}
          />
        </>
      )}
    </Screen>
  );
}

/* 큐레이션 식단 상세 (38) */
export function DietDetailCurationScreen({ nav, routeKey, leaving, focusComments }) {
  const { data, error, reload } = useDetail(routeKey);
  const saved = useSaved(nav.uid, routeKey);
  /* 큐레이션 식단, 또는 유튜브에서 정리한 식단 영상 */
  const video = data?.video?.kind === 'diet' ? data.video : null;
  const c = data?.curation || (video ? { title: video.routineTitle, meals: video.meals, totals: video.totals, kind: 'diet' } : null);
  async function save() {
    try { await toggleSaved(nav.uid, routeKey, { kind: 'diet', title: c.title.replace(/\n/g, ' '), sub: `${video ? `유튜브 · ${video.channelName}` : '큐레이션'} · ${c.totals.kcal.toLocaleString()}kcal`, tag: '식단', thumbnail: video?.thumbnail }, !saved); nav.toast(!saved ? '저장했어요' : '저장을 취소했어요'); } catch { nav.toast('저장하지 못했어요'); }
  }
  return (
    <Screen leaving={leaving}>
      <TopBar onBack={() => nav.pop()} title="" />
      {error ? <DetailError error={error} onRetry={reload} /> : !c ? <DetailSkeleton /> : (
        <>
          <div className="flex-1 overflow-y-auto px-5 pt-1 pb-6 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              {video ? (
                <button type="button" onClick={() => nav.push('channel', { channelId: video.channelId })} className="flex items-center gap-2 font-pretendard text-[13px] text-left">
                  <img src="/brand/youtube.png" alt="" className="w-[22px]" />
                  <span className="font-semibold text-typo-strong">{video.channelName}</span><span className="text-typo-alternative">· 유튜브</span>
                </button>
              ) : <span className="flex items-center gap-2 font-pretendard text-[13px] text-typo-normal"><Avatar profile={CURATOR} size={22} />루틴 소믈리에 · 식단</span>}
              <h2 className="font-pretendard font-bold text-[28px] leading-9 tracking-[-0.7px] text-typo-strong whitespace-pre-line">{c.title}</h2>
            </div>
            {video && <VideoBox video={video} />}
            <div className="rounded-[16px] bg-ui-1 py-4 grid grid-cols-4">
              {[[c.totals.kcal.toLocaleString(), 'kcal'], [`${c.totals.carb}g`, '탄수'], [`${c.totals.protein}g`, '단백질'], [`${c.totals.fat}g`, '지방']].map(([v, l], i) => (
                <div key={l} className="flex flex-col items-center gap-0.5">
                  <span className={`font-pretendard font-bold text-[18px] leading-7 ${i === 2 ? 'text-brand' : 'text-typo-strong'}`}>{v}</span>
                  <span className="font-pretendard text-[11px] leading-4 text-typo-alternative">{l}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-6">
              {c.meals.map((m) => (
                <div key={m.id} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between font-pretendard text-[15px]">
                    <span className="font-semibold text-typo-strong">{m.name}</span>
                    <span className="text-brand">{m.foods.reduce((s, f) => s + f.kcal, 0)}kcal</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {m.foods.map((f) => (
                      <div key={f.name} className="flex items-center justify-between font-pretendard text-[14px] leading-5">
                        <span className="text-typo-normal">{f.name}</span><span className="text-ui-6">{f.kcal}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <CommentSection nav={nav} routeKey={routeKey} data={data} reload={reload} focus={focusComments} />
          </div>
          <BottomAction label="내 식단으로 가져오기" saved={saved} onSave={save} onImport={() => nav.startImport({ key: routeKey, detail: data })} note={[video ? '영양 수치는 영상 기준 추정치예요' : '', followersNote(data.followers)].filter(Boolean).join(' · ')} />
        </>
      )}
    </Screen>
  );
}

/* 기록 상세 · 댓글 (16) */
export function PostDetailScreen({ nav, routeKey, focusComments, commentId, leaving }) {
  const { data, setData, error, reload } = useDetail(routeKey);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [menu, setMenu] = useState(null);
  const [reportFor, setReportFor] = useState(null);
  const [editing, setEditing] = useState(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const clapWant = useRef(null);
  const w = data?.workout;

  useEffect(() => {
    if (!data) return;
    if (focusComments || commentId) setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }, [Boolean(data)]); // eslint-disable-line react-hooks/exhaustive-deps

  async function clap() {
    const prev = data.counts;
    const want = !prev.clapped;
    clapWant.current = want;
    setData((d) => ({ ...d, counts: { ...prev, clapped: want, claps: Math.max(0, (prev.claps || 0) + (want ? 1 : -1)) } }));
    try {
      const res = await socialCall('clap', { key: routeKey, on: want });
      if (clapWant.current === want) setData((d) => ({ ...d, counts: res.counts }));
    } catch (e) {
      if (clapWant.current === want) setData((d) => ({ ...d, counts: prev }));
      nav.toast(socialErrorMessage(e));
    }
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await nav.requireProfile(async () => {
        if (editing) await socialCall('comment-edit', { id: editing, text: body });
        else await socialCall('comment-add', { key: routeKey, text: body });
        setText('');
        setEditing(null);
        await reload();
      });
    } catch (e) { nav.toast(socialErrorMessage(e)); }
    setSending(false);
  }

  async function remove(id) {
    setMenu(null);
    try { await socialCall('comment-delete', { id }); await reload(); } catch (e) { nav.toast(socialErrorMessage(e)); }
  }

  const pressTimer = useRef(null);
  const longPress = (c) => ({
    onPointerDown: () => { pressTimer.current = setTimeout(() => setMenu(c), 500); },
    onPointerUp: () => clearTimeout(pressTimer.current),
    onPointerLeave: () => clearTimeout(pressTimer.current),
    onContextMenu: (e) => { e.preventDefault(); setMenu(c); },
  });

  return (
    <Screen leaving={leaving}>
      <TopBar onBack={() => nav.pop()} title={data ? `${data.isMine ? '내 기록' : data.owner?.name} · ${w?.title?.replace(/,\s*/g, '·') || (data.diet ? '식단' : '')}` : ''} />
      {error ? <DetailError error={error} onRetry={reload} /> : !data ? <DetailSkeleton /> : (
        <>
          <div className="flex-1 overflow-y-auto px-5 pt-2 pb-6 flex flex-col gap-6">
            {/* 식단 스토리에서 들어온 경우: 하루 칼로리·탄단지만 */}
            {!w && data.diet && (
              <div className="rounded-[20px] bg-ui-1 px-5 py-5 flex flex-col gap-3">
                <span className="font-pretendard font-bold text-[15px] text-typo-strong">식단 · {data.diet.kcal.toLocaleString()}kcal</span>
                <span className="font-pretendard text-[14px] text-typo-normal">탄 {data.diet.carb}g · 단 {data.diet.protein}g · 지 {data.diet.fat}g</span>
                <button type="button" onClick={clap} aria-pressed={data.counts.clapped} className={`self-start flex items-center gap-1 font-pretendard font-semibold text-[13px] ${data.counts.clapped ? 'text-[#FF5A6E]' : 'text-typo-normal'}`}>
                  <IxHeart size={18} filled={data.counts.clapped} />박수 {data.counts.claps}
                </button>
              </div>
            )}
            {w && (
            <div className="rounded-[20px] bg-ui-1 px-5 py-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-pretendard font-bold text-[15px] text-typo-strong">{w.title.replace(/,\s*/g, ' · ')}</span>
                <span className="font-pretendard text-[13px] text-brand">{timeAgo(w.at)}</span>
              </div>
              <div className="flex flex-col gap-2">
                {w.exercises.map((e) => (
                  <div key={e.name} className="flex items-center justify-between font-pretendard text-[14px] leading-5">
                    <span className="text-typo-normal truncate">{e.name}</span><span className="text-typo-secondary flex-none">{e.sets}</span>
                  </div>
                ))}
              </div>
              {w.comment && <p className="font-pretendard text-[13px] leading-5 text-brand">{w.comment}</p>}
              <div className="flex items-center justify-between pt-1">
                <button type="button" onClick={clap} aria-pressed={data.counts.clapped} className={`flex items-center gap-1 font-pretendard font-semibold text-[13px] ${data.counts.clapped ? 'text-[#FF5A6E]' : 'text-typo-normal'}`}>
                  <IxHeart size={18} filled={data.counts.clapped} />박수 {data.counts.claps}
                </button>
                {!data.isMine && <button type="button" onClick={() => nav.startImport({ key: routeKey, detail: data })} className="flex items-center gap-1 font-pretendard font-semibold text-[13px] text-brand"><IcDown size={14} />이 운동 가져오기</button>}
              </div>
            </div>
            )}
            <div ref={listRef} className="flex flex-col gap-4">
              <span className="font-pretendard font-medium text-[13px] text-typo-alternative">댓글 {data.comments.length}</span>
              {data.comments.length === 0 && <p className="font-pretendard text-[14px] text-ui-6">첫 댓글을 남겨 보세요</p>}
              {data.comments.map((c) => (
                <div key={c.id} className={`flex gap-2 select-none ${commentId === c.id ? 'bg-brand-light -mx-2 px-2 py-1 rounded-[12px]' : ''}`} {...longPress(c)}>
                  <Avatar profile={c.author} size={32} onClick={c.author.gone ? undefined : () => nav.push('profile', { uid: c.uid })} />
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <span className="flex items-center gap-2 font-pretendard text-[13px]">
                      <span className="font-semibold text-typo-strong">{c.mine ? '나' : c.author.name}</span>
                      <span className="text-ui-6">{timeAgo(c.at)}{c.editedAt ? ' · 수정됨' : ''}</span>
                    </span>
                    <p className="font-pretendard text-[14px] leading-5 text-typo-normal whitespace-pre-wrap break-words">{c.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-none flex items-center gap-2 px-4 pt-2 border-t border-ui-2" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && send()}
              placeholder={editing ? '댓글 고치기' : '댓글 달기 · @로 친구 부르기'}
              maxLength={300}
              className="flex-1 min-w-0 h-[42px] px-4 rounded-full bg-ui-2 font-pretendard text-[14px] text-typo-strong placeholder:text-ui-6 outline-none"
            />
            <button type="button" onClick={send} disabled={!text.trim() || sending} aria-label="보내기" className={`w-9 h-9 rounded-full flex items-center justify-center text-white transition-colors ${text.trim() ? 'bg-brand' : 'bg-[rgba(113,113,255,0.3)]'}`}>
              {sending ? <Spinner size={14} className="border-white/40 border-t-white" /> : <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </button>
          </div>
          {menu && (
            <div className="absolute inset-0 z-50" onClick={() => setMenu(null)}>
              <div className="absolute inset-0 bg-black/30" />
              <div className="absolute inset-x-4 bottom-6 rounded-[16px] bg-white overflow-hidden" onClick={(e) => e.stopPropagation()}>
                {menu.mine && <button type="button" onClick={() => { setEditing(menu.id); setText(menu.text); setMenu(null); setTimeout(() => inputRef.current?.focus(), 50); }} className="w-full h-14 font-pretendard font-medium text-[16px] text-typo-strong">고치기</button>}
                {(menu.mine || data.isMine) && (<><FadeLine /><button type="button" onClick={() => remove(menu.id)} className="w-full h-14 font-pretendard font-medium text-[16px] text-state-danger">지우기</button></>)}
                {!menu.mine && (<><FadeLine /><button type="button" onClick={() => { const c = menu; setMenu(null); setReportFor({ key: routeKey, commentId: c.id, what: '댓글' }); }} className="w-full h-14 font-pretendard font-medium text-[16px] text-state-danger">신고하기</button></>)}
                {!menu.mine && data.isMine && (<><FadeLine /><button type="button" onClick={() => { setMenu(null); nav.push('profile', { uid: menu.uid }); }} className="w-full h-14 font-pretendard font-medium text-[16px] text-typo-normal">{menu.author.name}님 프로필 · 차단</button></>)}
              </div>
            </div>
          )}
          <ReportSheet target={reportFor} onClose={() => setReportFor(null)} toast={nav.toast} />
        </>
      )}
    </Screen>
  );
}

/* 채널 페이지 (19) — 우리가 만든 프로필이 아니라 누군가 이 채널 영상을 가져올 때 생긴다 */
export function ChannelScreen({ nav, channelId, leaving }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState('imports');
  const [following, setFollowing] = useState(false);
  const load = () => { setError(null); socialCall('channel', { channelId }).then((d) => { setData(d); setFollowing(d.following); }).catch(setError); };
  useEffect(load, [channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleFollow() {
    const ref = doc(db, 'users', nav.uid, 'channelFollows', channelId);
    const next = !following;
    setFollowing(next);
    try { if (next) await setDoc(ref, { name: data.channel.name, at: Date.now() }); else await deleteDoc(ref); } catch { setFollowing(!next); nav.toast('잠시 후 다시 시도해 주세요'); }
  }

  const list = data ? [...data.routines].sort((a, b) => (sort === 'imports' ? (b.imports || 0) - (a.imports || 0) : b.at - a.at)) : [];
  return (
    <Screen leaving={leaving} bg="bg-ui-1">
      <div className="bg-white"><TopBar onBack={() => nav.pop()} title="" /></div>
      {error ? <DetailError error={error} onRetry={load} /> : !data ? <DetailSkeleton /> : (
        <div className="flex-1 overflow-y-auto">
          <div className="bg-white px-5 pb-6 flex flex-col items-center gap-4">
            <span className="w-[72px] h-[72px] rounded-full bg-ui-1 border border-ui-3 flex items-center justify-center"><img src="/brand/youtube.png" alt="" className="w-10" /></span>
            <div className="flex flex-col items-center gap-1">
              <span className="flex items-center gap-2"><span className="font-pretendard font-bold text-[22px] leading-[30px] text-typo-strong">{data.channel.name}</span><Tag tone="gray">유튜브 채널</Tag></span>
              <span className="font-pretendard text-[13px] leading-5 text-typo-alternative">이 채널 영상에서 가져온 루틴 {data.routines.length}개 · {data.totalImports.toLocaleString()}명이 가져감</span>
            </div>
            <div className="w-full flex gap-2">
              <Btn size="S" kind={following ? 'secondary' : 'primary'} onClick={toggleFollow}>{following ? '팔로우 중' : '팔로우'}</Btn>
              <Btn size="S" kind="secondary" onClick={() => window.open(data.channel.url, '_blank', 'noopener')}>유튜브에서 보기</Btn>
            </div>
          </div>
          <div className="px-4 pt-5 pb-10 flex flex-col gap-4">
            <div className="flex gap-2">
              {[['imports', '가져간 순'], ['recent', '최신순']].map(([id, label]) => (
                <button key={id} type="button" onClick={() => setSort(id)} className={`h-[34px] px-3 rounded-full font-pretendard font-semibold text-[13px] ${sort === id ? 'bg-typo-strong text-white' : 'bg-white text-typo-normal border border-ui-3'}`}>{label}</button>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              {list.map((r) => (
                <button key={r.videoId} type="button" onClick={() => nav.push('routine', { key: `yt:${r.videoId}` })} className="w-full flex items-center gap-4 p-4 rounded-[20px] bg-white text-left">
                  <span className="relative w-[104px] h-16 rounded-[12px] overflow-hidden flex-none bg-ui-3">
                    <img src={r.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center"><span className="w-7 h-7 rounded-full bg-black/55 text-white flex items-center justify-center"><IxPlay size={12} /></span></span>
                  </span>
                  <span className="flex-1 min-w-0 flex flex-col gap-1">
                    <span className="font-pretendard font-semibold text-[15px] leading-[22px] text-typo-strong line-clamp-2">{r.routineTitle || r.title}</span>
                    <span className="font-pretendard text-[13px] leading-5 text-typo-alternative">{[(r.parts || []).join('·'), `${r.items.length}종목`, `${(r.imports || 0).toLocaleString()}명`].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Screen>
  );
}

export { ActionBar };
