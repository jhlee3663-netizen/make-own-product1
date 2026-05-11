import React, { useState, useRef, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { PDF_CONTEXT } from '../../lib/pdfContext';

const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY;

/* 각 방이 어느 탭(쇠질/식단)에 속하는지 매핑 */
export const ROOM_CATEGORY = {
  powerbuilding: 'workout',
  dumbbell: 'workout',
  routine: 'workout',
  mobility: 'workout',
  diet: 'diet',
};

const ROOM_CONFIG = {
  powerbuilding: {
    name: '파워빌딩 멘토',
    subtitle: '스트렝스 & 근비대 V4 가이드',
    greeting: (name) => `안녕하세요${name ? `, ${name}님` : ''}!\n파워빌딩 v4 기반으로 스트렝스와 근비대를 동시에 잡아드릴게요.`,
    quickQuestions: ['오늘 운동 뭐 할까?', '1RM 계산해줘', '볼륨 분석해줘', '점진적 과부하 방법'],
    systemRole: '파워빌딩 v4 전문 코치',
    systemFocus: '파워빌딩 v4 원칙, 점진적 과부하, 1RM 기반 중량 설정, 3분할 루틴에 집중하여',
    bg: 'linear-gradient(160deg, #dbeafe 0%, #eff6ff 45%, #f8faff 100%)',
  },
  dumbbell: {
    name: '덤벨 마스터',
    subtitle: '덤벨 도감 기반 가이드',
    greeting: (name) => `안녕하세요${name ? `, ${name}님` : ''}!\n덤벨 운동 루틴과 증량 가이드를 도와드릴게요.`,
    quickQuestions: ['덤벨 루틴 짜줘', '덤벨 컬 자세 알려줘', '홈트 루틴 추천', '증량 가이드'],
    systemRole: '덤벨 운동 전문 트레이너',
    systemFocus: '덤벨 도감 기반의 프리웨이트 및 홈트레이닝에 집중하여',
    bg: 'linear-gradient(160deg, #fae8ff 0%, #fdf2f8 45%, #fffbfe 100%)',
  },
  routine: {
    name: '루틴 설계사',
    subtitle: '3분할/4분할 맞춤 루틴',
    greeting: (name) => `안녕하세요${name ? `, ${name}님` : ''}!\n일정에 맞는 최적의 루틴을 설계해 드릴게요.`,
    quickQuestions: ['3분할 루틴 짜줘', '주4일 루틴 추천', '부위별 운동 순서', '쉬는 날 조절'],
    systemRole: '운동 루틴 설계 전문가',
    systemFocus: '개인 일정에 맞는 분할 루틴 설계, 운동 순서, 휴식 배치에 집중하여',
    bg: 'linear-gradient(160deg, #e0e7ff 0%, #eef2ff 45%, #f8faff 100%)',
  },
  mobility: {
    name: '스트레칭 코치',
    subtitle: '모빌리티 & 부상 방지',
    greeting: (name) => `안녕하세요${name ? `, ${name}님` : ''}!\n운동 전후 스트레칭과 부상 방지를 도와드릴게요.`,
    quickQuestions: ['운동 전 스트레칭', '어깨 모빌리티', '허리 통증 관리', '쿨다운 루틴'],
    systemRole: '모빌리티 및 부상 방지 전문 코치',
    systemFocus: '운동 전후 스트레칭, 모빌리티, 부상 예방에 집중하여',
    bg: 'linear-gradient(160deg, #fef3c7 0%, #fffbeb 45%, #fffff5 100%)',
  },
  diet: {
    name: '식단 관리사',
    subtitle: '칼로리 & 영양소 분석',
    greeting: (name) => `안녕하세요${name ? `, ${name}님` : ''}!\n식단 분석과 영양 코칭을 도와드릴게요.`,
    quickQuestions: ['오늘 식단 어때?', '칼로리 얼마나 남았어?', '단백질 충분해?', '간식 추천해줘'],
    systemRole: '식단을 분석하고 영양 코칭을 하는 AI 영양사',
    systemFocus: '칼로리 관리, 영양소 균형, 건강한 식단 계획에 집중하여',
    bg: 'linear-gradient(160deg, #d1fae5 0%, #ecfdf5 45%, #f8fffc 100%)',
  },
};

function formatTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h < 12 ? '오전' : '오후';
  return `${ampm} ${h % 12 || 12}:${String(m).padStart(2, '0')}`;
}

