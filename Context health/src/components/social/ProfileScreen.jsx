import React, { useState } from 'react';
import { socialCall, socialErrorMessage, timeAgo } from '../../lib/socialApi';
import { Avatar, Btn, EmptyState, FadeLine, Screen, Sheet, Skeleton, Tabs, Tag, TopBar, useAsync } from './ui';
import { IcDown, IcLock, IcMoreDots, IcPlusSmall } from './SocialIcons';

/* 프로필 (Figma 12 친구 · 13 친구 아님 · 23 내 프로필 · 24 최고 기록 · 35 요청 받음 · 36 친구 루틴 탭 · 27 끊기/차단)
   관계에 따라 보이는 것이 다르다 (IA 4-2). */

/* 하위 탭도 위 숫자(운동·식단·친구)에 맞춰 기록 · 식단 · 최고 기록. 루틴은 기록 탭 아래로 옮겼다. */
const TABS = [{ id: 'records', label: '기록' }, { id: 'diet', label: '식단' }, { id: 'best', label: '최고 기록' }];
const DAYS = ['월', '화', '수', '목', '금', '토', '일'];

function Stat({ value, label }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-1">
      <span className="font-pretendard font-bold text-[22px] leading-[30px] text-typo-strong">{value == null ? '–' : value.toLocaleString()}</span>
      <span className="font-pretendard text-[12px] leading-[18px] text-typo-alternative">{label}</span>
    </div>
  );
}

