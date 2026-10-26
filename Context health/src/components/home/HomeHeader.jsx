import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react';
import Pressable from '../common/Pressable';
import { headerLabel, shiftKey, weekOf } from '../../lib/homeSummary';

/* 홈 상단 (Figma 📚 스터디 1163:12392): 보라 바탕 위에 날짜 줄, 주간 띠, 폴더 모양 탭.
   화면 전체가 하나의 스크롤이고, 세 조각이 각각 붙는 위치가 다르다.
   - 날짜 줄: 맨 위에 늘 붙어 있다.
   - 주간 띠: 제자리에 있고, 스크롤하면 탭과 흰 시트가 그 위로 올라와 가린다.
   - 탭: 날짜 줄 바로 아래까지 올라와 붙는다. */

export const DATE_ROW_HEIGHT = 72;
export const TAB_HEIGHT = 36;
const BELOW_DATE_ROW = `calc(env(safe-area-inset-top) + ${DATE_ROW_HEIGHT}px)`;
export const BELOW_TABS = `calc(env(safe-area-inset-top) + ${DATE_ROW_HEIGHT + TAB_HEIGHT}px)`;

const TABS = [{ id: 'workout', label: '운동' }, { id: 'diet', label: '식단' }];
const MIN_WEEKS = 26; // 옆으로 넘겨 볼 수 있는 지난 주 수 (더 옛날 날짜를 고르면 그만큼 늘어난다)

function IcTodo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M6.5 1.25A3.25 3.25 0 0 0 3.25 4.5v15a3.25 3.25 0 0 0 3.25 3.25h11a3.25 3.25 0 0 0 3.25-3.25V8.6a2 2 0 0 0-.59-1.41l-5.35-5.35a2 2 0 0 0-1.41-.59H6.5Zm1.5 11a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5H8Zm0 4a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5H8Z" fill="#fff" />
    </svg>
  );
}

export const HomeDateRow = React.memo(function HomeDateRow({ dateKey, todayKey, onDateChange, onTodoClick, bell = null }) {
  return (
    <div className="sticky top-0 z-30 bg-brand" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex items-center justify-between px-4 py-6">
        <label className="relative flex items-center gap-1 cursor-pointer">
          <span className="font-pretendard font-bold text-[20px] leading-6 text-white tracking-[-0.5px] whitespace-nowrap">{headerLabel(dateKey)}</span>
          <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true"><path d="M2 1.5h8L6 6.5 2 1.5Z" fill="#fff" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg>
          {/* 날짜 글자 위에 투명한 날짜 입력을 겹쳐, 누르면 폰의 달력이 뜬다. 미래 날짜는 고를 수 없다. */}
          <input
            type="date"
            value={dateKey}
            max={todayKey}
            onChange={event => event.target.value && onDateChange(event.target.value)}
            aria-label="날짜 선택"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </label>
        {/* '할 일' 버튼은 분석 탭이 생기며 뺐다 (2026-10-22). 오른쪽에는 알림 종만 둔다. */}
        {bell}
      </div>
    </div>
  );
});

/* 주간 띠의 한 주. 26주치를 한꺼번에 그려 두기 때문에, 탭이나 날짜를 바꿀 때 달라진 주만 다시 그리도록 따로 기억한다. */
const WeekPage = React.memo(function WeekPage({ week, selectedKey, todayKey, marks, onDateChange }) {
  return (
    <div className="flex-none w-full snap-start flex items-start px-2" style={{ scrollSnapStop: 'always' }}>
      {week.map(({ key, day, weekday }, i) => {
        const on = key === selectedKey;
        const future = key > todayKey;
        return (
          <button
            key={key}
            type="button"
            disabled={future}
            onClick={() => onDateChange(key)}
            aria-label={`${day}일 ${weekday}요일`}
            aria-pressed={on}
            className="flex-1 min-w-0 flex flex-col items-center gap-1"
          >
            <span className="font-pretendard font-medium text-[12px] leading-[14px] text-white/70 tracking-[-0.3px]">{weekday}</span>
            <span className={`home-day flex items-center justify-center w-8 h-8 rounded-full font-pretendard text-[15px] tracking-[-0.375px] ${on ? 'bg-white text-brand font-bold' : `text-white font-semibold ${future ? 'opacity-40' : ''}`}`}>
              {day}
            </span>
            <span className={`w-[5px] h-[5px] rounded-full ${marks[i] === '1' ? 'bg-white' : 'bg-transparent'}`} />
          </button>
        );
      })}
    </div>
  );
});

