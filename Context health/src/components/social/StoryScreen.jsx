import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { socialCall, socialErrorMessage, timeAgo } from '../../lib/socialApi';
import { loadSeenStories, markStorySeen } from '../../lib/socialLocal';
import { Avatar, Screen, Spinner } from './ui';
import { IcDown, IcMoreDots, IcX, IxHeart } from './SocialIcons';

/* 스토리 보기 (Figma 03 친구 · 34 내 스토리). 인스타그램과 같은 조작:
   - 오른쪽 누르기: 다음 장, 마지막 장이면 다음 사람 / 왼쪽 누르기: 이전 장, 첫 장이면 이전 사람
   - 길게 누르기: 멈추고 위·아래 UI를 숨긴다. 떼면 멈춘 자리부터 이어서
   - 옆으로 밀기: 사람 바꾸기 / 아래로 밀기: 닫기 / 위로 밀기: 큐레이터 글 자세히
   - 사람이 바뀔 때는 정육면체처럼 돈다: 지금 사람과 다음 사람이 한 상자의 이웃한 두 면이라,
     손가락을 따라 함께 돌고 돌아간 면은 어두워진다 (인스타와 같은 방식)
   - 장마다 본 것으로 기억하고, 다시 열면 안 본 장부터. 앱이 가려지거나 입력 중이면 멈춘다.
   queue: 스토리 줄 순서 [{ uid, storyKey }], start: 누른 사람 위치. 큐레이터 스토리(type 'youtube')는 최근 24시간 피드 글. */
const STORY_MS = 6000;
const HOLD_MS = 200;
const TURN_MS = 380; // 다음 사람으로 도는 시간
const TURN_EASE = 'cubic-bezier(0.25, 0.8, 0.3, 1)';
const COMMIT_DEG = 22; // 이만큼(약 1/4 폭) 돌린 뒤 놓으면 넘어간다

const seenKey = (uid, item) => `${uid}_${item.at}`;

/* 그 사람의 처음 보여줄 장: 안 본 첫 장(다 봤으면 첫 장) 또는 마지막 장 */
function startIndex(items, uid, seen, mode) {
  if (!items.length) return 0;
  if (mode === 'last') return items.length - 1;
  const i = items.findIndex((it) => !seen.has(seenKey(uid, it)));
  return i < 0 ? 0 : i;
}