async function fetchRecentLogs(uid) {
  if (!uid) return { workouts: [], diets: [] };
  const q = query(collection(db, 'logs'), where('uid', '==', uid));
  const snap = await getDocs(q);
  const all = snap.docs
    .map(d => d.data())
    .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
  return {
    workouts: all.filter(d => !d.type || d.type === 'workout').slice(0, 10),
    diets: all.filter(d => d.type === 'diet').slice(0, 10),
  };
}

function buildSystemPrompt(profile, workouts, diets, roomType) {
  const p = profile || {};
  const cfg = ROOM_CONFIG[roomType] || ROOM_CONFIG.powerbuilding;
  return `당신은 ${cfg.systemRole}입니다.
친근하고 동기부여가 되는 말투로 답변하세요. 한국어로만 답하세요.

[사용자 프로필]
- 이름: ${p.name || '사용자'}
- 성별: ${p.gender || '미입력'}
- 나이: ${p.age || '미입력'}
- 키: ${p.height || '미입력'}cm
- 현재 체중: ${p.weight || '미입력'}kg
- 목표 체중: ${p.goalWeight || '미입력'}kg
- 목표: ${p.goal || '미입력'}
- 활동 수준: ${p.activityLevel || '미입력'}
- 일일 목표 칼로리: ${p.targetKcal || '미입력'}kcal

[최근 운동 기록 (최대 5개)]
${workouts.slice(0, 5).map((w, i) => `${i + 1}. ${w.title || '운동'} - 총 볼륨 ${w.totalVolume || 0}kg. ${w.overloadMsg || ''}`).join('\n') || '없음'}

[최근 식단 기록 (최대 5개)]
${diets.slice(0, 5).map((d, i) => `${i + 1}. ${d.kcal || 0}kcal (탄:${d.carb || 0}g 단:${d.protein || 0}g 지:${d.fat || 0}g) ${d.aiComment || ''}`).join('\n') || '없음'}

[전문가 코칭 지식 베이스 (파워빌딩 v4 및 덤벨 도감 적용)]
${PDF_CONTEXT}

${cfg.systemFocus} 답변하세요.
답변은 지식 베이스를 참고해서 전문적이고 간결하게, 필요할 때만 구체적인 숫자나 예시를 들어 설명하세요.

[응답 규칙]
사용자가 구체적인 운동 루틴이나 식단 제안을 요청했다면, 답변 끝에 반드시 아래 형태의 JSON 양식을 추가하세요 (반드시 \`\`\`json 과 \`\`\` 로 감싸야 합니다). 제안이 아닐 경우에는 절대 추가하지 마세요.
- 운동 예시:
\`\`\`json
{
  "type": "workout",
  "title": "가슴 & 삼두 파워빌딩 데이",
  "items": [
    { "name": "벤치프레스", "detail": "60kg 5회 3세트" },
    { "name": "인클라인 덤벨 프레스", "detail": "20kg 10회 3세트" }
  ]
}
\`\`\`
- 식단 예시:
\`\`\`json
{
  "type": "diet",
  "title": "단백질 빵빵 아침 식단",
  "items": [
    { "name": "닭가슴살 샐러드", "detail": "300kcal" },
    { "name": "고구마 1개", "detail": "150kcal" }
  ]
}
\`\`\``;
}

