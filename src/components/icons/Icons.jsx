import React from 'react';

export const IcHome = ({ active, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill={active ? "#0054d1" : "#adb5bd"}>
    <path fillRule="evenodd" clipRule="evenodd" d="M8.45.187C8.774-.062 9.226-.062 9.55.187l8.1 6.253C17.87 6.61 18 6.874 18 7.152v9.048C18 17.194 17.193 18 16.199 18H10.8v-4.31a.9.9 0 0 0-.9-.9H8.1a.9.9 0 0 0-.9.9V18H1.8C.806 18 0 17.194 0 16.2V7.152c0-.279.13-.541.35-.712L8.45.187Z" />
  </svg>
);

export const IcGrid = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="#adb5bd">
    <rect x="2" y="2" width="6" height="6" rx="1" />
    <rect x="2" y="10" width="6" height="6" rx="1" />
    <rect x="10" y="2" width="6" height="6" rx="1" />
    <rect x="10" y="10" width="6" height="6" rx="3" />
  </svg>
);

export const IcUser = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#adb5bd">
    <path d="M7.09 7.91C7.09 5.2 9.29 3 12 3s4.91 2.2 4.91 4.91-2.2 4.91-4.91 4.91S7.09 10.62 7.09 7.91Z" />
    <path d="M3 21c0-3.615 4.03-6.546 9-6.546S21 17.385 21 21H3Z" />
  </svg>
);

export const IcBack = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M15 18L9 12l6-6" stroke="#171719" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IcPlus = ({ color = "#171719", size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 5v14M5 12h14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const IcMore = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="5" r="1.5" fill="#171719" />
    <circle cx="12" cy="12" r="1.5" fill="#171719" />
    <circle cx="12" cy="19" r="1.5" fill="#171719" />
  </svg>
);

export const IcKeyboard = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="2" y="6" width="20" height="13" rx="2" stroke="#171719" strokeWidth="1.5" />
    <rect x="5" y="10" width="2" height="2" rx=".5" fill="#171719" />
    <rect x="9" y="10" width="2" height="2" rx=".5" fill="#171719" />
    <rect x="13" y="10" width="2" height="2" rx=".5" fill="#171719" />
    <rect x="17" y="10" width="2" height="2" rx=".5" fill="#171719" />
    <rect x="7" y="14" width="10" height="2" rx="1" fill="#171719" />
  </svg>
);

