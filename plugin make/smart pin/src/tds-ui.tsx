// TDS-style primitives (Button, ListRow, BottomSheet, Menu, Toast…) rebuilt
// with plain React because the official TDS component package is partner-only.
// Every value comes from ./tds so screens never hardcode visual decisions.
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { colors, greyOpacity, radius, spacing, text, semantic, shadow, z, motion, GUTTER, FONT } from './tds';

// ── Global styles (pressed state, focus ring, animations) ─────────────────────
;(() => {
  const s = document.createElement('style');
  s.textContent = [
    `.tds-press{transition:transform .2s ${motion},background-color .2s ${motion}}`,
    '.tds-press:not(:disabled):active{transform:scale(.97)}',
    `.tds-row{transition:background-color .15s ${motion}}`,
    `.tds-row:not(:disabled):hover{background:${colors.grey50}}`,
    `.tds-row:not(:disabled):active{background:${colors.grey100}}`,
    `.tds-icon-btn:not(:disabled):hover{background:${greyOpacity[100]}}`,
    `.tds-menu-item:hover,.tds-menu-item:focus{background:${colors.grey50};outline:none}`,
    `.tds-focus:focus-visible,.tds-press:focus-visible,.tds-row:focus-visible,.tds-icon-btn:focus-visible{outline:2px solid ${colors.blue400};outline-offset:2px}`,
    '.tds-scroll-x{overflow-x:auto;scrollbar-width:none}',
    `.grp-handle{opacity:0;transition:opacity .2s ${motion}}`,
    '.grp:hover>.grp-handle,.grp:focus-within>.grp-handle{opacity:.5}',
    '.tds-scroll-x::-webkit-scrollbar{display:none}',
    '@keyframes tdsSheetUp{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}',
    '@keyframes tdsFade{from{opacity:0}to{opacity:1}}',
    '@keyframes tdsPageIn{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}',
    `.tds-sheet{animation:tdsSheetUp .28s ${motion} both}`,
    `.tds-dim{animation:tdsFade .2s ${motion} both}`,
    `.tds-page-in{animation:tdsPageIn .28s ${motion} both}`,
  ].join('');
  document.head.appendChild(s);
})();

// ── Icons ─────────────────────────────────────────────────────────────────────
type IconName = 'chevronLeft' | 'chevronRight' | 'chevronDown' | 'more' | 'close' | 'lock' | 'link' | 'trash'
  | 'message' | 'people' | 'history' | 'manage' | 'search' | 'check' | 'warning' | 'info' | 'download'
  | 'upload' | 'plus' | 'shield' | 'transfer' | 'restore' | 'relink' | 'refresh' | 'gear';

