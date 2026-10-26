import React from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { auth } from '../src/lib/firebase';
import MyPageScreen from '../src/components/screens/MyPageScreen';
import OnboardingScreen from '../src/components/screens/OnboardingScreen';
import LoginScreen from '../src/components/screens/LoginScreen';
import SplashScreen from '../src/components/screens/SplashScreen';
import McpAuthorizeScreen from '../src/components/screens/McpAuthorizeScreen';

/* 마이·온보딩·로그인·스플래시·Claude 연결 승인 미리보기 (더미 데이터, Figma 캡처용).
   ?s=my|onboarding|login|splash|mcp
   my: &mcp=connected|allowed|none  &open=guide|disconnect|delete|trash|goal
   onboarding: &step=1..4
   mcp: &open=deny */
const params = new URLSearchParams(location.search);
const s = params.get('s') || 'my';
const mcp = params.get('mcp') || 'connected';

// 서버 대신: 로그인한 사용자와 Claude 연결 상태
try { Object.defineProperty(auth, 'currentUser', { configurable: true, get: () => ({ uid: 'preview', getIdToken: async () => 'preview' }) }); } catch { /* 미리보기 전용 */ }
const realFetch = window.fetch.bind(window);
window.fetch = (url, init) => {
  if (String(url).includes('/api/mcp-oauth/status')) {
    return Promise.resolve(new Response(JSON.stringify({ connected: mcp === 'connected', allowed: mcp !== 'none' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  return realFetch(url, init);
};

const user = { uid: 'preview', name: '이재현', email: 'preview@example.com', provider: 'kakao' };
const profile = { name: '이재현', gender: 'male', age: 29, height: 178, weight: 74.5, goalWeight: 70, goal: 'cut', activityLevel: 'moderate', targetKcal: 2100 };

const clickText = text => [...document.querySelectorAll('button, [role="button"], div, span')].reverse().find(el => el.textContent.trim() === text)?.click();
const clickHas = text => [...document.querySelectorAll('button, [role="button"]')].find(el => el.textContent.includes(text))?.click();

const steps = [];
if (s === 'my') {
  const open = params.get('open');
  if (open === 'guide') steps.push(() => clickHas('방법 보기'));
  if (open === 'disconnect') steps.push(() => clickHas('연결됨'));
  if (open === 'delete') steps.push(() => clickHas('회원 탈퇴'));
  if (open === 'trash') steps.push(() => clickHas('최근 삭제된 항목'));
  if (open === 'goal') steps.push(() => clickHas('목표'));
}
if (s === 'onboarding') {
  const step = Number(params.get('step') || 1);
  for (let i = 1; i < step; i += 1) {
    steps.push(() => document.querySelector('button[aria-pressed="false"], [data-option]')?.click());
    steps.push(() => clickHas('다음'));
  }
}
if (s === 'mcp' && params.get('open') === 'deny') steps.push(() => clickHas('허용하지 않기'));

const screens = {
  my: <MyPageScreen user={user} profile={profile} onProfileSave={() => {}} onNavChange={() => {}} />,
  onboarding: <OnboardingScreen user={user} onComplete={() => {}} />,
  login: <LoginScreen onLogin={() => {}} authReady />,
  splash: <SplashScreen />,
  mcp: <McpAuthorizeScreen user={user} request={{ client_id: 'claude', redirect_uri: 'https://claude.ai' }} onClose={() => {}} />,
};

createRoot(document.getElementById('root')).render(
  <div style={{ width: Number(params.get('w')) || 402, height: Number(params.get('h')) || 874, margin: '0 auto', position: 'relative', overflow: 'hidden', background: '#fff' }}>
    {screens[s]}
  </div>
);
steps.forEach((step, i) => setTimeout(step, 600 + i * 500));