export const IcAI = ({ active = false }) => {
  const fill = active ? "white" : "url(#tbAiG)";
  return (
    <div className={`w-6 h-6 flex-shrink-0 flex items-center justify-center ${active ? 'rounded-[8px] bg-gradient-to-r from-[#228bed] to-[#c509d6]' : 'bg-transparent'}`}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        {!active && (
          <defs>
            <linearGradient id="tbAiG" x1="0" y1="8" x2="16" y2="8" gradientUnits="userSpaceOnUse">
              <stop stopColor="#228BED" /><stop offset="1" stopColor="#C509D6" />
            </linearGradient>
          </defs>
        )}
        <path d="M3.636 16C3.235 16 2.909 15.674 2.909 15.273C2.909 14.871 3.235 14.545 3.636 14.545C4.038 14.545 4.364 14.871 4.364 15.273C4.364 15.674 4.038 16 3.636 16Z" fill={fill} />
        <path d="M12.364 1.455C11.962 1.455 11.636 1.129 11.636 0.727C11.636 0.326 11.962 0 12.364 0C12.765 0 13.091 0.326 13.091 0.727C13.091 1.129 12.765 1.455 12.364 1.455Z" fill={fill} />
        <path d="M15.273 4.364C14.871 4.364 14.545 4.038 14.545 3.636C14.545 3.235 14.871 2.909 15.273 2.909C15.674 2.909 16 3.235 16 3.636C16 4.038 15.674 4.364 15.273 4.364Z" fill={fill} />
        <path d="M7.051 2.928C7.292 1.933 8.708 1.933 8.949 2.928L9.613 5.667C9.700 6.023 9.977 6.300 10.333 6.387L13.072 7.051C14.067 7.292 14.067 8.708 13.072 8.949L10.333 9.613C9.977 9.700 9.700 9.977 9.613 10.333L8.949 13.072C8.708 14.067 7.292 14.067 7.051 13.072L6.387 10.333C6.300 9.977 6.023 9.700 5.667 9.613L2.928 8.949C1.933 8.708 1.933 7.292 2.928 7.051L5.667 6.387C6.023 6.300 6.300 6.023 6.387 5.667L7.051 2.928Z" fill={fill} />
        <path fillRule="evenodd" clipRule="evenodd" d="M15.502 10.178C15.840 10.305 16.012 10.682 15.886 11.021C15.067 13.214 13.367 14.977 11.217 15.877C10.883 16.016 10.500 15.859 10.360 15.525C10.221 15.192 10.378 14.809 10.711 14.669C12.529 13.908 13.967 12.417 14.660 10.563C14.786 10.224 15.163 10.052 15.502 10.178Z" fill={fill} />
        <path fillRule="evenodd" clipRule="evenodd" d="M5.833 0.498C5.960 0.836 5.788 1.214 5.450 1.340C3.585 2.038 2.088 3.493 1.333 5.331C1.195 5.666 0.813 5.826 0.479 5.688C0.144 5.551 -0.016 5.168 0.122 4.834C1.015 2.660 2.784 0.940 4.991 0.114C5.329 -0.012 5.707 0.159 5.833 0.498Z" fill={fill} />
        <path d="M0.727 13.091C0.326 13.091 0 12.765 0 12.364C0 11.962 0.326 11.636 0.727 11.636C1.129 11.636 1.455 11.962 1.455 12.364C1.455 12.765 1.129 13.091 0.727 13.091Z" fill={fill} />
      </svg>
    </div>
  );
};

export const IcSpark = () => {
  const fill = "url(#spAiG)";
  return (
    <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <defs>
          <linearGradient id="spAiG" x1="0" y1="8" x2="16" y2="8" gradientUnits="userSpaceOnUse">
            <stop stopColor="#228BED" /><stop offset="1" stopColor="#C509D6" />
          </linearGradient>
        </defs>
        <path d="M3.956 2.061C4.152 1.252 5.302 1.252 5.499 2.061L6.038 4.287C6.108 4.575 6.334 4.801 6.622 4.871L8.848 5.411C9.657 5.607 9.657 6.757 8.848 6.953L6.622 7.493C6.334 7.563 6.108 7.788 6.038 8.077L5.499 10.302C5.302 11.111 4.152 11.111 3.956 10.302L3.416 8.077C3.346 7.788 3.121 7.563 2.832 7.493L0.607 6.953C-0.202 6.757 -0.202 5.607 0.607 5.411L2.832 4.871C3.121 4.801 3.346 4.575 3.416 4.287L3.956 2.061Z" fill={fill} />
        <path d="M10.434 9.828C10.555 9.33 11.263 9.33 11.384 9.828L11.716 11.197C11.759 11.375 11.898 11.514 12.075 11.557L13.445 11.889C13.943 12.01 13.943 12.718 13.445 12.838L12.075 13.17C11.898 13.213 11.759 13.352 11.716 13.53L11.384 14.899C11.263 15.397 10.555 15.397 10.434 14.899L10.102 13.53C10.059 13.352 9.921 13.213 9.743 13.17L8.373 12.838C7.876 12.718 7.876 12.01 8.373 11.889L9.743 11.557C9.921 11.514 10.059 11.375 10.102 11.197L10.434 9.828Z" fill={fill} />
        <path d="M12.779 1.972C12.859 1.646 13.323 1.646 13.402 1.972L13.62 2.871C13.649 2.988 13.74 3.079 13.856 3.107L14.755 3.325C15.082 3.404 15.082 3.869 14.755 3.948L13.856 4.166C13.74 4.194 13.649 4.285 13.62 4.402L13.402 5.3C13.323 5.627 12.859 5.627 12.779 5.3L12.561 4.402C12.533 4.285 12.442 4.194 12.326 4.166L11.427 3.948C11.1 3.869 11.1 3.404 11.427 3.325L12.326 3.107C12.442 3.079 12.533 2.988 12.561 2.871L12.779 1.972Z" fill={fill} />
        <circle cx="4.364" cy="15.273" r="0.727" fill={fill} />
        <circle cx="0.727" cy="12.364" r="0.727" fill={fill} />
        <circle cx="8.727" cy="0.727" r="0.727" fill={fill} />
        <circle cx="15.273" cy="8.727" r="0.727" fill={fill} />
      </svg>
    </div>
  );
};

