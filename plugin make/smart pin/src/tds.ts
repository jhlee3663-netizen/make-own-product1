// Single source of design tokens for the plugin UI. Values come straight from
// the TDS Mobile reference in `Toss mobile md/`; components must not invent
// their own hex values, font sizes, spacing or radii.
import type React from 'react';
import { colors, greyOpacity, typography, fontWeight, spacing, radius } from '../Toss mobile md/tokens';
import type { TypographyKey, FontWeightKey } from '../Toss mobile md/tokens';
import type { PinCategory } from './types';

export { colors, greyOpacity, typography, fontWeight, spacing, radius };

export const FONT = '"Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", sans-serif';

export const text = (key: TypographyKey, weight: FontWeightKey = 'regular', color: string = colors.grey900): React.CSSProperties => ({
  fontFamily: FONT,
  fontSize: typography[key].fontSize,
  lineHeight: `${typography[key].lineHeight}px`,
  fontWeight: fontWeight[weight],
  color,
});

export const semantic = {
  primary: colors.blue500,
  primaryPressed: colors.blue600,
  danger: colors.red500,
  success: colors.green500,
  warning: colors.yellow500,
  textPrimary: colors.grey900,
  textStrong: colors.grey800,
  textSecondary: colors.grey700,
  textTertiary: colors.grey600,
  textDisabled: colors.grey500,
  placeholder: colors.grey400,
  bgPage: colors.greyBackground,
  bgSurface: colors.background,
  bgField: colors.grey50,
  bgSubtle: colors.grey100,
  divider: colors.grey200,
  fieldBorder: colors.grey200,
} as const;

// Canvas badges keep their own RGB values in code.ts; the UI maps the same
// four categories onto the nearest TDS hues.
export const categoryColor: Record<PinCategory, string> = {
  design: colors.blue500,
  descript: colors.green500,
  dev: colors.orange500,
  ask: colors.red500,
};

export const z = {
  cta: 40,
  selectionPopup: 60,
  page: 200,
  menu: 300,
  sheet: 400,
  toast: 500,
} as const;

export const shadow = {
  floating: `0 8px 24px ${greyOpacity[200]}`,
  raised: `0 2px 8px ${greyOpacity[100]}`,
  ring: `0 0 0 3px ${colors.blue50}`,
} as const;

export const motion = 'cubic-bezier(0.22, 1, 0.36, 1)';

// Horizontal gutter shared by page headers, lists and sheets.
export const GUTTER = spacing[5];
