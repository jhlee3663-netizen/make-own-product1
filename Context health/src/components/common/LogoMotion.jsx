import React, { useEffect, useId, useRef } from 'react';

/* 로고 지오메트리 — LOGO/기본 로고.png 실측값 (1000×1000 기준)
   큰 방울 B에 A·C가 필렛(반지름 114)으로 붙어 있고, 점 D는 떨어져 있다.
   도형을 매 프레임 다시 계산하므로 방울이 움직여도 이음새가 실제 액체처럼 따라온다. */
const REST = {
  a: { x: 216.5, y: 365.4, r: 130 },
  b: { x: 621.2, y: 554.8, r: 202.3 },
  c: { x: 291.1, y: 785.7, r: 85.8 },
  d: { x: 824.5, y: 215.5, r: 88 },
};
const FILLET = 114;
const NECK = 30; // 점 D가 B에서 떨어져 나올 때 생기는 목의 필렛 반지름

// 위치·색·불투명도는 Figma 시안(로고 중심 기준 px) 그대로
const CHIPS = [
  { text: '식단',   x: -151, y: -8,  bg: 'rgba(139,255,191,0.05)', opacity: 0.6, delay: 1.6, dur: 8 },
  { text: '루틴',   x: 138,  y: -77, bg: 'rgba(100,255,252,0.05)', opacity: 0.4, delay: 3.6, dur: 9 },
  { text: '탄단지', x: -99,  y: 123, bg: 'rgba(100,255,252,0.05)', opacity: 1,   delay: 5.4, dur: 8.5 },
  { text: '운동',   x: 108,  y: 76,  bg: 'rgba(142,185,255,0.05)', opacity: 0.9, delay: 7.2, dur: 9.5 },
];

const cross = (o, p, q) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
// 필렛은 세 번째 방울의 반대편(바깥쪽)에 생긴다
const outerSide = (p, q, third) => (cross(p, q, third) > 0 ? -1 : 1);
const SIDE_AB = outerSide(REST.a, REST.b, REST.c);
const SIDE_AC = outerSide(REST.a, REST.c, REST.b);
const SIDE_CB = outerSide(REST.c, REST.b, REST.a);

/* 두 원에 동시에 외접하는 필렛 원. stretch=true면 두 원이 멀어져도 끊기지 않게 반지름을 키운다. */
function fillet(p, q, rf, side, stretch) {
  const dx = q.x - p.x, dy = q.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d < Math.abs(p.r - q.r) + 0.01) return null; // 한쪽이 완전히 안에 있음
  let r = rf;
  if (d > p.r + q.r + 2 * r) {
    if (!stretch) return null;
    r = (d - p.r - q.r) / 2;
  }
  const a = p.r + r, b = q.r + r;
  const x = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(a * a - x * x, 0));
  const ux = dx / d, uy = dy / d;
  return { x: p.x + ux * x - uy * h * side, y: p.y + uy * x + ux * h * side, r };
}

const clamp01 = (t) => Math.min(1, Math.max(0, t));
function easeOutBack(t, s) {
  const u = clamp01(t) - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
}
const seg = (t, from, to) => (t - from) / (to - from);

