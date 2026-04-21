import React, { useState, useRef, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import BottomNav from '../common/BottomNav';
import { IcSpark } from '../icons/Icons';

const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY;

/* ── 최근 기록 요약 불러오기 ── */
async function fetchRecentLogs(uid) {
  const q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(10));
  const snap = await getDocs(q);
  const workouts = [];
  const diets = [];
  snap.forEach((d) => {
    const data = d.data();
    if (!data.type || data.type === 'workout') workouts.push(data);
    if (data.type === 'diet') diets.push(data);
  });
  return { workouts, diets };
}

function buildSystemPrompt(profile, workouts, diets) {
  const p = profile || {};
  return `당신은 사용자의 건강 데이터를 바탕으로 맞춤형 운동 및 식단을 코칭하는 AI 트레이너입니다.
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
${workouts.slice(0, 5).map((w, i) => `${i + 1}. ${w.memo || JSON.stringify(w.sections?.map(s => s.exercises?.join(', ')))}`).join('\n') || '없음'}

[최근 식단 기록 (최대 5개)]
${diets.slice(0, 5).map((d, i) => `${i + 1}. ${d.date || ''} - ${d.totalKcal || 0}kcal (탄:${d.totalCarb || 0}g 단:${d.totalProtein || 0}g 지:${d.totalFat || 0}g)`).join('\n') || '없음'}

위 데이터를 컨텍스트로 활용해서 사용자가 질문하는 내용에 답변하세요.
답변은 간결하고 실용적으로, 필요할 때만 구체적인 숫자나 예시를 들어 설명하세요.`;
}

async function callGemini(messages, profile, workouts, diets) {
  const systemPrompt = buildSystemPrompt(profile, workouts, diets);
  const contents = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: '안녕하세요! 저는 여러분의 AI 헬스 코치입니다. 운동이나 식단에 대해 뭐든지 물어보세요! 💪' }] },
    ...messages.map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    })),
  ];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
    }
  );
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '죄송해요, 잠시 후 다시 시도해 주세요.';
}

/* ── 말풍선 컴포넌트 ── */
function Bubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#228bed] to-[#c509d6] flex items-center justify-center mr-2 flex-shrink-0 mt-0.5">
          <IcSpark />
        </div>
      )}
      <div
        className={`max-w-[78%] px-4 py-2.5 rounded-[18px] text-[14px] leading-[1.55] tracking-[-0.35px] font-pretendard whitespace-pre-wrap ${
          isUser
            ? 'bg-[#0054d1] text-white rounded-br-[4px]'
            : 'bg-[#f1f3f5] text-[#171a1d] rounded-bl-[4px]'
        }`}
      >
        {msg.text}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#228bed] to-[#c509d6] flex items-center justify-center mr-2 flex-shrink-0">
        <IcSpark />
      </div>
      <div className="bg-[#f1f3f5] px-4 py-3 rounded-[18px] rounded-bl-[4px] flex gap-1.5 items-center">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 bg-[#adb5bd] rounded-full animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

const QUICK_QUESTIONS = [
  '오늘 운동 뭐 할까?',
  '최근 식단 어때?',
  '단백질 섭취 충분해?',
  '이번 주 목표 달성률',
];

export default function AICoachScreen({ user, profile, onNavChange }) {
  const [messages, setMessages] = useState([
    {
      role: 'model',
      text: `안녕하세요, ${profile?.name || user?.name || ''}님! 👋\n저는 AI 헬스 코치예요. 운동이나 식단에 대해 뭐든지 물어보세요!`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState({ workouts: [], diets: [] });
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    fetchRecentLogs(user?.uid).then(setContext);
  }, [user?.uid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const newMessages = [...messages, { role: 'user', text: trimmed }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const reply = await callGemini(
        newMessages,
        { ...profile, name: profile?.name || user?.name },
        context.workouts,
        context.diets
      );
      setMessages((prev) => [...prev, { role: 'model', text: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'model', text: '네트워크 오류가 발생했어요. 다시 시도해 주세요.' }]);
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
    <div className="flex flex-col h-full bg-white">
      {/* 헤더 */}
      <header className="flex-none px-5 pt-14 pb-4 border-b border-[#f1f3f5]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#228bed] to-[#c509d6] flex items-center justify-center">
            <IcSpark />
          </div>
          <div>
            <p className="font-pretendard font-bold text-[16px] tracking-[-0.4px] text-[#171a1d]">AI 코치</p>
            <p className="font-pretendard text-[12px] text-[#868e96] tracking-[-0.3px]">맞춤 운동·식단 상담</p>
          </div>
        </div>
      </header>

      {/* 채팅 영역 */}
      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
        {messages.map((msg, i) => (
          <Bubble key={i} msg={msg} />
        ))}
        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </main>

      {/* 빠른 질문 */}
      {messages.length <= 1 && (
        <div className="px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-none flex-shrink-0">
          {QUICK_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              className="flex-shrink-0 px-3.5 py-2 bg-[#f1f3f5] rounded-full font-pretendard text-[13px] text-[#495057] tracking-[-0.325px] whitespace-nowrap hover:bg-[#e9ecef] transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* 입력창 */}
      <div className="flex-none px-4 pb-[84px] pt-2 border-t border-[#f1f3f5]">
        <div className="flex items-end gap-2 bg-[#f8f9fa] rounded-[20px] px-4 py-2 min-h-[48px]">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
            placeholder="궁금한 것을 물어보세요..."
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none font-pretendard text-[14px] text-[#171a1d] tracking-[-0.35px] placeholder:text-[#adb5bd] leading-[1.5] max-h-[120px] overflow-y-auto self-center"
            style={{ height: 'auto' }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="w-8 h-8 rounded-full bg-[#0054d1] flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition-opacity mb-0.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      <BottomNav activeId="coach" onChange={onNavChange} />
    </div>
  );
}
