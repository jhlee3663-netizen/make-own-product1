import React, { useState } from 'react';

export const COACH_ROOMS = [
  {
    id: 'powerbuilding',
    name: '파워빌딩 멘토',
    desc: '스트렝스와 근비대를 동시에, V4 가이드',
    emoji: '🏋️‍♂️',
    bg: '#EAF0FF',
    badge: 'NEW',
  },
  {
    id: 'dumbbell',
    name: '덤벨 마스터',
    desc: '덤벨 도감 기반 프리웨이트 및 홈트 가이드',
    emoji: '💪',
    bg: '#FFF0F5',
  },
  {
    id: 'diet',
    name: '식단 관리사',
    desc: '정확한 매크로(탄단지) 및 칼로리 추적',
    emoji: '🥗',
    bg: '#F0FDF4',
  },
  {
    id: 'mobility',
    name: '스트레칭 코치',
    desc: '운동 전후 모빌리티 및 부상 방지 케어',
    emoji: '🧘‍♂️',
    bg: '#FEF3C7',
    badge: '인기',
  },
  {
    id: 'routine',
    name: '루틴 설계사',
    desc: '내 일정에 맞춘 3분할/4분할 맞춤 루틴',
    emoji: '📅',
    bg: '#F3E8FF',
  },
];

const QUICK_TIPS = [
  { icon: '🎯', text: '파워빌딩은 스트렝스가 먼저다?' },
  { icon: '📅', text: '오늘의 루틴 추천받기' },
  { icon: '💡', text: '덤벨 컬 효과적으로 하는 법' },
];