const PATHS: Record<IconName, React.ReactNode> = {
  chevronLeft: <path d="M15 5l-7 7 7 7" />,
  chevronRight: <path d="M9 5l7 7-7 7" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  more: <><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 118 0v2.5" /></>,
  link: <><path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 10-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 106.4 6.4l1-1" /></>,
  trash: <><path d="M4.5 7h15" /><path d="M9.5 7V5h5v2" /><path d="M6.5 7l1 12.5h9l1-12.5" /></>,
  message: <path d="M4.5 6.5A2.5 2.5 0 017 4h10a2.5 2.5 0 012.5 2.5v7A2.5 2.5 0 0117 16h-6l-4.5 4v-4H7a2.5 2.5 0 01-2.5-2.5z" />,
  people: <><circle cx="9" cy="9" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0111 0" /><path d="M15.5 6a3 3 0 010 6M17 14.2A5 5 0 0120.5 19" /></>,
  history: <><path d="M4 12a8 8 0 102.3-5.6" /><path d="M4 5v4h4" /><path d="M12 8v4.5l3 2" /></>,
  manage: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="M16 16l4 4" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  warning: <><path d="M12 4l9 16H3z" /><path d="M12 10v4" /><circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5" /><circle cx="12" cy="8" r=".8" fill="currentColor" stroke="none" /></>,
  download: <><path d="M12 4v11" /><path d="M7.5 10.5L12 15l4.5-4.5" /><path d="M5 19.5h14" /></>,
  upload: <><path d="M12 15V4" /><path d="M7.5 8.5L12 4l4.5 4.5" /><path d="M5 19.5h14" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  shield: <><path d="M12 3.5l7 2.8v5.2c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6.3z" /><path d="M9 12l2.2 2.2L15.5 10" /></>,
  transfer: <><path d="M5 8h13l-3.5-3.5" /><path d="M19 16H6l3.5 3.5" /></>,
  restore: <><path d="M4.5 12a7.5 7.5 0 107.5-7.5H9" /><path d="M11 2L8.5 4.5 11 7" /></>,
  relink: <><path d="M9 15l6-6" /><path d="M11 6.5l1.2-1.2a4 4 0 015.6 5.6L16.6 12" /><path d="M13 17.5l-1.2 1.2a4 4 0 01-5.6-5.6L7.4 12" /></>,
  refresh: <><path d="M19.5 12a7.5 7.5 0 11-2.2-5.3" /><path d="M19.5 4.5v4h-4" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3.5l1.6 2.2 2.7-.6.8 2.6 2.5 1.2-.9 2.6.9 2.6-2.5 1.2-.8 2.6-2.7-.6L12 20.5l-1.6-2.2-2.7.6-.8-2.6-2.5-1.2.9-2.6-.9-2.6 2.5-1.2.8-2.6 2.7.6z" /></>,
};

export function Icon({ name, size = 20, color = 'currentColor', strokeWidth = 1.8 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ flexShrink: 0, display: 'block' }}>
      {PATHS[name]}
    </svg>
  );
}

// ── Button ────────────────────────────────────────────────────────────────────
type ButtonColor = 'primary' | 'danger' | 'light' | 'dark';
type ButtonSize = 'small' | 'medium' | 'large' | 'xlarge';

const BUTTON_SIZE: Record<ButtonSize, { height: number; padding: number; font: 'st12' | 't7' | 'st11' | 't6' | 't5'; radius: number }> = {
  small: { height: 32, padding: spacing[3], font: 't7', radius: radius.md },
  medium: { height: 40, padding: spacing[4], font: 'st11', radius: radius.lg },
  large: { height: 48, padding: spacing[5], font: 't6', radius: radius.lg },
  xlarge: { height: 56, padding: spacing[6], font: 't5', radius: radius.xl },
};

const BUTTON_TONE: Record<ButtonColor, { fill: [string, string]; weak: [string, string] }> = {
  primary: { fill: [colors.blue500, colors.background], weak: [colors.blue50, colors.blue600] },
  danger: { fill: [colors.red500, colors.background], weak: [colors.red50, colors.red600] },
  light: { fill: [colors.grey100, colors.grey800], weak: [colors.grey100, colors.grey700] },
  dark: { fill: [colors.grey800, colors.background], weak: [colors.grey100, colors.grey800] },
};

export type ButtonProps = {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  color?: ButtonColor; variant?: 'fill' | 'weak'; size?: ButtonSize; display?: 'inline' | 'full';
  disabled?: boolean; type?: 'button' | 'submit'; title?: string; style?: React.CSSProperties;
  icon?: IconName; 'aria-label'?: string; onMouseDown?: (e: React.MouseEvent<HTMLButtonElement>) => void;
};

export function Button({ children, onClick, color = 'primary', variant = 'fill', size = 'large', display = 'inline',
  disabled, type = 'button', title, style, icon, onMouseDown, ...rest }: ButtonProps) {
  const s = BUTTON_SIZE[size];
  const [bg, fg] = BUTTON_TONE[color][variant];
  return (
    <button type={type} className="tds-press" onClick={onClick} onMouseDown={onMouseDown} disabled={disabled} title={title}
      aria-label={rest['aria-label']}
      style={{
        ...text(s.font, 'semibold', fg),
        height: s.height, padding: `0 ${s.padding}px`, borderRadius: s.radius, border: 'none',
        background: bg, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
        width: display === 'full' ? '100%' : undefined, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: spacing[1] + 2,
        whiteSpace: 'nowrap', boxSizing: 'border-box', ...style,
      }}>
      {icon && <Icon name={icon} size={size === 'small' ? 16 : 18} />}
      {children}
    </button>
  );
}

