// Toss Design System — Mobile Tokens
// Source: https://tossmini-docs.toss.im/tds-mobile/
// DO NOT hardcode hex values in components. Import from here.

// ─── Colors ────────────────────────────────────────────────

export const colors = {
  // Grey
  grey50:  '#f9fafb',
  grey100: '#f2f4f6',
  grey200: '#e5e8eb',
  grey300: '#d1d6db',
  grey400: '#b0b8c1',
  grey500: '#8b95a1',
  grey600: '#6b7684',
  grey700: '#4e5968',
  grey800: '#333d4b',
  grey900: '#191f28',

  // Blue (Primary)
  blue50:  '#e8f3ff',
  blue100: '#c9e2ff',
  blue200: '#90c2ff',
  blue300: '#64a8ff',
  blue400: '#4593fc',
  blue500: '#3182f6', // ← Primary Action
  blue600: '#2272eb',
  blue700: '#1b64da',
  blue800: '#1957c2',
  blue900: '#194aa6',

  // Red (Danger)
  red50:  '#ffeeee',
  red100: '#ffd4d6',
  red200: '#feafb4',
  red300: '#fb8890',
  red400: '#f66570',
  red500: '#f04452', // ← Danger / Error
  red600: '#e42939',
  red700: '#d22030',
  red800: '#bc1b2a',
  red900: '#a51926',

  // Green (Success)
  green50:  '#f0faf6',
  green100: '#aeefd5',
  green200: '#76e4b8',
  green300: '#3fd599',
  green400: '#15c47e',
  green500: '#03b26c', // ← Success
  green600: '#02a262',
  green700: '#029359',
  green800: '#028450',
  green900: '#027648',

  // Yellow (Warning)
  yellow50:  '#fff9e7',
  yellow100: '#ffefbf',
  yellow200: '#ffe69b',
  yellow300: '#ffdd78',
  yellow400: '#ffd158',
  yellow500: '#ffc342', // ← Warning
  yellow600: '#ffb331',
  yellow700: '#faa131',
  yellow800: '#ee8f11',
  yellow900: '#dd7d02',

  // Orange
  orange50:  '#fff3e0',
  orange100: '#ffe0b0',
  orange200: '#ffcd80',
  orange300: '#ffbd51',
  orange400: '#ffa927',
  orange500: '#fe9800',
  orange600: '#fb8800',
  orange700: '#f57800',
  orange800: '#ed6700',
  orange900: '#e45600',

  // Teal
  teal50:  '#edf8f8',
  teal100: '#bce9e9',
  teal200: '#89d8d8',
  teal300: '#58c7c7',
  teal400: '#30b6b6',
  teal500: '#18a5a5',
  teal600: '#109595',
  teal700: '#0c8585',
  teal800: '#097575',
  teal900: '#076565',

  // Purple
  purple50:  '#f9f0fc',
  purple100: '#edccf8',
  purple200: '#da9bef',
  purple300: '#c770e4',
  purple400: '#b44bd7',
  purple500: '#a234c7',
  purple600: '#9128b4',
  purple700: '#8222a2',
  purple800: '#73228e',
  purple900: '#65237b',

  // Background
  background:        '#ffffff',
  greyBackground:    '#f2f4f6',
  layeredBackground: '#ffffff',
  floatedBackground: '#ffffff',
} as const;

// Grey Opacity (rgba)
export const greyOpacity = {
  50:  'rgba(0, 23, 51, 0.02)',
  100: 'rgba(2, 32, 71, 0.05)',
  200: 'rgba(0, 27, 55, 0.10)',
  300: 'rgba(0, 29, 58, 0.18)',
  400: 'rgba(0, 25, 54, 0.31)',
  500: 'rgba(3, 24, 50, 0.46)',
  600: 'rgba(0, 19, 43, 0.58)',
  700: 'rgba(3, 18, 40, 0.70)',
  800: 'rgba(0, 12, 30, 0.80)',
  900: 'rgba(2,  9, 19, 0.91)',
} as const;

// ─── Semantic aliases ──────────────────────────────────────
// 의미 기반 별칭. 컴포넌트에선 이걸 우선 사용.

export const semantic = {
  primary:    colors.blue500,
  danger:     colors.red500,
  success:    colors.green500,
  warning:    colors.yellow500,

  textPrimary:   colors.grey900,
  textSecondary: colors.grey700,
  textTertiary:  colors.grey500,
  textDisabled:  colors.grey400,
  textPlaceholder: colors.grey400,

  bgDefault: colors.background,
  bgSubtle:  colors.greyBackground,
  bgCard:    colors.greyBackground,

  borderDefault:  colors.grey200,
  borderStrong:   colors.grey300,
} as const;

// ─── Typography ────────────────────────────────────────────
// font-size / line-height 쌍. 직접 px 하드코딩 금지.

export const typography = {
  t1:   { fontSize: 30, lineHeight: 40 },
  t2:   { fontSize: 26, lineHeight: 35 },
  t3:   { fontSize: 22, lineHeight: 31 },
  t4:   { fontSize: 20, lineHeight: 29 },
  t5:   { fontSize: 17, lineHeight: 25.5 },
  t6:   { fontSize: 15, lineHeight: 22.5 },
  t7:   { fontSize: 13, lineHeight: 19.5 },
  st1:  { fontSize: 29, lineHeight: 38 },
  st2:  { fontSize: 28, lineHeight: 37 },
  st3:  { fontSize: 27, lineHeight: 36 },
  st4:  { fontSize: 25, lineHeight: 34 },
  st5:  { fontSize: 24, lineHeight: 33 },
  st6:  { fontSize: 23, lineHeight: 32 },
  st7:  { fontSize: 21, lineHeight: 30 },
  st8:  { fontSize: 19, lineHeight: 28 },
  st9:  { fontSize: 18, lineHeight: 27 },
  st10: { fontSize: 16, lineHeight: 24 },
  st11: { fontSize: 14, lineHeight: 21 },
  st12: { fontSize: 12, lineHeight: 18 },
  st13: { fontSize: 11, lineHeight: 16.5 },
} as const;

export const fontWeight = {
  light:    300,
  regular:  400,
  medium:   500,
  semibold: 600,
  bold:     700,
} as const;

// ─── Spacing ───────────────────────────────────────────────
// 4px 기본 단위. 구조 레이아웃은 8px 배수 권장.

export const spacing = {
  1:  4,
  2:  8,
  3:  12,
  4:  16,
  5:  20,
  6:  24,
  7:  28,
  8:  32,
  10: 40,
  12: 48,
} as const;

// ─── Border Radius ─────────────────────────────────────────

export const radius = {
  sm:   4,
  md:   8,
  lg:   12,
  xl:   16,
  xxl:  20,
  full: 9999,
} as const;

// ─── Type helpers ──────────────────────────────────────────

export type ColorKey        = keyof typeof colors;
export type SemanticKey     = keyof typeof semantic;
export type TypographyKey   = keyof typeof typography;
export type FontWeightKey   = keyof typeof fontWeight;
export type SpacingKey      = keyof typeof spacing;
