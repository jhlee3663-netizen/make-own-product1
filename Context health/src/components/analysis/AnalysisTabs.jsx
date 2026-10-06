import React, { useState } from 'react';
import MainTab from '../common/MainTab';
import { IcSpark } from '../icons/Icons';

/* 분석 탭 (칩 구조): 요약 | 체중 | 식단 | 운동.
   계산 결과(model)를 받아 그리기만 한다. 카드마다 숫자 + 해석 한 줄, 색은 의미가 있을 때만. */

const TABS = [
  { id: 'summary', label: '요약' },
  { id: 'weight', label: '체중' },
  { id: 'diet', label: '식단' },
  { id: 'workout', label: '운동' },
];

const BRAND = '#7171FF';
const kg = (v, digits = 1) => `${v.toFixed(digits)}kg`;
const num = v => String(Math.round(v * 10) / 10);
const signed = (v, digits = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;
const comma = v => Math.round(v).toLocaleString();

function formatDay(dateKey) {
  const [, m, d] = dateKey.split('-').map(Number);
  return `${m}월 ${d}일`;
}

/* ── 공용 조각 ── */
function Card({ children, className = '' }) {
  return <section className={`mx-4 mt-3 bg-white rounded-[24px] shadow-[0_2px_12px_rgba(3,27,38,0.05)] px-5 py-6 ${className}`}>{children}</section>;
}

const BADGE_TONE = {
  green: 'bg-state-success-weak text-state-success',
  yellow: 'bg-state-warning-weak text-[#dd7d02]',
  blue: 'bg-brand-light text-brand',
  grey: 'bg-ui-2 text-typo-secondary',
};

function Badge({ tone = 'grey', children }) {
  return (
    <span className={`inline-flex items-center px-2 h-[22px] rounded-md font-pretendard font-semibold text-caption-m tracking-[-0.3px] whitespace-nowrap ${BADGE_TONE[tone]}`}>
      {children}
    </span>
  );
}

/* 문장형 제목: 숫자만 색을 입힌다 */
function Sentence({ before, value, after, sub }) {
  return (
    <div className="px-5 pt-6 pb-1">
      <p className="font-pretendard font-bold text-[22px] leading-[31px] text-typo-strong tracking-[-0.5px] [word-break:keep-all]">
        {before}<span className="text-brand">{value}</span>{after}
      </p>
      {sub && <p className="mt-1 font-pretendard text-body-s text-typo-secondary tracking-[-0.35px]">{sub}</p>}
    </div>
  );
}

function Rows({ rows }) {
  return (
    <dl className="divide-y divide-ui-2">
      {rows.filter(Boolean).map(row => (
        <div key={row.label} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
          <dt className="font-pretendard text-body-s text-typo-secondary tracking-[-0.35px]">{row.label}</dt>
          <dd className="font-pretendard font-semibold text-body-s text-typo-strong tracking-[-0.35px]">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PairTiles({ items }) {
  return (
    <div className="mx-4 mt-3 grid grid-cols-2 gap-3">
      {items.map(item => (
        <div key={item.label} className="bg-white rounded-[24px] shadow-[0_2px_12px_rgba(3,27,38,0.05)] px-5 py-5">
          <p className="font-pretendard text-caption-l text-typo-alternative tracking-[-0.325px]">{item.label}</p>
          <p className="mt-1 font-pretendard font-extrabold text-body-xl leading-7 text-typo-strong">{item.value}</p>
          {item.sub && <p className="font-pretendard text-caption-m text-typo-alternative tracking-[-0.3px]">{item.sub}</p>}
        </div>
      ))}
    </div>
  );
}

function Segmented({ options, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex p-0.5 rounded-lg bg-ui-2">
      {options.map(option => (
        <button
          key={option.value}
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`px-3 h-7 rounded-md font-pretendard font-semibold text-caption-l tracking-[-0.325px] transition-colors ${
            value === option.value ? 'bg-white text-typo-strong shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-typo-alternative'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SectionHeader({ title, right }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="font-pretendard font-semibold text-body-s text-typo-strong tracking-[-0.35px]">{title}</h3>
      {right}
    </div>
  );
}

function Tooltip({ leftPct, lines }) {
  const align = leftPct < 18 ? 'translate-x-0' : leftPct > 82 ? '-translate-x-full' : '-translate-x-1/2';
  return (
    <div className={`absolute top-0 ${align} px-2.5 py-1.5 rounded-lg bg-typo-strong text-white text-center pointer-events-none`} style={{ left: `${leftPct}%` }}>
      <p className="font-pretendard font-bold text-caption-l whitespace-nowrap">{lines[0]}</p>
      <p className="font-pretendard text-caption-s text-white/70 whitespace-nowrap">{lines[1]}</p>
    </div>
  );
}

function pickNearest(event, count) {
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  return Math.round(ratio * (count - 1));
}

function Spark({ values, color = BRAND, width = 64, height = 24 }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const span = Math.max(0.0001, Math.max(...values) - min);
  const pts = values.map((v, i) => `${2 + (i / (values.length - 1)) * (width - 4)},${2 + (1 - (v - min) / span) * (height - 4)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MiniBars({ values, height = 24 }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-[3px]" style={{ height }} aria-hidden="true">
      {values.map((v, i) => (
        <div key={i} className={`w-[5px] rounded-sm ${i === values.length - 1 ? 'bg-brand' : 'bg-[#d4d4ff]'}`} style={{ height: Math.max(2, (v / max) * height) }} />
      ))}
    </div>
  );
}

/* 기록이 부족할 때: 흐린 예시 차트 위에 안내와 기록 버튼 */
function GhostCard({ title, message, cta, onRecord, bars = false }) {
  const sample = [62, 58, 60, 52, 54, 46, 48, 40, 43, 36, 38, 30];
  return (
    <Card>
      <h3 className="font-pretendard font-semibold text-caption-l text-typo-alternative tracking-[-0.325px]">{title}</h3>
      <div className="relative mt-3 h-[132px] rounded-2xl bg-ui-1 overflow-hidden">
        <svg viewBox="0 0 300 132" className="absolute inset-0 w-full h-full opacity-50 blur-[2px]" preserveAspectRatio="none" aria-hidden="true">
          {bars
            ? sample.map((v, i) => <rect key={i} x={14 + i * 23.5} y={132 - (100 - v) * 1.4 - 10} width="14" height={(100 - v) * 1.4} rx="3" fill="#d4d4ff" />)
            : <polyline points={sample.map((v, i) => `${14 + i * 24.7},${(v - 30) * 2.6 + 18}`).join(' ')} fill="none" stroke={BRAND} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="font-pretendard font-medium text-body-s text-typo-normal tracking-[-0.35px]">{message}</p>
          <button onClick={onRecord} className="h-9 px-4 rounded-xl bg-brand font-pretendard font-bold text-caption-l text-white tracking-[-0.3px] active:opacity-70">{cta}</button>
        </div>
      </div>
    </Card>
  );
}

/* ── 요약 ── */
const REPORT_ROWS = [
  { key: 'good', label: '잘한 점', mark: '↑', tone: 'text-state-success' },
  { key: 'improve', label: '바꿀 점', mark: '↓', tone: 'text-[#dd7d02]' },
  { key: 'suggestion', label: '다음 주', mark: '→', tone: 'text-brand' },
];

function AiReport({ status, report, onAskCoach, onRetry }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mx-4 mt-4 bg-white rounded-[24px] shadow-[0_2px_12px_rgba(3,27,38,0.05)] overflow-hidden">
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#228bed] to-[#c509d6] flex items-center justify-center flex-shrink-0"><IcSpark /></div>
          <h2 className="font-pretendard font-semibold text-caption-l text-typo-normal tracking-[-0.325px]">이번 주 AI 리포트</h2>
        </div>

        {status === 'loading' && (
          <div className="mt-4 space-y-2.5" aria-label="리포트를 쓰는 중">
            {[86, 58].map(w => <div key={w} className="h-5 rounded bg-ui-2 animate-pulse" style={{ width: `${w}%` }} />)}
          </div>
        )}

        {status === 'empty' && (
          <p className="mt-3 font-pretendard text-body-s text-typo-secondary tracking-[-0.35px] leading-[22px]">
            운동·식단·체중 중 무엇이든 3일 이상 기록하면 한 주를 정리해 드려요.
          </p>
        )}

        {status === 'error' && (
          <div className="mt-3 flex items-center justify-between">
            <p className="font-pretendard text-body-s text-typo-secondary tracking-[-0.35px]">리포트를 만들지 못했어요.</p>
            <button onClick={onRetry} className="font-pretendard font-semibold text-caption-l text-brand tracking-[-0.325px] active:opacity-50">다시 시도</button>
          </div>
        )}

        {status === 'ready' && report && (
          <>
            <p className="mt-3 font-pretendard font-bold text-body-l text-typo-strong tracking-[-0.45px] [word-break:keep-all]">{report.headline || report.good}</p>
            {open && (
              <dl className="mt-4 space-y-3">
                {REPORT_ROWS.filter(row => report[row.key]).map(row => (
                  <div key={row.key} className="flex gap-3">
                    <dt className={`w-[52px] flex-none font-pretendard font-semibold text-caption-l tracking-[-0.325px] ${row.tone}`}>{row.mark} {row.label}</dt>
                    <dd className="font-pretendard text-body-s text-typo-normal tracking-[-0.35px] leading-[22px]">{report[row.key]}</dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )}
      </div>

      {status === 'ready' && (
        <div className="flex border-t border-ui-2">
          <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex-1 py-3 font-pretendard text-caption-l font-semibold text-typo-secondary tracking-[-0.325px] active:bg-ui-1">
            {open ? '접기' : '자세히 보기'}
          </button>
          <span className="w-px bg-ui-2" />
          <button onClick={onAskCoach} className="flex-1 py-3 font-pretendard text-caption-l font-semibold text-brand tracking-[-0.325px] active:bg-ui-1">
            코치에게 물어보기
          </button>
        </div>
      )}
    </section>
  );
}

function Tile({ label, value, sub, subTone = 'text-typo-alternative', visual, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col text-left bg-white rounded-[24px] shadow-[0_2px_12px_rgba(3,27,38,0.05)] px-5 pt-5 pb-4 min-h-[148px] active:bg-ui-1">
      <span className="font-pretendard text-body-s text-typo-alternative tracking-[-0.35px]">{label}</span>
      <span className="mt-1 font-pretendard font-extrabold text-[22px] leading-7 text-typo-strong tracking-[-0.5px]">{value}</span>
      {sub && <span className={`font-pretendard font-medium text-caption-m tracking-[-0.3px] ${subTone}`}>{sub}</span>}
      <span className="mt-auto pt-2 flex items-end min-h-[26px]">{visual}</span>
    </button>
  );
}

function SummaryTab({ model, report, reportStatus, onAskCoach, onRetryReport, goTab }) {
  const { trend, maintenance, strength, weekly, week } = model;
  const { thisWeek, lastWeek } = week;
  const volumeChange = lastWeek?.volume ? Math.round(((thisWeek.volume - lastWeek.volume) / lastWeek.volume) * 100) : null;
  const hasWorkout = weekly.some(w => w.days > 0);
  const towardGoal = trend.ready && trend.goal && trend.weeklyDelta && Math.sign(trend.goal - trend.current) === Math.sign(trend.weeklyDelta);

  return (
    <>
      <AiReport status={reportStatus} report={report} onAskCoach={onAskCoach} onRetry={onRetryReport} />
      <div className="mx-4 mt-3 grid grid-cols-2 gap-3">
        <Tile
          label="공복 체중"
          value={trend.ready ? kg(trend.current) : '? kg'}
          sub={trend.ready
            ? (trend.weeklyDelta !== null ? `지난주보다 ${signed(trend.weeklyDelta)}kg` : '7일 평균')
            : `${trend.need}일 더 기록하면 보여요`}
          subTone={towardGoal ? 'text-state-success' : undefined}
          visual={trend.ready && <Spark values={trend.series.map(p => p.avg)} width={120} />}
          onClick={() => goTab('weight')}
        />
        <Tile
          label="유지 칼로리"
          value={maintenance.ready ? `${comma(maintenance.tdee)}kcal` : '? kcal'}
          sub={maintenance.ready ? `평균 섭취 ${comma(maintenance.avgIntake)}kcal` : '식단·체중 기록이 더 필요해요'}
          visual={maintenance.ready && (
            <div className="w-full h-1.5 rounded-full bg-ui-2 overflow-hidden">
              <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (maintenance.avgIntake / maintenance.tdee) * 100)}%` }} />
            </div>
          )}
          onClick={() => goTab('diet')}
        />
        <Tile
          label="최근 7일 볼륨"
          value={hasWorkout ? `${comma(thisWeek.volume)}kg` : '? kg'}
          sub={!hasWorkout ? '운동을 기록하면 보여요'
            : volumeChange !== null ? `그 전 7일보다 ${volumeChange > 0 ? '+' : ''}${volumeChange}%` : `${thisWeek.workoutDays}일 운동`}
          subTone={hasWorkout && volumeChange > 0 ? 'text-state-success' : undefined}
          visual={hasWorkout && <MiniBars values={weekly.map(w => w.volume)} />}
          onClick={() => goTab('workout')}
        />
        <Tile
          label="운동 성장"
          value={!strength.exercises.length ? '?' : strength.records.length ? `신기록 ${strength.records.length}개` : '신기록 없음'}
          sub={strength.exercises.length ? '최근 30일' : '같은 종목을 2번 이상 기록하면 보여요'}
          visual={strength.stalled.length > 0 && <Badge tone="yellow">정체 {strength.stalled.length}종목</Badge>}
          onClick={() => goTab('workout')}
        />
      </div>
    </>
  );
}

/* ── 체중 ── */
function WeightChart({ series, goal }) {
  const [selected, setSelected] = useState(series.length - 1);
  const index = Math.min(selected, series.length - 1);
  const W = 300; const H = 120; const PAD = 10;
  const minX = series[0].x;
  const spanX = Math.max(1, series[series.length - 1].x - minX);
  const ys = series.flatMap(p => [p.y, p.avg]);
  let minY = Math.min(...ys); let maxY = Math.max(...ys);
  const goalVisible = goal && goal > minY - 2 && goal < maxY + 2;
  if (goalVisible) { minY = Math.min(minY, goal); maxY = Math.max(maxY, goal); }
  const spanY = Math.max(0.6, maxY - minY);
  const px = x => PAD + ((x - minX) / spanX) * (W - PAD * 2);
  const py = y => PAD + (1 - (y - minY) / spanY) * (H - PAD * 2);
  const point = series[index];
  const pick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = minX + Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * spanX;
    setSelected(series.reduce((best, p, i) => (Math.abs(p.x - x) < Math.abs(series[best].x - x) ? i : best), 0));
  };

  return (
    <div className="relative mt-3 pt-12">
      <Tooltip leftPct={(px(point.x) / W) * 100} lines={[kg(point.y), formatDay(point.date)]} />
      <svg
        viewBox={`0 0 ${W} ${H}`} className="w-full h-[120px] touch-pan-y" role="img" aria-label="공복 체중 추이"
        onPointerDown={pick} onPointerMove={e => e.buttons && pick(e)}
      >
        {goalVisible && <line x1={PAD} x2={W - PAD} y1={py(goal)} y2={py(goal)} stroke="#adb5bd" strokeWidth="1" strokeDasharray="3 4" />}
        <line x1={px(point.x)} x2={px(point.x)} y1={0} y2={H} stroke="#171a1d" strokeWidth="1" strokeDasharray="2 3" opacity="0.35" />
        {series.map(p => <circle key={p.x} cx={px(p.x)} cy={py(p.y)} r="2" fill="#ced4da" />)}
        <polyline points={series.map(p => `${px(p.x)},${py(p.avg)}`).join(' ')} fill="none" stroke={BRAND} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={px(point.x)} cy={py(point.y)} r="4.5" fill={BRAND} stroke="#fff" strokeWidth="2" />
      </svg>
      <div className="mt-1 flex items-center gap-3 font-pretendard text-caption-s text-typo-alternative">
        <span className="flex items-center gap-1"><i className="w-3 h-0.5 rounded bg-brand" />7일 평균</span>
        <span className="flex items-center gap-1"><i className="w-1.5 h-1.5 rounded-full bg-ui-5" />매일 기록</span>
        {goalVisible && <span className="flex items-center gap-1"><i className="w-3 border-t border-dashed border-ui-6" />목표</span>}
      </div>
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
      <Sentence before="7일 평균 " value={kg(trend.current)} after="이에요" sub={weightInsight(trend)} />
      <Card>
        <SectionHeader
          title="체중 추이"
          right={<Segmented label="기간" value={weeks} onChange={setWeeks} options={[{ value: 4, label: '4주' }, { value: 8, label: '8주' }]} />}
        />
        <WeightChart key={weeks} series={series} goal={trend.goal} />
      </Card>
      <Card>
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
function IntakeChart({ diet, maintenance, weightSeries }) {
  const [selected, setSelected] = useState(diet.days.length - 1);
  const W = 300; const H = 130; const PAD = 6;
  const count = diet.to - diet.from + 1;
  const slot = (W - PAD * 2) / count;
  const maxKcal = Math.max(...diet.days.map(d => d.kcal), maintenance.ready ? maintenance.tdee : 0) * 1.08;
  const bx = x => PAD + (x - diet.from) * slot;
  const by = kcal => H - (kcal / maxKcal) * (H - 8);
  const line = weightSeries.filter(p => p.x >= diet.from && p.x <= diet.to);
  const minW = Math.min(...line.map(p => p.avg)); const spanW = Math.max(0.6, Math.max(...line.map(p => p.avg)) - minW);
  const wy = v => 14 + (1 - (v - minW) / spanW) * (H * 0.45);
  const day = diet.days[Math.min(selected, diet.days.length - 1)];
  const pick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = diet.from + ((event.clientX - rect.left) / rect.width) * count;
    setSelected(diet.days.reduce((best, d, i) => (Math.abs(d.x + 0.5 - x) < Math.abs(diet.days[best].x + 0.5 - x) ? i : best), 0));
  };

  return (
    <div className="relative mt-3 pt-12">
      <Tooltip leftPct={((bx(day.x) + slot / 2) / W) * 100} lines={[`${comma(day.kcal)}kcal`, formatDay(day.date)]} />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[130px] touch-pan-y" role="img" aria-label="하루 섭취 칼로리와 체중" onPointerDown={pick} onPointerMove={e => e.buttons && pick(e)}>
        {diet.days.map(d => (
          <rect key={d.x} x={bx(d.x) + slot * 0.18} width={slot * 0.64} y={by(d.kcal)} height={H - by(d.kcal)} rx="2" fill={d.x === day.x ? BRAND : '#d4d4ff'} />
        ))}
        {maintenance.ready && <line x1={PAD} x2={W - PAD} y1={by(maintenance.tdee)} y2={by(maintenance.tdee)} stroke="#868e96" strokeWidth="1" strokeDasharray="3 4" />}
        {line.length > 1 && <polyline points={line.map(p => `${bx(p.x) + slot / 2},${wy(p.avg)}`).join(' ')} fill="none" stroke="#171a1d" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      <div className="mt-2 flex items-center gap-3 font-pretendard text-caption-s text-typo-alternative">
        <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-[#d4d4ff]" />섭취 칼로리</span>
        {line.length > 1 && <span className="flex items-center gap-1"><i className="w-3 h-0.5 rounded bg-typo-strong" />체중</span>}
        {maintenance.ready && <span className="flex items-center gap-1"><i className="w-3 border-t border-dashed border-typo-alternative" />유지 칼로리</span>}
      </div>
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
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="font-pretendard font-semibold text-body-s text-typo-strong tracking-[-0.35px]">단백질 <span className="font-bold">하루 평균 {avgProtein}g</span></h3>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <div className="relative mt-5 h-2 rounded-full bg-ui-2">
        <div className="absolute inset-y-0 rounded-full bg-[#d4d4ff]" style={{ left: pct(range.min), width: `calc(${pct(range.max)} - ${pct(range.min)})` }} />
        <div className="absolute top-1/2 w-3.5 h-3.5 -mt-[7px] -ml-[7px] rounded-full bg-brand border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.2)]" style={{ left: pct(avgProtein) }} />
      </div>
      <div className="relative mt-1.5 h-4 font-pretendard text-caption-s text-typo-alternative">
        <span className="absolute -translate-x-1/2" style={{ left: pct(range.min) }}>{range.min}g</span>
        <span className="absolute -translate-x-1/2" style={{ left: pct(range.max) }}>{range.max}g</span>
      </div>
      <p className="mt-2 font-pretendard text-caption-m text-typo-alternative tracking-[-0.3px]">내 체중 기준 권장 범위예요 (1kg당 1.6~2.2g).</p>
    </Card>
  );
}

function DietTab({ diet, maintenance, trend, onRecord }) {
  if (!diet.ready) {
    return <GhostCard bars title="식단" message={`식단을 ${diet.need}일 더 기록하면 섭취 추이를 보여드려요.`} cta="식단 기록하기" onRecord={() => onRecord('diet')} />;
  }
  const gap = maintenance.ready ? diet.avgKcal - maintenance.tdee : null;
  const sub = gap === null
    ? '식단과 공복 체중 기록이 더 쌓이면 나의 유지 칼로리를 계산해 드려요.'
    : Math.abs(gap) < 50 ? `유지 칼로리 약 ${comma(maintenance.tdee)}kcal와 거의 같아요.`
    : `유지 칼로리 약 ${comma(maintenance.tdee)}kcal보다 ${comma(Math.abs(gap))}kcal ${gap < 0 ? '적어요' : '많아요'}.`;

  return (
    <>
      <Sentence before="하루 평균 " value={`${comma(diet.avgKcal)}kcal`} after=" 먹었어요" sub={sub} />
      <Card>
        <SectionHeader title="섭취와 체중 · 최근 4주" />
        <IntakeChart diet={diet} maintenance={maintenance} weightSeries={trend.ready ? trend.series : []} />
        {maintenance.ready && (
          <p className="mt-3 font-pretendard text-caption-m text-typo-alternative tracking-[-0.3px]">
            유지 칼로리는 식단을 기록한 {maintenance.dietDays}일과 공복 체중 변화로 추정한 값이에요.
          </p>
        )}
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
    <div className="relative mt-3 pt-12">
      <Tooltip leftPct={((index + 0.5) / weekly.length) * 100} lines={[config.format(weekly[index][metric]), `${weekly[index].label} 주`]} />
      <div className="flex items-end gap-2 h-[110px]" onPointerDown={e => setSelected(pickNearest(e, weekly.length))}>
        {weekly.map((week, i) => (
          <div key={week.label} className="flex-1 flex flex-col items-center justify-end h-full gap-1.5">
            <div className={`w-full rounded-t-[4px] ${i === index ? 'bg-brand' : 'bg-[#d4d4ff]'}`} style={{ height: week[metric] > 0 ? Math.max(6, (week[metric] / max) * 88) : 2 }} />
            <span className={`font-pretendard text-[10px] leading-none ${i === index ? 'text-brand font-bold' : 'text-typo-alternative'}`}>{week.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExerciseRow({ exercise }) {
  const { name, e1rm, top, delta, stalledWeeks, series } = exercise;
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-pretendard font-semibold text-body-s text-typo-strong tracking-[-0.35px] truncate">{name}</p>
        <p className="font-pretendard text-caption-m text-typo-alternative tracking-[-0.3px]">최근 {num(top.weight)}kg × {top.reps}회</p>
      </div>
      <Spark values={series} color={stalledWeeks > 0 ? '#adb5bd' : BRAND} width={52} height={22} />
      <div className="w-[76px] flex-none flex flex-col items-end gap-0.5">
        <span className="font-pretendard font-bold text-body-s text-typo-strong">{kg(e1rm)}</span>
        {stalledWeeks > 0
          ? <Badge tone="yellow">{stalledWeeks}주째 정체</Badge>
          : Math.abs(delta) >= 0.5 && <span className={`font-pretendard font-semibold text-caption-m ${delta > 0 ? 'text-state-success' : 'text-typo-alternative'}`}>{signed(delta)}kg</span>}
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
      <Sentence
        before="최근 7일간 " value={`${thisWeek.workoutDays}일`} after=" 운동했어요"
        sub={change !== null ? `볼륨은 ${comma(thisWeek.volume)}kg, 그 전 7일보다 ${change > 0 ? '+' : ''}${change}%예요.` : `볼륨은 ${comma(thisWeek.volume)}kg이에요.`}
      />
      <Card>
        <div className="flex items-center justify-between">
          <Segmented label="지표" value={metric} onChange={setMetric} options={WORKOUT_METRICS} />
          <Segmented label="기간" value={weeks} onChange={setWeeks} options={[{ value: 4, label: '4주' }, { value: 8, label: '8주' }]} />
        </div>
        <WeeklyBars key={`${metric}-${weeks}`} weekly={weekly.slice(-weeks)} metric={metric} />
      </Card>

      {records.length > 0 && (
        <Card>
          <SectionHeader title="최근 30일 신기록" />
          <ul className="mt-3 space-y-2.5">
            {records.map(r => (
              <li key={r.name} className="flex items-center gap-2">
                <Badge tone="green">신기록</Badge>
                <span className="min-w-0 truncate font-pretendard font-medium text-body-s text-typo-strong tracking-[-0.35px]">{r.name} {num(r.weight)}kg × {r.reps}회</span>
                <span className="ml-auto flex-none font-pretendard text-caption-m text-typo-alternative">{formatDay(r.date)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {exercises.length > 0 && (
        <Card>
          <SectionHeader title="자주 하는 종목" right={<span className="font-pretendard text-caption-m text-typo-alternative tracking-[-0.3px]">추정 1RM · 최근 8주</span>} />
          <ul className="mt-1 divide-y divide-ui-2">
            {exercises.map(e => <ExerciseRow key={e.name} exercise={e} />)}
          </ul>
          <p className="mt-2 font-pretendard text-caption-m text-typo-alternative tracking-[-0.3px]">추정 1RM은 기록한 무게와 횟수로 계산한 1회 최대 중량이에요.</p>
        </Card>
      )}

      {parts.length > 1 && (
        <Card>
          <SectionHeader title="부위별 볼륨 · 최근 4주" />
          <div className="mt-3 space-y-2.5">
            {parts.map(p => (
              <div key={p.part} className="flex items-center gap-3">
                <span className="w-[44px] flex-none font-pretendard text-caption-l text-typo-secondary tracking-[-0.325px] truncate">{p.part}</span>
                <div className="flex-1 h-2 rounded-full bg-ui-2 overflow-hidden">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${(p.share / topShare) * 100}%`, opacity: 0.35 + 0.65 * (p.share / topShare) }} />
                </div>
                <span className="w-[36px] flex-none text-right font-pretendard font-semibold text-caption-l text-typo-strong">{Math.round(p.share * 100)}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

/* ── 화면 ── */
export default function AnalysisTabsView({ status = 'ready', model, report, reportStatus, onAskCoach, onRecord, onRetry, onRetryReport, initialTab = 'summary' }) {
  const [tab, setTab] = useState(initialTab);
  const [weeks, setWeeks] = useState(8);
  const ready = status === 'ready' && model;

  return (
    <div className="flex flex-col h-full bg-ui-1">
      <header className="flex-none bg-white pt-14 border-b border-ui-2">
        <h1 className="px-5 pb-3 font-pretendard font-bold text-title-s text-typo-strong">분석</h1>
        <MainTab tabs={TABS} activeId={tab} onChange={setTab} />
      </header>
      <main className="flex-1 overflow-y-auto pb-[120px]">
        {status === 'loading' && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-brand/20 border-t-brand rounded-full animate-spin" />
          </div>
        )}
        {status === 'error' && (
          <div className="px-5 py-20 text-center">
            <p role="alert" className="font-pretendard text-body-s text-typo-secondary tracking-[-0.35px]">기록을 불러오지 못했어요.</p>
            <button onClick={onRetry} className="mt-3 font-pretendard font-semibold text-body-s text-brand active:opacity-50">다시 시도</button>
          </div>
        )}
        {ready && tab === 'summary' && <SummaryTab model={model} report={report} reportStatus={reportStatus} onAskCoach={onAskCoach} onRetryReport={onRetryReport} goTab={setTab} />}
        {ready && tab === 'weight' && <WeightTab trend={model.trend} weeks={weeks} setWeeks={setWeeks} onRecord={onRecord} />}
        {ready && tab === 'diet' && <DietTab diet={model.diet} maintenance={model.maintenance} trend={model.trend} onRecord={onRecord} />}
        {ready && tab === 'workout' && <WorkoutTab strength={model.strength} weekly={model.weekly} week={model.week} weeks={weeks} setWeeks={setWeeks} onRecord={onRecord} />}
      </main>
    </div>
  );
}