// Inline text action, used where a full button would compete with the primary CTA.
export function TextButton({ children, onClick, color = semantic.textSecondary, size = 't7', disabled, 'aria-label': label }: {
  children: React.ReactNode; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; color?: string;
  size?: 'st12' | 't7' | 'st11'; disabled?: boolean; 'aria-label'?: string;
}) {
  return (
    <button type="button" className="tds-press tds-focus" onClick={onClick} disabled={disabled} aria-label={label}
      style={{ ...text(size, 'semibold', color), background: 'none', border: 'none', padding: `${spacing[1]}px ${spacing[1] + 2}px`,
        margin: `-${spacing[1]}px -${spacing[1] + 2}px`, borderRadius: radius.md, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1, whiteSpace: 'nowrap' }}>
      {children}
    </button>
  );
}

// ── IconButton ────────────────────────────────────────────────────────────────
export const IconButton = React.forwardRef<HTMLButtonElement, {
  label: string; icon: IconName; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  size?: 32 | 36 | 40; iconSize?: number; color?: string; badge?: number; dot?: boolean;
  disabled?: boolean; haspopup?: 'menu' | 'dialog'; expanded?: boolean; onMouseDown?: (e: React.MouseEvent) => void;
}>(function IconButton({ label, icon, onClick, size = 36, iconSize = 20, color = semantic.textTertiary, badge, dot, disabled, haspopup, expanded, onMouseDown }, ref) {
  return (
    <button ref={ref} type="button" className="tds-icon-btn tds-press" onClick={onClick} onMouseDown={onMouseDown}
      aria-label={badge ? `${label} (${badge})` : label} title={label} disabled={disabled}
      aria-haspopup={haspopup} aria-expanded={haspopup ? !!expanded : undefined}
      style={{ position: 'relative', width: size, height: size, borderRadius: radius.lg, border: 'none',
        background: expanded ? greyOpacity[100] : 'transparent', color, cursor: disabled ? 'default' : 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0,
        opacity: disabled ? 0.4 : 1 }}>
      <Icon name={icon} size={iconSize} />
      {!!badge && (
        <span aria-hidden="true" style={{ ...text('st13', 'bold', colors.background), position: 'absolute', top: 2, right: 0,
          minWidth: 16, height: 16, padding: '0 4px', borderRadius: radius.full, background: colors.red500,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
          lineHeight: '16px', boxShadow: `0 0 0 2px ${colors.background}` }}>{badge > 99 ? '99+' : badge}</span>
      )}
      {!badge && dot && (
        <span aria-hidden="true" style={{ position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: radius.full,
          background: colors.red500, boxShadow: `0 0 0 2px ${colors.background}` }} />
      )}
    </button>
  );
});

// ── Badge ─────────────────────────────────────────────────────────────────────
type BadgeColor = 'blue' | 'red' | 'green' | 'yellow' | 'grey';
const BADGE: Record<BadgeColor, { fill: [string, string]; weak: [string, string] }> = {
  blue: { fill: [colors.blue500, colors.background], weak: [colors.blue50, colors.blue600] },
  red: { fill: [colors.red500, colors.background], weak: [colors.red50, colors.red600] },
  green: { fill: [colors.green500, colors.background], weak: [colors.green50, colors.green700] },
  yellow: { fill: [colors.yellow500, colors.grey900], weak: [colors.yellow50, colors.yellow900] },
  grey: { fill: [colors.grey600, colors.background], weak: [colors.grey100, colors.grey700] },
};