async function callGemini(messages, profile, workouts, diets, roomType) {
  const systemPrompt = buildSystemPrompt(profile, workouts, diets, roomType);
  const firstUserIdx = messages.findIndex(m => m.role === 'user');
  const conversationMessages = firstUserIdx >= 0 ? messages.slice(firstUserIdx) : [];

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: conversationMessages.map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text || m.displayText || '' }],
    })),
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const parts = data.candidates?.[0]?.content?.parts;
  if (!parts) return { text: '죄송해요, 잠시 후 다시 시도해 주세요.', suggestion: null };
  let rawText = (parts.find(p => !p.thought) ?? parts[parts.length - 1]).text;
  
  let suggestion = null;
  const jsonMatch = rawText.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      suggestion = JSON.parse(jsonMatch[1]);
      rawText = rawText.replace(/```json\n([\s\S]*?)\n```/, '').trim();
    } catch(e) {}
  }
  return { text: rawText, suggestion };
}

function normalizeOutgoingMessage(payload) {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    return trimmed ? { text: trimmed } : null;
  }

  if (!payload || typeof payload !== 'object') return null;
  const text = (payload.text || '').trim();
  if (!text) return null;

  return {
    text,
    displayText: payload.displayText || text,
    memoCard: payload.memoCard || null,
  };
}

function BotAvatar() {
  return (
    <div className="w-9 h-9 rounded-full bg-brand flex items-center justify-center flex-shrink-0">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="8" width="18" height="13" rx="4" fill="white" />
        <circle cx="9" cy="14.5" r="2" fill="#3476EE" />
        <circle cx="15" cy="14.5" r="2" fill="#3476EE" />
        <path d="M9 19h6" stroke="#3476EE" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="12" y1="8" x2="12" y2="4.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="3.5" r="1.5" fill="white" />
      </svg>
    </div>
  );
}

