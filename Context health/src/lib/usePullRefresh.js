import { useEffect, useRef, useState } from 'react';

/* 당겨서 새로고침 (홈 HomeScreen과 같은 값·같은 동작). 피드·분석 탭이 쓴다.
   - 맨 위에서 아래로 당긴 거리의 0.45배만큼 틈이 벌어진다 (최대 76)
   - 52 넘게 당기고 놓으면 새로고침, 그동안 틈은 56
   - 놓으면 당긴 거리 자체를 420ms에 걸쳐 되돌린다 (docs/motion_and_ui_notes.md)
   옆으로 미는 영역은 data-no-pull로 뺀다. */
const PULL_THRESHOLD = 52;
const MAX_PULL = 76;
const REFRESH_GAP = 56;
const MIN_REFRESH_MS = 1200;

export default function usePullRefresh(scrollRef, onRefresh) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const startX = useRef(0);
  const pulling = useRef(false);
  const refreshingRef = useRef(false);
  const pullRef = useRef(0);
  const animRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onMove = (e) => {
      if (!startY.current || refreshingRef.current) return;
      const delta = e.touches[0].clientY - startY.current;
      const dx = Math.abs(e.touches[0].clientX - startX.current);
      /* 옆으로 미는 손짓(탭 넘기기)이면 당기기로 받지 않는다 */
      if (!pulling.current && Math.max(dx, Math.abs(delta)) > 6 && dx > Math.abs(delta)) { startY.current = 0; return; }
      if (el.scrollTop > 0 || delta <= 0) {
        if (pulling.current) { pulling.current = false; pullRef.current = 0; setPull(0); }
        return;
      }
      pulling.current = true;
      e.preventDefault();
      cancelAnimationFrame(animRef.current);
      pullRef.current = Math.min(MAX_PULL, delta * 0.45);
      setPull(pullRef.current);
    };
    el.addEventListener('touchmove', onMove, { passive: false });
    return () => el.removeEventListener('touchmove', onMove);
  }, [scrollRef]);

  function settle(to, done) {
    cancelAnimationFrame(animRef.current);
    const from = pullRef.current;
    if (Math.abs(from - to) < 0.5) { pullRef.current = to; setPull(to); done?.(); return; }
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / 420);
      pullRef.current = from + (to - from) * (1 - Math.pow(1 - k, 3));
      setPull(pullRef.current);
      if (k < 1) animRef.current = requestAnimationFrame(step);
      else done?.();
    };
    animRef.current = requestAnimationFrame(step);
  }

  function onTouchStart(e) {
    if (e.target.closest?.('[data-no-pull]')) { startY.current = 0; return; }
    if (scrollRef.current?.scrollTop === 0) { startY.current = e.touches[0].clientY; startX.current = e.touches[0].clientX; }
  }

  function onTouchEnd() {
    startY.current = 0;
    if (refreshingRef.current) return;
    const pulled = pulling.current;
    pulling.current = false;
    if (pulled && pullRef.current >= PULL_THRESHOLD) {
      setRefreshing(true);
      refreshingRef.current = true;
      settle(REFRESH_GAP);
      const started = Date.now();
      Promise.resolve(onRefreshRef.current?.()).catch(() => {}).finally(() => {
        setTimeout(() => {
          setRefreshing(false);
          refreshingRef.current = false;
          settle(0);
        }, Math.max(0, MIN_REFRESH_MS - (Date.now() - started)));
      });
    } else {
      settle(0);
    }
  }

  return { pull, refreshing, handlers: { onTouchStart, onTouchEnd, onTouchCancel: onTouchEnd } };
}

export { PULL_THRESHOLD };