/* 주간 띠: 한 화면에 한 주(월~일). 옆으로 밀면 한 주씩 넘어간다. */
export const WeekStrip = React.memo(function WeekStrip({ dateKey, todayKey, markedDays, onDateChange }) {
  const scrollerRef = useRef(null);
  const firstRun = useRef(true);
  const weeks = useMemo(() => {
    const thisMonday = weekOf(todayKey)[0].key;
    const selectedMonday = weekOf(dateKey)[0].key;
    let count = MIN_WEEKS;
    let cursor = shiftKey(thisMonday, -7 * (MIN_WEEKS - 1));
    while (cursor > selectedMonday) { cursor = shiftKey(cursor, -7); count += 1; }
    return Array.from({ length: count }, (_, i) => weekOf(shiftKey(thisMonday, -7 * (count - 1 - i))));
  }, [dateKey, todayKey]);
  const selectedPage = weeks.findIndex(week => week.some(day => day.key === dateKey));

  // 고른 날짜가 있는 주가 보이도록 맞춘다. 처음에는 바로, 그 뒤로는 부드럽게.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || selectedPage < 0) return;
    const left = selectedPage * el.clientWidth;
    if (firstRun.current || !el.scrollTo) el.scrollLeft = left;
    else el.scrollTo({ left, behavior: 'smooth' });
    firstRun.current = false;
  }, [selectedPage, weeks.length]);

  // 화면 폭이 바뀌면(회전 등) 쪽 위치를 다시 맞춘다
  useEffect(() => {
    const onResize = () => { const el = scrollerRef.current; if (el && selectedPage >= 0) el.scrollLeft = selectedPage * el.clientWidth; };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [selectedPage]);

  return (
    <div className="sticky z-10 bg-brand" style={{ top: BELOW_DATE_ROW }}>
      <div ref={scrollerRef} data-no-pull className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-6" style={{ overscrollBehaviorX: 'contain' }}>
        {weeks.map(week => (
          <WeekPage
            key={week[0].key}
            week={week}
            selectedKey={week.some(day => day.key === dateKey) ? dateKey : null}
            todayKey={todayKey}
            marks={week.map(day => (markedDays.has(day.key) ? '1' : '0')).join('')}
            onDateChange={onDateChange}
          />
        ))}
      </div>
    </div>
  );
});

/* 폴더 모양 탭. 선택된 탭의 흰 바탕은 아래 시트와 이어져 있다가,
   시트를 아래로 당기면(detached) 떨어져 나오면서 동그란 알약 모양이 된다. */