function AiBubble({ msg, onQuickReply, onAccept, loading, quickQuestions }) {
  const [accepted, setAccepted] = useState(false);
  const timeStr = msg.timestamp ? formatTime(msg.timestamp) : '';
  const sg = msg.suggestion;
  return (
    <div className="flex items-start gap-2.5 mb-5">
      <BotAvatar />
      <div className="flex-1 min-w-0">
        <div
          className="bg-white rounded-[20px] rounded-tl-[6px] px-4 py-3.5 inline-block w-full max-w-full"
          style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}
        >
          <p className="font-pretendard text-body-s text-typo-normal leading-relaxed whitespace-pre-wrap">
            {msg.text}
          </p>
          {sg && (
            <div className="mt-4 p-3 bg-ui-1 border border-brand/20 rounded-xl">
              <p className="font-pretendard font-bold text-brand text-body-s mb-2">🎯 {sg.title}</p>
              <ul className="mb-3 flex flex-col gap-1.5">
                {sg.items?.slice(0, 3).map((it, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-caption-m text-typo-strong">
                    <span className="text-brand/60 mt-0.5">•</span>
                    <span>{it.name} <span className="text-typo-alternative ml-0.5">{it.detail}</span></span>
                  </li>
                ))}
                {sg.items?.length > 3 && <li className="text-caption-m text-typo-alternative ml-3">등 {sg.items.length}개 항목</li>}
              </ul>
              <button
                onClick={() => {
                  if (accepted) return;
                  setAccepted(true);
                  onAccept({ ...sg, id: Date.now() + Math.random(), timestamp: Date.now() });
                }}
                className={`w-full py-2.5 rounded-lg font-pretendard font-bold text-caption-l transition-all duration-100 border ${accepted ? 'bg-ui-2 text-typo-alternative border-ui-3 cursor-default' : 'bg-brand text-white border-brand active:scale-[0.97] active:brightness-90'}`}
              >
                {accepted ? '✅ 목표에 추가됨 (홈에서 확인)' : (sg.type === 'workout' ? '이 루틴으로 시작하기 💪' : '이 식단 적용하기 🥗')}
              </button>
            </div>
          )}
          {msg.showQuickReplies && !loading && (
            <div className="mt-3 flex flex-col gap-2">
              {quickQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => onQuickReply(q)}
                  className="w-full text-center px-4 py-2.5 rounded-xl font-pretendard text-body-s text-typo-normal font-medium border border-ui-3 bg-ui-1 transition-all duration-100 active:scale-[0.97] active:bg-ui-2 active:opacity-70"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
        {timeStr && (
          <p className="font-pretendard text-caption-m text-typo-alternative mt-1.5 ml-1">{timeStr}</p>
        )}
      </div>
    </div>
  );
}

function UserBubble({ msg }) {
  const timeStr = msg.timestamp ? formatTime(msg.timestamp) : '';
  const card = msg.memoCard;

  if (card) {
    const visibleSections = (card.sections || []).slice(0, 2);
    return (
      <div className="flex flex-col items-end mb-5">
        <div className="w-[82%] max-w-[340px] rounded-[20px] rounded-br-[6px] bg-brand p-1">
          <div className="rounded-[17px] bg-white overflow-hidden">
            <div className="px-4 pt-4 pb-3 border-b border-ui-2">
              <p className="font-pretendard text-caption-m font-semibold text-brand">메모 전달</p>
              <p className="mt-1 font-pretendard text-body-m font-bold text-typo-strong">{card.title || '운동 메모'}</p>
              <p className="mt-0.5 font-pretendard text-caption-l text-typo-alternative">{card.subtitle || '피드백 요청'}</p>
            </div>
            <div className="px-4 py-3 bg-ui-1">
              {card.mode === 'free' ? (
                <p className="font-pretendard text-body-s text-typo-normal leading-relaxed line-clamp-3">
                  {card.excerpt || '자유 메모 내용'}
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {visibleSections.map((section, idx) => (
                    <div key={`${section.part}-${idx}`}>
                      <p className="font-pretendard text-body-s font-bold text-typo-strong">{section.part}</p>
                      <div className="mt-1.5 flex flex-col gap-1">
                        {(section.items || []).slice(0, 2).map((item, itemIdx) => (
                          <p key={`${item.title}-${itemIdx}`} className="font-pretendard text-caption-l text-typo-normal leading-snug">
                            {item.title}
                            {item.body ? <span className="text-typo-alternative"> · {item.body}</span> : null}
                          </p>
                        ))}
                        {section.totalItems > 2 && (
                          <p className="font-pretendard text-caption-m text-typo-alternative">
                            외 {section.totalItems - 2}개 종목
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  {card.totalSections > visibleSections.length && (
                    <p className="font-pretendard text-caption-m text-typo-alternative">
                      외 {card.totalSections - visibleSections.length}개 부위
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="font-pretendard text-caption-l text-typo-normal">{msg.displayText || '피드백 요청'}</span>
              <span className="font-pretendard text-caption-l font-bold text-brand">전송됨</span>
            </div>
          </div>
        </div>
        {timeStr && (
          <p className="font-pretendard text-caption-m text-typo-alternative mt-1.5 mr-1">{timeStr}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end mb-5">
      <div className="max-w-[75%] bg-brand px-4 py-3 rounded-[20px] rounded-br-[6px]">
        <p className="font-pretendard text-body-s text-white leading-relaxed whitespace-pre-wrap">
          {msg.displayText || msg.text}
        </p>
      </div>
      {timeStr && (
        <p className="font-pretendard text-caption-m text-typo-alternative mt-1.5 mr-1">{timeStr}</p>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5 mb-5">
      <BotAvatar />
      <div
        className="bg-white rounded-[20px] rounded-tl-[6px] px-4 py-4 flex gap-1.5 items-center"
        style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 bg-ui-5 rounded-full animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function AICoachScreen({ user, profile, roomType = 'powerbuilding', savedMessages, onMessagesChange, onAcceptSuggestion, onBack, pendingMessage, onPendingMessageSent }) {
  const cfg = ROOM_CONFIG[roomType] || ROOM_CONFIG.powerbuilding;
  const name = profile?.name || user?.name || '';

  const [messages, setMessages] = useState(() =>
    savedMessages ?? [
      {
        role: 'model',
        text: cfg.greeting(name),
        timestamp: new Date(),
        showQuickReplies: true,
      },
    ]
  );
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState({ workouts: [], diets: [] });
  const bottomRef = useRef(null);

  useEffect(() => {
    fetchRecentLogs(user?.uid).then(setContext);
  }, [user?.uid]);

  useEffect(() => {
    if (!savedMessages) onMessagesChange?.(messages);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pendingMessage: 메모에서 피드백 요청 시 자동 전송
  useEffect(() => {
    if (!pendingMessage) return;
    const timer = setTimeout(() => {
      sendMessage(pendingMessage);
      onPendingMessageSent?.();
    }, 400);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  function updateMessages(newMessages) {
    setMessages(newMessages);
    onMessagesChange?.(newMessages);
  }

  async function sendMessage(payload) {
    const outgoing = normalizeOutgoingMessage(payload);
    if (!outgoing || loading) return;

    const newMessages = [
      ...messages.map(m => ({ ...m, showQuickReplies: false })),
      { role: 'user', ...outgoing, timestamp: new Date() },
    ];
    updateMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const reply = await callGemini(
        newMessages,
        { ...profile, name },
        context.workouts,
        context.diets,
        roomType
      );
      updateMessages([...newMessages, { role: 'model', text: reply.text, suggestion: reply.suggestion, timestamp: new Date() }]);
      const category = ROOM_CATEGORY[roomType] || 'workout';
      localStorage.setItem(`coaching_insight_${category}`, JSON.stringify({ text: reply.text, timestamp: Date.now(), roomType, category }));
    } catch {
      updateMessages([...newMessages, { role: 'model', text: '네트워크 오류가 발생했어요. 다시 시도해 주세요.', timestamp: new Date() }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: cfg.bg }}>
      {/* 헤더 */}
      <header className="flex-none px-4 pt-5 pb-4 flex items-center gap-2">
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center text-typo-alternative flex-shrink-0 rounded-full transition-all duration-100 active:scale-[0.85] active:opacity-50"
        >
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none">
            <path d="M9 1L1 8l8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className="flex items-center gap-2.5 flex-1">
          <BotAvatar />
          <div>
            <p className="font-pretendard font-bold text-body-m text-typo-strong tracking-[-0.4px]">{cfg.name}</p>
            <p className="font-pretendard text-caption-m text-typo-alternative tracking-[-0.3px]">{cfg.subtitle}</p>
          </div>
        </div>
      </header>

      {/* 채팅 영역 */}
      <main className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
        {messages.map((msg, i) =>
          msg.role === 'user'
            ? <UserBubble key={i} msg={msg} />
            : <AiBubble key={i} msg={msg} onQuickReply={sendMessage} onAccept={onAcceptSuggestion} loading={loading} quickQuestions={cfg.quickQuestions} />
        )}
        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </main>

      {/* 입력창 */}
      <div className="flex-none px-4 pb-[88px] pt-2">
        <div
          className="flex items-end gap-2 bg-white rounded-[24px] px-4 py-2 min-h-[52px]"
          style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}
        >
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
            placeholder="궁금한 것을 물어보세요..."
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none font-pretendard text-body-s text-typo-normal tracking-[-0.35px] placeholder:text-typo-alternative leading-relaxed max-h-[120px] overflow-y-auto self-center"
            style={{ height: 'auto' }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="w-9 h-9 rounded-full bg-brand flex items-center justify-center flex-shrink-0 disabled:opacity-30 transition-all duration-100 active:scale-[0.88] active:brightness-90 mb-0.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

    </div>
  );
}