function formatDate(ts) {
  if (!ts) return '';
  const d = ts instanceof Date ? ts : new Date(ts);
  const now = new Date();
  if (now.toDateString() === d.toDateString()) {
    const h = d.getHours(), m = d.getMinutes();
    return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(m).padStart(2, '0')}`;
  }
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

export default function CoachListScreen({ rooms, onOpenRoom }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inputText, setInputText] = useState('');

  const roomsWithHistory = COACH_ROOMS.filter(r => rooms?.[r.id]?.length > 1);

  const lastActiveRoomId = roomsWithHistory.reduce((acc, r) => {
    const msgs = rooms[r.id] || [];
    const lastTs = [...msgs].reverse().find(m => m.timestamp)?.timestamp;
    if (!acc.ts || (lastTs && lastTs > acc.ts)) return { id: r.id, ts: lastTs };
    return acc;
  }, { id: 'powerbuilding', ts: null }).id;

  function handleSend() {
    const text = inputText.trim();
    if (!text) return;
    onOpenRoom(lastActiveRoomId, text);
    setInputText('');
  }

  return (
    <div className="flex flex-col h-full bg-white relative overflow-hidden">
      
      {/* Sidebar + backdrop */}
      <>
        <div 
          onClick={() => setSidebarOpen(false)} 
          className={`absolute inset-0 bg-black/40 z-[60] transition-opacity duration-500 ease-in-out ${sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} 
        />
        <div className={`absolute inset-y-0 left-0 w-[280px] bg-white z-[70] flex flex-col shadow-2xl transition-transform duration-500 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex items-center justify-between px-5 pt-6 pb-4 border-b border-ui-2">
              <p className="font-pretendard font-bold text-body-m text-typo-strong tracking-[-0.4px]">과거 대화 기록</p>
              <button onClick={() => setSidebarOpen(false)} className="p-1 text-typo-alternative">
                <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                  <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {roomsWithHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" className="text-ui-4">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                  <p className="font-pretendard text-body-s text-typo-alternative">대화 기록이 없습니다</p>
                </div>
              ) : (
                roomsWithHistory.map(r => {
                  const msgs = rooms[r.id] || [];
                  const lastMsg = [...msgs].reverse().find(m => m.text);
                  return (
                    <button
                      key={r.id}
                      onClick={() => { setSidebarOpen(false); onOpenRoom(r.id); }}
                      className="w-full flex items-center gap-3 px-5 py-4 border-b border-ui-1 text-left active:bg-ui-1 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-xl" style={{ background: r.bg }}>
                        {r.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center gap-1">
                          <p className="font-pretendard font-semibold text-caption-l text-typo-strong truncate">{r.name}</p>
                          <p className="font-pretendard text-caption-m text-typo-alternative flex-shrink-0">{formatDate(lastMsg?.timestamp)}</p>
                        </div>
                        <p className="font-pretendard text-caption-m text-typo-alternative truncate mt-0.5">
                          {lastMsg?.text?.split('\n')[0].slice(0, 32) || '대화가 시작되었습니다.'}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
      </>

      {/* 스크롤 가능한 메인 바디 */}
      <main className="flex-1 overflow-y-auto pb-4">
        
        {/* 상단 파스텔 헤더 (이미지 구현) */}
        <div 
          className="relative pt-[60px] pb-[40px] flex flex-col items-center text-center rounded-b-[40px]"
          style={{ background: 'linear-gradient(170deg, #FDF4F8 0%, #F5F7FF 50%, #FFFFFF 100%)' }}
        >
          {/* 좌측 상단 사이드바(대화기록) 아이콘 */}
          <button 
            onClick={() => setSidebarOpen(true)}
            className="absolute top-5 left-5 w-10 h-10 flex items-center justify-center text-typo-secondary bg-white/50 backdrop-blur-sm rounded-full shadow-sm transition-opacity duration-300"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* 중앙 아바타 */}
          <div className="w-[84px] h-[84px] rounded-full flex items-center justify-center text-[44px] bg-gradient-to-tr from-pink-200 to-blue-200 shadow-md mb-4" style={{ filter: 'drop-shadow(0px 8px 16px rgba(255, 180, 200, 0.4))' }}>
            💪
          </div>

          <h1 className="font-pretendard text-[20px] font-bold text-typo-strong tracking-[-0.5px] leading-snug mb-5">
            득근을 위한 완벽한 플랜,<br/>
            Context Health 코치입니다.
          </h1>

          <div className="flex flex-col gap-2.5 w-full px-8">
            {QUICK_TIPS.map((tip, i) => (
              <button 
                key={i} 
                onClick={() => onOpenRoom('powerbuilding', tip.text)}
                className="w-full bg-white/80 backdrop-blur-md rounded-full py-3 px-5 flex items-center gap-3 shadow-sm border border-white/50 hover:bg-white transition-colors"
              >
                <span className="text-[17px]">{tip.icon}</span>
                <span className="font-pretendard text-[14px] font-medium text-typo-strong tracking-[-0.3px]">{tip.text}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 나의 AI 메이트 (대화 기록이 있는 방) */}
        {roomsWithHistory.length > 0 && (
          <div className="px-5 pt-8 pb-2">
            <h2 className="font-pretendard font-bold text-[16px] text-[#A872B8] mb-3 tracking-[-0.4px] text-center">나의 AI 메이트</h2>
            <div className="flex flex-col gap-3">
              {roomsWithHistory.map((r, idx) => {
                const msgs = rooms[r.id] || [];
                const lastMsg = [...msgs].reverse().find(m => m.text);
                return (
                  <button
                    key={r.id}
                    onClick={() => onOpenRoom(r.id)}
                    className="w-full bg-[#f8f9fc] rounded-[20px] p-4 flex items-center gap-4 text-left active:scale-[0.98] transition-transform"
                  >
                    <div className="w-14 h-14 rounded-full flex items-center justify-center text-[28px] shadow-sm flex-shrink-0" style={{ background: r.bg }}>
                      {r.emoji}
                    </div>
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="font-pretendard font-bold text-[15px] text-typo-strong truncate">{r.name} <span className="text-typo-alternative text-[12px] font-normal ml-1 border-l border-ui-2 pl-2 tracking-[-0.3px]">{formatDate(lastMsg?.timestamp)}</span></p>
                      <p className="font-pretendard text-[13px] text-typo-alternative mt-1 truncate tracking-[-0.3px]">
                        {lastMsg?.text?.split('\n')[0].slice(0, 24) || '최근 대화 없음'}...
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 추천 AI 메이트 (전체) */}
        <div className="px-5 pt-8 pb-6">
          <h2 className="font-pretendard font-bold text-[16px] text-[#FF5D8F] mb-4 tracking-[-0.4px] text-center">추천 AI 메이트</h2>
          <div className="flex flex-col gap-3">
            {COACH_ROOMS.map((r) => (
              <div
                key={r.id}
                className="w-full bg-[#F5F6FB] rounded-[22px] p-3.5 pr-4 flex items-center gap-4 text-left"
              >
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-[28px] shadow-sm flex-shrink-0" style={{ background: r.bg }}>
                  {r.emoji}
                </div>
                <div className="flex-1 min-w-0 pr-1">
                  <div className="flex items-center gap-1.5">
                    {r.badge && (
                      <span className="bg-[#FF5D8F] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm flex-shrink-0 relative -top-[1px]">
                        {r.badge}
                      </span>
                    )}
                    <p className="font-pretendard font-bold text-[15px] text-typo-strong truncate">{r.name}</p>
                  </div>
                  <p className="font-pretendard text-[13px] text-typo-alternative mt-0.5 truncate tracking-[-0.4px]">
                    {r.desc}
                  </p>
                </div>
                <button
                  onClick={() => onOpenRoom(r.id)}
                  className="bg-white px-4 py-2 rounded-full font-pretendard font-bold text-[13px] text-typo-strong shadow-sm border border-[#E5E7EB] active:bg-gray-50 flex-shrink-0 whitespace-nowrap"
                >
                  대화
                </button>
              </div>
            ))}
          </div>
        </div>

      </main>

      {/* 하단 입력바 (알약 모양) */}
      <div className="flex-none px-5 py-3 bg-white border-t border-ui-2 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] z-10 pb-[90px]">
        <div className="w-full h-[52px] bg-[#F7F7FA] border border-[#EEEEF2] rounded-full flex items-center px-5 gap-3">
          <input
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
            placeholder="코치에게 이야기해보세요"
            className="flex-1 bg-transparent outline-none font-pretendard text-[14px] text-typo-strong placeholder:text-[#A0A0A5] tracking-[-0.3px]"
          />
          {inputText.trim() ? (
            <button onClick={handleSend} className="w-8 h-8 rounded-full bg-[#FF5D8F] flex items-center justify-center text-white flex-shrink-0 shadow-sm transition-transform active:scale-95">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ) : (
            <button className="flex items-center justify-center text-[#A0A0A5] flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </button>
          )}
        </div>
      </div>

    </div>
  );
}
