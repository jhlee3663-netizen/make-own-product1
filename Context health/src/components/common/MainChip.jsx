import React from 'react';

/**
 * MainChip - 대시보드 카드 등에서 상태를 나타내는 작은 배지
 * @param {('success'|'fail'|'more')} type - 칩의 타입
 * @param {string} label - 표시할 텍스트
 */
const MainChip = ({ type = 'success', label }) => {
  const styles = {
    success: 'bg-[#e7f5ed] text-[#219653]',
    fail: 'bg-[#fde7e7] text-[#eb5757]',
    more: 'bg-[#e7f0fd] text-[#2d9cdb]',
  };

  const defaultLabels = {
    success: '성공 🔥',
    fail: '실패 💧',
    more: '더보기',
  };

  return (
    <div className={`px-3 py-1 rounded-full text-caption-m font-bold tracking-[-0.3px] ${styles[type]}`}>
      {label || defaultLabels[type]}
    </div>
  );
};

export default MainChip;
