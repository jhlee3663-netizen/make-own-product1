import React from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { IcSpark } from '../src/components/icons/Icons';
import { FadeLine, IntakeSummary } from '../src/components/diet/DietParts';

/* 식단 빈 끼니 화면: "아래에 적으면 된다"가 먼저 보이게 하는 시안 3개 (정지 화면, 더미 데이터). */
const totals = { kcal: 1020, carb: 104, protein: 98, fat: 24 };
const GRADIENT = 'linear-gradient(90deg, #7171FF, #f79fff)';

function Phone({ title, note, children, footer }) {
  return (
    <div className="flex flex-col gap-3 w-[390px]">
      <div>
        <p className="m-0 font-bold text-[17px] text-[#171a1d]">{title}</p>
        <p className="m-0 mt-1 text-[13px] leading-[19px] text-[#495057] whitespace-pre-line">{note}</p>
      </div>
      <div className="relative h-[760px] flex flex-col bg-[#7171ff] overflow-hidden rounded-[28px] shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
        <div className="flex-none flex items-center justify-between px-5 pt-5 pb-[14px] text-white">
          <span className="text-[20px]">‹</span>
          <span className="font-semibold text-[18px]">저녁 ⌄</span>
          <span className="font-bold text-[14px] opacity-85">•••</span>
        </div>
        <div className="flex-1 min-h-0 bg-[#f8f9fa] rounded-t-[22px] px-4 pt-4 flex flex-col gap-4">
          <IntakeSummary totals={totals} target={1850} />
          {children}
        </div>
        <div className="relative z-10 flex-none bg-[#f8f9fa]">{footer}</div>
      </div>
    </div>
  );
}