export function Badge({ children, color = 'grey', variant = 'weak', size = 'small' }: {
  children: React.ReactNode; color?: BadgeColor; variant?: 'fill' | 'weak'; size?: 'xsmall' | 'small';
}) {
  const [bg, fg] = BADGE[color][variant];
  return (
    <span style={{ ...text(size === 'xsmall' ? 'st13' : 'st12', 'semibold', fg), background: bg, borderRadius: radius.sm + 2,
      padding: size === 'xsmall' ? '0 5px' : '1px 6px', display: 'inline-flex', alignItems: 'center', gap: 3,
      whiteSpace: 'nowrap', flexShrink: 0 }}>{children}</span>
  );
}

// ── Layout helpers ────────────────────────────────────────────────────────────
export function ListHeader({ title, description, right }: { title: React.ReactNode; description?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ padding: `${spacing[6]}px ${GUTTER}px ${spacing[2]}px` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing[2] }}>
        <h3 style={{ ...text('t7', 'semibold', semantic.textTertiary), margin: 0, flex: 1 }}>{title}</h3>
        {right}
      </div>
      {description && <p style={{ ...text('st12', 'regular', semantic.textDisabled), margin: `${spacing[1]}px 0 0` }}>{description}</p>}
    </div>
  );
}

export function ListRow({ left, title, description, extra, right, withArrow, onClick, disabled, tone, 'aria-label': label, alignTop }: {
  left?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; extra?: React.ReactNode;
  right?: React.ReactNode; withArrow?: boolean; onClick?: () => void; disabled?: boolean; tone?: 'danger';
  'aria-label'?: string; alignTop?: boolean;
}) {
  const body = (
    <>
      {left && <span style={{ flexShrink: 0, display: 'flex', alignSelf: alignTop ? 'flex-start' : 'center' }}>{left}</span>}
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
        <span style={{ ...text('st11', 'medium', tone === 'danger' ? colors.red500 : semantic.textPrimary), overflowWrap: 'anywhere' }}>{title}</span>
        {description && <span style={{ ...text('st12', 'regular', semantic.textTertiary), overflowWrap: 'anywhere' }}>{description}</span>}
        {extra}
      </span>
      {right && <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: spacing[2], alignSelf: alignTop ? 'flex-start' : 'center' }}>{right}</span>}
      {withArrow && <span style={{ color: colors.grey400, flexShrink: 0, display: 'flex' }}><Icon name="chevronRight" size={18} /></span>}
    </>
  );
  const style: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: spacing[3], width: '100%', boxSizing: 'border-box',
    minHeight: 56, padding: `${spacing[3]}px ${GUTTER}px`, background: 'transparent', border: 'none',
    fontFamily: FONT, opacity: disabled ? 0.45 : 1,
  };
  return onClick
    ? <button type="button" className="tds-row" onClick={onClick} disabled={disabled} aria-label={label} style={{ ...style, cursor: disabled ? 'default' : 'pointer' }}>{body}</button>
    : <div style={style}>{body}</div>;
}

export function Divider({ inset = false, gap = 0 }: { inset?: boolean; gap?: number }) {
  return <div role="separator" style={{ height: gap || 1, background: gap ? semantic.bgPage : semantic.divider, margin: inset ? `0 ${GUTTER}px` : 0 }} />;
}

export function Paragraph({ children, tone = 'secondary', style }: { children: React.ReactNode; tone?: 'secondary' | 'tertiary'; style?: React.CSSProperties }) {
  return <p style={{ ...text('t7', 'regular', tone === 'secondary' ? semantic.textSecondary : semantic.textTertiary), margin: 0, padding: `0 ${GUTTER}px`, ...style }}>{children}</p>;
}

export function Avatar({ name }: { name?: string }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <span aria-hidden="true" style={{ ...text('t7', 'semibold', semantic.textSecondary), width: 36, height: 36, borderRadius: radius.full,
      background: semantic.bgSubtle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initial}</span>
  );
}

