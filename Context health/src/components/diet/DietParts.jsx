import { useEffect, useState } from 'react';
import { kcalRange } from '../../lib/homeSummary';
import { ensureFoodPortion, getFoodPortionAmount, getPortionDisplayName } from '../../utils/dietPortions';

/* 식단 기록 화면의 그리는 조각들 (Figma 1176:7168). 수치는 docs/diet_detail_figma_spec.md 기준. */

export const comma = value => Math.round(Number(value) || 0).toLocaleString();

const SAFE_BOTTOM_16 = { paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' };

export function getItemsTotal(items) {
  return (items || []).reduce((sum, item) => ({
    kcal: sum.kcal + Number(item.kcal || 0),
    carb: sum.carb + Number(item.carb || 0),
    protein: sum.protein + Number(item.protein || 0),
    fat: sum.fat + Number(item.fat || 0),
  }), { kcal: 0, carb: 0, protein: 0, fat: 0 });
}

export function sourceLabel(source) {
  if (source === 'custom') return '내 기준값';
  if (source === 'mfds') return 'DB 참고값';
  if (source === 'standard') return '기준 참고값';
  if (source === 'ai') return 'AI 추정값';
  if (source === 'mcp') return 'Claude 입력';
  if (source === 'shared') return '공용 기준값';
  return '';
}

export function formatPortionNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 10) / 10);
}

// "1캔 · 250g · AI 추정값"
export function describePortion(item) {
  const { mode, grams, unit, gramsKnown } = ensureFoodPortion(item).portion;
  const amount = formatPortionNumber(getFoodPortionAmount(item));
  const parts = mode === 'count'
    ? [`${amount}${unit}`, gramsKnown ? `${formatPortionNumber(grams)}g` : '']
    : [`${amount}g`];
  parts.push(sourceLabel(item.source), item.adjustmentNote ? `${item.adjustmentNote} 기준` : '');
  return parts.filter(Boolean).join(' · ');
}

// "1접시 · 탄 18 단 38 지 12"
export function describeFood(food) {
  const macros = `탄 ${comma(food.carb)} 단 ${comma(food.protein)} 지 ${comma(food.fat)}`;
  return food.serving ? `${food.serving} · ${macros}` : macros;
}

export function defaultMealByTime(now = new Date()) {
  const hour = now.getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  return 'dinner';
}

// 같은 끼니를 마지막으로 기록한 지난 날을 찾는다 ("어제 점심 그대로")
export function findPreviousMeal(logs, secId, baseDate) {
  const dayStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate()).getTime();
  for (const log of logs || []) {
    const ms = (log.timestamp?.seconds || 0) * 1000;
    if (!ms || ms >= dayStart) continue;
    const items = (log.sections || []).find(sec => sec.id === secId)?.items || [];
    if (items.length === 0) continue;
    const date = new Date(ms);
    const days = Math.round((dayStart - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86400000);
    return {
      items,
      kcal: getItemsTotal(items).kcal,
      label: days === 1 ? '어제' : `${date.getMonth() + 1}월 ${date.getDate()}일`,
    };
  }
  return null;
}

/* 구분선: 가운데만 보이고 양 끝으로 사라지는 그라데이션 선 (Figma 1173:9759) */
export function FadeLine({ at = 'top' }) {
  const fade = direction => `linear-gradient(${direction}, rgba(241,243,245,0), #f1f3f5 22%, #f1f3f5 78%, rgba(241,243,245,0))`;
  if (at === 'right') {
    return <span aria-hidden="true" className="absolute inset-y-0 right-0 w-px pointer-events-none" style={{ background: fade('to bottom') }} />;
  }
  return (
    <span
      aria-hidden="true"
      className={`absolute inset-x-0 h-px pointer-events-none ${at === 'top' ? 'top-0' : 'bottom-0'}`}
      style={{ background: fade('to right') }}
    />
  );
}

export function addTotals(a, b) {
  return { kcal: a.kcal + b.kcal, carb: a.carb + b.carb, protein: a.protein + b.protein, fat: a.fat + b.fat };
}

/* 섭취 칼로리 카드 (Figma 1174:11964).
   totals는 하루 합계, added는 그중 지금 끼니에서 넣은(넣으려는) 몫이다. added만큼은 주황으로 이어 보여준다. */
