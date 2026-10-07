import { useEffect } from 'react';

/* 열려 있는 메뉴를, 메뉴 바깥을 누르거나 화면을 스크롤하면 닫는다.
   화면 전체를 덮는 투명 층 방식은 카드에 움직임(transform)이 걸리면 카드 크기로 줄어들어 쓸 수 없다. */
export default function useDismiss(open, onClose, insideRef) {
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (insideRef.current?.contains(event.target)) return;
      onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);
}
