import React, { useId, useState } from 'react';
import { IcBack, IcMore } from '../icons/Icons';
import Pressable from '../common/Pressable';

/* 분석 탭: 요약 | 체중 | 식단 | 운동.
   수치·색·그라데이션은 Figma 시안(📚 스터디 1135:6792 / 6882 / 6982 / 7103 / 7209) 그대로다.
   계산 결과(model)를 받아 그리기만 한다. */

const TABS = [
  { id: 'summary', label: '요약' },
  { id: 'weight', label: '체중' },
  { id: 'diet', label: '식단' },
  { id: 'workout', label: '운동' },
];

const POINT = '#7171FF';
const DOT = '#7777FF';
const STALL = '#FF7171';
const INTAKE = '#FF9137';
const AI_GRADIENT = 'linear-gradient(135deg, #3aa0ff 0%, #f152ff 100%)';
const FADE_GRADIENT = 'linear-gradient(90deg, rgba(113,113,255,0.2) 0%, #7171FF 100%)';
const CARD = 'bg-white rounded-[24px] shadow-[0_2px_12px_rgba(3,27,38,0.05)]';
const TRACKING = 'tracking-[-0.025em]';

const kg = (v, digits = 1) => `${v.toFixed(digits)}kg`;
const num = v => String(Math.round(v * 10) / 10);
const signed = (v, digits = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;
const comma = v => Math.round(v).toLocaleString();

function formatDay(dateKey) {
  const [, m, d] = dateKey.split('-').map(Number);
  return `${m}월 ${d}일`;
}

/* ── 유려한 곡선 ──
   기록을 하나하나 이으면 선이 자잘하게 꺾인다. 구간 평균으로 흐름만 남긴 뒤(reducePoints)
   튀어 오르지 않는 단조 3차 곡선(flowPoints)으로 잇는다. */
function reducePoints(points, maxCount) {
  if (points.length <= maxCount) return points;
  const inner = points.slice(1, -1);
  const size = inner.length / (maxCount - 2);
  const out = [points[0]];
  for (let i = 0; i < maxCount - 2; i += 1) {
    const bucket = inner.slice(Math.floor(i * size), Math.max(Math.floor(i * size) + 1, Math.floor((i + 1) * size)));
    out.push([bucket.reduce((sum, q) => sum + q[0], 0) / bucket.length, bucket.reduce((sum, q) => sum + q[1], 0) / bucket.length]);
  }
  out.push(points[points.length - 1]);
  return out;
}

function flowPoints(points, steps = 14) {
  const n = points.length;
  if (n < 3) {
    if (n < 2) return points;
    // 두 점뿐이면 완만한 S자로 잇는다
    const [a, b] = points;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * (t * t * (3 - 2 * t))];
    });
  }
  const dx = []; const slope = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx.push(points[i + 1][0] - points[i][0]);
    slope.push((points[i + 1][1] - points[i][1]) / (dx[i] || 1));
  }
  const m = [slope[0]];
  for (let i = 1; i < n - 1; i += 1) m.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  m.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i += 1) {
    if (slope[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / slope[i]; const b = m[i + 1] / slope[i];
    const h = Math.hypot(a, b);
    if (h > 3) { m[i] = (3 * a / h) * slope[i]; m[i + 1] = (3 * b / h) * slope[i]; }
  }
  const out = [];
  for (let i = 0; i < n - 1; i += 1) {
    for (let k = 0; k < steps; k += 1) {
      const t = k / steps; const t2 = t * t; const t3 = t2 * t;
      out.push([
        points[i][0] + dx[i] * t,
        (2 * t3 - 3 * t2 + 1) * points[i][1] + (t3 - 2 * t2 + t) * dx[i] * m[i] + (-2 * t3 + 3 * t2) * points[i + 1][1] + (t3 - t2) * dx[i] * m[i + 1],
      ]);
    }
  }
  out.push(points[n - 1]);
  return out;
}

const toPath = points => points.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
const flowPath = (points, maxCount = 9) => toPath(flowPoints(reducePoints(points, maxCount)));

/* 곡선 위에서 x 위치의 높이 (선택 점을 선 위에 올려놓기 위해) */
function yOnCurve(curve, x) {
  if (x <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i += 1) {
    if (x <= curve[i][0]) {
      const [x0, y0] = curve[i - 1]; const [x1, y1] = curve[i];
      return y0 + ((x - x0) / ((x1 - x0) || 1)) * (y1 - y0);
    }
  }
  return curve[curve.length - 1][1];
}

/* ── 공용 조각 ── */
function Card({ children, className = '' }) {
  return <section className={`${CARD} ${className}`}>{children}</section>;
}

const BADGE_TONE = {
  green: 'bg-[#f0faf6] text-[#03b26c]',
  yellow: 'bg-[#fff9e7] text-[#dd7d02]',
  grey: 'bg-[#f1f3f5] text-[#646d76]',
};

function Badge({ tone = 'grey', children }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-pretendard font-semibold text-[12px] leading-[18px] whitespace-nowrap ${TRACKING} ${BADGE_TONE[tone]}`}>
      {children}
    </span>
  );
}

/* 선·막대 끝에 붙는 점: 진한 점 + 20% 후광 */
function HaloDot({ size = 16, style, className = '' }) {
  const inner = Math.round(size * 0.625);
  return (
    <span className={`absolute rounded-full pointer-events-none ${className}`} style={{ width: size, height: size, background: 'rgba(119,119,255,0.2)', ...style }}>
      <span className="absolute rounded-full" style={{ width: inner, height: inner, left: (size - inner) / 2, top: (size - inner) / 2, background: DOT }} />
    </span>
  );
}

function Headline({ before, value, after, sub }) {
  return (
    <div className="px-1 pt-2 pb-1 flex flex-col gap-1">
      <p className={`font-pretendard font-bold text-[22px] leading-[31px] text-[#171a1d] [word-break:keep-all] ${TRACKING}`}>
        {before}<span style={{ color: POINT }}>{value}</span>{after}
      </p>
      {sub && <p className={`font-pretendard text-[14px] leading-5 text-[#646d76] ${TRACKING}`}>{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }) {
  return <h3 className={`font-pretendard font-bold text-[16px] leading-[22.4px] text-[#171a1d] ${TRACKING}`}>{children}</h3>;
}

function Caption({ children, small = false }) {
  return <p className={`font-pretendard text-[#868e96] ${small ? 'text-[11px] leading-4' : 'text-[12px] leading-[18px]'} ${TRACKING}`}>{children}</p>;
}

function Segmented({ options, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex p-0.5 rounded-lg bg-[#f1f3f5]">
      {options.map(option => {
        const on = value === option.value;
        return (
          <button
            key={option.value}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={`px-3 py-1 rounded-md font-pretendard font-semibold text-[13px] leading-5 ${TRACKING} ${on ? 'bg-white text-[#171a1d]' : 'text-[#868e96]'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Tooltip({ leftPct, lines }) {
  const align = leftPct < 14 ? 'translate-x-0' : leftPct > 86 ? '-translate-x-full' : '-translate-x-1/2';
  const left = leftPct < 14 ? '0%' : leftPct > 86 ? '100%' : `${leftPct}%`;
  return (
    <div className={`absolute top-0 ${align} flex flex-col items-center px-2.5 py-1.5 rounded-lg pointer-events-none`} style={{ left, background: POINT }}>
      <p className={`font-pretendard font-bold text-[13px] leading-5 text-white whitespace-nowrap ${TRACKING}`}>{lines[0]}</p>
      <p className={`font-pretendard text-[11px] leading-4 text-white/70 whitespace-nowrap ${TRACKING}`}>{lines[1]}</p>
    </div>
  );
}

function LegendItem({ kind, children }) {
  return (
    <span className={`flex items-center gap-1 font-pretendard text-[11px] leading-4 text-[#868e96] ${TRACKING}`}>
      {kind === 'line' && <i className="w-3 h-0.5 rounded-[1px]" style={{ background: POINT }} />}
      {kind === 'dot' && <i className="w-1.5 h-1.5 rounded-full bg-[#ced4da]" />}
      {kind === 'box' && <i className="w-2 h-2 rounded-sm" style={{ background: INTAKE }} />}
      {kind === 'dash' && <i className="w-3 border-t border-dashed border-[#868e96]" />}
      {children}
    </span>
  );
}

function Rows({ rows }) {
  const list = rows.filter(Boolean);
  return (
    <dl>
      {list.map((row, i) => (
        <div
          key={row.label}
          className={`flex items-center justify-between ${i === 0 ? '' : 'pt-3'} ${i === list.length - 1 ? '' : 'pb-3 border-b border-[#f1f3f5]'}`}
        >
          <dt className={`font-pretendard text-[14px] leading-5 text-[#646d76] ${TRACKING}`}>{row.label}</dt>
          <dd className={`font-pretendard font-semibold text-[14px] leading-5 text-[#171a1d] ${TRACKING}`}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PairTiles({ items }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map(item => (
        <div key={item.label} className={`${CARD} p-5 flex flex-col gap-1`}>
          <p className={`font-pretendard text-[13px] leading-5 text-[#868e96] ${TRACKING}`}>{item.label}</p>
          <p className={`font-pretendard font-extrabold text-[20px] leading-7 text-[#171a1d] ${TRACKING}`}>{item.value}</p>
          <p className={`font-pretendard text-[12px] leading-[18px] text-[#868e96] ${TRACKING}`}>{item.sub}</p>
        </div>
      ))}
    </div>
  );
}

/* 왼쪽이 옅고 오른쪽이 진한 선 (가로 그라데이션 스트로크) */
function FadeLine({ d, width, height, strokeWidth = 1.8, color = POINT, className = '', style }) {
  const id = useId();
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} style={{ overflow: 'visible', ...style }} aria-hidden="true">
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={width} y2="0">
          <stop offset="0" stopColor={color} stopOpacity="0.2" />
          <stop offset="1" stopColor={color} />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke={`url(#${id})`} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function sparkPoints(values, width, height, pad = 2) {
  const min = Math.min(...values);
  const span = Math.max(0.0001, Math.max(...values) - min);
  return values.map((v, i) => [pad + (i / (values.length - 1)) * (width - pad * 2), pad + (1 - (v - min) / span) * (height - pad * 2)]);
}

/* 기록이 부족할 때: 흐린 예시 차트 위에 안내와 기록 버튼 */
function GhostCard({ title, message, cta, onRecord, bars = false }) {
  const sample = [62, 58, 60, 52, 54, 46, 48, 40, 43, 36, 38, 30];
  return (
    <Card className="px-5 py-6">
      <h3 className={`font-pretendard font-semibold text-[14px] leading-5 text-[#171a1d] ${TRACKING}`}>{title}</h3>
      <div className="relative mt-4 h-[132px] rounded-2xl bg-[#f8f9fa] overflow-hidden">
        <svg viewBox="0 0 300 132" className="absolute inset-0 w-full h-full opacity-50 blur-[2px]" preserveAspectRatio="none" aria-hidden="true">
          {bars
            ? sample.map((v, i) => <rect key={i} x={14 + i * 23.5} y={132 - (100 - v) * 1.4 - 10} width="14" height={(100 - v) * 1.4} rx="3" fill={POINT} opacity="0.2" />)
            : <path d={flowPath(sample.map((v, i) => [14 + i * 24.7, (v - 30) * 2.6 + 18]), 6)} fill="none" stroke={POINT} strokeWidth="2.5" strokeLinecap="round" />}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className={`font-pretendard font-medium text-[14px] leading-5 text-[#495057] ${TRACKING}`}>{message}</p>
          <button onClick={onRecord} className={`h-9 px-4 rounded-xl font-pretendard font-bold text-[13px] text-white active:opacity-70 ${TRACKING}`} style={{ background: POINT }}>{cta}</button>
        </div>
      </div>
    </Card>
  );
}

/* ── 요약 ── */
const REPORT_ROWS = [
  { key: 'good', label: '↑ 잘한 점', color: '#03b26c' },
  { key: 'improve', label: '↓ 바꿀 점', color: '#dd7d02' },
  { key: 'suggestion', label: '→ 다음 주', color: POINT },
];

function SparkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 0.5L7.3 4.7L11.5 6L7.3 7.3L6 11.5L4.7 7.3L0.5 6L4.7 4.7L6 0.5Z" fill="#fff" />
    </svg>
  );
}

function AiReport({ status, report, onAskCoach, onRetry }) {
  const [open, setOpen] = useState(false);
  // 시안처럼 첫 쉼표 뒤에서 줄을 바꾼다
  const headline = (report?.headline || report?.good || '').replace(/,\s+/, ',\n');
  return (
    <Card className="overflow-hidden">
      <div className="p-5 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full flex items-center justify-center flex-none" style={{ background: AI_GRADIENT }}><SparkIcon /></span>
            <h2 className={`font-pretendard font-semibold text-[13px] leading-5 ${TRACKING}`} style={{ color: POINT }}>이번 주 AI 리포트</h2>
          </div>

          {status === 'loading' && (
            <div className="space-y-2.5 py-1" aria-label="리포트를 쓰는 중">
              {[72, 88].map(w => <div key={w} className="h-5 rounded bg-[#f1f3f5] animate-pulse" style={{ width: `${w}%` }} />)}
            </div>
          )}
          {status === 'empty' && (
            <p className={`font-pretendard text-[14px] leading-[22px] text-[#495057] ${TRACKING}`}>
              운동·식단·체중 중 무엇이든 3일 이상 기록하면 한 주를 정리해 드려요.
            </p>
          )}
          {status === 'error' && (
            <div className="flex items-center justify-between">
              <p className={`font-pretendard text-[14px] leading-[22px] text-[#495057] ${TRACKING}`}>리포트를 만들지 못했어요.</p>
              <button onClick={onRetry} className={`font-pretendard font-semibold text-[13px] leading-5 active:opacity-50 ${TRACKING}`} style={{ color: POINT }}>다시 시도</button>
            </div>
          )}
          {status === 'ready' && report && (
            <p className={`font-pretendard font-semibold text-[18px] leading-7 text-[#171a1d] whitespace-pre-line [word-break:keep-all] ${TRACKING}`}>{headline}</p>
          )}
        </div>

        {status === 'ready' && report && open && (
          <dl className="flex flex-col gap-2">
            {REPORT_ROWS.filter(row => report[row.key]).map(row => (
              <div key={row.key} className="flex gap-3">
                <dt className={`w-14 flex-none font-pretendard font-semibold text-[13px] leading-[22px] ${TRACKING}`} style={{ color: row.color }}>{row.label}</dt>
                <dd className={`font-pretendard text-[14px] leading-[22px] text-[#495057] ${TRACKING}`}>{report[row.key]}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {status === 'ready' && (
        <div className="flex border-t border-[#f1f3f5]">
          <button onClick={() => setOpen(o => !o)} aria-expanded={open} className={`flex-1 py-3 border-r border-[#f1f3f5] font-pretendard font-semibold text-[13px] leading-5 text-[#646d76] active:bg-[#f8f9fa] ${TRACKING}`}>
            {open ? '접기' : '자세히 보기'}
          </button>
          <button onClick={onAskCoach} className={`flex-1 py-3 font-pretendard font-semibold text-[13px] leading-5 active:bg-[#f8f9fa] ${TRACKING}`}>
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: AI_GRADIENT }}>코치에게 물어보기</span>
          </button>
        </div>
      )}
    </Card>
  );
}

function Tile({ label, value, sub, subColor = '#868e96', visual, visualAlign = 'center', onClick }) {
  return (
    <button onClick={onClick} className={`${CARD} flex flex-col gap-10 text-left px-5 pt-5 pb-4 active:bg-[#f8f9fa]`}>
      <span className="flex flex-col gap-1 w-full">
        <span className="flex flex-col">
          <span className={`font-pretendard text-[14px] leading-5 text-[#646d76] ${TRACKING}`}>{label}</span>
          <span className={`font-pretendard font-bold text-[20px] leading-7 text-[#171a1d] ${TRACKING}`}>{value}</span>
        </span>
        <span className={`font-pretendard text-[12px] leading-[18px] ${TRACKING}`} style={{ color: subColor }}>{sub}</span>
      </span>
      <span className={`relative flex w-full h-10 ${visualAlign === 'end' ? 'items-end' : 'items-center'}`}>{visual}</span>
    </button>
  );
}

function TileSpark({ values }) {
  const W = 116; const H = 20;
  const curve = flowPoints(reducePoints(sparkPoints(values, W, H, 1), 7));
  const end = curve[curve.length - 1];
  return (
    <span className="relative block" style={{ width: W, height: H }}>
      <FadeLine d={toPath(curve)} width={W} height={H} />
      <HaloDot size={12} style={{ left: end[0] - 6, top: end[1] - 6 }} />
    </span>
  );
}

function TileProgress({ ratio }) {
  const fill = Math.max(8, Math.min(120, 120 * ratio));
  return (
    <span className="relative block w-[120px] h-1.5 rounded-[3px] bg-[#f1f3f5]">
      <span className="absolute left-0 top-0 h-1.5 rounded-[3px]" style={{ width: fill, background: FADE_GRADIENT }} />
      <HaloDot size={16} style={{ left: fill - 10, top: -5 }} />
    </span>
  );
}

function TileBars({ values }) {
  const max = Math.max(...values, 1);
  return (
    <span className="flex items-end gap-1 h-[30px]">
      {values.map((v, i) => (
        <span key={i} className="w-[5px] rounded-[1px]" style={{ height: Math.max(2, (v / max) * 23), background: i === values.length - 1 ? POINT : 'rgba(113,113,255,0.2)' }} />
      ))}
    </span>
  );
}

function SummaryTab({ model, report, reportStatus, onAskCoach, onRetryReport, goTab }) {
  const { trend, maintenance, strength, weekly, week } = model;
  const { thisWeek, lastWeek } = week;
  const hasWorkout = weekly.some(w => w.days > 0);
  const volumeChange = lastWeek?.volume ? Math.round(((thisWeek.volume - lastWeek.volume) / lastWeek.volume) * 100) : null;
  const towardGoal = trend.ready && trend.goal && trend.weeklyDelta && Math.sign(trend.goal - trend.current) === Math.sign(trend.weeklyDelta);

  return (
    <>
      <AiReport status={reportStatus} report={report} onAskCoach={onAskCoach} onRetry={onRetryReport} />
      <div className="grid grid-cols-2 gap-3">
        <Tile
          label="공복 체중"
          value={trend.ready ? kg(trend.current) : '? kg'}
          sub={trend.ready
            ? (trend.weeklyDelta !== null ? `지난주보다 ${signed(trend.weeklyDelta)}kg` : '7일 평균')
            : `${trend.need}일 더 기록하면 보여요`}
          subColor={towardGoal ? '#03b26c' : undefined}
          visual={trend.ready && trend.series.length > 1 && <TileSpark values={trend.series.map(p => p.avg)} />}
          onClick={() => goTab('weight')}
        />
        <Tile
          label="유지 칼로리"
          value={maintenance.ready ? `${comma(maintenance.tdee)}kcal` : '? kcal'}
          sub={maintenance.ready ? `평균 섭취 ${comma(maintenance.avgIntake)}kcal` : '식단·체중 기록이 더 필요해요'}
          visual={maintenance.ready && <TileProgress ratio={maintenance.avgIntake / maintenance.tdee} />}
          onClick={() => goTab('diet')}
        />
        <Tile
          label="최근 7일 볼륨"
          value={hasWorkout ? `${comma(thisWeek.volume)}kg` : '? kg'}
          sub={!hasWorkout ? '운동을 기록하면 보여요'
            : volumeChange !== null ? `그 전 7일보다 ${volumeChange > 0 ? '+' : ''}${volumeChange}%` : `${thisWeek.workoutDays}일 운동`}
          subColor={hasWorkout && volumeChange > 0 ? '#03b26c' : undefined}
          visual={hasWorkout && <TileBars values={weekly.map(w => w.volume)} />}
          visualAlign="end"
          onClick={() => goTab('workout')}
        />
        <Tile
          label="운동 성장"
          value={!strength.exercises.length ? '?' : strength.records.length ? `신기록 ${strength.records.length}개` : '신기록 없음'}
          sub={strength.exercises.length ? '최근 30일' : '같은 종목을 2번 이상 기록하면 보여요'}
          visual={strength.stalled.length > 0 && <Badge tone="yellow">정체 {strength.stalled.length}종목</Badge>}
          visualAlign="end"
          onClick={() => goTab('workout')}
        />
      </div>
    </>
  );
}

/* ── 체중 ── */
function WeightChart({ series }) {
  const [selected, setSelected] = useState(series.length - 1);
  const index = Math.min(selected, series.length - 1);
  const W = 330; const TOP = 48; const PLOT = 120; const H = TOP + PLOT; const PAD = 10;
  const minX = series[0].x;
  const spanX = Math.max(1, series[series.length - 1].x - minX);
  const ys = series.flatMap(p => [p.y, p.avg]);
  const minY = Math.min(...ys);
  const spanY = Math.max(0.6, Math.max(...ys) - minY);
  const px = x => PAD + ((x - minX) / spanX) * (W - PAD * 2);
  const py = y => TOP + PAD + (1 - (y - minY) / spanY) * (PLOT - PAD * 2);
  const point = series[index];
  const curve = flowPoints(reducePoints(series.map(p => [px(p.x), py(p.avg)]), 9));
  const pick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = minX + ((Math.min(rect.width, Math.max(0, event.clientX - rect.left)) / rect.width) * W - PAD) / (W - PAD * 2) * spanX;
    setSelected(series.reduce((best, p, i) => (Math.abs(p.x - x) < Math.abs(series[best].x - x) ? i : best), 0));
  };
  const pct = v => `${(v / W) * 100}%`;
  const pcty = v => `${(v / H) * 100}%`;

  return (
    <div className="relative w-full touch-pan-y" style={{ aspectRatio: `${W} / ${H}` }} onPointerDown={pick} onPointerMove={e => e.buttons && pick(e)} role="img" aria-label="공복 체중 추이">
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="weight-line" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2="0">
            <stop offset="0" stopColor={POINT} stopOpacity="0.2" />
            <stop offset="1" stopColor={POINT} />
          </linearGradient>
        </defs>
        <line x1={px(point.x)} x2={px(point.x)} y1={TOP} y2={H} stroke="#171a1d" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="2 3" strokeLinecap="round" />
        {series.map(p => <circle key={p.x} cx={px(p.x)} cy={py(p.y)} r="2" fill="#ced4da" />)}
        <path d={toPath(curve)} fill="none" stroke="url(#weight-line)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={px(point.x)} cy={py(point.y)} r="4.5" fill={POINT} stroke="#fff" strokeWidth="2" />
      </svg>
      <HaloDot size={16} style={{ left: `calc(${pct(px(point.x))} - 8px)`, top: `calc(${pcty(yOnCurve(curve, px(point.x)))} - 8px)` }} />
      <Tooltip leftPct={(px(point.x) / W) * 100} lines={[kg(point.y), formatDay(point.date)]} />
    </div>
  );
}

function weightInsight({ goal, eta, ratePerWeek }) {
  if (!goal) return '마이페이지에서 목표 체중을 정하면 도달 예상일을 알려드려요.';
  if (!eta) return '체중을 며칠 더 기록하면 목표 도달 예상일을 알려드려요.';
  if (eta.status === 'reached') return `목표 ${kg(goal)}에 도달했어요.`;
  if (eta.status === 'on-track') return `이 속도면 ${formatDay(eta.date)}쯤 목표 ${kg(goal)}에 도달해요.`;
  if (eta.status === 'away') return `최근 4주는 목표와 반대 방향이에요 (주 ${signed(ratePerWeek)}kg).`;
  return '최근 4주간 체중 변화가 거의 없어요.';
}

function WeightTab({ trend, weeks, setWeeks, onRecord }) {
  if (!trend.ready) {
    return <GhostCard title="공복 체중" message={`아침 공복 체중을 ${trend.need}일 더 기록하면 추이를 보여드려요.`} cta="체중 기록하기" onRecord={() => onRecord('weight')} />;
  }
  const lastX = trend.series[trend.series.length - 1].x;
  const series = trend.series.filter(p => p.x > lastX - weeks * 7);
  const lightest = series.reduce((a, b) => (b.y < a.y ? b : a));
  const heaviest = series.reduce((a, b) => (b.y > a.y ? b : a));

  return (
    <>
      <Headline before="7일 평균 " value={kg(trend.current)} after="이에요" sub={weightInsight(trend)} />
      <Card className="px-5 pt-5 pb-6 flex flex-col gap-3">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h3 className={`font-pretendard font-semibold text-[14px] leading-5 text-[#171a1d] ${TRACKING}`}>체중 추이</h3>
            <Segmented label="기간" value={weeks} onChange={setWeeks} options={[{ value: 4, label: '4주' }, { value: 8, label: '8주' }]} />
          </div>
          <WeightChart key={weeks} series={series} />
        </div>
        <div className="flex items-center gap-3">
          <LegendItem kind="line">7일 평균</LegendItem>
          <LegendItem kind="dot">매일 기록</LegendItem>
        </div>
      </Card>
      <Card className="px-5 py-6">
        <Rows rows={[
          trend.goal && { label: '목표까지', value: `${signed(trend.goal - trend.current)}kg` },
          trend.weeklyDelta !== null && { label: '지난주 대비', value: `${signed(trend.weeklyDelta)}kg` },
          trend.ratePerWeek !== null && { label: '주당 변화 (최근 4주)', value: `${signed(trend.ratePerWeek)}kg` },
          trend.eta?.status === 'on-track' && { label: '목표 도달 예상', value: formatDay(trend.eta.date) },
        ]} />
      </Card>
      <PairTiles items={[
        { label: '가장 가벼웠던 날', value: kg(lightest.y), sub: formatDay(lightest.date) },
        { label: '가장 무거웠던 날', value: kg(heaviest.y), sub: formatDay(heaviest.date) },
      ]} />
    </>
  );
}

/* ── 식단 ── */
function IntakeChart({ days, from, to, maintenance, weightSeries }) {
  const [selected, setSelected] = useState(days.length - 1);
  const index = Math.min(selected, days.length - 1);
  const W = 330; const TOP = 55; const H = 178; const PLOT = H - TOP;
  const spanX = Math.max(1, to - from);
  const maxKcal = Math.max(...days.map(d => d.kcal), maintenance.ready ? maintenance.tdee : 0) * 1.12;
  const px = x => ((x - from) / spanX) * W;
  const ky = kcal => H - (kcal / maxKcal) * PLOT;
  const top = flowPoints(reducePoints(days.map(d => [px(d.x), ky(d.kcal)]), 7));
  const area = top.length > 1 ? `${toPath(top)} L ${top[top.length - 1][0].toFixed(2)} ${H} L ${top[0][0].toFixed(2)} ${H} Z` : '';
  const line = weightSeries.filter(p => p.x >= from && p.x <= to);
  const minW = Math.min(...line.map(p => p.avg));
  const spanW = Math.max(0.6, Math.max(...line.map(p => p.avg)) - minW);
  const wy = v => TOP + 20 + (1 - (v - minW) / spanW) * 36;
  const weightTop = line.length > 1 ? flowPoints(reducePoints(line.map(p => [px(p.x), wy(p.avg)]), 7)) : [];
  const weightArea = weightTop.length ? `${toPath(weightTop)} L ${weightTop[weightTop.length - 1][0].toFixed(2)} ${H} L ${weightTop[0][0].toFixed(2)} ${H} Z` : '';
  const day = days[index];
  // 기록이 기간 중간에서 시작하거나 끝나면 면적이 잘린 것처럼 보인다. 그 가장자리는 서서히 사라지게 한다.
  const edgeFade = (id, curve) => {
    if (curve.length < 2) return null;
    const x0 = curve[0][0]; const x1 = curve[curve.length - 1][0];
    const fade = Math.min(28, (x1 - x0) / 3);
    const left = x0 > 2; const right = x1 < W - 2;
    if (!left && !right) return null;
    return (
      <>
        <linearGradient id={`${id}-g`} gradientUnits="userSpaceOnUse" x1={x0} y1="0" x2={x1} y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity={left ? 0 : 1} />
          <stop offset={fade / (x1 - x0)} stopColor="#fff" />
          <stop offset={1 - fade / (x1 - x0)} stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity={right ? 0 : 1} />
        </linearGradient>
        <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
          <rect x={x0} y="0" width={x1 - x0} height={H} fill={`url(#${id}-g)`} />
        </mask>
      </>
    );
  };
  const intakeMask = edgeFade('intake-edge', top);
  const weightMask = edgeFade('weight-edge', weightTop);
  const pick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = from + (Math.min(rect.width, Math.max(0, event.clientX - rect.left)) / rect.width) * spanX;
    setSelected(days.reduce((best, d, i) => (Math.abs(d.x - x) < Math.abs(days[best].x - x) ? i : best), 0));
  };

  return (
    <div className="relative w-full touch-pan-y" style={{ aspectRatio: `${W} / ${H}` }} onPointerDown={pick} onPointerMove={e => e.buttons && pick(e)} role="img" aria-label="하루 섭취 칼로리와 체중">
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="intake-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={INTAKE} />
            <stop offset="1" stopColor={POINT} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="weight-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={POINT} />
            <stop offset="1" stopColor={POINT} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="intake-haze" x1="1" y1="0" x2="0" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#fff" />
          </linearGradient>
          <linearGradient id="intake-line" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2="0">
            <stop offset="0" stopColor={POINT} stopOpacity="0.2" />
            <stop offset="1" stopColor={POINT} />
          </linearGradient>
          {intakeMask}
          {weightMask}
          <linearGradient id="intake-maint" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2="0">
            <stop offset="0" stopColor="#f1f3f5" />
            <stop offset="1" stopColor="#868e96" />
          </linearGradient>
        </defs>
        {maintenance.ready && (
          <line x1="0" x2={W} y1={ky(maintenance.tdee)} y2={ky(maintenance.tdee)} stroke="url(#intake-maint)" strokeWidth="1" strokeDasharray="3 4" strokeLinecap="round" />
        )}
        {area && (
          <g mask={intakeMask ? 'url(#intake-edge)' : undefined}>
            <path d={area} fill="url(#intake-fill)" />
            <path d={area} fill="url(#intake-haze)" opacity="0.4" />
          </g>
        )}
        {weightArea && (
          <g mask={weightMask ? 'url(#weight-edge)' : undefined}>
            <path d={weightArea} fill="url(#weight-fill)" />
            <path d={weightArea} fill="url(#intake-haze)" opacity="0.4" />
            <path d={toPath(weightTop)} fill="none" stroke="url(#intake-line)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}
      </svg>
      <Tooltip leftPct={(px(day.x) / W) * 100} lines={[`${comma(day.kcal)}kcal`, formatDay(day.date)]} />
    </div>
  );
}

const PROTEIN_BADGE = { ok: ['green', '적정'], low: ['yellow', '부족'], high: ['grey', '충분'] };

function ProteinRange({ diet }) {
  const { avgProtein, proteinRange: range, proteinStatus } = diet;
  if (!range) return null;
  const max = Math.max(range.max * 1.25, avgProtein * 1.1);
  const pct = v => `${Math.min(100, (v / max) * 100)}%`;
  const [tone, label] = PROTEIN_BADGE[proteinStatus];
  return (
    <Card className="px-5 py-6 flex flex-col gap-3">
      <div className="flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <h3 className={`flex items-center gap-1 font-pretendard font-bold text-[16px] leading-[22.4px] text-[#171a1d] ${TRACKING}`}>
            단백질 하루 평균 <span style={{ color: POINT }}>{avgProtein}g</span>
          </h3>
          <Badge tone={tone}>{label}</Badge>
        </div>
        <div className="relative h-[34px]">
          <div className="absolute left-0 right-0 top-1.5 h-2 rounded bg-[#f1f3f5]" />
          <div className="absolute top-1.5 h-2 rounded" style={{ left: pct(range.min), width: `calc(${pct(range.max)} - ${pct(range.min)})`, background: 'rgba(113,113,255,0.2)' }} />
          <HaloDot size={16} style={{ left: `calc(${pct(avgProtein)} - 8px)`, top: 2 }} />
          {[range.min, range.max].map(v => (
            <span key={v} className={`absolute top-[18px] -translate-x-1/2 font-pretendard text-[11px] leading-4 text-[#868e96] ${TRACKING}`} style={{ left: pct(v) }}>{v}g</span>
          ))}
        </div>
      </div>
      <Caption>내 체중 기준 권장 범위예요 (1kg당 1.6~2.2g).</Caption>
    </Card>
  );
}

function DietTab({ diet, maintenance, trend, onRecord }) {
  const [weeks, setWeeks] = useState(4);
  if (!diet.ready) {
    return <GhostCard bars title="식단" message={`식단을 ${diet.need}일 더 기록하면 섭취 추이를 보여드려요.`} cta="식단 기록하기" onRecord={() => onRecord('diet')} />;
  }
  const from = diet.to - weeks * 7 + 1;
  const days = diet.days.filter(d => d.x >= from);
  const gap = maintenance.ready ? diet.avgKcal - maintenance.tdee : null;
  const sub = gap === null
    ? '식단과 공복 체중 기록이 더 쌓이면 나의 유지 칼로리를 계산해 드려요.'
    : Math.abs(gap) < 50 ? `유지 칼로리 약 ${comma(maintenance.tdee)}kcal와 거의 같아요.`
    : `유지 칼로리 약 ${comma(maintenance.tdee)}kcal보다 ${comma(Math.abs(gap))}kcal ${gap < 0 ? '적어요' : '많아요'}.`;

  return (
    <>
      <Headline before="하루 평균 " value={`${comma(diet.avgKcal)}kcal`} after=" 먹었어요" sub={sub} />
      <Card className="px-5 py-6 flex flex-col gap-2">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h3 className={`font-pretendard font-semibold text-[14px] leading-5 text-[#171a1d] ${TRACKING}`}>섭취와 체중</h3>
            <Segmented label="기간" value={weeks} onChange={setWeeks} options={[{ value: 2, label: '2주' }, { value: 4, label: '4주' }]} />
          </div>
          <div className="flex flex-col gap-3">
            {days.length > 0
              ? <IntakeChart key={weeks} days={days} from={from} to={diet.to} maintenance={maintenance} weightSeries={trend.ready ? trend.series : []} />
              : <p className={`py-10 text-center font-pretendard text-[14px] text-[#868e96] ${TRACKING}`}>이 기간에는 식단 기록이 없어요.</p>}
            <div className="flex items-center gap-3">
              <LegendItem kind="box">섭취 칼로리</LegendItem>
              {trend.ready && <LegendItem kind="line">체중</LegendItem>}
              {maintenance.ready && <LegendItem kind="dash">유지 칼로리</LegendItem>}
            </div>
          </div>
        </div>
        {maintenance.ready && <Caption small>유지 칼로리는 식단을 기록한 {maintenance.dietDays}일과 공복 체중 변화로 추정한 값이에요.</Caption>}
      </Card>
      <ProteinRange diet={diet} />
      <PairTiles items={[
        { label: '식단 기록한 날', value: `${diet.days.length}일`, sub: '최근 4주' },
        diet.proteinHitDays !== null
          ? { label: '단백질 채운 날', value: `${diet.proteinHitDays}일`, sub: `${diet.proteinRange.min}g 이상` }
          : { label: '평균 단백질', value: `${diet.avgProtein}g`, sub: '하루 기준' },
      ]} />
    </>
  );
}

/* ── 운동 ── */
const WORKOUT_METRICS = [
  { value: 'volume', label: '볼륨', format: v => `${comma(v)}kg` },
  { value: 'days', label: '운동 일수', format: v => `${v}일` },
];

function WeeklyBars({ weekly, metric }) {
  const [selected, setSelected] = useState(weekly.length - 1);
  const index = Math.min(selected, weekly.length - 1);
  const config = WORKOUT_METRICS.find(m => m.value === metric);
  const max = Math.max(...weekly.map(w => w[metric]), 1);
  return (
    <div className="flex flex-col gap-10">
      <div className="relative h-12">
        <Tooltip leftPct={((index + 0.5) / weekly.length) * 100} lines={[config.format(weekly[index][metric]), `${weekly[index].label} 주`]} />
      </div>
      <div className="flex items-end gap-2 h-[106px]">
        {weekly.map((week, i) => {
          const on = i === index;
          return (
            <button key={week.label} onClick={() => setSelected(i)} aria-label={`${week.label} 주 ${config.format(week[metric])}`} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
              <span className="w-full rounded-t-[8px]" style={{ height: week[metric] > 0 ? Math.max(8, (week[metric] / max) * 88) : 2, background: on ? POINT : 'rgba(113,113,255,0.2)' }} />
              <span className={`font-pretendard text-[10px] leading-3 ${on ? 'font-bold' : ''} ${TRACKING}`} style={{ color: on ? POINT : '#868e96' }}>{week.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ExerciseRow({ exercise, last }) {
  const { name, e1rm, top, delta, stalledWeeks, series } = exercise;
  const stalled = stalledWeeks > 0;
  // 정체했거나 기록이 떨어진 종목은 붉은 선, 오른 종목만 보라 선
  const declining = stalled || delta <= -0.5;
  return (
    <li className={`flex items-center gap-3 py-3 ${last ? '' : 'border-b border-[#f1f3f5]'}`}>
      <div className="min-w-0 flex-1">
        <p className={`font-pretendard font-semibold text-[14px] leading-5 text-[#495057] truncate ${TRACKING}`}>{name}</p>
        <p className={`font-pretendard text-[12px] leading-[18px] text-[#868e96] ${TRACKING}`}>최근 {num(top.weight)}kg × {top.reps}회</p>
      </div>
      <div className="flex items-center gap-1 flex-none">
        {series.length > 1
          ? <FadeLine d={flowPath(sparkPoints(series, 52, 22, 4), 6)} width={52} height={22} color={declining ? STALL : POINT} />
          : <span className="w-[52px]" />}
        <div className="w-20 flex flex-col items-end gap-0.5">
          <span className={`font-pretendard font-bold text-[14px] leading-5 text-[#171a1d] ${TRACKING}`}>{kg(e1rm)}</span>
          {stalled
            ? <Badge tone="yellow">{stalledWeeks}주째 정체</Badge>
            : Math.abs(delta) >= 0.5 && (
              <span className={`font-pretendard font-semibold text-[12px] leading-[18px] ${TRACKING}`} style={{ color: delta > 0 ? '#03b26c' : '#868e96' }}>{signed(delta)}kg</span>
            )}
        </div>
      </div>
    </li>
  );
}

function WorkoutTab({ strength, weekly, week, weeks, setWeeks, onRecord }) {
  const [metric, setMetric] = useState('volume');
  const hasAny = weekly.some(w => w.days > 0);
  if (!hasAny) {
    return <GhostCard bars title="운동" message="운동을 기록하면 주간 볼륨과 종목별 성장을 보여드려요." cta="운동 기록하기" onRecord={() => onRecord('workout')} />;
  }
  const { thisWeek, lastWeek } = week;
  const change = lastWeek?.volume ? Math.round(((thisWeek.volume - lastWeek.volume) / lastWeek.volume) * 100) : null;
  const { exercises, records, parts } = strength;
  const topShare = parts[0]?.share || 1;

  return (
    <>
      <Headline
        before="최근 7일간 " value={`${thisWeek.workoutDays}일`} after=" 운동했어요"
        sub={change !== null ? `볼륨은 ${comma(thisWeek.volume)}kg, 그 전 7일보다 ${change > 0 ? '+' : ''}${change}%예요.` : `볼륨은 ${comma(thisWeek.volume)}kg이에요.`}
      />
      <Card className="px-5 py-6 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <Segmented label="지표" value={metric} onChange={setMetric} options={WORKOUT_METRICS} />
          <Segmented label="기간" value={weeks} onChange={setWeeks} options={[{ value: 4, label: '4주' }, { value: 8, label: '8주' }]} />
        </div>
        <WeeklyBars key={`${metric}-${weeks}`} weekly={weekly.slice(-weeks)} metric={metric} />
      </Card>

      {records.length > 0 && (
        <Card className="px-5 py-6 flex flex-col gap-8">
          <SectionTitle>최근 30일 신기록</SectionTitle>
          <ul className="flex flex-col gap-3">
            {records.map(r => (
              <li key={r.name} className="flex items-center gap-2">
                <Badge tone="green">신기록</Badge>
                <span className={`min-w-0 flex-1 truncate font-pretendard font-medium text-[14px] leading-5 text-[#495057] ${TRACKING}`}>{r.name} {num(r.weight)}kg × {r.reps}회</span>
                <span className={`flex-none font-pretendard text-[12px] leading-[18px] text-[#868e96] ${TRACKING}`}>{formatDay(r.date)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {exercises.length > 0 && (
        <Card className="px-5 py-6 flex flex-col gap-6">
          <div className="flex items-center justify-between pb-1">
            <SectionTitle>자주 하는 종목</SectionTitle>
            <Caption>추정 1RM · 최근 8주</Caption>
          </div>
          <ul>
            {exercises.map((e, i) => <ExerciseRow key={e.name} exercise={e} last={i === exercises.length - 1} />)}
          </ul>
          <Caption>추정 1RM은 기록한 무게와 횟수로 계산한 1회 최대 중량이에요.</Caption>
        </Card>
      )}

      {parts.length > 1 && (
        <Card className="px-5 py-6 flex flex-col gap-8">
          <SectionTitle>부위별 볼륨 · 최근 4주</SectionTitle>
          <div className="flex flex-col gap-3">
            {parts.map(p => (
              <div key={p.part} className="flex items-center gap-3">
                <span className={`w-11 flex-none truncate font-pretendard text-[13px] leading-5 text-[#646d76] ${TRACKING}`}>{p.part}</span>
                <div className="flex-1 h-2 rounded bg-[#f1f3f5] overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${(p.share / topShare) * 94.7}%`, background: FADE_GRADIENT }} />
                </div>
                <span className={`w-9 flex-none text-right font-pretendard font-semibold text-[13px] leading-5 text-[#171a1d] ${TRACKING}`}>{Math.round(p.share * 100)}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

/* ── 더보기 메뉴 ── */
const MENU_ICONS = {
  refresh: <><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" /><path d="M21 3v5h-5" /></>,
  report: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="M19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" /></>,
  goal: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
};

const GUIDE = [
  ['7일 평균 체중', '매일의 체중은 수분·식사에 따라 흔들려요. 최근 7일 기록의 평균으로 흐름만 보여드려요.'],
  ['유지 칼로리', '최근 4주간 먹은 양과 체중 변화를 맞춰 계산해요. 체중 1kg 변화를 약 7,700kcal로 보고, 식단 10일·체중 2주 이상 기록이 있어야 나와요.'],
  ['추정 1RM', '기록한 무게와 횟수로 계산한 1회 최대 중량이에요 (무게 × (1 + 횟수 ÷ 30)). 15회를 넘는 세트는 계산에서 빼요.'],
  ['정체', '같은 종목을 3번 이상 했는데 3주 넘게 최고 기록을 넘지 못하면 정체로 표시해요.'],
];

function Sheet({ onClose, children }) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      <div onClick={onClose} className="absolute inset-0 bg-[#171719]/50 animate-[bsFadeIn_0.3s_cubic-bezier(0.16,1,0.3,1)_forwards]" />
      <div className="relative w-full max-w-[430px] mx-auto bg-white rounded-t-[24px] px-4 pb-[calc(40px+env(safe-area-inset-bottom))] flex flex-col items-center animate-[bottomSheetUp_0.4s_cubic-bezier(0.2,0.8,0.2,1)_forwards] shadow-lg">
        <div className="py-3 w-full flex justify-center"><div className="w-10 h-1 rounded-full bg-[#e9ecef]" /></div>
        {children}
      </div>
    </div>
  );
}

function MoreMenu({ view, setView, actions }) {
  if (!view) return null;
  const close = () => setView(null);
  if (view === 'guide') {
    return (
      <Sheet onClose={close}>
        <div className="w-full pb-2">
          <h2 className={`px-1 pb-3 font-pretendard font-bold text-[18px] leading-7 text-[#171a1d] ${TRACKING}`}>숫자는 이렇게 계산해요</h2>
          <dl className="flex flex-col gap-4 px-1">
            {GUIDE.map(([term, text]) => (
              <div key={term}>
                <dt className={`font-pretendard font-semibold text-[14px] leading-5 text-[#171a1d] ${TRACKING}`}>{term}</dt>
                <dd className={`mt-0.5 font-pretendard text-[14px] leading-[22px] text-[#646d76] ${TRACKING}`}>{text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Sheet>
    );
  }
  const items = [
    { icon: 'refresh', title: '새로고침', sub: '방금 추가한 기록까지 다시 불러와요', run: actions.onRefresh },
    { icon: 'report', title: 'AI 리포트 다시 쓰기', sub: '지금 기록으로 이번 주 리포트를 새로 만들어요', run: actions.onRegenerateReport },
    { icon: 'goal', title: '목표 체중 바꾸기', sub: '마이페이지에서 목표 체중을 수정해요', run: actions.onEditGoal },
    { icon: 'info', title: '숫자 계산 기준', sub: '유지 칼로리·추정 1RM을 어떻게 구하는지 봐요', run: () => setView('guide'), keepOpen: true },
  ];
  return (
    <Sheet onClose={close}>
      <div className="w-full flex flex-col divide-y divide-[#f1f3f5]">
        {items.map(item => (
          <button
            key={item.title}
            onClick={() => { if (!item.keepOpen) close(); item.run?.(); }}
            className="flex items-center gap-3 w-full py-4 text-left active:opacity-50 text-[#495057]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-none" aria-hidden="true">{MENU_ICONS[item.icon]}</svg>
            <span className="flex flex-col gap-0.5">
              <span className={`font-pretendard font-medium text-[16px] leading-6 text-[#495057] ${TRACKING}`}>{item.title}</span>
              <span className={`font-pretendard text-[14px] leading-5 text-[#868e96] ${TRACKING}`}>{item.sub}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/* ── 화면 ── */
export default function AnalysisTabsView({ status = 'ready', model, report, reportStatus, onAskCoach, onRecord, onRetry, onRetryReport, onBack, onRegenerateReport, onEditGoal, initialTab = 'summary' }) {
  const [tab, setTab] = useState(initialTab);
  const [menu, setMenu] = useState(null); // null | 'menu' | 'guide'
  const [weeks, setWeeks] = useState(8);
  const ready = status === 'ready' && model;

  return (
    <div className="flex flex-col h-full bg-[#f8f9fa]">
      <header className="flex-none bg-white border-b border-[#f1f3f5]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-4 h-14 px-4">
          <Pressable pressScale={0.85} onClick={onBack} aria-label="홈으로" className="flex items-center justify-center w-6 h-6 flex-none">
            <IcBack />
          </Pressable>
          <h1 className={`flex-1 pl-1 font-pretendard font-semibold text-[20px] leading-[30px] text-black ${TRACKING}`}>분석</h1>
          <Pressable pressScale={0.85} onClick={() => setMenu('menu')} aria-label="더보기" className="flex items-center justify-center w-6 h-6 flex-none">
            <IcMore />
          </Pressable>
        </div>
        <div role="tablist" className="flex">
          {TABS.map(item => {
            const on = tab === item.id;
            return (
              <button
                key={item.id}
                role="tab"
                aria-selected={on}
                onClick={() => setTab(item.id)}
                className={`flex-1 py-2 border-b-2 font-pretendard text-[16px] leading-6 ${on ? 'font-bold' : 'font-medium text-[#868e96] border-white'} ${TRACKING}`}
                style={on ? { color: POINT, borderColor: POINT } : undefined}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 px-4 pt-4 pb-[120px]">
          {status === 'loading' && (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(113,113,255,0.2)', borderTopColor: POINT }} />
            </div>
          )}
          {status === 'error' && (
            <div className="px-1 py-20 text-center">
              <p role="alert" className={`font-pretendard text-[14px] text-[#646d76] ${TRACKING}`}>기록을 불러오지 못했어요.</p>
              <button onClick={onRetry} className={`mt-3 font-pretendard font-semibold text-[14px] active:opacity-50 ${TRACKING}`} style={{ color: POINT }}>다시 시도</button>
            </div>
          )}
          {ready && tab === 'summary' && <SummaryTab model={model} report={report} reportStatus={reportStatus} onAskCoach={onAskCoach} onRetryReport={onRetryReport} goTab={setTab} />}
          {ready && tab === 'weight' && <WeightTab trend={model.trend} weeks={weeks} setWeeks={setWeeks} onRecord={onRecord} />}
          {ready && tab === 'diet' && <DietTab diet={model.diet} maintenance={model.maintenance} trend={model.trend} onRecord={onRecord} />}
          {ready && tab === 'workout' && <WorkoutTab strength={model.strength} weekly={model.weekly} week={model.week} weeks={weeks} setWeeks={setWeeks} onRecord={onRecord} />}
        </div>
      </main>
      <MoreMenu view={menu} setView={setMenu} actions={{ onRefresh: onRetry, onRegenerateReport, onEditGoal }} />
    </div>
  );
}