export const IcUndo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M4 10h10c3.314 0 6 2.686 6 6s-2.686 6-6 6H8" stroke="#ADB5BD" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M8 6 4 10l4 4" stroke="#ADB5BD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IcRedo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M20 10H10C6.686 10 4 12.686 4 16s2.686 6 6 6h6" stroke="#ADB5BD" strokeWidth="1.5" strokeLinecap="round" />
    <path d="m16 6 4 4-4 4" stroke="#ADB5BD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IcPencil = ({ size = 16, color = "white" }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill={color}>
    <path fillRule="evenodd" clipRule="evenodd" d="M12.259.495a1.5 1.5 0 0 0-2.122.002L8.105 2.261l5.044 5.044 1.754-1.8A1.5 1.5 0 0 0 14.89 3.126L12.259.495ZM12.263 8.214 7.208 3.16.865 9.512A1.5 1.5 0 0 0 .124 11.2l-.123 2.922A1.268 1.268 0 0 0 1.268 15.445l2.877.001a2.5 2.5 0 0 0 1.818-.767l6.3-6.465Z" />
  </svg>
);

export const IcSave = ({ size = 24, color = "#171719" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M17 21v-8H7v8" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 3v5h8" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const QuoteIcon = ({ gid }) => (
  <svg width="17" height="12" viewBox="0 0 17 12" className="flex-shrink-0 mt-0.5">
    <defs>
      <linearGradient id={gid} x1="0" y1="0" x2="17" y2="0" gradientUnits="userSpaceOnUse">
        <stop stopColor="#228bed" />
        <stop offset="1" stopColor="#c509d6" />
      </linearGradient>
    </defs>
    <path d="M5.655.22C5.948.512 5.948.987 5.655 1.28c-.2.2-.396.394-.587.585C4.136 2.79 3.306 3.614 2.665 4.42c-.362.455-.64.877-.834 1.279.584-.562 1.378-.907 2.252-.907 1.795 0 3.25 1.455 3.25 3.25S5.878 11.292 4.083 11.292c-1.252-.008-2.29-.437-3.008-1.239C.324 9.255 0 8.173 0 7c0-1.297.648-2.453 1.491-3.514C2.192 2.604 3.1 1.704 4.032.779 4.219.594 4.407.407 4.595.22c.292-.293.767-.293 1.06 0Z" fill={`url(#${gid})`} />
    <path d="M14.405.22c.293.293.293.768 0 1.06-.2.2-.396.394-.587.584C12.887 2.79 12.056 3.614 11.415 4.42c-.362.455-.64.877-.834 1.279.584-.562 1.378-.907 2.252-.907 1.795 0 3.25 1.455 3.25 3.25s-1.455 3.25-3.25 3.25c-1.252-.008-2.29-.437-3.008-1.239C9.073 9.255 8.75 8.173 8.75 7c0-1.297.648-2.453 1.491-3.514.701-.879 1.609-1.779 2.541-2.703.187-.186.375-.372.562-.56.293-.292.768-.292 1.061 0Z" fill={`url(#${gid})`} />
  </svg>
);