export function IntakeSummary({ totals, target, added }) {
  const add = added?.kcal > 0 ? added : null;
  const range = kcalRange(target);
  const base = Math.max(0, totals.kcal - (add?.kcal || 0));
  const scaleMax = Math.max(Math.ceil(Math.max(target * 1.45, totals.kcal * 1.05, 1000) / 100) * 100, 1);
  const pct = value => `${Math.min(100, (value / scaleMax) * 100)}%`;
  return (
    <div className="bg-white rounded-[20px] shadow-[0_2px_12px_rgba(3,27,38,0.05)] px-5 py-[18px] flex flex-col gap-4">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-1.5">
          <p className="m-0 font-semibold text-[13px] leading-4 text-[#868e96]">섭취 칼로리</p>
          <p className="m-0 flex items-end gap-1.5">
            <span className="flex items-center gap-0.5 font-bold">
              <span className="text-[26px] leading-[31px] text-[#171a1d]">{comma(totals.kcal)}</span>
              {add && <span className="text-[12px] leading-[14px] text-[#ff9137]">+{comma(add.kcal)}</span>}
            </span>
            <span className="text-[14px] leading-[22px] text-[#868e96]">{target ? `/ ${comma(target)}kcal` : 'kcal'}</span>
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <div className="relative h-[14px]">
            <span className="absolute left-0 right-0 top-[3px] h-2 rounded bg-[#f1f3f5]" />
            {range && <span className="absolute top-0 h-[14px] rounded bg-[rgba(113,113,255,0.2)]" style={{ left: pct(range.min), width: `calc(${pct(range.max)} - ${pct(range.min)})` }} />}
            <span className="diet-bar absolute top-[3px] h-2 rounded" style={{ left: pct(base), width: `calc(${pct(totals.kcal)} - ${pct(base)})`, background: 'linear-gradient(to right, rgba(255,176,87,0.3), #ffb057)' }} />
            {base > 0 && (
              <span className="diet-bar absolute left-0 top-[3px] h-2 overflow-hidden rounded" style={{ width: pct(base), minWidth: 8 }}>
                <span className="chart-grow-x block w-full h-full rounded" style={{ background: 'linear-gradient(to right, rgba(113,113,255,0.3), #7171ff)' }} />
              </span>
            )}
          </div>
          <div className="flex items-start justify-between text-[11px] leading-[13px]">
            <span className="text-[#adb5bd]">0</span>
            {range && <span className="font-semibold text-[#7171ff]">적정 {comma(range.min)}~{comma(range.max)}</span>}
            <span className="text-[#adb5bd]">{comma(scaleMax)}</span>
          </div>
        </div>
      </div>
      {/* 좁은 화면에서는 글자를 꺾지 않고 다음 줄로 넘긴다 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {[['탄수', 'carb'], ['단백질', 'protein'], ['지방', 'fat']].map(([label, field]) => (
          <span key={field} className="flex items-end gap-0.5 whitespace-nowrap">
            <span className="flex gap-1 text-[13px] leading-4">
              <span className="text-[#868e96]">{label}</span>
              <span className="font-bold text-[#7171ff]">{comma(totals[field])}g</span>
            </span>
            {add && add[field] > 0 && <span className="font-bold text-[11px] leading-[13px] text-[#ff9137]">+{comma(add[field])}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

/* 보라 헤더 + 회색 시트 + 아래 고정 영역.
   스크롤 영역을 둥글게 자르면 모서리가 깜빡여서, 네모로 두고 모서리 조각을 덮는다. */
export function ScreenFrame({ header, footer, children }) {
  const corner = side => ({
    position: 'absolute', top: 0, [side]: 0, width: 22, height: 22, pointerEvents: 'none',
    background: `radial-gradient(circle at ${side === 'left' ? '100% 100%' : '0 100%'}, transparent 21.5px, #7171ff 22px)`,
  });
  return (
    <div className="flex flex-col h-full bg-[#7171ff]">
      {header}
      <div className="relative flex-1 min-h-0 bg-[#f8f9fa]">
        <div className="h-full overflow-y-auto overscroll-contain">{children}</div>
        <span aria-hidden="true" style={corner('left')} />
        <span aria-hidden="true" style={corner('right')} />
      </div>
      {/* 위 스크롤 영역이 그림자를 덮지 않게 한 층 올린다 */}
      {footer && <div className="relative z-10 flex-none bg-[#f8f9fa]">{footer}</div>}
    </div>
  );
}

export function ViewHeader({ title, onBack, right }) {
  return (
    <header className="flex-none relative z-30 flex items-center justify-between px-3 pb-[14px]" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}>
      <button type="button" onClick={onBack} aria-label="뒤로" className="w-10 h-7 flex items-center justify-center active:opacity-60">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M15 18L9 12l6-6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="absolute inset-x-0 bottom-[14px] h-7 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto">{title}</div>
      </div>
      <div className="relative min-w-[40px] h-7 flex items-center justify-end">{right}</div>
    </header>
  );
}

export function BottomBar({ label, disabled, onClick }) {
  return (
    <div className="bg-white rounded-t-[20px] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] px-[14px] pt-3" style={SAFE_BOTTOM_16}>
      <button type="button" onClick={onClick} disabled={disabled} className="w-full rounded-[14px] bg-[#7171ff] py-[15px] font-bold text-[15px] leading-[18px] text-white transition-opacity disabled:opacity-40 active:opacity-80">
        {label}
      </button>
    </div>
  );
}

/* 아래에서 올라오는 시트. 화면 래퍼에 transform이 남아 있어 fixed 대신 absolute로 깐다. */
export function Sheet({ leaving, onClose, children }) {
  return (
    <div className="absolute inset-0 z-[60] flex flex-col justify-end">
      <div onClick={onClose} className={`absolute inset-0 bg-black/45 ${leaving ? 'diet-fade-out' : 'diet-fade-in'}`} />
      <div className={`relative bg-white rounded-t-[22px] pt-[10px] px-4 flex flex-col gap-6 ${leaving ? 'diet-sheet-out' : 'diet-sheet-in'}`} style={{ paddingBottom: 'calc(18px + env(safe-area-inset-bottom))' }}>
        <span className="self-center w-9 h-1 rounded-full bg-[#dee2e6]" />
        {children}
      </div>
    </div>
  );
}

export function SheetButton({ label, disabled, onClick }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="w-full rounded-[14px] bg-[#7171ff] py-[15px] font-bold text-[15px] leading-[18px] text-white transition-opacity disabled:opacity-40 active:opacity-80">
      {label}
    </button>
  );
}

/* 영양성분 상자 4개. 누른 상자만 흰색 + 보라 테두리가 된다. */
export function NutritionBoxes({ form, onChange }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {[['kcal', '열량'], ['carb', '탄수화물'], ['protein', '단백질'], ['fat', '지방']].map(([field, label]) => (
        <label key={field} className="flex flex-col items-center gap-1 rounded-xl px-1.5 py-[7.5px] border-[1.5px] border-transparent bg-[#f8f9fa] transition-colors focus-within:bg-white focus-within:border-[#7171ff]">
          <span className="font-medium text-[11px] leading-[13px] text-[#868e96]">{label}</span>
          <input
            type="text"
            inputMode="decimal"
            value={form[field]}
            placeholder="0"
            onChange={e => onChange(field, e.target.value)}
            className="w-full min-w-0 p-0 bg-transparent border-0 outline-none text-center font-pretendard font-bold text-[16px] leading-[19px] text-[#171a1d] placeholder:text-[#ced4da]"
          />
        </label>
      ))}
    </div>
  );
}

