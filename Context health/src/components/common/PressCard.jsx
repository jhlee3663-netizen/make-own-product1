import React, { useEffect, useRef } from 'react';

/* 토스식 카드 눌림 효과 (Figma 📚 스터디 1155:9637).
   누르는 순간 진한 색이 카드 가운데에서 바깥으로 퍼진다. 처음 70%까지는 눈에 안 보일 만큼 빠르게,
   나머지 가장자리까지는 눈에 보이는 속도로 채워진다. 동시에 카드가 0.99배로 살짝 줄었다가
   누르고 있는 동안 원래 크기로 돌아온다. 가장자리 1px은 흰색으로 남고, 손을 떼면 색이 빠진다.
   카드 안쪽 영역에 불투명한 배경을 두면 퍼지는 색을 가리므로 두지 않는다. */

export const PRESS = {
  color: '#e9ecef',
  scale: 0.99,
  fastCover: 0.7,   // 순식간에 채워지는 범위 (카드 폭 대비)
  fastMs: 35,       // 그 범위까지 걸리는 시간
  fillMs: 200,      // 나머지 가장자리까지 채워지는 시간
  dipMs: 300,       // 줄었다가 돌아오는 전체 시간
  dipAt: 0.2,       // 그중 가장 작아지는 시점
  releaseMs: 240,   // 손을 뗐을 때 색이 빠지는 시간
  cancelMs: 100,    // 스크롤로 판단됐을 때 색이 빠지는 시간
  touchDelayMs: 20, // 스크롤하려고 댄 손인지 볼 짧은 대기
  minHoldMs: 120,   // 톡 눌렀을 때도 효과가 보이는 최소 시간
  moveCancelPx: 8,
};

// 색 띠: 가운데 80%는 꽉 찬 색, 양 끝 10%씩만 옅어진다. 띠의 끝이 곧 색이 번져 나가는 경계가 된다.
// 꽉 찬 부분이 카드 폭을 다 덮으려면 1 / 0.8배가 필요하다.
const SOLID = 0.8;
const FULL_SCALE = 1 / SOLID + 0.02;
const BAND = `linear-gradient(90deg, transparent 0%, ${PRESS.color} ${(0.5 - SOLID / 2) * 100}%, ${PRESS.color} ${(0.5 + SOLID / 2) * 100}%, transparent 100%)`;

export default function PressCard({ children, className = '', radius = 16, onClick, ...rest }) {
  const rootRef = useRef(null);
  const overlayRef = useRef(null);
  const state = useRef({ timer: null, releaseTimer: null, startX: 0, startY: 0, down: false, activeAt: 0 });

  useEffect(() => () => {
    clearTimeout(state.current.timer);
    clearTimeout(state.current.releaseTimer);
  }, []);

  function activate() {
    const s = state.current;
    const overlay = overlayRef.current;
    clearTimeout(s.timer);
    clearTimeout(s.releaseTimer);
    s.activeAt = performance.now();
    if (overlay?.animate) {
      overlay.getAnimations().forEach(animation => animation.cancel());
      const total = PRESS.fastMs + PRESS.fillMs;
      overlay.animate(
        [
          { transform: 'scaleX(0)', opacity: 1, easing: 'linear' },
          { transform: `scaleX(${PRESS.fastCover})`, opacity: 1, offset: PRESS.fastMs / total, easing: 'cubic-bezier(0.3, 0.4, 0.4, 1)' },
          { transform: `scaleX(${FULL_SCALE})`, opacity: 1 },
        ],
        { duration: total, fill: 'forwards' },
      );
    }
    rootRef.current?.animate?.(
      [
        { transform: 'scale(1)', easing: 'cubic-bezier(0.2, 0, 0.4, 1)' },
        { transform: `scale(${PRESS.scale})`, offset: PRESS.dipAt, easing: 'cubic-bezier(0.25, 1.2, 0.4, 1)' },
        { transform: 'scale(1)' },
      ],
      { duration: PRESS.dipMs },
    );
  }

  function fadeOut(duration) {
    const s = state.current;
    const overlay = overlayRef.current;
    s.activeAt = 0;
    if (!overlay?.animate) return;
    const fade = overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: 'ease-out', fill: 'forwards' });
    fade.onfinish = () => overlay.getAnimations().forEach(animation => animation.cancel());
  }

  function release(cancelled = false) {
    const s = state.current;
    clearTimeout(s.timer);
    if (!s.activeAt) return;
    clearTimeout(s.releaseTimer);
    if (cancelled) { fadeOut(PRESS.cancelMs); return; }
    const wait = Math.max(0, PRESS.minHoldMs - (performance.now() - s.activeAt));
    s.releaseTimer = setTimeout(() => fadeOut(PRESS.releaseMs), wait);
  }

  function handlePointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // 카드 안의 버튼(더보기 등)을 누를 때는 카드 효과를 내지 않는다
    const inner = event.target.closest('button, a, input, textarea, [data-no-press]');
    if (inner && inner !== rootRef.current && rootRef.current?.contains(inner)) return;
    const s = state.current;
    s.down = true;
    s.startX = event.clientX;
    s.startY = event.clientY;
    clearTimeout(s.timer);
    if (event.pointerType === 'mouse') activate();
    else s.timer = setTimeout(activate, PRESS.touchDelayMs);
  }

  function handlePointerMove(event) {
    const s = state.current;
    if (!s.down) return;
    if (Math.hypot(event.clientX - s.startX, event.clientY - s.startY) > PRESS.moveCancelPx) {
      s.down = false;
      release(true);
    }
  }

  function handlePointerUp() {
    const s = state.current;
    if (!s.down) return;
    s.down = false;
    // 기다리는 사이에 손을 뗀 짧은 탭이면 지금 바로 효과를 보여준다
    if (!s.activeAt) activate();
    release();
  }

  function handlePointerCancel() {
    const s = state.current;
    if (!s.down && !s.activeAt) return;
    s.down = false;
    release(true);
  }

  return (
    <div
      ref={rootRef}
      onClick={onClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerCancel}
      onPointerCancel={handlePointerCancel}
      className={`relative ${className}`}
      style={{ borderRadius: radius, WebkitTapHighlightColor: 'transparent' }}
      {...rest}
    >
      <span aria-hidden="true" className="absolute inset-px overflow-hidden pointer-events-none" style={{ borderRadius: radius - 1 }}>
        <span ref={overlayRef} className="absolute inset-0 will-change-transform" style={{ background: BAND, opacity: 0, transform: 'scaleX(0)' }} />
      </span>
      <div className="relative">{children}</div>
    </div>
  );
}