export default function StoryScreen({ nav, uid: firstUid, queue: queueProp, start = 0, leaving }) {
  const queue = queueProp?.length ? queueProp : [{ uid: firstUid }];
  /* item: 숫자 = 그 장, 'first' = 안 본 첫 장, 'last' = 마지막 장 (불러온 뒤 정한다) */
  const [pos, setPos] = useState({ user: Math.min(start, queue.length - 1), item: 'first' });
  const [, setVersion] = useState(0);
  const cache = useRef(new Map());
  const [nonce, setNonce] = useState(0);
  const [holding, setHolding] = useState(false);
  const [typing, setTyping] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const [rot, setRot] = useState({ deg: 0, animate: false, prevMode: 'first' }); // 상자 회전 (음수 = 다음 사람 쪽)
  const [pullY, setPullY] = useState(0); // 아래로 당긴 거리
  const [dragging, setDragging] = useState(false);
  const [width, setWidth] = useState(390);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const stageRef = useRef(null);
  const gesture = useRef(null);
  const holdTimer = useRef(null);
  const turnTimer = useRef(null);
  const holdingRef = useRef(false);
  const turningRef = useRef(false);
  const wantRef = useRef(null);
  const seenRef = useRef(loadSeenStories(nav.uid));

  const uid = queue[pos.user].uid;
  const entry = cache.current.get(uid);
  const data = entry?.data;
  const error = entry?.error;
  const items = data?.items || data?.workouts || [];
  const index = typeof pos.item === 'number' ? Math.min(pos.item, items.length - 1) : -1;
  const current = index >= 0 ? items[index] : null;
  const key = current ? current.key || `log:${current.id}` : null;
  const counts = (key && data?.counts?.[key]) || {};
  const official = Boolean(data?.official);
  const turning = rot.deg !== 0 || rot.animate;
  const paused = holding || typing || hidden || turning || dragging || pullY > 0;

  useLayoutEffect(() => {
    const measure = () => stageRef.current && setWidth(stageRef.current.clientWidth || 390);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const load = useCallback((target) => {
    if (!target || cache.current.has(target)) return;
    cache.current.set(target, { loading: true });
    socialCall('story', { uid: target })
      .then((d) => cache.current.set(target, { data: d }))
      .catch((e) => cache.current.set(target, { error: e }))
      .finally(() => setVersion((v) => v + 1));
  }, []);

  /* 지금 사람과 양옆 사람을 미리 불러 둔다 (돌릴 때 옆면이 비어 보이지 않게) */
  useEffect(() => {
    load(uid);
    if (queue[pos.user + 1]) load(queue[pos.user + 1].uid);
    if (queue[pos.user - 1]) load(queue[pos.user - 1].uid);
  }, [uid, load]);

  /* 불러온 뒤 시작할 장을 정한다. 장이 없으면 다음 사람으로 */
  useEffect(() => {
    if (typeof pos.item === 'number' || !entry || entry.loading) return;
    if (!items.length) {
      if (!error && pos.user < queue.length - 1) setPos({ user: pos.user + 1, item: 'first' });
      return;
    }
    setPos({ user: pos.user, item: startIndex(items, uid, seenRef.current, pos.item) });
  }, [pos, entry]);

  useEffect(() => {
    if (!current) return;
    markStorySeen(nav.uid, seenKey(uid, current));
    seenRef.current.add(seenKey(uid, current));
  }, [uid, current]);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      clearTimeout(holdTimer.current);
      clearTimeout(turnTimer.current);
    };
  }, []);

  /* 옆 사람이 보여줄 장 */
  function neighborIndex(dir, mode = 'first') {
    const n = queue[pos.user + dir];
    const d = n && cache.current.get(n.uid)?.data;
    if (!d) return 'first';
    return startIndex(d.items || d.workouts || [], n.uid, seenRef.current, mode);
  }

  /* 상자를 끝까지 돌린 뒤, 옆면을 지금 면으로 바꾼다. 같은 프레임에 회전을 0으로 되돌리므로 화면은 그대로 이어진다 */
  function turn(dir, mode = 'first') {
    const target = pos.user + dir;
    if (target >= queue.length) { nav.pop(); return; }
    if (target < 0) { settle(); setNonce((n) => n + 1); return; }
    if (turningRef.current) return;
    turningRef.current = true;
    const item = neighborIndex(dir, mode);
    setRot({ deg: dir > 0 ? -90 : 90, animate: true, prevMode: mode });
    clearTimeout(turnTimer.current);
    turnTimer.current = setTimeout(() => {
      setPos({ user: target, item });
      setText('');
      setRot({ deg: 0, animate: false, prevMode: 'first' });
      turningRef.current = false;
    }, TURN_MS);
  }
  function settle() { setRot((r) => ({ ...r, deg: 0, animate: true })); clearTimeout(turnTimer.current); turnTimer.current = setTimeout(() => setRot((r) => ({ ...r, animate: false })), TURN_MS); }

  function next() {
    if (turningRef.current) return;
    if (index >= 0 && index < items.length - 1) setPos({ user: pos.user, item: index + 1 });
    else turn(1);
  }
  function prev() {
    if (turningRef.current) return;
    if (index > 0) setPos({ user: pos.user, item: index - 1 });
    else if (pos.user > 0) turn(-1, 'last');
    else setNonce((n) => n + 1); // 맨 처음이면 이 장을 처음부터
  }
  const openDetail = () => key && nav.push(current?.kind === 'diet' ? 'diet' : 'routine', { key });

  function setHold(on) {
    holdingRef.current = on;
    setHolding(on);
  }

  function onPointerDown(e) {
    if (turningRef.current || e.button > 0) return;
    gesture.current = { x: e.clientX, y: e.clientY, t: Date.now(), mode: null, left: e.currentTarget.getBoundingClientRect().left };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => setHold(true), HOLD_MS);
  }
  function onPointerMove(e) {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.mode && Math.max(Math.abs(dx), Math.abs(dy)) > 10) {
      g.mode = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      clearTimeout(holdTimer.current);
      setHold(false);
      setDragging(true);
    }
    if (g.mode === 'x') {
      /* 옆 사람이 없는 쪽으로는 조금만 따라온다 */
      const hasSide = queue[pos.user + (dx < 0 ? 1 : -1)];
      const deg = Math.max(-90, Math.min(90, (dx / width) * 90)) * (hasSide ? 1 : 0.2);
      setRot({ deg, animate: false, prevMode: 'first' });
    } else if (g.mode === 'y') {
      setPullY(Math.max(0, dy));
    }
  }
  function onPointerUp(e) {
    clearTimeout(holdTimer.current);
    const g = gesture.current;
    gesture.current = null;
    const wasHold = holdingRef.current;
    setHold(false);
    setDragging(false);
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (g.mode === 'x') {
      const deg = (dx / width) * 90;
      if (deg < -COMMIT_DEG && queue[pos.user + 1]) turn(1);
      else if (deg > COMMIT_DEG && queue[pos.user - 1]) turn(-1);
      else settle();
      return;
    }
    if (g.mode === 'y') {
      if (dy > 120) { nav.pop(); return; }
      setPullY(0);
      if (dy < -70 && official) openDetail();
      return;
    }
    /* 길게 눌렀다 뗀 것은 이어 보기만 한다 */
    if (wasHold || Date.now() - g.t > 300) return;
    if (g.x - g.left < width * 0.3) prev();
    else next();
  }
  function onPointerCancel() {
    clearTimeout(holdTimer.current);
    gesture.current = null;
    setHold(false);
    setDragging(false);
    setPullY(0);
    settle();
  }

  function patchCounts(nextCounts) {
    const d = cache.current.get(uid)?.data;
    if (!d) return;
    cache.current.set(uid, { data: { ...d, counts: { ...d.counts, [key]: nextCounts } } });
    setVersion((v) => v + 1);
  }

  async function clap() {
    if (!key) return;
    const prevCounts = counts;
    const want = !prevCounts.clapped;
    wantRef.current = want;
    patchCounts({ ...prevCounts, clapped: want, claps: Math.max(0, (prevCounts.claps || 0) + (want ? 1 : -1)) });
    try {
      const res = await socialCall('clap', { key, on: want });
      if (wantRef.current === want) patchCounts(res.counts);
    } catch (err) { nav.toast(socialErrorMessage(err)); }
  }

  async function send() {
    if (!text.trim() || !key || sending) return;
    setSending(true);
    try {
      await nav.requireProfile(async () => {
        await socialCall('comment-add', { key, text });
        setText('');
        nav.toast('한마디를 남겼어요');
      });
    } catch (err) { nav.toast(socialErrorMessage(err)); }
    setSending(false);
    setTyping(false);
  }

  const half = width / 2;
  const turned = Math.min(1, Math.abs(rot.deg) / 90);
  const transition = rot.animate ? `transform ${TURN_MS}ms ${TURN_EASE}` : 'none';
  const nextUser = queue[pos.user + 1];
  const prevUser = queue[pos.user - 1];
  const sideFace = (n, dir) => {
    const e = n && cache.current.get(n.uid);
    const d = e?.data;
    const its = d?.items || d?.workouts || [];
    const idx = d ? startIndex(its, n.uid, seenRef.current, dir < 0 ? rot.prevMode : 'first') : -1;
    return (
      <StoryFace
        key={n.uid}
        face={`rotateY(${dir * 90}deg) translateZ(${half}px)`}
        shade={(1 - turned) * 0.55}
        shadeTransition={transition}
        data={d}
        error={e?.error}
        items={its}
        index={idx}
      />
    );
  };

  return (
    <Screen leaving={leaving} bg="bg-black">
      {/* 아래로 당기면 작아지며 내려간다 */}
      <div
        ref={stageRef}
        className="absolute inset-0"
        style={{
          perspective: `${Math.round(width * 2.2)}px`,
          transform: pullY ? `translateY(${pullY}px) scale(${1 - Math.min(pullY, 400) / 1600})` : undefined,
          transition: dragging ? 'none' : 'transform 220ms ease-out',
        }}
      >
        <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d', transform: `translateZ(${-half}px) rotateY(${rot.deg}deg)`, transition }}>
          {prevUser && sideFace(prevUser, -1)}
          {nextUser && sideFace(nextUser, 1)}
          <StoryFace
            key={uid}
            face={`translateZ(${half}px)`}
            shade={turned * 0.55}
            shadeTransition={transition}
            active
            data={data}
            error={error}
            items={items}
            index={index}
            progressKey={`${pos.user}-${index}-${nonce}`}
            paused={paused}
            onEnd={next}
            uiHidden={holding && !dragging}
            gestures={{ onPointerDown, onPointerMove, onPointerUp, onPointerCancel }}
            header={(
              <>
                <button type="button" className="flex items-center gap-2 min-w-0" onClick={() => !data?.self && !official && nav.push('profile', { uid })}>
                  {data?.profile && <Avatar profile={data.profile} size={34} />}
                  <span className="font-pretendard font-semibold text-[14px] truncate">{data?.self ? '내 기록' : data?.profile?.name}</span>
                  {official && <span className="flex-none px-1.5 py-0.5 rounded-[6px] bg-white/20 font-pretendard font-semibold text-[11px] leading-[14px]">큐레이터</span>}
                  {current && <span className="font-pretendard text-[13px] text-white/70 flex-none">· {timeAgo(current.at)}</span>}
                </button>
                <span className="flex-1" />
                {data?.self && current && (
                  <button type="button" aria-label="자세히" onClick={() => nav.push('post', { key })}><IcMoreDots size={22} /></button>
                )}
                <button type="button" aria-label="닫기" onClick={() => nav.pop()}><IcX size={22} /></button>
              </>
            )}
            footer={current && (data.self ? (
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => nav.push('post', { key })} className="h-11 px-4 rounded-[14px] bg-white/15 flex items-center gap-4 font-pretendard font-semibold text-[14px] text-white">
                  <span>박수 {counts.claps || 0}</span><span>댓글 {counts.comments || 0}</span><span>가져감 {counts.imports || 0}</span>
                  <span className="flex-1" /><span className="font-medium text-white/80">자세히</span>
                </button>
                <p className="text-center font-pretendard text-[12px] leading-[18px] text-white/70">누가 봤는지는 보여주지 않아요 · 올린 뒤 24시간이 지나면 사라져요 (기록은 남아요)</p>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onFocus={() => setTyping(true)}
                  onBlur={() => !text && setTyping(false)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                  placeholder="한마디 남기기"
                  maxLength={300}
                  className="flex-1 min-w-0 h-11 px-4 rounded-full bg-transparent border border-white/50 font-pretendard text-[14px] text-white placeholder:text-white/70 outline-none"
                />
                {text.trim() ? (
                  <button type="button" onClick={send} disabled={sending} className="h-11 px-4 rounded-full bg-white font-pretendard font-semibold text-[14px] text-brand">보내기</button>
                ) : (
                  <>
                    <button type="button" onClick={clap} aria-pressed={Boolean(counts.clapped)} aria-label="박수" className={`w-11 h-11 rounded-full flex items-center justify-center ${counts.clapped ? 'bg-white text-[#FF5A6E]' : 'bg-white/20 text-white'}`}>
                      <IxHeart size={22} filled={counts.clapped} />
                    </button>
                    {official ? (
                      <button type="button" onClick={openDetail} className="h-11 px-4 rounded-full bg-white flex items-center font-pretendard font-semibold text-[14px] text-brand">자세히</button>
                    ) : current.type !== 'diet' && (
                      <button type="button" onClick={() => nav.startImport({ key })} className="h-11 px-4 rounded-full bg-white flex items-center gap-1.5 font-pretendard font-semibold text-[14px] text-brand">
                        <IcDown size={15} />가져오기
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          />
        </div>
      </div>
    </Screen>
  );
}

/* 상자의 한 면 = 한 사람의 스토리. 옆면(active 아님)은 진행 바가 멈춰 있고 누를 수 없다 */
function StoryFace({ face, shade, shadeTransition = 'none', active = false, data, error, items, index, progressKey, paused, onEnd, uiHidden = false, gestures, header, footer }) {
  const current = index >= 0 ? items[index] : null;
  return (
    <div
      className={`absolute inset-0 flex flex-col overflow-hidden bg-[linear-gradient(180deg,#5B5BF5_0%,#9B7BFF_55%,#C79BFF_100%)] ${active ? '' : 'pointer-events-none'}`}
      style={{ transform: face, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
    >
      <div className="flex-1 flex flex-col gap-6 px-4" style={{ paddingTop: 'calc(16px + env(safe-area-inset-top))', paddingBottom: 'calc(28px + env(safe-area-inset-bottom))' }}>
        {/* 진행 바 + 작성자 (길게 누르면 숨김) */}
        <div className={`flex flex-col gap-3 transition-opacity duration-200 ${uiHidden ? 'opacity-0' : 'opacity-100'}`}>
          <div className="flex gap-1">
            {(items.length ? items : [0]).map((_, i) => (
              <span key={i} className="flex-1 h-[3px] rounded-full bg-white/35 overflow-hidden">
                {i < index && <span className="block h-full bg-white" />}
                {active && i === index && current && (
                  <span
                    key={progressKey}
                    className="story-progress block h-full bg-white"
                    style={{ animationDuration: `${STORY_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }}
                    onAnimationEnd={onEnd}
                  />
                )}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 text-white min-h-[34px]">
            {header || (data?.profile && (
              <span className="flex items-center gap-2 min-w-0">
                <Avatar profile={data.profile} size={34} />
                <span className="font-pretendard font-semibold text-[14px] truncate">{data.self ? '내 기록' : data.profile.name}</span>
                {current && <span className="font-pretendard text-[13px] text-white/70 flex-none">· {timeAgo(current.at)}</span>}
              </span>
            ))}
          </div>
        </div>

        {/* 내용: 누르기·길게 누르기·밀기를 여기서 받는다 */}
        <div className="flex-1 flex flex-col justify-center gap-6 select-none touch-none" onContextMenu={(e) => e.preventDefault()} {...(gestures || {})}>
          {error ? (
            <p className="text-center font-pretendard text-[15px] text-white/80">{socialErrorMessage(error)}</p>
          ) : !data ? (
            <div className="flex justify-center"><Spinner size={28} className="border-white/30 border-t-white" /></div>
          ) : !items.length ? (
            <p className="text-center font-pretendard text-[15px] text-white/80">최근 24시간 동안 올린 기록이 없어요</p>
          ) : current ? (
            <StoryContent item={current} />
          ) : null}
        </div>

        {footer && <div className={`transition-opacity duration-200 ${uiHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>{footer}</div>}
      </div>
      {/* 돌아간 만큼 어두워진다 */}
      <div className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: shade, transition: shadeTransition.replace('transform', 'opacity') }} />
    </div>
  );
}

/* 한 장의 내용: 운동 기록 · 식단 기록 · 큐레이터 영상 정리 */
function StoryContent({ item }) {
  if (item.type === 'youtube') {
    return (
      <div className="flex flex-col gap-6 text-white">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="font-pretendard font-semibold text-[14px] text-white/80">{[item.kind === 'diet' ? '식단' : '루틴', item.channelName].filter(Boolean).join(' · ')}</span>
          <h2 className="font-pretendard font-bold text-[30px] leading-[38px] tracking-[-0.8px] line-clamp-3">{item.title}</h2>
          <p className="font-pretendard font-medium text-[15px] leading-6 text-white/85">
            {item.kind === 'diet' ? `${item.kcal.toLocaleString()}kcal · ${item.meals.length}끼` : `${item.exerciseCount}종목`}
          </p>
        </div>
        <div className="rounded-[16px] bg-white/15 px-4 py-4 flex flex-col gap-2">
          {item.kind === 'diet'
            ? item.meals.slice(0, 5).map((m) => (
              <div key={m.name} className="flex items-center gap-3 font-pretendard text-[14px] leading-5">
                <span className="font-semibold flex-none">{m.name}</span>
                <span className="text-white/85 truncate">{m.foods}</span>
              </div>
            ))
            : item.exercises.slice(0, 6).map((ex, i) => (
              <div key={`${ex.name}-${i}`} className="flex items-center justify-between gap-3 font-pretendard text-[14px] leading-5">
                <span className="font-semibold truncate">{ex.name}</span>
                <span className="text-white/85 flex-none">{ex.sets}</span>
              </div>
            ))}
          {item.kind !== 'diet' && item.exercises.length > 6 && <span className="font-pretendard text-[13px] text-white/70">외 {item.exercises.length - 6}종목</span>}
        </div>
        {item.caption && <p className="font-pretendard text-[14px] leading-[22px] text-white/85 line-clamp-3">{item.caption}</p>}
        <p className="text-center font-pretendard text-[12px] text-white/60">위로 밀어서 자세히 보기</p>
      </div>
    );
  }
  if (item.type === 'diet') {
    return (
      <div className="flex flex-col items-center gap-6 text-white text-center">
        <div className="flex flex-col items-center gap-1">
          <span className="font-pretendard font-semibold text-[15px] text-white/85">{item.meals ? `오늘 식단 · ${item.meals}끼` : '오늘 식단'}</span>
          <h2 className="font-pretendard font-bold text-[52px] leading-[64px] tracking-[-1.5px]">{item.kcal.toLocaleString()}<span className="text-[24px] font-semibold"> kcal</span></h2>
        </div>
        <div className="w-full rounded-[16px] bg-white/15 px-4 py-4 grid grid-cols-3">
          {[['탄수', item.carb], ['단백질', item.protein], ['지방', item.fat]].map(([l, v]) => (
            <div key={l} className="flex flex-col items-center gap-0.5 font-pretendard">
              <span className="font-bold text-[20px]">{v}g</span>
              <span className="text-[12px] text-white/75">{l}</span>
            </div>
          ))}
        </div>
        {item.goal ? <p className="font-pretendard text-[13px] text-white/75">목표 {item.goal.toLocaleString()}kcal</p> : null}
      </div>
    );
  }
  return (
    <>
      <div className="flex flex-col items-center gap-1 text-center text-white">
        <h2 className="font-pretendard font-bold text-[52px] leading-[64px] tracking-[-1.5px]">{item.title.replace(/,\s*/g, ' · ')}</h2>
        <p className="font-pretendard font-medium text-[16px] leading-6 text-white/85">
          {[`${item.exerciseCount}종목`, item.comment].filter(Boolean).join(' · ')}
        </p>
      </div>
      {item.exercises.length > 0 && (
        <div className="rounded-[16px] bg-white/15 px-4 py-4 flex flex-col gap-2">
          {item.exercises.slice(0, 6).map((ex) => (
            <div key={ex.name} className="flex items-center justify-between gap-3 font-pretendard text-[14px] leading-5 text-white">
              <span className="font-semibold truncate">{ex.name}</span>
              <span className="text-white/85 flex-none">{ex.sets}</span>
            </div>
          ))}
          {item.exercises.length > 6 && <span className="font-pretendard text-[13px] text-white/70">외 {item.exercises.length - 6}종목</span>}
        </div>
      )}
    </>
  );
}
