import React, { useEffect, useRef, useState } from 'react';
import Pressable from './Pressable';

export default function ConfirmModal({
  isOpen,
  title,
  subtitle,
  onConfirm,
  onCancel,
  confirmText = '확인',
  cancelText = '취소',
  confirmVariant = 'primary',
}) {
  const [render, setRender] = useState(isOpen);
  const cancelButtonRef = useRef(null);

  useEffect(() => {
    if (isOpen) setRender(true);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const t = setTimeout(() => cancelButtonRef.current?.focus(), 120);
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onCancel?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onCancel]);

  if (!render) return null;

  const confirmClass = confirmVariant === 'danger'
    ? 'bg-[#F04452] text-white active:bg-[#D92D3D]'
    : 'bg-[#3182F6] text-white active:bg-[#1B64DA]';

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-5 transition-opacity duration-200 ${isOpen ? 'opacity-100 pointer-events-auto bg-black/45' : 'opacity-0 pointer-events-none bg-transparent'}`}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel?.();
      }}
      onTransitionEnd={() => !isOpen && setRender(false)}
    >
      <div
        className={`bg-white w-full max-w-[326px] rounded-[20px] px-5 pt-6 pb-4 shadow-[0_18px_48px_rgba(0,0,0,0.18)] flex flex-col text-left transition-all duration-200 ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-3'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby={subtitle ? 'confirm-modal-subtitle' : undefined}
      >
        <h3 id="confirm-modal-title" className="font-pretendard text-[20px] font-bold text-[#191F28] tracking-[-0.5px] leading-[28px] mb-2 whitespace-pre-wrap">
          {title}
        </h3>
        {subtitle && (
          <p id="confirm-modal-subtitle" className="font-pretendard text-[15px] font-normal text-[#6B7684] leading-[22px] mb-6 whitespace-pre-wrap">
            {subtitle}
          </p>
        )}
        <div className="flex w-full gap-2 mt-1">
          <Pressable
            ref={cancelButtonRef}
            pressScale={0.97}
            onClick={onCancel}
            className="flex-1 h-12 bg-[#F2F4F6] text-[#4E5968] font-pretendard font-medium text-[16px] rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-[#3182F6]/30"
          >
            {cancelText}
          </Pressable>
          <Pressable
            pressScale={0.97}
            onClick={onConfirm}
            className={`flex-1 h-12 font-pretendard font-medium text-[16px] rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-[#3182F6]/30 ${confirmClass}`}
          >
            {confirmText}
          </Pressable>
        </div>
      </div>
    </div>
  );
}