export function PortionStepper({ item, onAdjust, onSetAmount }) {
  const normalized = ensureFoodPortion(item);
  const amount = getFoodPortionAmount(normalized);
  const [draft, setDraft] = useState(formatPortionNumber(amount));
  const byCount = normalized.portion.mode === 'count';
  const name = getPortionDisplayName(item.name);

  useEffect(() => {
    setDraft(formatPortionNumber(amount));
  }, [amount, byCount]);

  function commitDraft() {
    const next = Number(draft);
    if (!Number.isFinite(next) || next <= 0) {
      setDraft(formatPortionNumber(amount));
      return;
    }
    onSetAmount(next);
  }

  const sign = plus => (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d={plus ? 'M6 2.5v7M2.5 6h7' : 'M2.5 6h7'} stroke="#adb5bd" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
  return (
    <div className="flex-none flex items-center gap-3 p-1 rounded-lg bg-[#f1f3f5]">
      <button type="button" onClick={() => onAdjust(-1)} aria-label={`${name} 수량 줄이기`} className="w-6 h-6 flex items-center justify-center rounded-md bg-white active:bg-[#e9ecef]">{sign(false)}</button>
      <label className="flex items-center justify-center min-w-[16px] font-semibold text-[14px] leading-5 text-[#495057]">
        <input
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          style={{ width: `${Math.max(String(draft).length, 1)}ch` }}
          className="p-0 bg-transparent border-0 outline-none text-center font-pretendard font-semibold text-[14px] leading-5 text-[#495057]"
          aria-label={`${name} ${byCount ? '개수' : '무게'}`}
        />
        {!byCount && <span>g</span>}
      </label>
      <button type="button" onClick={() => onAdjust(1)} aria-label={`${name} 수량 늘리기`} className="w-6 h-6 flex items-center justify-center rounded-md bg-white active:bg-[#e9ecef]">{sign(true)}</button>
    </div>
  );
}

/* 여러 개 고르는 음식 줄 (내 음식, 식품 검색) */
export function FoodPickRow({ food, selected, onToggle, badge, first }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={selected} className="relative w-full flex items-center gap-3 py-[13px] text-left">
      {!first && <FadeLine />}
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="truncate font-semibold text-[14px] leading-[17px] text-[#171a1d]">{food.name}</span>
          {badge && <span className="flex-none rounded-md bg-[#f1f3f5] px-1.5 py-0.5 text-[11px] leading-[13px] text-[#868e96]">{badge}</span>}
        </span>
        <span className="truncate text-[12px] leading-[14px] text-[#868e96]">{describeFood(food)}</span>
      </span>
      <span className={`flex-none font-semibold text-[13px] leading-4 transition-colors ${selected ? 'text-[#7171ff]' : 'text-[#868e96]'}`}>{comma(food.kcal)}kcal</span>
      <span className={`flex-none w-6 h-6 rounded-full flex items-center justify-center border-[1.5px] transition-colors ${selected ? 'bg-[#7171ff] border-[#7171ff]' : 'bg-white border-[#dee2e6]'}`}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={`diet-check ${selected ? 'scale-100' : 'scale-0'}`}>
          <path d="M2.5 6.2l2.4 2.4 4.6-5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}
