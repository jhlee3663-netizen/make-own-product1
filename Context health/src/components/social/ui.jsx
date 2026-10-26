import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Pressable from '../common/Pressable';
import { IcBack } from '../icons/Icons';
import { IcX } from './SocialIcons';

/* 피드·친구 화면 공통 부품. 값은 Figma 📚 스터디 07 UI 컴포넌트·06 화면 기준.
   간격 원칙(docs/spacing_rules.md): 묶음 안 4~8, 묶음 사이 24, 화면 좌우 20(목록 16). */

export function Avatar({ profile, size = 40, ring = null, onClick, className = '' }) {
  const name = profile?.name || profile?.handle || '?';
  const letter = profile?.gone ? '?' : (name.trim()[0] || '?').toUpperCase();
  const ringStyle = ring === 'new' ? { boxShadow: `0 0 0 ${size >= 56 ? 1.5 : 1}px #fff` }
    : ring === 'seen' ? { boxShadow: '0 0 0 1px rgba(255,255,255,0.6)' }
    : ring === 'brand' ? { boxShadow: '0 0 0 1px #7171FF' } : null;
  const font = size >= 76 ? 'text-[28px]' : size >= 56 ? 'text-[24px]' : size >= 40 ? 'text-[16px]' : size >= 32 ? 'text-[12px]' : 'text-[11px]';
  const body = (
    <span
      className={`relative inline-flex flex-none items-center justify-center rounded-full overflow-hidden font-pretendard font-bold text-white ${font} ${className}`}
      style={{ width: size, height: size, background: profile?.photoUrl ? '#e9ecef' : (profile?.color || '#ADB5BD'), ...ringStyle }}
    >
      {profile?.photoUrl ? <img src={profile.photoUrl} alt="" className="w-full h-full object-cover" draggable="false" /> : letter}
    </span>
  );
  /* 스토리가 있을 때(인스타처럼): 바깥 그라데이션 2.5px + 안쪽 흰 2px + 사진 */
  if (ring === 'story') {
    const wrapped = (
      <span className="relative inline-flex flex-none rounded-full p-[2.5px]" style={{ background: 'linear-gradient(45deg, #3AA0FF 0%, #7171FF 50%, #F79FFF 100%)' }}>
        <span className="inline-flex rounded-full p-[2px] bg-white">{body}</span>
      </span>
    );
    if (!onClick) return wrapped;
    return <button type="button" onClick={onClick} className="flex-none rounded-full" aria-label={`${name} 스토리 보기`}>{wrapped}</button>;
  }
  if (!onClick) return body;
  return <button type="button" onClick={onClick} className="flex-none rounded-full" aria-label={`${name} 프로필`}>{body}</button>;
}

export function TopBar({ title, onBack, close = false, right = null, dark = false, className = '' }) {
  return (
    <div className={`h-14 flex-none flex items-center gap-2.5 px-4 ${dark ? 'text-white' : 'text-typo-strong bg-white'} ${className}`}>
      {onBack && (
        <Pressable pressScale={0.88} onClick={onBack} aria-label={close ? '닫기' : '뒤로'} className="w-7 h-7 -ml-1 flex items-center justify-center">
          {close ? <IcX size={22} /> : <IcBack size={24} />}
        </Pressable>
      )}
      <h1 className="flex-1 min-w-0 truncate font-pretendard font-bold text-[18px] leading-7 tracking-[-0.45px]">{title}</h1>
      {right}
    </div>
  );
}

const BTN_KIND = {
  primary: 'bg-brand text-white active:bg-[#5C5CE6] disabled:bg-ui-3 disabled:text-ui-6',
  secondary: 'bg-ui-2 text-typo-normal active:bg-ui-3',
  tint: 'bg-brand-light text-brand active:bg-[rgba(113,113,255,0.18)]',
  kakao: 'bg-[#FEE500] text-[#191919] active:bg-[#F2D900]',
  text: 'bg-transparent text-typo-alternative',
  danger: 'bg-state-danger text-white',
  outline: 'bg-white text-typo-normal border border-ui-4',
};
const BTN_SIZE = { L: 'h-[52px] rounded-[16px] text-[16px]', M: 'h-11 rounded-[14px] text-[15px]', S: 'h-10 rounded-[12px] text-[14px]', XS: 'h-8 px-3 rounded-[10px] text-[13px]' };

export function Btn({ kind = 'primary', size = 'L', children, className = '', full = true, ...props }) {
  return (
    <Pressable
      pressScale={0.97}
      type="button"
      className={`${BTN_SIZE[size]} ${BTN_KIND[kind]} ${full && size !== 'XS' ? 'w-full' : ''} px-4 inline-flex items-center justify-center gap-1.5 font-pretendard font-semibold tracking-[-0.35px] transition-colors ${className}`}
      {...props}
    >
      {children}
    </Pressable>
  );
}

export function Tag({ children, tone = 'purple', className = '' }) {
  const t = tone === 'purple' ? 'bg-brand-light text-brand' : tone === 'orange' ? 'bg-[#FFF1E8] text-red-orange' : tone === 'green' ? 'bg-state-success-weak text-state-success' : 'bg-ui-2 text-typo-secondary';
  return <span className={`inline-flex items-center h-[21px] px-2 rounded-full font-pretendard font-semibold text-[11px] leading-4 ${t} ${className}`}>{children}</span>;
}

export function FadeLine({ className = '' }) {
  return <div className={`h-px w-full bg-gradient-to-r from-transparent via-ui-3 to-transparent ${className}`} />;
}

