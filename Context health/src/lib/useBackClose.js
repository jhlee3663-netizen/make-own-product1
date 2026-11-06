import { useEffect, useRef } from 'react';

/* 화면을 덮는 겹침(모달·상세 보기)을 기기 뒤로가기로 닫는다.
   안 쓰면 안드로이드 뒤로가기가 앱을 그대로 꺼버린다 (약관 상세에서 앱이 종료되던 문제).

   방식: 열릴 때 기록(history)을 한 칸 쌓고, 뒤로가기가 그 칸을 빼면 닫는다.
   닫기 버튼으로 닫았으면 쌓아 둔 칸을 되돌린다.
   주의: 운동 메모·식단 상세 안에서는 쓰지 않는다. 그 화면은 App.jsx가 뒤로가기를
   따로 지키고 있어(detailBackGuard) 서로 엉킨다. */

let pendingBacks = 0; // 우리가 되돌린 뒤로가기는 닫기로 세지 않는다

export default function useBackClose(open, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    let pushed = false;
    try {
      window.history.pushState({ overlayBack: Date.now() }, '');
      pushed = true;
    } catch { /* 기록을 못 쌓으면 뒤로가기 처리를 포기한다 */ }

    const onPop = () => {
      if (pendingBacks > 0) { pendingBacks -= 1; return; }
      pushed = false;
      closeRef.current?.();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (pushed) { pendingBacks += 1; window.history.back(); }
    };
  }, [open]);
}