/* 분석 탭도 같은 탭을 쓴다(tabs·sticky를 넘김). 탭 수만큼 흰 바탕 폭이 나뉜다. */
export function HomeTabs({ tab, onTabChange, pull = 0, detached = false, tabs = TABS, sticky = true }) {
  // 탭을 누르면 흰 바탕과 글자는 바로 움직이고, 아래 목록을 새로 그리는 일은 그 뒤에 끊어서 한다.
  // 한꺼번에 하면 목록을 그리는 동안 탭 모션이 멈춰 버벅여 보인다.
  const [shownTab, setShownTab] = useState(tab);
  const [, startTransition] = useTransition();
  useEffect(() => { setShownTab(tab); }, [tab]);
  const select = (id) => { setShownTab(id); startTransition(() => onTabChange(id)); };
  const tabIndex = Math.max(0, tabs.findIndex(item => item.id === shownTab));
  return (
    <div role="tablist" className={`${sticky ? 'sticky z-20' : 'relative'} bg-brand`} style={sticky ? { top: BELOW_DATE_ROW } : undefined}>
      <div className="relative flex px-6">
        <span
          aria-hidden="true"
          className="home-tab-slider absolute top-0 bottom-0 left-6"
          style={{ width: `calc((100% - 48px) / ${tabs.length})`, transform: `translateX(${tabIndex * 100}%)` }}
        >
          <span
            className={`home-tab-shape block w-full h-full bg-white ${detached ? 'is-detached' : ''}`}
            style={detached ? undefined : {
              borderRadius: `24px 24px ${neckProgress(pull) * 24}px ${neckProgress(pull) * 24}px`,
              transition: 'none', // 당긴 거리를 그대로 따라간다 (되돌아올 때도 같은 값으로 움직인다)
            }}
          />
        </span>
        {tabs.map(({ id, label }) => {
          const on = id === shownTab;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => select(id)}
              className="relative flex-1 py-2 grid place-items-center outline-none font-pretendard text-[16px] leading-5 tracking-[-0.4px]"
            >
              <span className="tab-label col-start-1 row-start-1 font-medium text-white" style={{ opacity: on ? 0 : 1 }}>{label}</span>
              <span aria-hidden="true" className="tab-label col-start-1 row-start-1 font-bold text-brand" style={{ opacity: on ? 1 : 0 }}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* 시트를 당길 때 탭과 시트 사이에 생기는 보라 틈.
   물방울이 둘로 갈라지듯, 탭과 시트를 잇는 목이 당길수록 가늘어지다가 NECK_BREAK에서 끊어진다.
   끊어진 뒤에는 탭이 알약 모양으로 튕겨 올라가고, 시트 쪽에 남은 방울은 탄력 있게 가라앉는다. */
export const NECK_BREAK = 40;
export const neckProgress = pull => Math.max(0, Math.min(1, pull / NECK_BREAK));

export function PullGap({ height, pull, detached, tabIndex, width, animate, children, tabCount = 2, neck: withNeck = true }) {
  const tabWidth = Math.max(0, (width - 48) / tabCount);
  const center = 24 + tabWidth * (tabIndex + 0.5);
  const t = neckProgress(pull);
  const showNeck = withNeck && !detached && pull > 0.5;
  let neck = null;
  if (showNeck) {
    const top = Math.max(0, (tabWidth - 48 * t - 2) * (1 - 0.55 * t)); // 탭 아래 모서리가 둥글어지는 만큼 안쪽에서 시작해 점점 좁아진다
    const waist = tabWidth * 0.85 * Math.pow(1 - t, 2.2);   // 당길수록 가늘어져 끊어지는 순간 0
    const bottom = tabWidth * (1 - 0.7 * t);
    const half = (value) => value / 2;
    const side = (dir) => {
      const xT = center + dir * half(top); const xM = center + dir * half(waist); const xB = center + dir * half(bottom);
      return { xT, xM, xB };
    };
    const L = side(-1); const R = side(1);
    const h = pull;
    neck = [
      `M ${L.xT} 0`,
      `C ${L.xT + (L.xM - L.xT) * 0.55} 0, ${L.xM} ${h * 0.2}, ${L.xM} ${h * 0.5}`,
      `C ${L.xM} ${h * 0.8}, ${L.xB + (L.xM - L.xB) * 0.55} ${h}, ${L.xB} ${h}`,
      `L ${R.xB} ${h}`,
      `C ${R.xB + (R.xM - R.xB) * 0.55} ${h}, ${R.xM} ${h * 0.8}, ${R.xM} ${h * 0.5}`,
      `C ${R.xM} ${h * 0.2}, ${R.xT + (R.xM - R.xT) * 0.55} 0, ${R.xT} 0`,
      'Z',
    ].join(' ');
  }
  return (
    <div
      className="relative z-[15] bg-brand flex justify-center items-center"
      style={{ height, overflow: 'hidden', transition: animate ? 'height 0.45s cubic-bezier(.2,.8,.2,1)' : 'none' }}
    >
      {showNeck && (
        <svg aria-hidden="true" className="absolute left-0 top-0 pointer-events-none" width={width} height={pull} style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id="home-neck" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="1" stopColor="#f8f9fa" />
            </linearGradient>
          </defs>
          <path d={neck} fill="url(#home-neck)" />
        </svg>
      )}
      {withNeck && detached && <span aria-hidden="true" className="home-drip" style={{ left: center }} />}
      {children}
    </div>
  );
}

/* 새로고침 표시: 목이 끊어진 뒤부터 나타나 당긴 만큼 돈다 */
export function PullSpinner({ pull, refreshing }) {
  return (
    <div
      className={`relative w-6 h-6 border-2 border-white/30 border-t-white rounded-full ${refreshing ? 'animate-spin' : ''}`}
      style={{
        opacity: refreshing ? 1 : Math.min(1, Math.max(0, (pull - NECK_BREAK) / (52 - NECK_BREAK))),
        transform: refreshing ? undefined : `rotate(${pull * 4}deg)`,
      }}
    />
  );
}

/* 흰 시트 위쪽의 둥근 모서리. 스크롤 영역을 둥글게 자르면 일부 폰에서 모서리가 검게 깜빡이므로,
   시트는 네모로 두고 모서리 자리에 보라색 조각을 덮어 둥글게 보이게 한다. 탭 아래에 붙어 따라다닌다. */
export function SheetCorners() {
  const piece = side => ({
    position: 'absolute', top: 0, [side]: 0, width: 24, height: 24, pointerEvents: 'none',
    background: `radial-gradient(circle at ${side === 'left' ? '100% 100%' : '0 100%'}, transparent 23.5px, #7171FF 24px)`,
  });
  return (
    <div aria-hidden="true" className="sticky z-20 h-0" style={{ top: BELOW_TABS }}>
      <span style={piece('left')} />
      <span style={piece('right')} />
    </div>
  );
}
