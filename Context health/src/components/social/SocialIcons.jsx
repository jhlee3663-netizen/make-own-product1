import React from 'react';

/* 피드·친구 화면 아이콘. DS Iconex Light(선)·Filled 원본(Figma 📚 스터디 07-13)에서 옮겼다. 색은 currentColor. */

const Svg = ({ size = 24, children, vb = 24 }) => (
  <svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} fill="none" aria-hidden="true">{children}</svg>
);

export const IxSearch = ({ size }) => (
  <Svg size={size}><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M16.5 16.957L21.5 21.957" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></Svg>
);

export const IxPlusSquare = ({ size }) => (
  <Svg size={size}><rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="1.5" /><path d="M9 12H15M12 9L12 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></Svg>
);

export const IxAddUser = ({ size }) => (
  <Svg size={size}>
    <circle cx="10" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
    <path d="M3 16.9347C3 16.0743 3.54085 15.3068 4.35109 15.0175C8.00404 13.7128 11.996 13.7128 15.6489 15.0175C16.4591 15.3068 17 16.0743 17 16.9347V18.2502C17 19.4376 15.9483 20.3498 14.7728 20.1818L13.8184 20.0455C11.2856 19.6837 8.71435 19.6837 6.18162 20.0455L5.22721 20.1818C4.0517 20.3498 3 19.4376 3 18.2502V16.9347Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M17 11H21M19 9L19 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

const HEART = 'M3.66275 13.2135L9.82377 19.7065C11.0068 20.9532 12.9932 20.9532 14.1762 19.7065L20.3372 13.2135C22.5542 10.877 22.5543 7.08882 20.3373 4.75235C18.1203 2.41588 14.5258 2.41588 12.3088 4.75235C12.1409 4.92925 11.8591 4.92925 11.6912 4.75235C9.47421 2.41588 5.87975 2.41588 3.66275 4.75235C1.44575 7.08883 1.44575 10.877 3.66275 13.2135Z';
export const IxHeart = ({ size, filled }) => (
  <Svg size={size}><path d={HEART} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" /></Svg>
);

export const IxMessage = ({ size }) => (
  <Svg size={size}>
    <path d="M12 2.75C17.1086 2.75 21.25 6.89137 21.25 12C21.25 17.1086 17.1086 21.25 12 21.25C10.3745 21.25 8.84932 20.8305 7.52321 20.0952C7.08754 19.8537 6.55016 19.7826 6.04427 19.9614L3.52057 20.8534C3.16396 20.9794 2.82037 20.6358 2.94641 20.2792L3.8757 17.6481C4.04742 17.162 3.98834 16.6459 3.76926 16.2198C3.11877 14.9548 2.75 13.5216 2.75 12C2.75 6.89137 6.89137 2.75 12 2.75Z" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="7.05" cy="12.05" r="1.25" fill="currentColor" /><circle cx="12.05" cy="12.05" r="1.25" fill="currentColor" /><circle cx="17.05" cy="12.05" r="1.25" fill="currentColor" />
  </Svg>
);

export const IxDownload = ({ size }) => (
  <Svg size={size}>
    <path d="M9 8L7 8C4.79086 8 3 9.79086 3 12L3 17C3 19.2091 4.79086 21 7 21L19 21C21.2091 21 23 19.2091 23 17L23 12C23 9.79086 21.2091 8 19 8L17 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" transform="translate(-1 0)" />
    <path d="M10 13L12.2929 15.2929C12.6834 15.6834 13.3166 15.6834 13.7071 15.2929L16 13M13 15L13 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" transform="translate(-1 0)" />
  </Svg>
);

export const IxBookmark = ({ size, filled }) => (
  <Svg size={size}>
    {filled ? (
      <path fillRule="evenodd" clipRule="evenodd" d="M4.25 7C4.25 4.37665 6.37665 2.25 9 2.25H15C17.6234 2.25 19.75 4.37665 19.75 7V20.1683C19.75 21.5529 18.2183 22.3891 17.0537 21.6404L12.6759 18.8261C12.2642 18.5614 11.7358 18.5614 11.3241 18.8261L6.94633 21.6404C5.78168 22.3891 4.25 21.5529 4.25 20.1683V7ZM9 7.75C8.58579 7.75 8.25 8.08579 8.25 8.5C8.25 8.91421 8.58579 9.25 9 9.25H15C15.4142 9.25 15.75 8.91421 15.75 8.5C15.75 8.08579 15.4142 7.75 15 7.75H9Z" fill="currentColor" />
    ) : (
      <>
        <path d="M5 7C5 4.79086 6.79086 3 9 3H15C17.2091 3 19 4.79086 19 7V20.1683C19 20.9595 18.1248 21.4373 17.4592 21.0095L13.0815 18.1953C12.4227 17.7717 11.5773 17.7717 10.9185 18.1953L6.54076 21.0095C5.87525 21.4373 5 20.9595 5 20.1683V7Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 8.5H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </>
    )}
  </Svg>
);

/* 공유(보내기) — Iconex Light 선 굵기 1.5 */
export const IxSend = ({ size }) => (
  <Svg size={size}><path d="M20.5 3.5L10.5 13.5M20.5 3.5L14.2 20.3C14 20.8 13.3 20.8 13.1 20.3L10.5 13.5L3.7 10.9C3.2 10.7 3.2 10 3.7 9.8L20.5 3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></Svg>
);

export const IxMoreCircle = ({ size }) => (
  <Svg size={size}><rect x="2" y="2" width="20" height="20" rx="10" stroke="currentColor" strokeWidth="1.5" /><circle cx="7.05" cy="12.05" r="1.25" fill="currentColor" /><circle cx="12.05" cy="12.05" r="1.25" fill="currentColor" /><circle cx="17.05" cy="12.05" r="1.25" fill="currentColor" /></Svg>
);

export const IxCheckSquare = ({ size = 20 }) => (
  <Svg size={size} vb={20}><rect x="1.67" y="1.67" width="16.67" height="16.67" rx="4.17" stroke="currentColor" strokeWidth="1.25" /><path d="M7.92 9.58L9.58 11.25L12.92 7.92" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /></Svg>
);

export const IxPlay = ({ size = 24 }) => (
  <Svg size={size} vb={28}><path d="M9.33 5.83V22.17L22.17 14L9.33 5.83Z" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></Svg>
);

/* 이하 작은 선 아이콘 (stroke 2) */
const Line = ({ size, vb, d, sw = 2 }) => (
  <svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} fill="none" aria-hidden="true">
    {[].concat(d).map((p) => <path key={p} d={p} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />)}
  </svg>
);