export function IconTile({ icon, tone = 'grey' }: { icon: IconName; tone?: 'grey' | 'blue' | 'red' }) {
  const [bg, fg] = tone === 'blue' ? [colors.blue50, colors.blue500] : tone === 'red' ? [colors.red50, colors.red500] : [semantic.bgSubtle, semantic.textSecondary];
  return (
    <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: radius.lg, background: bg, color: fg,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon name={icon} size={20} />
    </span>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div style={{ padding: `${spacing[12]}px ${GUTTER}px`, textAlign: 'center' }}>
      <p style={{ ...text('t6', 'semibold', semantic.textSecondary), margin: 0 }}>{title}</p>
      {description && <p style={{ ...text('t7', 'regular', semantic.textTertiary), margin: `${spacing[1]}px 0 0` }}>{description}</p>}
    </div>
  );
}

// ── Callout (contextual notice) ───────────────────────────────────────────────
const CALLOUT: Record<'info' | 'warning' | 'danger' | 'neutral', { bg: string; fg: string; icon: IconName }> = {
  info: { bg: colors.blue50, fg: colors.blue500, icon: 'info' },
  warning: { bg: colors.yellow50, fg: colors.yellow900, icon: 'warning' },
  danger: { bg: colors.red50, fg: colors.red500, icon: 'warning' },
  neutral: { bg: semantic.bgSubtle, fg: semantic.textTertiary, icon: 'info' },
};

