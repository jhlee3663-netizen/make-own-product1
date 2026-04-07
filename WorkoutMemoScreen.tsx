// @ts-nocheck
/**
 * 쇠질 메모 화면
 * Figma Node: 365:3104 (메모_ 운동 부위_AI 루틴_1)
 * 진입 경로: 메인 홈 하단 플로팅 버튼(FAB) → 쇠질 메모
 *
 * 레이아웃:
 *   - <header> : fixed 상단 고정 (TopNav)
 *   - <nav>    : fixed 하단 고정 (BottomNav)
 *   - <main>   : overflow-y-auto 세로 스크롤 (중앙 콘텐츠)
 */

import React, { useState } from "react";

/* ─────────────────────────────────────────────────────────────
   타입 정의
───────────────────────────────────────────────────────────── */

interface IconHomeProps {
  active?: boolean;
}

interface IconPlusProps {
  color?: string;
  size?: number;
}

interface IconAIProps {
  size?: number;
}

interface MemoEntry {
  id: number;
  title: string;
  body: string;
  showAI?: boolean;
}

/* ─────────────────────────────────────────────────────────────
   SVG 아이콘 컴포넌트
   (실제 에셋 교체 시 각 레이어명 주석 참조)
───────────────────────────────────────────────────────────── */

/** 레이어: GNB_home */
function IconHome({ active = false }: IconHomeProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 9.5L12 3L21 9.5V20C21 20.552 20.552 21 20 21H15V15H9V21H4C3.448 21 3 20.552 3 20V9.5Z"
        fill={active ? "#0066FF" : "#ADB5BD"}
      />
    </svg>
  );
}

/** 레이어: GNB_Analytics */
function IconGrid() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="8" height="8" rx="1" fill="#ADB5BD" />
      <rect x="13" y="3" width="8" height="8" rx="1" fill="#ADB5BD" />
      <rect x="3" y="13" width="8" height="8" rx="1" fill="#ADB5BD" />
      <rect x="13" y="13" width="8" height="8" rx="4" fill="#ADB5BD" />
    </svg>
  );
}

/** 레이어: GNB_MY */
function IconUser() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke="#ADB5BD" strokeWidth="1.5" />
      <path
        d="M4 20C4 16.686 7.582 14 12 14C16.418 14 20 16.686 20 20"
        stroke="#ADB5BD"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 레이어: Back (chevronLeft) */
function IconChevronLeft() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M15 18L9 12L15 6"
        stroke="#171719"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 레이어: Icon 1 (plus) / Icon/Normal/Plus */
function IconPlus({ color = "#171719", size = 24 }: IconPlusProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 5V19M5 12H19"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 레이어: Icon 2 (moreVertical) */
function IconMoreVertical() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="5" r="1.5" fill="#171719" />
      <circle cx="12" cy="12" r="1.5" fill="#171719" />
      <circle cx="12" cy="19" r="1.5" fill="#171719" />
    </svg>
  );
}

/** 레이어: Button/Icon/Normal — 키보드 아이콘 */
function IconKeyboard() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="6" width="20" height="13" rx="2" stroke="#171719" strokeWidth="1.5" />
      <rect x="5" y="10" width="2" height="2" rx="0.5" fill="#171719" />
      <rect x="9" y="10" width="2" height="2" rx="0.5" fill="#171719" />
      <rect x="13" y="10" width="2" height="2" rx="0.5" fill="#171719" />
      <rect x="17" y="10" width="2" height="2" rx="0.5" fill="#171719" />
      <rect x="7" y="14" width="10" height="2" rx="1" fill="#171719" />
    </svg>
  );
}

/** 레이어: icon/AI Generate A filled */
function IconAI({ size = 24 }: IconAIProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="aiGrad" x1="4" y1="2" x2="20" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366F1" />
          <stop offset="1" stopColor="#A855F7" />
        </linearGradient>
      </defs>
      <path
        d="M12 2L13.8 8.2L20 10L13.8 11.8L12 18L10.2 11.8L4 10L10.2 8.2L12 2Z"
        fill="url(#aiGrad)"
      />
      <path
        d="M19 15L19.8 17.2L22 18L19.8 18.8L19 21L18.2 18.8L16 18L18.2 17.2L19 15Z"
        fill="#A855F7"
      />
    </svg>
  );
}