export function Tabs({ tabs, value, onChange, className = '' }) {
  const index = Math.max(0, tabs.findIndex((t) => t.id === value));
  return (
    <div className={`relative flex flex-none bg-white border-b border-ui-2 ${className}`} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          onClick={() => onChange(t.id)}
          className={`flex-1 h-10 font-pretendard text-[14px] tracking-[-0.35px] transition-colors ${t.id === value ? 'font-bold text-typo-strong' : 'font-medium text-ui-6'}`}
        >
          {t.label}
        </button>
      ))}
      <span
        className="absolute bottom-0 h-0.5 bg-brand transition-transform duration-[460ms] ease-[cubic-bezier(0.3,1.3,0.45,1)]"
        style={{ width: `${100 / tabs.length}%`, transform: `translateX(${index * 100}%)` }}
      />
    </div>
  );
}

export function Toggle({ on, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative w-[44px] h-[26px] rounded-full flex-none transition-colors duration-200 ${on ? 'bg-brand' : 'bg-ui-4'}`}
    >
      <span className={`absolute top-[3px] left-[3px] w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${on ? 'translate-x-[18px]' : ''}`} />
    </button>
  );
}

/* 바텀 시트: 손잡이는 위 8에 따로, 내용은 위 32부터. 닫힐 때도 아래로 내려간다. */
export function Sheet({ open, onClose, children, className = '', label }) {
  const [render, setRender] = useState(open);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (open) { setRender(true); setLeaving(false); return undefined; }
    if (!render) return undefined;
    setLeaving(true);
    const t = setTimeout(() => { setRender(false); setLeaving(false); }, 260);
    return () => clearTimeout(t);
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!render) return null;
  return overlay(
    <div className="absolute inset-0 z-[60] pointer-events-auto" role="dialog" aria-modal="true" aria-label={label}>
      <div className={`absolute inset-0 bg-black/45 ${leaving ? 'diet-fade-out' : 'diet-fade-in'}`} onClick={onClose} />
      <div
        className={`absolute inset-x-0 bottom-0 bg-white rounded-t-[24px] px-5 pt-8 flex flex-col gap-6 max-h-[88%] overflow-y-auto ${leaving ? 'diet-sheet-out' : 'diet-sheet-in'} ${className}`}
        style={{ paddingBottom: 'calc(28px + env(safe-area-inset-bottom))' }}
      >
        <span className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-ui-4" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

/* 탭 화면은 transform 때문에 하단 내비보다 위로 못 올라온다. 시트는 앱 맨 위 층(#app-overlay)에 그린다. */
export function overlay(node) {
  const host = typeof document !== 'undefined' ? document.getElementById('app-overlay') : null;
  return host ? createPortal(node, host) : node;
}

export function SheetTitle({ title, sub, center = false }) {
  return (
    <div className={`flex flex-col gap-1 ${center ? 'items-center text-center' : ''}`}>
      <h2 className="font-pretendard font-bold text-[20px] leading-[30px] tracking-[-0.5px] text-typo-strong whitespace-pre-line">{title}</h2>
      {sub && <p className="font-pretendard text-[14px] leading-5 tracking-[-0.35px] text-typo-alternative">{sub}</p>}
    </div>
  );
}

/* 화면 하나 (오른쪽에서 밀려 들어온다) */
export function Screen({ children, className = '', leaving = false, bg = 'bg-white' }) {
  return (
    <div className={`absolute inset-0 flex flex-col ${bg} ${leaving ? 'social-screen-out' : 'social-screen-in'} ${className}`}>
      {children}
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`bg-ui-2 rounded-lg animate-pulse ${className}`} />;
}

export function Spinner({ size = 20, className = '' }) {
  return (
    <span className={`inline-block rounded-full border-2 border-ui-3 border-t-brand animate-spin ${className}`} style={{ width: size, height: size }} aria-label="불러오는 중" />
  );
}

/* 빈 상태: [아이콘] 16 [제목 4 설명] — 막다른 화면이 없게 다음 할 일 버튼을 같이 둔다 */
export function EmptyState({ icon, title, sub, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center text-center gap-4 ${className}`}>
      {icon && <span className="w-14 h-14 rounded-full bg-ui-2 text-typo-alternative flex items-center justify-center">{icon}</span>}
      <div className="flex flex-col items-center gap-1">
        <p className="font-pretendard font-bold text-[18px] leading-7 tracking-[-0.45px] text-typo-strong">{title}</p>
        {sub && <p className="font-pretendard text-[14px] leading-5 tracking-[-0.35px] text-typo-alternative whitespace-pre-line">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionLabel({ children, right }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-pretendard font-medium text-[13px] leading-5 tracking-[-0.3px] text-typo-alternative">{children}</span>
      {right}
    </div>
  );
}

/* 사람 한 줄: 아바타 · 이름/부제 · 오른쪽 */
export function PersonRow({ profile, sub, right, onClick, size = 40 }) {
  return (
    <div className="flex items-center gap-3 py-2 min-h-[56px]">
      <button type="button" onClick={onClick} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <Avatar profile={profile} size={size} />
        <span className="flex flex-col min-w-0">
          <span className="font-pretendard font-semibold text-[15px] leading-[22px] tracking-[-0.35px] text-typo-strong truncate">{profile?.name}</span>
          <span className="font-pretendard text-[13px] leading-5 tracking-[-0.3px] text-typo-alternative truncate">{sub ?? (profile?.handle ? `@${profile.handle}` : '')}</span>
        </span>
      </button>
      {right}
    </div>
  );
}

export function useAsync(fn, deps) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const seq = useRef(0);
  const run = async () => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (id === seq.current) setState({ loading: false, error: null, data });
    } catch (error) {
      if (id === seq.current) setState((s) => ({ loading: false, error, data: s.data }));
    }
  };
  useEffect(() => { run(); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: run, setData: (updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })) };
}
