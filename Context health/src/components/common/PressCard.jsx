import React, { useEffect, useRef, useState } from 'react';

/* 토스식 카드 눌림 효과 (Figma 📚 스터디 1155:9637).
   누르는 순간: 진한 색이 가운데에서 바깥으로 빠르게 퍼지고, 카드가 0.99배로 살짝 줄었다가
   누르고 있는 동안 원래 크기로 돌아온다. 가장자리 1px은 흰색으로 남는다. 손을 떼면 색이 부드럽게 빠진다. */

export const PRESS = {
  color: '#e9ecef',
  scale: 0.99,
  spreadMs: 160,   // 색이 퍼지는 시간
  dipMs: 380,      // 줄었다가 돌아오는 전체 시간
  dipAt: 0.28,     // 그중 가장 작아지는 시점
  releaseMs: 260,  // 손을 뗐을 때 색이 빠지는 시간
  touchDelayMs: 70, // 스크롤하려고 댄 손에 반응하지 않도록 기다리는 시간
  minHoldMs: 140,  // 톡 눌렀을 때도 효과가 보이는 최소 시간
  moveCancelPx: 8,
};

const SPREAD_EASE = 'cubic-bezier(0.2, 0, 0, 1)';

export default function PressCard({ children, className = '', radius = 16, onClick, ...rest }) {
  const rootRef = useRef(null);
  const [phase, setPhase] = useState('idle'); // idle | in | out
  const state = useRef({ timer: null, releaseTimer: null, startX: 0, startY: 0, down: false, activeAt: 0 });

  useEffect(() => () => {
    clearTimeout(state.current.timer);
    clearTimeout(state.current.releaseTimer);
  }, []);

  function activate() {
    const s = state.current;
    clearTimeout(s.timer);
    clearTimeout(s.releaseTimer);
    s.activeAt = performance.now();
    setPhase('in');
    rootRef.current?.animate?.(
      [
        { transform: 'scale(1)', easing: 'cubic-bezier(0.3, 0, 0.5, 1)' },
        { transform: `scale(${PRESS.scale})`, offset: PRESS.dipAt, easing: 'cubic-bezier(0.25, 1.2, 0.4, 1)' },
        { transform: 'scale(1)' },
      ],
      { duration: PRESS.dipMs },
    );
  }

  function release() {
    const s = state.current;
    clearTimeout(s.timer);
    if (!s.activeAt) return;
    const wait = Math.max(0, PRESS.minHoldMs - (performance.now() - s.activeAt));
    clearTimeout(s.releaseTimer);
    s.releaseTimer = setTimeout(() => { s.activeAt = 0; setPhase('out'); }, wait);
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
      release();
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
    s.down = false;
    release();
  }

  const overlayStyle = phase === 'in'
    ? { opacity: 1, transform: 'scaleX(2.4)', transition: `transform ${PRESS.spreadMs}ms ${SPREAD_EASE}, opacity 60ms linear` }
    : phase === 'out'
      ? { opacity: 0, transform: 'scaleX(2.4)', transition: `opacity ${PRESS.releaseMs}ms ease-out` }
      : { opacity: 0, transform: 'scaleX(0.15)', transition: 'none' };

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
      <span
        aria-hidden="true"
        className="absolute inset-px overflow-hidden pointer-events-none"
        style={{ borderRadius: radius - 1 }}
      >
        <span
          className="absolute inset-0 will-change-transform"
          onTransitionEnd={(event) => { if (phase === 'out' && event.propertyName === 'opacity') setPhase('idle'); }}
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${PRESS.color} 28%, ${PRESS.color} 72%, transparent 100%)`,
            ...overlayStyle,
          }}
        />
      </span>
      <div className="relative">{children}</div>
    </div>
  );
}