/** 레이어: Button/Icon/Normal — Flip Backward (Undo) */
function IconUndo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 10H14C17.314 10 20 12.686 20 16C20 19.314 17.314 22 14 22H8"
        stroke="#ADB5BD"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M8 6L4 10L8 14"
        stroke="#ADB5BD"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 레이어: Button/Icon/Normal — Flip Backward mirrored (Redo) */
function IconRedo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M20 10H10C6.686 10 4 12.686 4 16C4 19.314 6.686 22 10 22H16"
        stroke="#ADB5BD"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M16 6L20 10L16 14"
        stroke="#ADB5BD"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 레이어: Vector — AI 요약_하위 (작은 스파크 아이콘) */
function IconAISpark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <defs>
        <linearGradient id="sparkGrad" x1="2" y1="1" x2="14" y2="13" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366F1" />
          <stop offset="1" stopColor="#A855F7" />
        </linearGradient>
      </defs>
      <path
        d="M8 1L9.2 5.8L14 7L9.2 8.2L8 13L6.8 8.2L2 7L6.8 5.8L8 1Z"
        fill="url(#sparkGrad)"
      />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────
   상태바 아이콘 컴포넌트
   레이어: Wrapper (I365:3105;16215:20447;377:7512)
   포함: Wi-Fi(Shape2) / Cellular(Shape1) / Battery(Shape)