export function Callout({ tone = 'info', children, action, onDismiss, style }: {
  tone?: 'info' | 'warning' | 'danger' | 'neutral'; children: React.ReactNode;
  action?: { label: string; onClick: () => void }; onDismiss?: () => void; style?: React.CSSProperties;
}) {
  const c = CALLOUT[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} style={{ display: 'flex', gap: spacing[2] + 2, alignItems: 'flex-start',
      background: c.bg, borderRadius: radius.lg, padding: `${spacing[3]}px ${spacing[3] + 2}px`, ...style }}>
      <span style={{ color: c.fg, display: 'flex', paddingTop: 1 }}><Icon name={c.icon} size={16} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...text('t7', 'regular', semantic.textStrong), overflowWrap: 'anywhere' }}>{children}</div>
        {action && <div style={{ marginTop: spacing[2] }}><TextButton color={tone === 'warning' ? colors.grey800 : c.fg} onClick={action.onClick}>{action.label}</TextButton></div>}
      </div>
      {onDismiss && (
        <button type="button" className="tds-icon-btn tds-press" onClick={onDismiss} aria-label="안내 닫기" title="안내 닫기"
          style={{ width: 24, height: 24, border: 'none', background: 'transparent', borderRadius: radius.md, color: semantic.textTertiary,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}

// ── Segmented control / filter chips ──────────────────────────────────────────
export function SegmentedControl<T extends string>({ value, onChange, items, ariaLabel, disabled }: {
  value: T; onChange: (v: T) => void; items: { value: T; label: string }[]; ariaLabel: string; disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} style={{ display: 'flex', background: semantic.bgSubtle, borderRadius: radius.lg, padding: 3, gap: 2 }}>
      {items.map(item => {
        const on = item.value === value;
        return (
          <button key={item.value} type="button" role="radio" aria-checked={on} disabled={disabled} className="tds-press"
            onClick={() => { if (!on) onChange(item.value); }}
            style={{ ...text('t7', on ? 'semibold' : 'medium', on ? semantic.textPrimary : semantic.textTertiary), flex: 1, minWidth: 0,
              height: 34, border: 'none', borderRadius: radius.md + 1, background: on ? colors.background : 'transparent',
              boxShadow: on ? shadow.raised : 'none', cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis', padding: `0 ${spacing[2]}px`, opacity: disabled ? 0.5 : 1 }}>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function FilterChips<T extends string>({ value, onChange, items, ariaLabel }: {
  value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[]; ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="tds-scroll-x" style={{ display: 'flex', gap: spacing[2] - 2, margin: `0 -${GUTTER}px`, padding: `0 ${GUTTER}px` }}>
      {items.map(item => {
        const on = item.value === value;
        return (
          <button key={item.value} type="button" role="radio" aria-checked={on} className="tds-press" onClick={() => onChange(item.value)}
            style={{ ...text('t7', 'semibold', on ? colors.background : semantic.textSecondary), height: 32, flexShrink: 0,
              padding: `0 ${spacing[3]}px`, borderRadius: radius.full, border: 'none', cursor: 'pointer',
              background: on ? colors.grey800 : semantic.bgSubtle, display: 'inline-flex', alignItems: 'center', gap: spacing[1] }}>
            {item.label}
            {!!item.count && <span style={{ color: on ? colors.grey300 : semantic.textTertiary }}>{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── Form fields ───────────────────────────────────────────────────────────────
export const fieldShell = (focused: boolean): React.CSSProperties => ({
  background: semantic.bgField, border: `1px solid ${focused ? colors.blue500 : semantic.fieldBorder}`,
  borderRadius: radius.lg, boxShadow: focused ? shadow.ring : 'none',
  transition: `border-color .15s ${motion}, box-shadow .15s ${motion}`, boxSizing: 'border-box',
});

export function FieldLabel({ children, htmlFor, right }: { children: React.ReactNode; htmlFor?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: spacing[2], marginBottom: spacing[2] }}>
      <label htmlFor={htmlFor} style={{ ...text('t7', 'semibold', semantic.textTertiary), flex: 1 }}>{children}</label>
      {right}
    </div>
  );
}

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function TextInput(props, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <input ref={ref} {...props}
      onFocus={e => { setFocused(true); props.onFocus?.(e); }}
      onBlur={e => { setFocused(false); props.onBlur?.(e); }}
      style={{ ...fieldShell(focused), ...text('st11', 'regular', semantic.textPrimary), width: '100%', height: 48,
        padding: `0 ${spacing[4]}px`, outline: 'none', ...props.style }} />
  );
});

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea {...props}
      onFocus={e => { setFocused(true); props.onFocus?.(e); }}
      onBlur={e => { setFocused(false); props.onBlur?.(e); }}
      style={{ ...fieldShell(focused), ...text('st11', 'regular', semantic.textPrimary), width: '100%', minHeight: 112,
        padding: `${spacing[3]}px ${spacing[4]}px`, outline: 'none', resize: 'vertical', display: 'block', ...props.style }} />
  );
}

// ── Navigation bar ────────────────────────────────────────────────────────────
export function NavBar({ title, subtitle, onBack, backLabel = '뒤로', right, titleId }: {
  title: React.ReactNode; subtitle?: React.ReactNode; onBack?: () => void; backLabel?: string; right?: React.ReactNode; titleId?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: spacing[1], minHeight: 56, padding: `${spacing[2]}px ${spacing[3]}px`,
      background: colors.background, flexShrink: 0, boxSizing: 'border-box' }}>
      {onBack && <IconButton label={backLabel} icon="chevronLeft" onClick={onBack} color={semantic.textPrimary} iconSize={22} />}
      <div style={{ flex: 1, minWidth: 0, paddingLeft: onBack ? 0 : spacing[2] }}>
        <h1 id={titleId} style={{ ...text('t6', 'bold', semantic.textPrimary), margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h1>
        {subtitle && <div style={{ ...text('st12', 'regular', semantic.textTertiary), display: 'flex', alignItems: 'center', gap: spacing[1], flexWrap: 'wrap' }}>{subtitle}</div>}
      </div>
      {right && <div style={{ display: 'flex', alignItems: 'center', gap: spacing[1], flexShrink: 0 }}>{right}</div>}
    </div>
  );
}

// ── BottomCTA (fixed to the viewport, portaled out of transformed ancestors) ──
export const BOTTOM_CTA_SPACE = 104;

export function BottomCTA({ children, caption }: { children: React.ReactNode; caption?: React.ReactNode }) {
  return createPortal(
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: z.cta, pointerEvents: 'none',
      background: `linear-gradient(to bottom, rgba(255,255,255,0), ${colors.background} ${spacing[4]}px)` }}>
      <div style={{ pointerEvents: 'auto', maxWidth: 640, margin: '0 auto', padding: `${spacing[5]}px ${GUTTER}px ${spacing[4]}px`, boxSizing: 'border-box' }}>
        {caption && <p style={{ ...text('st12', 'regular', semantic.textTertiary), margin: `0 0 ${spacing[2]}px`, textAlign: 'center' }}>{caption}</p>}
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ── Focus management shared by sheets and menus ───────────────────────────────
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useFocusTrap(open: boolean, container: React.RefObject<HTMLElement>, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const el = container.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') || el?.querySelector<HTMLElement>(FOCUSABLE);
    (first || el)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !el) return;
      const nodes = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!nodes.length) return;
      const [a, b] = [nodes[0], nodes[nodes.length - 1]];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
      else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [open]);
}

// ── BottomSheet ───────────────────────────────────────────────────────────────
export function BottomSheet({ open, onClose, title, description, children, cta }: {
  open: boolean; onClose: () => void; title: React.ReactNode; description?: React.ReactNode;
  children?: React.ReactNode; cta?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(open, ref, onClose);
  if (!open) return null;
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: z.sheet, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div className="tds-dim" onClick={onClose} style={{ position: 'absolute', inset: 0, background: greyOpacity[500] }} />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="tds-sheet"
        style={{ position: 'relative', width: '100%', maxWidth: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          background: colors.background, borderRadius: `${radius.xxl + 4}px ${radius.xxl + 4}px 0 0`, outline: 'none',
          boxShadow: shadow.floating, overflow: 'hidden' }}>
        <div style={{ padding: `${spacing[6]}px ${GUTTER}px ${description ? spacing[2] : spacing[4]}px`, flexShrink: 0 }}>
          <h2 id={titleId} style={{ ...text('t5', 'bold', semantic.textPrimary), margin: 0 }}>{title}</h2>
          {description && <div style={{ ...text('t7', 'regular', semantic.textTertiary), marginTop: spacing[1] + 2 }}>{description}</div>}
        </div>
        {children && <div style={{ overflowY: 'auto', flex: '0 1 auto', padding: `${spacing[2]}px 0` }}>{children}</div>}
        {cta && <div style={{ padding: `${spacing[3]}px ${GUTTER}px ${spacing[5]}px`, flexShrink: 0 }}>{cta}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function SheetCTA({ primary, secondary }: {
  primary: { label: string; onClick: () => void; disabled?: boolean; tone?: 'primary' | 'danger' };
  secondary?: { label: string; onClick: () => void };
}) {
  return (
    <div style={{ display: 'flex', gap: spacing[2] }}>
      {secondary && <Button color="light" variant="weak" size="large" display="full" style={{ flex: 1 }} onClick={secondary.onClick}>{secondary.label}</Button>}
      <Button color={primary.tone === 'danger' ? 'danger' : 'primary'} size="large" display="full" style={{ flex: secondary ? 1.4 : 1 }}
        disabled={primary.disabled} onClick={primary.onClick}>{primary.label}</Button>
    </div>
  );
}

// ── Menu (popover for `...`) ──────────────────────────────────────────────────
export type MenuItem = { key: string; label: string; description?: string; icon?: IconName; tone?: 'danger'; disabled?: boolean; onSelect: () => void };

export function Menu({ anchor, open, onClose, items, label }: {
  anchor: HTMLElement | null; open: boolean; onClose: () => void; items: MenuItem[]; label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const place = () => {
    if (!anchor || !anchor.isConnected) { closeRef.current(); return; }
    const r = anchor.getBoundingClientRect();
    // The trigger scrolled out of view: an orphaned popover is worse than closing it.
    if (r.bottom < 0 || r.top > window.innerHeight) { closeRef.current(); return; }
    const width = Math.min(240, window.innerWidth - spacing[4] * 2);
    const estimated = ref.current?.offsetHeight || items.length * 48 + spacing[2] * 2;
    const below = r.bottom + spacing[1];
    const top = below + estimated > window.innerHeight - spacing[2] ? Math.max(spacing[2], r.top - spacing[1] - estimated) : below;
    const left = Math.min(Math.max(spacing[2], r.right - width), window.innerWidth - width - spacing[2]);
    setPos(prev => prev && prev.top === top && prev.left === left && prev.width === width ? prev : { top, left, width });
  };
  useLayoutEffect(() => {
    if (!open || !anchor) { setPos(null); return; }
    place();
  }, [open, anchor, items.length]);
  // Follow the trigger through scrolls and layout shifts (autosave, toasts)
  // instead of closing, so the menu never vanishes under the pointer.
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, anchor]);
  useFocusTrap(open && !!pos, ref, onClose);
  if (!open || !pos) return null;
  const move = (e: React.KeyboardEvent, dir: 1 | -1) => {
    e.preventDefault();
    const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    const i = nodes.indexOf(document.activeElement as HTMLElement);
    nodes[(i + dir + nodes.length) % nodes.length]?.focus();
  };
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: z.menu }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="menu" aria-label={label} tabIndex={-1}
        onKeyDown={e => { if (e.key === 'ArrowDown') move(e, 1); if (e.key === 'ArrowUp') move(e, -1); }}
        className="tds-dim"
        style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, background: colors.background,
          borderRadius: radius.xl, boxShadow: shadow.floating, padding: `${spacing[2]}px 0`, outline: 'none' }}>
        {items.map(item => (
          <button key={item.key} type="button" role="menuitem" className="tds-menu-item" disabled={item.disabled}
            onClick={() => { onClose(); item.onSelect(); }}
            style={{ display: 'flex', alignItems: 'center', gap: spacing[3], width: '100%', minHeight: 44,
              padding: `${spacing[2] + 2}px ${spacing[4]}px`, border: 'none', background: 'transparent', textAlign: 'left',
              cursor: item.disabled ? 'default' : 'pointer', opacity: item.disabled ? 0.4 : 1, boxSizing: 'border-box' }}>
            {item.icon && <span style={{ color: item.tone === 'danger' ? colors.red500 : semantic.textTertiary, display: 'flex' }}><Icon name={item.icon} size={18} /></span>}
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={text('st11', 'medium', item.tone === 'danger' ? colors.red500 : semantic.textPrimary)}>{item.label}</span>
              {item.description && <span style={text('st12', 'regular', semantic.textTertiary)}>{item.description}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

// ── Toast / snackbar ──────────────────────────────────────────────────────────
export type ToastData = { id: number; message: string; tone?: 'default' | 'error'; action?: { label: string; onClick: () => void } };

export function Toast({ toast, bottomOffset = spacing[5] }: { toast: ToastData | null; bottomOffset?: number }) {
  if (!toast) return null;
  const error = toast.tone === 'error';
  return createPortal(
    <div key={toast.id} role={error ? 'alert' : 'status'} aria-live={error ? 'assertive' : 'polite'} className="tds-sheet"
      style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: bottomOffset, zIndex: z.toast,
        width: 'max-content', maxWidth: `calc(100% - ${GUTTER * 2}px)`, boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', gap: spacing[3], padding: `${spacing[3]}px ${spacing[4]}px`,
        background: colors.grey800, borderRadius: radius.xl, boxShadow: shadow.floating }}>
      {error && <span style={{ color: colors.red300, display: 'flex' }}><Icon name="warning" size={18} /></span>}
      <span style={{ ...text('t7', 'medium', colors.background), overflowWrap: 'anywhere' }}>{toast.message}</span>
      {toast.action && (
        <button type="button" className="tds-press tds-focus" onClick={toast.action.onClick}
          style={{ ...text('t7', 'bold', colors.blue300), background: 'none', border: 'none', padding: `0 ${spacing[1]}px`, cursor: 'pointer', flexShrink: 0 }}>
          {toast.action.label}
        </button>
      )}
    </div>,
    document.body,
  );
}