/* tone='white'는 시작 화면용: 그라데이션 배경 위에 흰 로고만, 주변 칩 없이 같은 모션으로 그린다. */
export default function LogoMotion({ size = 228, tone = 'gradient', epoch }) {
  const white = tone === 'white';
  const id = useId();
  const el = useRef({});
  const reduced = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const E = el.current;
    const setCircle = (node, c) => {
      node.setAttribute('cx', c ? c.x : -999);
      node.setAttribute('cy', c ? c.y : -999);
      node.setAttribute('r', c ? Math.max(c.r, 0) : 0);
    };
    const setPoly = (node, pts) => {
      node.setAttribute('points', pts.every(Boolean) ? pts.map(p => `${p.x},${p.y}`).join(' ') : '');
    };

    function draw({ a, b, c, d }) {
      const f1 = fillet(a, b, FILLET, SIDE_AB, true);
      const f2 = fillet(a, c, FILLET, SIDE_AC, true);
      const f3 = fillet(c, b, FILLET, SIDE_CB, true);
      const g1 = fillet(b, d, NECK, 1, false);
      const g2 = fillet(b, d, NECK, -1, false);
      setCircle(E.a, a); setCircle(E.b, b); setCircle(E.c, c); setCircle(E.d, d);
      setCircle(E.f1, f1); setCircle(E.f2, f2); setCircle(E.f3, f3);
      setCircle(E.g1, g1); setCircle(E.g2, g2);
      setPoly(E.hub, [a, b, c]);
      setPoly(E.t1, [a, f1, b]);
      setPoly(E.t2, [a, f2, c]);
      setPoly(E.t3, [c, f3, b]);
      setPoly(E.neck, [b, g1, d, g2]);
    }

    if (reduced) { draw(REST); return; }

    // B 중심에서 p만큼 뻗어 나온 방울 (p=1이 제자리)
    const bud = (rest, b, p, grow) => ({
      x: b.x + (rest.x - REST.b.x) * p,
      y: b.y + (rest.y - REST.b.y) * p,
      r: rest.r * grow * (0.5 + 0.5 * clamp01(p)),
    });

    let raf, start;
    function frame(now) {
      if (start === undefined) start = epoch ?? now; // epoch를 주면 화면이 바뀌어도 같은 모션이 이어진다
      const t = (now - start) / 1000;

      // 인트로: B가 맺히고 → A, C가 차례로 돋아나고 → 점 D가 튀어나와 끊어진다
      const grow = easeOutBack(seg(t, 0, 0.6), 1.4);
      const pa = easeOutBack(seg(t, 0.25, 1.0), 1.1);
      const pc = easeOutBack(seg(t, 0.4, 1.15), 1.1);
      const pd = easeOutBack(seg(t, 0.65, 1.5), 2.2);
      const idle = clamp01(seg(t, 1.4, 2.6)); // 인트로가 끝나면 천천히 떠다닌다

      const b = { ...REST.b, r: REST.b.r * grow };
      const a = bud(REST.a, b, pa, grow);
      const c = bud(REST.c, b, pc, grow);
      const d = bud(REST.d, b, pd, grow);
      a.x += idle * 6 * Math.sin(t * 0.9);        a.y += idle * 5 * Math.sin(t * 0.7 + 1);
      c.x += idle * 5 * Math.sin(t * 1.1 + 1.3);  c.y += idle * 5 * Math.sin(t * 0.8 + 4);
      d.x += idle * 5 * Math.sin(t * 0.6);        d.y += idle * 9 * Math.sin(t * 0.85 + 0.5);

      draw({ a, b, c, d });
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reduced, epoch]);

  const bind = (key) => (node) => { el.current[key] = node; };

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {/* 기록 조각들이 로고로 빨려 들어간다 */}
      {!reduced && !white && CHIPS.map(({ text, x, y, bg, opacity, delay, dur }) => (
        <div
          key={text}
          className="absolute left-1/2 top-1/2 w-0 h-0 pointer-events-none"
          style={{ '--x': `${x}px`, '--y': `${y}px`, animation: `chipAbsorb ${dur}s ${delay}s cubic-bezier(.5,0,.6,1) infinite both` }}
        >
          <div
            className="absolute px-4 py-2 rounded-full font-pretendard font-medium text-[12px] leading-[1.5] text-[#646d76] whitespace-nowrap"
            style={{
              transform: 'translate(-50%, -50%)',
              background: bg,
              opacity,
              boxShadow: '0px 1px 2px rgba(23,26,29,0.05), 0px 1px 3px rgba(23,26,29,0.1)',
            }}
          >
            {text}
          </div>
        </div>
      ))}

      <svg viewBox="0 0 1000 1000" className="absolute inset-0 w-full h-full overflow-visible" role="img" aria-label="Context Health logo">
        <defs>
          <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4ba3ff" />
            <stop offset="1" stopColor="#ea78ff" />
          </linearGradient>
          <mask id={`${id}-m`} maskUnits="userSpaceOnUse" x="-200" y="-200" width="1400" height="1400">
            {/* 맞닿은 도형 사이에 실금이 비치지 않도록 살짝 겹치게 그린다 */}
            <g fill="#fff" stroke="#fff" strokeWidth="3" strokeLinejoin="round">
              <polygon ref={bind('hub')} />
              <polygon ref={bind('t1')} />
              <polygon ref={bind('t2')} />
              <polygon ref={bind('t3')} />
              <polygon ref={bind('neck')} />
            </g>
            <g fill="#000">
              <circle ref={bind('f1')} />
              <circle ref={bind('f2')} />
              <circle ref={bind('f3')} />
              <circle ref={bind('g1')} />
              <circle ref={bind('g2')} />
            </g>
            <g fill="#fff">
              <circle ref={bind('a')} />
              <circle ref={bind('b')} />
              <circle ref={bind('c')} />
              <circle ref={bind('d')} />
            </g>
          </mask>
        </defs>
        <g mask={`url(#${id}-m)`}>
          <rect x="-200" y="-200" width="1400" height="1400" fill={white ? '#fff' : `url(#${id}-g)`} />
          {!white && <image href="/logo-gradient-fill.jpg" x="0" y="0" width="1000" height="1000" preserveAspectRatio="none" />}
        </g>
      </svg>
    </div>
  );
}