export const IcX = ({ size = 22 }) => <Line size={size} vb={22} d="M16.5 5.5L5.5 16.5M5.5 5.5L16.5 16.5" />;
export const IcDown = ({ size = 15 }) => <Line size={size} vb={15} d="M7.5 2.5V10M3.75 6.875L7.5 10.625L11.25 6.875M3.125 13.125H11.875" />;
export const IcBell = ({ size = 18 }) => <Line size={size} vb={18} d="M7.725 15.75C7.84326 15.9869 8.0252 16.1862 8.25041 16.3255C8.47562 16.4648 8.73519 16.5386 9 16.5386C9.26481 16.5386 9.52438 16.4648 9.74959 16.3255C9.9748 16.1862 10.1567 15.9869 10.275 15.75M4.5 6C4.5 4.80653 4.97411 3.66193 5.81802 2.81802C6.66193 1.97411 7.80653 1.5 9 1.5C10.1935 1.5 11.3381 1.97411 12.182 2.81802C13.0259 3.66193 13.5 4.80653 13.5 6C13.5 11.25 15.75 12.75 15.75 12.75H2.25C2.25 12.75 4.5 11.25 4.5 6Z" />;
export const IcLink = ({ size = 18 }) => <Line size={size} vb={18} d="M7.5 9.75C7.82 10.17 8.24 10.52 8.71 10.78C9.18 11.03 9.7 11.18 10.23 11.21C10.76 11.25 11.29 11.17 11.79 10.98C12.29 10.79 12.75 10.5 13.13 10.13L15.38 7.88C15.92 7.15 16.18 6.26 16.12 5.36C16.05 4.46 15.66 3.61 15.03 2.97C14.39 2.34 13.54 1.95 12.64 1.88C11.74 1.82 10.85 2.08 10.13 2.63L8.85 3.9M10.5 8.25C10.18 7.83 9.76 7.48 9.29 7.22C8.82 6.97 8.3 6.82 7.77 6.79C7.24 6.75 6.71 6.83 6.21 7.02C5.71 7.21 5.25 7.5 4.88 7.88L2.63 10.13C2.08 10.85 1.82 11.74 1.88 12.64C1.95 13.54 2.34 14.39 2.97 15.03C3.61 15.66 4.46 16.05 5.36 16.12C6.26 16.18 7.15 15.92 7.88 15.38L9.15 14.1" />;
export const IcCheck = ({ size = 14 }) => <Line size={size} vb={14} d="M11.67 3.5L5.25 9.92L2.33 7" sw={2.4} />;
export const IcGrip = ({ size = 16 }) => <Line size={size} vb={16} d="M6 4H6.01M10 4H10.01M6 8H6.01M10 8H10.01M6 12H6.01M10 12H10.01" />;
export const IcAlert = ({ size = 16 }) => <Line size={size} vb={16} d={['M8 14C11.31 14 14 11.31 14 8C14 4.69 11.31 2 8 2C4.69 2 2 4.69 2 8C2 11.31 4.69 14 8 14Z', 'M8 5.33V8M8 10.67H8.01']} />;
export const IcLock = ({ size = 24 }) => <Line size={size} vb={24} d={['M18 11H6C4.9 11 4 11.9 4 13V19C4 20.1 4.9 21 6 21H18C19.1 21 20 20.1 20 19V13C20 11.9 19.1 11 18 11Z', 'M8 11V7C8 5.94 8.42 4.92 9.17 4.17C9.92 3.42 10.94 3 12 3C13.06 3 14.08 3.42 14.83 4.17C15.58 4.92 16 5.94 16 7V11']} />;
export const IcPlusSmall = ({ size = 16 }) => <Line size={size} vb={16} d="M8 3.33V12.67M3.33 8H12.67" />;
export const IcMoreDots = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 22 22" fill="currentColor" aria-hidden="true"><circle cx="4.6" cy="11" r="1.6" /><circle cx="11" cy="11" r="1.6" /><circle cx="17.4" cy="11" r="1.6" /></svg>
);
export const IcChevronRight = ({ size = 16 }) => <Line size={size} vb={16} d="M6 4L10 8L6 12" />;