function Week({ week }) {
  if (!week) return null;
  const monday = new Date(`${week.mondayKey}T00:00:00Z`);
  const keys = DAYS.map((_, i) => new Date(monday.getTime() + i * 86400000).toISOString().slice(0, 10));
  const parts = [...new Set(Object.values(week.days).flat())].slice(0, 5);
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  return (
    <div className="rounded-[20px] bg-white px-5 py-5 flex flex-col gap-2">
      <div className="flex items-center">
        <span className="w-12 font-pretendard text-[12px] text-typo-normal">이번 주</span>
        {DAYS.map((d, i) => <span key={d} className={`flex-1 text-center font-pretendard text-[11px] ${keys[i] === today ? 'text-brand font-semibold' : 'text-ui-6'}`}>{d}</span>)}
      </div>
      {parts.length === 0 ? <p className="font-pretendard text-[13px] text-ui-6 py-2">이번 주 기록이 아직 없어요</p> : parts.map((p) => (
        <div key={p} className="flex items-center h-7">
          <span className="w-12 font-pretendard text-[13px] text-typo-normal truncate">{p}</span>
          {keys.map((k) => (
            <span key={k} className="flex-1 flex justify-center">
              <span className={`w-[22px] h-[22px] rounded-[6px] ${(week.days[k] || []).includes(p) ? 'bg-gradient-to-br from-[#8F8FFF] to-[#7171FF]' : k > today ? 'bg-transparent' : 'bg-ui-2'}`} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function WorkoutCard({ w, counts, nav, isMine }) {
  const key = `log:${w.id}`;
  return (
    <div className="rounded-[20px] bg-white px-5 py-5 flex flex-col gap-3">
      <button type="button" onClick={() => nav.push('post', { key })} className="flex flex-col gap-3 text-left">
        <span className="flex items-center justify-between">
          <span className="font-pretendard font-bold text-[15px] text-typo-strong">{w.title.replace(/,\s*/g, ' · ')}</span>
          <span className="font-pretendard text-[13px] text-brand">{timeAgo(w.at)}</span>
        </span>
        <span className="flex flex-col gap-2">
          {w.exercises.slice(0, 4).map((e) => (
            <span key={e.name} className="flex items-center justify-between font-pretendard text-[14px] leading-5">
              <span className="text-typo-normal truncate">{e.name}</span><span className="text-typo-secondary flex-none">{e.sets}</span>
            </span>
          ))}
        </span>
      </button>
      <FadeLine />
      <div className="flex items-center justify-between">
        <span className="font-pretendard text-[13px] text-typo-alternative">박수 {counts?.claps || 0} · 댓글 {counts?.comments || 0}</span>
        {!isMine && <button type="button" onClick={() => nav.startImport({ key })} className="flex items-center gap-1 font-pretendard font-semibold text-[13px] text-brand"><IcDown size={14} />가져오기</button>}
      </div>
    </div>
  );
}

function RoutineCard({ r, nav, isMine }) {
  const key = `rt:${r.id}`;
  return (
    <div className="rounded-[20px] bg-white px-5 py-5 flex flex-col gap-3">
      <button type="button" onClick={() => nav.push('routine', { key })} className="flex flex-col gap-1 text-left">
        <span className="flex items-center gap-2">
          <span className="font-pretendard font-bold text-[17px] leading-[26px] text-typo-strong">{r.title}</span>
          {isMine && <Tag tone={r.status === 'public' ? 'purple' : 'gray'}>{r.status === 'public' ? '공개' : '나만'}</Tag>}
        </span>
        <span className="font-pretendard text-[13px] leading-5 text-typo-alternative">{[r.parts.join(' · '), `${r.items.length}종목`].filter(Boolean).join(' · ')}</span>
      </button>
      {!isMine && (
        <>
          <FadeLine />
          <Btn size="S" onClick={() => nav.startImport({ key })}><IcDown size={14} />내 메모로 가져오기</Btn>
        </>
      )}
    </div>
  );
}

/* 식단 탭: 최근 7일 평균 + 날짜별 칼로리·탄단지 (음식 이름은 보여주지 않는다) */
function DietTab({ diets, isSelf }) {
  if (!diets.length) return <EmptyState className="py-10" title="최근 식단 기록이 없어요" />;
  const week = diets.filter((d) => Date.now() - d.at < 7 * 86400000);
  const avg = (k) => (week.length ? Math.round(week.reduce((s, d) => s + d[k], 0) / week.length) : 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[20px] bg-white px-5 py-5 flex flex-col gap-3">
        <span className="font-pretendard text-[13px] text-typo-alternative">최근 7일 하루 평균</span>
        <div className="grid grid-cols-4">
          {[[avg('kcal').toLocaleString(), 'kcal'], [`${avg('carb')}g`, '탄수'], [`${avg('protein')}g`, '단백질'], [`${avg('fat')}g`, '지방']].map(([v, l], i) => (
            <div key={l} className="flex flex-col items-center gap-0.5">
              <span className={`font-pretendard font-bold text-[18px] leading-7 ${i === 2 ? 'text-brand' : 'text-typo-strong'}`}>{v}</span>
              <span className="font-pretendard text-[11px] text-typo-alternative">{l}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-[20px] bg-white px-5 py-1">
        {diets.slice(0, 14).map((d, i) => {
          const total = d.carb * 4 + d.protein * 4 + d.fat * 9 || 1;
          return (
            <React.Fragment key={d.id}>
              {i > 0 && <FadeLine />}
              <div className="py-3 flex flex-col gap-2">
                <div className="flex items-center justify-between font-pretendard">
                  <span className="text-[14px] text-typo-normal">{d.date.slice(5).replace('-', '. ')}{d.meals ? ` · ${d.meals}끼` : ''}</span>
                  <span className="font-semibold text-[15px] text-typo-strong">{d.kcal.toLocaleString()}kcal</span>
                </div>
                <div className="flex h-1.5 rounded-full overflow-hidden bg-ui-2">
                  <span style={{ width: `${(d.carb * 4 / total) * 100}%`, background: '#FFB547' }} />
                  <span style={{ width: `${(d.protein * 4 / total) * 100}%`, background: '#7171FF' }} />
                  <span style={{ width: `${(d.fat * 9 / total) * 100}%`, background: '#3ECF8E' }} />
                </div>
                <span className="font-pretendard text-[12px] text-typo-alternative">탄 {d.carb}g · 단 {d.protein}g · 지 {d.fat}g</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      {!isSelf && <p className="px-1 font-pretendard text-[12px] text-ui-6">하루 칼로리·탄단지만 보여요 · 음식 이름은 보이지 않아요</p>}
    </div>
  );
}

function BestTab({ best, isSelf, nav, reload }) {
  const [menu, setMenu] = useState(null);
  if (!best) return <Locked title="친구가 되면 최고 기록을 볼 수 있어요" />;
  const big = [['벤치', best.big3.bench], ['스쿼트', best.big3.squat], ['데드', best.big3.dead]];
  async function hide(rec) {
    setMenu(null);
    try { await socialCall('best-hide', { recordId: rec.id }); nav.toast('이 기록을 친구에게 숨겼어요'); reload(); } catch (e) { nav.toast(socialErrorMessage(e)); }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {big.map(([label, rec]) => (
          <div key={label} className="rounded-[16px] bg-white px-4 py-3 flex flex-col gap-1">
            <span className="font-pretendard text-[12px] text-typo-alternative">{label}</span>
            <span className="font-pretendard font-bold text-[20px] leading-7 text-typo-strong">{rec ? `${rec.weightKg}kg` : '–'}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <div className="rounded-[20px] bg-white px-5 py-1">
          {best.list.length === 0 && <p className="py-5 font-pretendard text-[14px] text-ui-6">무게를 적은 기록이 아직 없어요</p>}
          {best.list.map((rec, i) => (
            <React.Fragment key={rec.id}>
              {i > 0 && <FadeLine />}
              <button type="button" onContextMenu={(e) => { e.preventDefault(); if (isSelf) setMenu(rec); }} onClick={() => isSelf && setMenu(rec)} className="w-full flex items-center gap-3 py-3 text-left">
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="flex items-center gap-2"><span className="font-pretendard font-semibold text-[15px] text-typo-strong truncate">{rec.name}</span>{rec.isNew && <span className="h-5 px-1.5 rounded-full bg-red-orange text-white font-pretendard font-bold text-[10px] flex items-center">NEW</span>}</span>
                  <span className="font-pretendard text-[12px] text-typo-alternative">{rec.date.slice(5).replace('-', '. ')}{rec.est1rm ? ` · 예상 1RM ${Math.round(rec.est1rm)}kg` : ''}</span>
                </span>
                <span className="font-pretendard font-bold text-[16px] text-brand flex-none">{rec.weightKg}kg × {rec.reps}</span>
              </button>
            </React.Fragment>
          ))}
        </div>
        <p className="font-pretendard text-[12px] leading-[18px] text-ui-6">기록에서 자동으로 계산해요 · 본인은 잘못 적은 기록을 숨길 수 있어요</p>
      </div>
      <Sheet open={Boolean(menu)} onClose={() => setMenu(null)}>
        {menu && (<><SheetHead title={`${menu.name} ${menu.weightKg}kg × ${menu.reps}`} sub="잘못 적은 기록이면 친구에게 숨길 수 있어요" /><Btn kind="secondary" onClick={() => hide(menu)}>친구에게 숨기기</Btn></>)}
      </Sheet>
    </div>
  );
}

function SheetHead({ title, sub }) {
  return <div className="flex flex-col gap-1"><h2 className="font-pretendard font-bold text-[18px] text-typo-strong">{title}</h2><p className="font-pretendard text-[14px] text-typo-alternative">{sub}</p></div>;
}

function Locked({ title, sub, routines, nav }) {
  return (
    <div className="flex flex-col gap-8 pt-6">
      <EmptyState icon={<IcLock size={24} />} title={title} sub={sub} />
      {routines?.length > 0 && (
        <div className="rounded-[16px] bg-white px-4 py-4 flex flex-col gap-1">
          <span className="font-pretendard text-[12px] text-typo-alternative">공개 루틴 {routines.length}</span>
          {routines.map((r, i) => (
            <React.Fragment key={r.id}>
              {i > 0 && <FadeLine />}
              <div className="flex items-center justify-between py-2">
                <button type="button" onClick={() => nav.push('routine', { key: `rt:${r.id}` })} className="font-pretendard font-semibold text-[14px] text-typo-strong text-left">{r.title}</button>
                <button type="button" onClick={() => nav.startImport({ key: `rt:${r.id}` })} className="flex items-center gap-1 font-pretendard text-[12px] text-brand"><IcDown size={12} />가져오기</button>
              </div>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/* 친구 ✓ 를 누르면: 끊기 · 차단 (27) */
export function FriendActionSheet({ open, onClose, profile, nav, onDone }) {
  const [busy, setBusy] = useState(false);
  async function act(action, msg) {
    setBusy(true);
    try { await socialCall(action, { uid: profile.uid }); nav.toast(msg); onDone?.(); onClose(); } catch (e) { nav.toast(socialErrorMessage(e)); }
    setBusy(false);
  }
  return (
    <Sheet open={open} onClose={onClose} label="친구 관리">
      {profile && (
        <>
          <div className="flex flex-col items-center gap-2"><Avatar profile={profile} size={56} /><span className="font-pretendard font-bold text-[18px] text-typo-strong">{profile.name}</span></div>
          <div className="flex flex-col gap-2">
            <button type="button" disabled={busy} onClick={() => act('friend-remove', '친구를 끊었어요')} className="rounded-[16px] bg-ui-1 px-4 py-4 flex flex-col gap-1 text-left">
              <span className="font-pretendard font-bold text-[16px] text-typo-strong">친구 끊기</span>
              <span className="font-pretendard text-[13px] leading-5 text-typo-alternative">서로 기록·스토리가 바로 안 보여요 · 상대에게 알리지 않아요 · 가져온 루틴은 남아요</span>
            </button>
            <button type="button" disabled={busy} onClick={() => act('block', '차단했어요')} className="rounded-[16px] bg-state-danger-weak px-4 py-4 flex flex-col gap-1 text-left">
              <span className="font-pretendard font-bold text-[16px] text-state-danger">차단</span>
              <span className="font-pretendard text-[13px] leading-5 text-typo-alternative">끊기 + 서로 검색·피드·알림·댓글에서 사라져요 · 상대는 몰라요</span>
            </button>
          </div>
          <Btn kind="secondary" onClick={onClose}>닫기</Btn>
        </>
      )}
    </Sheet>
  );
}

const IcGear = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

/* 마이 탭: 내 프로필이 먼저 보이고, 오른쪽 위 톱니바퀴로 설정(예전 마이 화면)을 연다 */
export function MyTab({ nav, active }) {
  const me = nav.me?.profile;
  const gear = <button type="button" aria-label="설정" onClick={() => nav.push('settings', {})} className="text-typo-strong"><IcGear /></button>;
  if (!nav.me) {
    return <div className="h-full flex flex-col bg-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}><TopBar title="" right={gear} /><div className="px-5 pt-2 flex flex-col gap-4"><div className="flex items-center gap-5"><Skeleton className="w-[76px] h-[76px] rounded-full" /><Skeleton className="flex-1 h-12" /></div><Skeleton className="w-32 h-5" /></div></div>;
  }
  if (!me?.handle) {
    return (
      <div className="h-full flex flex-col bg-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <TopBar title="마이" right={gear} />
        <EmptyState
          className="pt-28 px-8"
          icon={<IcPlusSmall size={22} />}
          title="내 프로필을 만들어 보세요"
          sub={'아이디를 정하면 친구와 운동 기록을 나누고\n루틴을 공개할 수 있어요'}
          action={<Btn size="M" full={false} className="px-6" onClick={() => nav.requireProfile(() => nav.refreshMe())}>프로필 만들기</Btn>}
        />
      </div>
    );
  }
  return <ProfileScreen nav={nav} uid={nav.uid} asTab active={active} headerRight={gear} />;
}

export default function ProfileScreen({ nav, uid, initialTab = 'records', leaving, asTab = false, active = true, headerRight = null }) {
  const { data, error, loading, reload, setData } = useAsync(() => socialCall('profile', { uid }), [uid]);
  /* 탭으로 쓸 때는 다시 들어올 때마다 새로 불러온다 */
  const firstActive = React.useRef(true);
  React.useEffect(() => {
    if (!asTab || !active) return;
    if (firstActive.current) { firstActive.current = false; return; }
    reload();
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const [tab, setTab] = useState(initialTab);
  const [actionOpen, setActionOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rel = data?.relation;
  const p = data?.profile;
  const isSelf = rel === 'self';

  async function act(action, { msg, profileNeeded = true } = {}) {
    setBusy(true);
    try {
      const run = async () => { const res = await socialCall(action, { uid }); if (msg) nav.toast(msg); if (res?.relation) setData((d) => ({ ...d, relation: res.relation })); if (res?.relation === 'friend') reload(); };
      if (profileNeeded) await nav.requireProfile(run); else await run();
    } catch (e) { nav.toast(socialErrorMessage(e)); }
    setBusy(false);
  }

  async function poke() {
    try { const r = await socialCall('poke', { uid }); nav.toast(r.ok ? `${p.name}님을 콕 찔렀어요` : '오늘은 이미 콕 찔렀어요'); } catch (e) { nav.toast(socialErrorMessage(e)); }
  }

  if (rel === 'gone' || rel === 'blockedBy') {
    return (
      <Screen leaving={leaving}>
        <TopBar onBack={() => nav.pop()} title="" />
        <EmptyState className="pt-32" title={rel === 'gone' ? '탈퇴한 사용자예요' : '찾을 수 없는 사용자예요'} />
      </Screen>
    );
  }

  const buttons = !data ? null : isSelf ? (
    <><Btn size="S" kind="secondary" onClick={() => nav.push('profileEdit', {})}>프로필 편집</Btn><Btn size="S" kind="secondary" onClick={() => nav.push('visibility', {})}>공개 범위</Btn></>
  ) : rel === 'friend' ? (
    <><Btn size="S" kind="secondary" onClick={() => setActionOpen(true)}>친구 ✓</Btn><Btn size="S" onClick={poke}>콕 찌르기</Btn></>
  ) : rel === 'requested' ? (
    <Btn size="S" kind="tint" disabled={busy} onClick={() => act('friend-cancel', { msg: '요청을 취소했어요', profileNeeded: false })}>요청 보냄</Btn>
  ) : rel === 'incoming' ? (
    <><Btn size="S" kind="secondary" disabled={busy} onClick={() => act('friend-decline', { profileNeeded: false })}>거절</Btn><Btn size="S" disabled={busy} onClick={() => act('friend-accept', { msg: `${p.name}님과 친구가 됐어요` })}>수락</Btn></>
  ) : rel === 'blocked' ? (
    <Btn size="S" kind="secondary" disabled={busy} onClick={() => act('unblock', { msg: '차단을 풀었어요', profileNeeded: false })}>차단 해제</Btn>
  ) : (
    <Btn size="S" disabled={busy} onClick={() => act('friend-request', { msg: '친구 요청을 보냈어요' })}>친구 요청</Btn>
  );

  const locked = rel === 'none' || rel === 'requested' || rel === 'incoming';

  const content = (
    <>
      <TopBar onBack={asTab ? null : () => nav.pop()} title={p?.handle || ''} right={headerRight || (!isSelf && rel === 'friend' ? <button type="button" aria-label="더보기" onClick={() => setActionOpen(true)} className="text-typo-strong"><IcMoreDots size={22} /></button> : null)} />
      <div className="flex-1 overflow-y-auto flex flex-col">
        {loading && !data ? (
          <div className="px-5 pt-2 flex flex-col gap-4"><div className="flex items-center gap-5"><Skeleton className="w-[76px] h-[76px] rounded-full" /><Skeleton className="flex-1 h-12" /></div><Skeleton className="w-32 h-5" /><Skeleton className="h-10" /></div>
        ) : error ? (
          <EmptyState className="pt-32" title={socialErrorMessage(error)} action={<Btn size="S" full={false} className="px-5" onClick={reload}>다시 시도</Btn>} />
        ) : (
          <>
            {/* [사진·숫자] 16 [이름 4 소개] 16 [버튼] */}
            <div className="px-5 pt-1 pb-4 flex flex-col gap-4">
              <div className="flex items-center gap-5">
                {/* 최근 24시간 스토리가 있을 때만 링, 누르면 스토리 */}
                <Avatar profile={p} size={data.hasStory ? 67 : 76} ring={data.hasStory ? 'story' : null} onClick={data.hasStory ? () => nav.push('story', { uid: p.uid }) : undefined} />
                <div className="flex-1 flex">
                  <Stat value={data.stats.workouts} label="운동" />
                  <Stat value={data.stats.diets} label="식단" />
                  <Stat value={data.stats.friends} label="친구" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-pretendard font-bold text-[16px] leading-6 text-typo-strong">{p.name}</span>
                {p.bio && <span className="font-pretendard text-[14px] leading-5 text-typo-normal">{p.bio}</span>}
              </div>
              {rel === 'incoming' && <span className="-mb-2 font-pretendard font-medium text-[14px] text-brand">{p.name}님이 친구 요청을 보냈어요</span>}
              <div className="flex gap-2">{buttons}</div>
              {rel === 'incoming' && <span className="-mt-2 font-pretendard text-[12px] text-ui-6">거절해도 상대에게 알리지 않아요</span>}
            </div>

            {rel !== 'blocked' && (
              <>
                <Tabs tabs={TABS} value={tab} onChange={setTab} />
                <div className={`bg-ui-1 flex-1 px-4 pt-4 flex flex-col gap-3 ${asTab ? 'pb-28' : 'pb-10'}`}>
                  {tab === 'records' && (locked
                    ? <Locked title="친구가 되면 기록을 볼 수 있어요" sub={data.publicRoutineCount ? `지금은 공개 루틴 ${data.publicRoutineCount}개만 볼 수 있어요` : '지금은 공개한 루틴만 볼 수 있어요'} routines={data.routines} nav={nav} />
                    : !data.workouts ? <Locked title="기록을 공개하지 않았어요" />
                    : (
                      <>
                        <Week week={data.week} />
                        {data.workouts.length === 0 && <EmptyState className="py-10" title="최근 기록이 없어요" />}
                        {data.workouts.map((w) => <WorkoutCard key={w.id} w={w} counts={data.counts?.[`log:${w.id}`]} nav={nav} isMine={isSelf} />)}
                        {(isSelf || data.routines.length > 0) && (
                          <div className="pt-5 flex flex-col gap-3">
                            <span className="px-1 font-pretendard font-semibold text-[14px] text-typo-strong">{isSelf ? '내 루틴' : '공개 루틴'}</span>

                      {isSelf && data.drafts?.length > 0 && (
                        <div className="rounded-[20px] border border-dashed border-[rgba(113,113,255,0.5)] bg-[rgba(113,113,255,0.06)] px-4 py-5 flex flex-col gap-3">
                          <span className="font-pretendard font-semibold text-[14px] text-brand">초안 {data.drafts.length}개</span>
                          {data.drafts.map((d) => (
                            <div key={d.key} className="rounded-[14px] bg-white px-4 py-3 flex items-center gap-2">
                              <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                <span className="font-pretendard font-semibold text-[15px] text-typo-strong">{d.title}</span>
                                <span className="font-pretendard text-[12px] text-typo-alternative">최근 {d.sessionCount}번 · {d.items.length}종목</span>
                              </span>
                              <Btn size="XS" full={false} onClick={() => nav.push('routineEdit', { draft: d })}>확인하고 공개</Btn>
                            </div>
                          ))}
                          <span className="font-pretendard text-[12px] text-typo-alternative">공개하기 전까지는 나만 보여요</span>
                        </div>
                      )}
                      <div className="flex flex-col gap-3">
                        {data.routines.map((r) => <RoutineCard key={r.id} r={r} nav={nav} isMine={isSelf} />)}
                        {isSelf && (
                          <button type="button" onClick={() => nav.push('routineEdit', {})} className="h-12 rounded-[16px] border border-ui-4 bg-white flex items-center justify-center gap-1.5 font-pretendard font-semibold text-[14px] text-typo-normal">
                            <IcPlusSmall size={16} />새 루틴 직접 만들기
                          </button>
                        )}
                      </div>
                          </div>
                        )}
                      </>
                    ))}
                  {tab === 'diet' && (locked
                    ? <Locked title="친구가 되면 식단을 볼 수 있어요" />
                    : !data.diets ? <Locked title="식단을 공개하지 않았어요" sub="공개 범위에서 식단을 켠 친구만 보여요" />
                    : <DietTab diets={data.diets} isSelf={isSelf} />)}
                  {tab === 'best' && (locked ? <Locked title="친구가 되면 최고 기록을 볼 수 있어요" /> : <BestTab best={data.best} isSelf={isSelf} nav={nav} reload={reload} />)}
                </div>
              </>
            )}
          </>
        )}
      </div>
      <FriendActionSheet open={actionOpen} onClose={() => setActionOpen(false)} profile={p} nav={nav} onDone={reload} />
    </>
  );
  /* 탭(마이)으로 쓸 때는 밀려 들어오는 모션 없이 그대로 */
  return asTab
    ? <div className="h-full flex flex-col bg-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>{content}</div>
    : <Screen leaving={leaving}>{content}</Screen>;
}
