import React, { useEffect } from 'react';
import LogoMotion from '../common/LogoMotion';

const SPLASH_COLOR = '#3aa0ff';

/* 앱을 켰을 때 내 기록을 불러오는 동안 잠깐 보이는 화면 (Figma 📚 스터디 1152:8795). */
export default function SplashScreen() {
  // 상단 상태 표시줄 색도 화면과 이어지게 맞췄다가, 화면이 사라지면 흰색으로 되돌린다.
  useEffect(() => {
    const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
    metas.forEach(meta => meta.setAttribute('content', SPLASH_COLOR));
    return () => metas.forEach(meta => meta.setAttribute('content', '#ffffff'));
  }, []);

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(to bottom right, #3aa0ff, #f79fff)' }}
      role="status"
      aria-label="앱을 불러오는 중"
    >
      <div className="flex flex-col items-center -mt-[62px]">
        <LogoMotion tone="white" />
        <p className="font-pretendard font-bold text-[28px] leading-[33px] text-white">Context Health</p>
      </div>
    </div>
  );
}
