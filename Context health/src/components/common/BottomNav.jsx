import React, { useEffect, useState } from 'react';
import { IcHome, IcGenerate, IcUser, IcAnalysis, IcPencil } from '../icons/Icons';
import Pressable from './Pressable';

const TABS = [
  { id: 'home',     label: '홈',   Icon: IcHome },
  { id: 'feed',     label: '피드', Icon: IcGenerate }, // 코치 탭은 숨겨 두었다 (코드는 App에 남아 있음)
  null, // 가운데 메모 버튼 자리
  { id: 'analysis', label: '분석', Icon: IcAnalysis },
  { id: 'my',       label: '마이', Icon: IcUser },
];

// 기록 버튼을 눌렀을 때 나오는 두 선택지. from은 닫혀 있을 때 숨어 있는 방향(가운데 버튼 쪽)이다.
const MEMO_OPTIONS = [
  { type: 'workout', label: '운동', image: '/memo-workout.png', imageSize: 48, gradient: 'linear-gradient(158deg, #fff 0%, #ecd6ff 100%)', from: '80px' },
  { type: 'diet', label: '식단', image: '/memo-diet.png', imageSize: 40, gradient: 'linear-gradient(210deg, #fff 0%, #ecd6ff 100%)', from: '-80px' },
];

export default function BottomNav({ activeId = 'home', onChange, onMemo }) {
  const [memoOpen, setMemoOpen] = useState(false);

  useEffect(() => { setMemoOpen(false); }, [activeId]);

  function pickMemo(type) {
    setMemoOpen(false);
    onMemo?.(type);
  }

  return (
    <>
      {/* 기록 버튼을 누르면 화면이 어두워지고 운동·식단 두 선택지가 버튼 위로 튀어나온다 (Figma 📚 스터디 1170:8615) */}
      <div
        onClick={() => setMemoOpen(false)}
        aria-hidden="true"
        className={`absolute inset-0 bg-black/60 z-[35] transition-opacity duration-200 ${memoOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />

      {/* 아이폰 홈 표시줄 자리(safe area)까지 흰 네비가 덮도록 높이를 늘리고, 내용은 그 위 60px에 둔다 */}
      <nav
        className="absolute bottom-0 w-full bg-white border border-b-0 border-ui-3 rounded-t-[16px] flex items-start z-20 shadow-[0_-4px_16px_rgba(0,0,0,0.05)]"
        style={{ height: 'calc(60px + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {TABS.map((item, index) => {
          if (!item) return <div key={`slot-${index}`} className="flex-1 h-full" aria-hidden="true" />;
          const { id, label, Icon } = item;
          const isActive = activeId === id;
          return (
            <Pressable
              key={id}
              pressScale={0.88}
              onClick={() => onChange && onChange(id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 flex-1 p-2 bg-none border-none outline-none select-none ${
                isActive ? 'text-brand' : 'text-ui-6'
              }`}
            >
              <Icon active={isActive} size={24} />
              <span className="font-pretendard font-medium text-[12px] leading-[1.5]">{label}</span>
            </Pressable>
          );
        })}
      </nav>

      <div role="menu" aria-hidden={!memoOpen} className={`absolute left-1/2 -translate-x-1/2 z-[40] flex items-start gap-20 ${memoOpen ? '' : 'pointer-events-none'}`} style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}>
        {MEMO_OPTIONS.map(({ type, label, image, imageSize, gradient, from }) => (
          <button
            key={type}
            type="button"
            role="menuitem"
            tabIndex={memoOpen ? 0 : -1}
            onClick={() => pickMemo(type)}
            className={`memo-option${memoOpen ? ' open' : ''} w-20 flex flex-col items-center gap-[10px] active:opacity-80`}
            style={{ '--from-x': from }}
          >
            <span className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: gradient }}>
              <img src={image} alt="" width={imageSize} height={imageSize} draggable="false" />
            </span>
            <span className="font-pretendard font-medium text-[14px] leading-5 text-white tracking-[-0.35px]">{label}</span>
          </button>
        ))}
      </div>

      <Pressable
        pressScale={0.90}
        onClick={() => setMemoOpen(open => !open)}
        aria-label={memoOpen ? '닫기' : '기록 추가'}
        aria-expanded={memoOpen}
        style={{ bottom: 'calc(16px + env(safe-area-inset-bottom))' }}
        className={`absolute left-1/2 -ml-[28px] z-[40] w-[56px] h-[56px] rounded-full flex items-center justify-center bg-brand shadow-[0_0_17px_rgba(0,0,0,0.04)] border ${memoOpen ? 'border-white' : 'border-transparent'}`}
      >
        {/* 연필과 닫기(X)를 겹쳐 두고 돌리면서 바꾼다 */}
        <span className="memo-icon absolute" style={{ opacity: memoOpen ? 0 : 1, transform: memoOpen ? 'rotate(90deg) scale(0.6)' : 'none' }}>
          <IcPencil size={22} color="#f8f9fa" />
        </span>
        <span className="memo-icon absolute" style={{ opacity: memoOpen ? 1 : 0, transform: memoOpen ? 'none' : 'rotate(-90deg) scale(0.6)' }}>
          <svg width="16" height="16" viewBox="36.8 36.8 16 16" aria-hidden="true">
            <path d="M39.9515 37.3406C39.2305 36.6196 38.0616 36.6196 37.3406 37.3406C36.6197 38.0616 36.6197 39.2305 37.3406 39.9515L42.189 44.7999L37.3406 49.6483C36.6197 50.3693 36.6197 51.5382 37.3406 52.2592C38.0616 52.9802 39.2305 52.9802 39.9515 52.2592L44.7999 47.4108L49.6483 52.2592C50.3693 52.9802 51.5382 52.9802 52.2592 52.2592C52.9801 51.5382 52.9801 50.3693 52.2592 49.6483L47.4108 44.7999L52.2592 39.9515C52.9801 39.2305 52.9801 38.0616 52.2592 37.3406C51.5382 36.6196 50.3693 36.6196 49.6483 37.3406L44.7999 42.189L39.9515 37.3406Z" fill="#fff" />
          </svg>
        </span>
      </Pressable>
    </>
  );
}