const Suggestions = () => (
  <div className="flex flex-col gap-2">
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-[11px] text-[#495057]">어제 저녁 그대로</span>
          <span className="font-bold text-[15px] text-[#171a1d]">879kcal</span>
        </div>
        <span className="truncate text-[12px] text-[#868e96]">삼겹살 수육, 라면 (국물 적게), 보쌈김치, 광어</span>
      </div>
      <span className="rounded-full bg-[rgba(113,113,255,0.1)] px-[14px] py-2 font-bold text-[13px] text-[#7171ff]">넣기</span>
    </div>
    <div className="px-4 py-3 flex items-center gap-3 text-[#495057]">
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <span className="font-semibold text-[11px]">내 음식에서 고르기</span>
        <span className="truncate text-[13px]">물국수 1인분 · 피자 1조각 · 미트리 기본맛 …</span>
      </div>
      <span>›</span>
    </div>
  </div>
);

const Chip = ({ children, strong }) => (
  <span className={`flex-none px-3 py-2 rounded-xl text-[13px] whitespace-nowrap ${strong ? 'bg-[rgba(113,113,255,0.1)] font-bold text-[#7171ff]' : 'bg-[#f1f3f5] font-medium text-[#171a1d]'}`}>{children}</span>
);

function BigInput({ placeholder, focused }) {
  return (
    <div className="rounded-[18px] p-px" style={{ background: GRADIENT, boxShadow: '0 6px 20px rgba(113,113,255,0.22)' }}>
      <div className="flex items-center gap-2 rounded-[17px] bg-white pl-4 pr-2 h-[52px]">
        <span className={`flex-1 text-[15px] ${focused ? 'text-[#171a1d]' : 'text-[#868e96]'}`}>{focused && <span className="inline-block w-px h-[18px] bg-[#7171ff] align-middle mr-0.5" />}{placeholder}</span>
        <span className="w-9 h-9 flex items-center justify-center"><IcSpark active /></span>
      </div>
    </div>
  );
}

const Bar = ({ children }) => (
  <div className="bg-white rounded-t-[20px] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] px-4 pt-3 pb-4 flex flex-col gap-3">{children}</div>
);

function Keyboard() {
  return (
    <div className="bg-[#22201f] px-2 pt-3 pb-5 grid grid-cols-4 gap-1.5">
      {['ㅣ', 'ㆍ', 'ㅡ', '⌫', 'ㄱㅋ', 'ㄴㄹ', 'ㄷㅌ', '↵', 'ㅂㅍ', 'ㅅㅎ', 'ㅈㅊ', '.,?!', '한/영', 'ㅇㅁ', '␣', ','].map(key => (
        <span key={key} className="h-11 rounded-lg bg-[#3a3533] flex items-center justify-center text-[15px] text-white">{key}</span>
      ))}
    </div>
  );
}

const Rows = ({ inlineAdd }) => (
  <div className="flex flex-col gap-2">
    <div className="relative px-4 py-3 flex items-center gap-3">
      <FadeLine at="bottom" />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-[11px] text-[#495057]">어제 저녁 그대로</span>
          <span className="font-bold text-[15px] text-[#171a1d]">879kcal</span>
        </div>
        <span className="truncate text-[12px] text-[#868e96]">삼겹살 수육, 라면 (국물 적게), 보쌈김치, 광어</span>
      </div>
      <span className="rounded-full bg-[rgba(113,113,255,0.1)] px-[14px] py-2 font-bold text-[13px] text-[#7171ff]">넣기</span>
    </div>
    <div className="px-4 py-3 flex items-center gap-3 text-[#495057]">
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <span className="flex items-center justify-between">
          <span className="font-semibold text-[11px]">내 음식에서 고르기</span>
          {inlineAdd && <span className="font-bold text-[11px] text-[#7171ff]">＋ 새 음식 등록</span>}
        </span>
        <span className="truncate text-[13px]">물국수 1인분 · 피자 1조각 · 미트리 기본맛 …</span>
      </div>
      <span className="text-[#868e96]">›</span>
    </div>
  </div>
);

const Question = () => (
  <div className="flex-1 flex flex-col items-center justify-end gap-3 text-center" style={{ paddingBottom: 32 }}>
    <p className="m-0 font-bold text-[20px] leading-[26px] text-[#171a1d]">저녁에 뭐 드셨어요?</p>
    <p className="m-0 text-[13px] leading-[19px] text-[#868e96]">말하듯 적으면 AI가 칼로리와 탄단지를 정리해요</p>
    <div className="flex flex-col items-center gap-2 mt-2">
      <span className="px-3 py-2 rounded-xl bg-white shadow-[0_2px_12px_rgba(3,27,38,0.05)] text-[13px] text-[#495057]">"삼겹살 2인분이랑 냉면"</span>
      <span className="px-3 py-2 rounded-xl bg-white shadow-[0_2px_12px_rgba(3,27,38,0.05)] text-[13px] text-[#495057]">"연어 150g에 샐러드"</span>
    </div>
  </div>
);

const InputOnly = () => <Bar><BigInput placeholder="예: 제육덮밥이랑 콜라" /></Bar>;

createRoot(document.getElementById('root')).render(
  <div className="font-pretendard tracking-[-0.025em] flex gap-8 p-8 w-max">
    <Phone
      title="1. 추천은 피그마 그대로 위에, 새 음식은 줄 안에"
      note={'아래 흰 영역에는 입력창만 둔다 (칩 없음).\n추천 두 줄은 피그마(1173:9581) 그대로 카드 아래. "새 음식 등록"은 내 음식 줄 오른쪽 위 작은 글자.'}
      footer={<InputOnly />}
    >
      <Rows inlineAdd />
      <Question />
    </Phone>

    <Phone
      title="2. 같은 구조, 새 음식 등록은 따로 버튼"
      note={'1과 같고, "새 음식 등록"만 추천 두 줄 아래에 알약 버튼으로 둔다.\n눈에는 더 잘 띄지만 위쪽에 누를 것이 하나 더 생긴다.'}
      footer={<InputOnly />}
    >
      <Rows />
      <span className="self-center flex items-center gap-1 rounded-full bg-[rgba(113,113,255,0.1)] px-[14px] py-2 font-bold text-[13px] text-[#7171ff]">＋ 새 음식 등록</span>
      <Question />
    </Phone>

    <Phone
      title="3. 위는 비우고, 추천은 질문 묶음 안에"
      note={'카드 아래를 비워 시선이 바로 아래로 떨어진다.\n추천 두 줄을 예시 문장 자리 대신 질문 바로 아래에 붙인다. 예시 문장은 입력창 안내 글로만 남는다.'}
      footer={<InputOnly />}
    >
      <div className="flex-1 flex flex-col justify-end gap-4" style={{ paddingBottom: 32 }}>
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="m-0 font-bold text-[20px] leading-[26px] text-[#171a1d]">저녁에 뭐 드셨어요?</p>
          <p className="m-0 text-[13px] leading-[19px] text-[#868e96]">말하듯 적으면 AI가 칼로리와 탄단지를 정리해요</p>
        </div>
        <Rows inlineAdd />
      </div>
    </Phone>
  </div>
);