───────────────────────────────────────────────────────────── */
function StatusBarIcons() {
  return (
    <div className="flex items-center gap-1">
      {/* 레이어: Wi-Fi (Shape2) */}
      <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
        <path
          d="M8 2.5C9.8 2.5 11.4 3.2 12.6 4.3L14 2.9C12.4 1.4 10.3.5 8 .5S3.6 1.4 2 2.9L3.4 4.3C4.6 3.2 6.2 2.5 8 2.5Z"
          fill="black"
        />
        <path
          d="M8 5.5C9.1 5.5 10 5.9 10.7 6.6L12.1 5.2C11 4.2 9.6 3.5 8 3.5S5 4.2 3.9 5.2L5.3 6.6C6 5.9 6.9 5.5 8 5.5Z"
          fill="black"
        />
        <circle cx="8" cy="9.5" r="1.5" fill="black" />
      </svg>
      {/* 레이어: Cellular (Shape1) */}
      <svg width="15" height="11" viewBox="0 0 15 11" fill="none">
        <rect x="0" y="7" width="3" height="4" rx="0.5" fill="black" />
        <rect x="4.5" y="4" width="3" height="7" rx="0.5" fill="black" />
        <rect x="9" y="1" width="3" height="10" rx="0.5" fill="black" />
      </svg>
      {/* 레이어: Battery (Shape) */}
      <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
        <rect x=".5" y=".5" width="21" height="11" rx="3.5" stroke="black" strokeOpacity=".35" />
        <rect x="2" y="2" width="16" height="8" rx="2" fill="black" />
        <path
          d="M23 4V8C23.8 7.5 24.5 6.8 24.5 6S23.8 4.5 23 4Z"
          fill="black"
          fillOpacity=".4"
        />
      </svg>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   메인 컴포넌트
   Figma Node: 365:3104
───────────────────────────────────────────────────────────── */

export default function WorkoutMemoScreen() {
  const [entries] = useState<MemoEntry[]>([
    {
      id: 1,
      title: "오늘의 운동 종목을 적어주세요",
      body: "운동의 무게와 세트수 등 편하게 적어주세요운동의 무게와 세트수 등 편하게 적어주세요운동의 무게와 세트수 등 편하게 적어주세요운동의 무게와 세트수 등 편하게 적어주세요",
      showAI: true,
    },
    {
      id: 2,
      title: "오늘의 운동 종목을",
      body: "운동의 무게와 세트수 등 편하게 적어주세요운동의 무게와 세트수 등 편하게 적어주세요운동의 무게와 세트수 등 편하게 적어주세요운동의 무게와 세트수 등 편하게 적어주세요",
      showAI: false,
    },
    {
      id: 3,
      title: "오늘의 운동 종목을",
      body: "운동의 무게와 세트수 등 편하게 적어주세요운동의 무게와 세트수 등 편하게 적어주세요운동의 무게와 세트수 등 편하게 적어주세요운동의 무게와 세트수 등 편하게 적어주세요",
      showAI: false,
    },
  ]);

  return (
    /**
     * 최외곽 컨테이너
     * Figma: bg-[#f8f9fa], rounded-[16px], Elevation3 shadow
     * data-node-id: 365:3104
     */
    <div
      className="relative flex flex-col bg-[#f8f9fa] w-full max-w-[402px] h-screen mx-auto rounded-[16px] overflow-hidden shadow-[0px_8px_16px_0px_rgba(23,26,29,0.10),0px_4px_8px_0px_rgba(23,26,29,0.05)]"
      data-node-id="365:3104"
    >

      {/* ═══════════════════════════════════════════════
          SECTION 1 — 상단 네비게이션 (fixed)
          Figma: Top Navigation/Top Navigation (365:3105)
          - Status bar : I365:3105;16215:20447
          - Nav bar    : I365:3105;16215:20448
      ═══════════════════════════════════════════════ */}
      <header
        className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[402px] z-50 bg-white/90 backdrop-blur-[32px] border-b border-[rgba(112,115,124,0.16)]"
        data-node-id="365:3105"
      >
        {/* 스테이터스 바 — I365:3105;16215:20447, height 36px */}
        <div className="flex items-center justify-between h-[36px] px-[16px]">
          {/* 레이어: Time */}
          <span
            className="text-[14px] font-medium text-black/60"
            style={{ fontFamily: "Pretendard, sans-serif" }}
          >
            9:41
          </span>
          {/* 레이어: Wi-Fi / Cellular / Battery */}
          <StatusBarIcons />
        </div>

        {/* 네비게이션 바 — I365:3105;16215:20448, px-16 py-16, h-56 */}
        <div
          className="relative flex items-center justify-between px-[16px] py-[16px] h-[56px]"
          data-node-id="I365:3105;16215:20448"
        >
          {/* Leading — 레이어: Back (chevronLeft) */}
          <button
            className="flex items-center justify-center w-[24px] h-[24px] rounded-full active:bg-black/[0.08] transition-colors"
            type="button"
            aria-label="뒤로가기"
            data-node-id="I365:3105;16215:20472;16215:20529"
          >
            <IconChevronLeft />
          </button>

          {/* Title — 쇠질 메모
              Pretendard SemiBold 20px, tracking -0.5px, leading 36px */}
          <h1
            className="absolute left-1/2 -translate-x-1/2 text-[20px] font-semibold text-black tracking-[-0.5px] leading-[36px] whitespace-nowrap overflow-hidden text-ellipsis"
            style={{ fontFamily: "Pretendard, sans-serif" }}
            data-node-id="I365:3105;16215:20448;16215:20467"
          >
            쇠질 메모
          </h1>

          {/* Trailing — 레이어: Icon 1 (plus) + Icon 2 (moreVertical) */}
          <div className="flex items-center gap-[16px]">
            {/* 레이어: Icon 1 (plus) */}
            <button
              className="flex items-center justify-center w-[24px] h-[24px] rounded-full active:bg-black/[0.08] transition-colors"
              type="button"
              aria-label="추가"
              data-node-id="I365:3105;16215:20476;16215:20573"
            >
              <IconPlus />
            </button>
            {/* 레이어: Icon 2 (moreVertical) */}
            <button
              className="flex items-center justify-center w-[24px] h-[24px] rounded-full active:bg-black/[0.08] transition-colors"
              type="button"
              aria-label="더보기"
              data-node-id="I365:3105;16215:20476;16215:20574"
            >
              <IconMoreVertical />
            </button>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════
          SECTION 2 — 중앙 스크롤 영역
          pt: TopNav(36 status + 56 nav = 92px)
          pb: BottomNav(~69px)
      ═══════════════════════════════════════════════ */}
      <main
        className="flex-1 overflow-y-auto pt-[92px] pb-[69px]"
        data-node-id="365:3106-scroll"
      >

        {/* 툴바 (키보드 / AI / Undo / Redo)
            Figma: 365:3119 — bg white, px-24 py-12 */}
        <div
          className="flex items-center justify-between bg-white px-[24px] py-[12px]"
          data-node-id="365:3119"
        >
          {/* 왼쪽: 키보드 + AI */}
          <div className="flex items-center gap-[16px]" data-node-id="365:3120">
            {/* 레이어: Button/Icon/Normal — 키보드 아이콘 */}
            <button
              className="flex items-center justify-center w-[24px] h-[24px] rounded-full active:bg-[#ADB5BD]/20 transition-colors"
              type="button"
              aria-label="키보드"
              data-node-id="365:3121"
            >
              <IconKeyboard />
            </button>
            {/* 레이어: icon/AI Generate A filled */}
            <button
              className="flex items-center justify-center w-[24px] h-[24px] rounded-full active:bg-violet-100 transition-colors"
              type="button"
              aria-label="AI 생성"
              data-node-id="365:3122"
            >
              <IconAI />
            </button>
          </div>

          {/* 오른쪽: Undo / Redo */}
          <div className="flex items-center gap-[16px]" data-node-id="365:3124">
            {/* 레이어: Button/Icon/Normal — Flip Backward (Undo) */}
            <button
              className="flex items-center justify-center w-[24px] h-[24px] rounded-full active:bg-[#ADB5BD]/20 transition-colors"
              type="button"
              aria-label="되돌리기"
              data-node-id="365:3125"
            >
              <IconUndo />
            </button>
            {/* 레이어: Button/Icon/Normal — Flip Backward mirrored (Redo) */}
            <button
              className="flex items-center justify-center w-[24px] h-[24px] rounded-full active:bg-[#ADB5BD]/20 transition-colors"
              type="button"
              aria-label="다시실행"
              data-node-id="365:3126"
            >
              <IconRedo />
            </button>
          </div>
        </div>

        {/* 운동 부위 헤더
            Figma: 365:3118 (쇠질 메모_운동 부위)
            font: SB/l — 18px semibold #171A1D, tracking -0.45px, leading 28px
            bg: white, px-16 py-32 */}
        <div
          className="flex items-center gap-[8px] bg-white px-[16px] py-[32px]"
          data-node-id="365:3118"
        >
          <span
            className="flex-1 text-[18px] font-semibold text-[#171A1D] tracking-[-0.45px] leading-[28px]"
            style={{ fontFamily: "Pretendard, sans-serif" }}
            data-node-id="I365:3118;357:1510"
          >
            하체
          </span>
          {/* 레이어: AI 요약_하위 — Vector */}
          <button
            className="flex items-center justify-center w-[24px] h-[24px] bg-white rounded-[8px] p-[4px] active:bg-violet-50 transition-colors"
            type="button"
            aria-label="AI 요약"
            data-node-id="I365:3118;357:1511"
          >
            <IconAISpark />
          </button>
        </div>

        {/* 메모 항목 목록
            Figma: 365:3107 ~ 365:3116
            종목: SB/m — 16px semibold #495057, tracking -0.4px, leading 24px
            본문: M/s  — 14px medium  #646D76, tracking -0.35px, leading 20px */}
        <div className="flex flex-col" data-node-id="365:3106-list">
          {entries.map((entry) => (
            <div key={entry.id} className="flex flex-col w-full">

              {/* 운동 종목 헤더 행
                  Figma: 쇠질 메모_운동 종목
                  bg: white, pt-16 pb-8 px-16 */}
              <div
                className="flex items-center gap-[8px] bg-white pt-[16px] pb-[8px] px-[16px] w-full"
                data-node-id="365:3108"
              >
                <p
                  className="flex-1 text-[16px] font-semibold text-[#495057] tracking-[-0.4px] leading-[24px]"
                  style={{ fontFamily: "Pretendard, sans-serif" }}
                >
                  {entry.title}
                </p>
                {/* 레이어: AI 요약_하위 (첫 항목만) */}
                {entry.showAI === true && (
                  <button
                    className="flex items-center justify-center w-[24px] h-[24px] bg-white rounded-[8px] p-[4px] active:bg-violet-50 transition-colors shrink-0"
                    type="button"
                    aria-label="AI 요약"
                    data-node-id="I365:3108;363:1479"
                  >
                    {/* 레이어: Vector */}
                    <IconAISpark />
                  </button>
                )}
              </div>

              {/* 운동 본문 행
                  Figma: 쇠질 메모_운동 무게,세트수 등
                  bg: white, pt-8 pb-16 px-16 */}
              <div
                className="flex items-start bg-white pt-[8px] pb-[16px] px-[16px] w-full"
                data-node-id="365:3109"
              >
                <p
                  className="flex-1 text-[14px] font-medium text-[#646D76] tracking-[-0.35px] leading-[20px]"
                  style={{ fontFamily: "Pretendard, sans-serif" }}
                >
                  {entry.body}
                </p>
              </div>

            </div>
          ))}

          {/* + 항목 추가 버튼
              Figma: 365:3116 → I365:3117;365:3813
              bg: #f1f3f5, rounded-[12px], padding: 8px */}
          <div
            className="flex items-center justify-center p-[8px] w-full"
            data-node-id="365:3116"
          >
            <button
              className="flex flex-1 items-center justify-center bg-[#f1f3f5] rounded-[12px] py-[8px] active:bg-[#dee2e6] transition-colors"
              type="button"
              aria-label="메모 항목 추가"
              data-node-id="I365:3117;365:3813"
            >
              {/* 레이어: Icon/Normal/Plus */}
              <IconPlus color="#495057" />
            </button>
          </div>
        </div>

      </main>

      {/* ═══════════════════════════════════════════════
          SECTION 3 — 하단 탭 바 (fixed)
          Figma: Bottom Nav (365:3127) → GNB_NEW (I365:3127;119:708)
          border: #e9ecef, rounded-tl/tr-[16px]
          shadow FAB: 0px 6px 16px rgba(3,7,19,0.10)
          홈(active #0066FF) / 분석 / 마이 — Pretendard Medium 12px
      ═══════════════════════════════════════════════ */}
      <nav
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[402px] z-50"
        data-node-id="365:3127"
      >
        <div
          className="flex items-center bg-white border border-[#e9ecef] rounded-tl-[16px] rounded-tr-[16px]"
          style={{ boxShadow: "0px 6px 16px 0px rgba(3,7,19,0.10)" }}
          data-node-id="I365:3127;119:708"
        >
          {/* 탭: 홈 (active) */}
          <button
            className="flex flex-col flex-1 items-center justify-center gap-[2px] py-[8px] bg-white"
            type="button"
            aria-label="홈"
            data-node-id="I365:3127;119:709"
          >
            {/* 레이어: GNB_home */}
            <IconHome active={true} />
            <span
              className="text-[12px] font-medium leading-[1.5] text-[#0066FF]"
              style={{ fontFamily: "Pretendard, sans-serif" }}
              data-node-id="I365:3127;119:714"
            >
              홈
            </span>
          </button>

          {/* 탭: 분석 */}
          <button
            className="flex flex-col flex-1 items-center justify-center gap-[2px] py-[8px] bg-white"
            type="button"
            aria-label="분석"
            data-node-id="I365:3127;119:715"
          >
            {/* 레이어: GNB_Analytics */}
            <IconGrid />
            <span
              className="text-[12px] font-medium leading-[1.5] text-[#ADB5BD]"
              style={{ fontFamily: "Pretendard, sans-serif" }}
              data-node-id="I365:3127;119:721"
            >
              분석
            </span>
          </button>

          {/* 탭: 마이 */}
          <button
            className="flex flex-col flex-1 items-center justify-center gap-[2px] py-[8px] bg-white"
            type="button"
            aria-label="마이"
            data-node-id="I365:3127;119:722"
          >
            {/* 레이어: GNB_MY */}
            <IconUser />
            <span
              className="text-[12px] font-medium leading-[1.5] text-[#ADB5BD]"
              style={{ fontFamily: "Pretendard, sans-serif" }}
              data-node-id="I365:3127;119:727"
            >
              마이
            </span>
          </button>
        </div>
      </nav>

    </div>
  );
}
