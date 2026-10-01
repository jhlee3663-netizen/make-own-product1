import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { Pin, PinCategory, PinStatus, PageStub, UIMessage, PluginMessage, SafetyState, PinRevision } from './types';
import { canEdit, canStatus, isOwner } from './safety';
import { SafetyPanel, ManageEntry, inboxItems } from './SafetyPanel';
import { WhatsNew } from './WhatsNew';
import { colors, greyOpacity, spacing, radius, text, semantic, categoryColor, shadow, z, motion, GUTTER, FONT as TDS_FONT } from './tds';
import {
  Badge, BottomCTA, BOTTOM_CTA_SPACE, Button, Callout, FieldLabel, FilterChips, Icon, IconButton, Menu, MenuItem,
  SegmentedControl, TextInput, Toast, ToastData, fieldShell,
} from './tds-ui';
import { Lang, t, getInitialLang, persistLang } from './i18n';
import { markdownToHtml, htmlToMarkdown } from './richtext';
import pinSvg from './pin.svg';

function resizeSvg(svg: string, size: number): string {
  return svg.replace(/(<svg[^>]*)\swidth="[^"]*"/, `$1 width="${size}"`)
            .replace(/(<svg[^>]*)\sheight="[^"]*"/, `$1 height="${size}"`);
}

function send(msg: UIMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

const WEB_VIEWER_CLIP_PREFIX = 'SMARTPIN_V1:';

// Figma 플러그인 UI iframe마다 클립보드 API 지원이 달라 두 방식을 모두 시도한다.
function copyToClipboard(text: string): boolean {
  let ok = false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ok = document.execCommand('copy');
    document.body.removeChild(ta);
  } catch (_) {}
  try {
    const clip = (navigator as any).clipboard;
    if (clip && clip.writeText) clip.writeText(text).catch(() => {});
  } catch (_) {}
  return ok;
}

const EXPECTED_CODE_VERSION = 7; // code.ts의 CODE_VERSION과 항상 동일하게 유지
const UPDATE_URL = 'https://works.do/5WcDgVh';

function isRecentlyUpdated(updatedAt?: string): boolean {
  if (!updatedAt) return false;
  return Date.now() - new Date(updatedAt).getTime() < 24 * 60 * 60 * 1000;
}

// ── Press-scale CSS ──────────────────────────────────────────────────────────
;(() => {
  const s = document.createElement('style');
  s.textContent = [
    '.p-card{transition:transform 0.45s cubic-bezier(0.22,1,0.36,1)}',
    // Only pressing the card itself (or its title toggle) gives press feedback; no inner control may shrink it.
    '.p-card:active:not(:has(button:not([data-drag-ok]):active)):not(:has(textarea:active)):not(:has(input:active)):not(:has([contenteditable]:active)):not(:has([role="menuitem"]:active)){transform:scale(0.99)}',
    '.p-btn{transition:transform 0.45s cubic-bezier(0.22,1,0.36,1)}',
    '.p-btn:active{transform:scale(0.99)}',
    // View navigation slide animations
    '@keyframes vFwd{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}',
    '@keyframes vBack{from{opacity:0;transform:translateX(-24px)}to{opacity:1;transform:none}}',
    '.v-fwd{animation:vFwd 0.32s cubic-bezier(0.22,1,0.36,1) both}',
    '.v-back{animation:vBack 0.32s cubic-bezier(0.22,1,0.36,1) both}',
    '@keyframes obFade{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}',
    '.ob-fade{animation:obFade 0.35s cubic-bezier(0.22,1,0.36,1) both}',
    // Rich text editor
    '.rt-editor{white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word}',
    '.rt-editor ul{margin:0;padding-left:20px}',
    '.rt-editor li{margin:0}',
    '.rt-editor b,.rt-editor strong{font-weight:700}',
    '.rt-editor u{text-underline-offset:2px}',
    '.rt-editor i,.rt-editor em{font-style:italic}',
  ].join('');
  document.head.appendChild(s);
})();

// ── Colour aliases (all values come from the TDS tokens in ./tds) ────────────
const C = {
  primary:     colors.blue500,
  primaryDark: colors.blue600,
  bg:          semantic.bgPage,
  card:        colors.background,
  cardHover:   colors.grey50,
  inputBg:     semantic.bgField,
  text1:       semantic.textPrimary,
  text2:       semantic.textSecondary,
  text3:       semantic.textTertiary,
  line:        colors.grey100,
  guideLine:   semantic.divider,
  success:     colors.green500,
  error:       colors.red500,
  blue10:      colors.blue50,
  disabledBg:  colors.blue50,
  disabledText:colors.blue200,
} as const;

const CAT_COLOR: Record<PinCategory, string> = categoryColor;
const CAT_LABEL: Record<PinCategory, string> = {
  design: 'Design', descript: 'Descript', dev: 'Dev', ask: 'Ask',
};
const FONT = TDS_FONT;
const FOREIGN_HINT_KEY = 'hint-foreign-v1';
const WHATS_NEW_KEY = 'whats-new-v7';
const LANG_FLAG_KEY = 'lang';
// The "someone else's pin" hint is shown once: on the first foreign pin a
// viewer opens. That card keeps it for the session; no other card shows it.
let foreignHintPinId: string | null = null;
// figma.clientStorage-backed flags (the UI iframe has no usable localStorage).
// Until they arrive, treat hints as already seen so nothing flashes twice.
const clientFlags: { loaded: boolean; values: Record<string, string> } = { loaded: false, values: {} };
const setClientFlag = (key: string, value = '1') => { clientFlags.values[key] = value; send({ type: 'CLIENT_SET', key, value }); };
const foreignHintSeen = () => !clientFlags.loaded || clientFlags.values[FOREIGN_HINT_KEY] === '1';

// ── Nested tree type ─────────────────────────────────────────────────────────
interface NestedTreeNode {
  path: string; depth: number; label: string;
  pins: Pin[]; totalCount: number; hasChildren: boolean;
  children: NestedTreeNode[];
}

// ── Group tree builder (pure — called per page section) ───────────────────────
function buildGroupTree(pinsSubset: Pin[]): NestedTreeNode[] {
  const pinMap = new Map<string, Pin[]>();
  pinsSubset.forEach(pin => {
    const k = pin.group?.trim() || '';
    if (!pinMap.has(k)) pinMap.set(k, []);
    pinMap.get(k)!.push(pin);
  });

  const pathSet = new Set<string>();
  for (const k of pinMap.keys()) {
    if (!k) continue;
    const parts = k.split('/');
    for (let i = 1; i <= parts.length; i++) pathSet.add(parts.slice(0, i).join('/'));
  }

  const sorted = [...pathSet].sort((a, b) => a.localeCompare(b));

  const totalCount = (path: string): number => {
    let n = (pinMap.get(path) ?? []).length;
    for (const k of pinMap.keys()) {
      if (k !== path && k.startsWith(path + '/')) n += (pinMap.get(k) ?? []).length;
    }
    return n;
  };

  const nodeMap = new Map<string, NestedTreeNode>();
  const roots: NestedTreeNode[] = [];
  for (const path of sorted) {
    const node: NestedTreeNode = {
      path,
      depth: path.split('/').length - 1,
      label: path.split('/').pop()!,
      pins: pinMap.get(path) ?? [],
      totalCount: totalCount(path),
      hasChildren: sorted.some(p => p.startsWith(path + '/')),
      children: [],
    };
    nodeMap.set(path, node);
    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : null;
    if (parentPath && nodeMap.has(parentPath)) nodeMap.get(parentPath)!.children.push(node);
    else roots.push(node);
  }
  return roots;
}

// ── GroupInput ───────────────────────────────────────────────────────────────
function GroupInput({ value, onChange, suggestions, lang }: {
  value: string; onChange: (v: string) => void; suggestions: string[]; lang: Lang;
}) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const filtered = suggestions.filter(s =>
    s.toLowerCase().includes(value.toLowerCase()) && s !== value
  );
  return (
    <div style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => { setOpen(true); setFocused(true); }}
        onBlur={() => { setTimeout(() => setOpen(false), 150); setFocused(false); }}
        placeholder={t(lang, 'groupInputPlaceholder')}
        aria-label={t(lang, 'fieldGroup')}
        style={{
          ...fieldShell(focused), ...text('st11', 'regular', C.text1),
          width: '100%', height: 48, padding: `0 ${spacing[4]}px`, outline: 'none',
        }}
      />
      {open && filtered.length > 0 && (
        <div role="listbox" style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: z.selectionPopup,
          background: C.card, borderRadius: radius.lg, marginTop: spacing[1],
          boxShadow: shadow.floating, overflow: 'hidden', padding: `${spacing[1]}px 0`,
        }}>
          {filtered.map(s => (
            <div key={s} role="option" aria-selected={false} className="tds-menu-item"
              onMouseDown={e => { e.preventDefault(); onChange(s); setOpen(false); }}
              style={{ ...text('st11', 'regular', C.text1), padding: `${spacing[2] + 2}px ${spacing[4]}px`, cursor: 'pointer' }}
            >{s}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── HighlightText ────────────────────────────────────────────────────────────
function HighlightText({ text, query }: { text: string; query?: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const lq    = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let last = 0, idx = lower.indexOf(lq);
  while (idx !== -1) {
    if (idx > last) parts.push(text.slice(last, idx));
    parts.push(
      <mark key={idx} style={{
        background: colors.yellow200, color: 'inherit',
        borderRadius: 3, padding: '0 1px', margin: '0 -1px',
      }}>
        {text.slice(idx, idx + query.length)}
      </mark>
    );
    last = idx + query.length;
    idx = lower.indexOf(lq, last);
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function previewFormattedText(text: string): string {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/(^|\n)\s*-\s+/g, '$1• ');
}

function FormattedInline({ text, query, depth = 0 }: { text: string; query?: string; depth?: number }) {
  if (depth > 3) return <HighlightText text={text} query={query} />;
  const pattern = /(\*\*[^*\n]+\*\*|__[^_\n]+__)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) {
      parts.push(<HighlightText key={`t-${last}`} text={text.slice(last, match.index)} query={query} />);
    }
    const token = match[0];
    const inner = token.slice(2, -2);
    const child = <FormattedInline text={inner} query={query} depth={depth + 1} />;
    parts.push(token.startsWith('**')
      ? <strong key={`f-${match.index}`} style={{ fontWeight: 700 }}>{child}</strong>
      : <u key={`f-${match.index}`} style={{ textUnderlineOffset: 2 }}>{child}</u>);
    last = match.index + token.length;
  }
  if (last < text.length) {
    parts.push(<HighlightText key={`t-${last}`} text={text.slice(last)} query={query} />);
  }
  return <>{parts}</>;
}

function FormattedContent({ text, query }: { text: string; query?: string }) {
  return <>{text.split('\n').map((line, index) => {
    const bullet = line.match(/^\s*(?:•|-)\s+(.*)$/);
    return bullet ? (
      <div key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, minHeight: '1.6em' }}>
        <span aria-hidden="true" style={{ flexShrink: 0 }}>•</span>
        <span><FormattedInline text={bullet[1]} query={query} /></span>
      </div>
    ) : (
      <div key={index} style={{ minHeight: '1.6em' }}><FormattedInline text={line} query={query} /></div>
    );
  })}</>;
}

function findScrollParent(el: HTMLElement): HTMLElement | null {
  let parent = el.parentElement;
  while (parent && parent !== document.body) {
    const { overflowY } = window.getComputedStyle(parent);
    if (overflowY === 'auto' || overflowY === 'scroll') return parent;
    parent = parent.parentElement;
  }
  return null;
}

// ── RichTextEditor ───────────────────────────────────────────────────────────
// A contentEditable surface: bold/underline/bullets are real DOM nodes, so the
// note looks the way it will be read. Text still enters and leaves as the
// stored `**`/`__`/`•` format via richtext.ts.
function RichTextEditor({ value, onChange, placeholder, style, className, editorRef, syncRef, onKeyDown, onSelectionChange, onBlur }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  style?: React.CSSProperties; className?: string;
  editorRef?: React.RefObject<HTMLDivElement>;
  syncRef?: React.MutableRefObject<(() => void) | null>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onSelectionChange?: () => void;
  onBlur?: () => void;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const ref = editorRef ?? innerRef;
  // What the editor itself last produced. Rewriting innerHTML on our own edits
  // would reset the caret to the top on every keystroke.
  const lastEmitted = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || value === lastEmitted.current) return;
    el.innerHTML = markdownToHtml(value);
    lastEmitted.current = value;
  }, [value]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const markdown = htmlToMarkdown(el);
    lastEmitted.current = markdown;
    onChange(markdown);
  };
  if (syncRef) syncRef.current = emit;

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={ref}
        className={`rt-editor${className ? ` ${className}` : ''}`}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onKeyDown={onKeyDown}
        onMouseUp={onSelectionChange}
        onKeyUp={onSelectionChange}
        onBlur={onBlur}
        onPaste={e => {
          // Paste as plain text: notes only carry bold/underline/bullets, and
          // pasted fonts or colours would survive the round trip as noise.
          e.preventDefault();
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
        }}
        onDragStart={e => {
          // Selecting a large block and dragging from inside that selection is
          // a browser built-in "drag this text out" gesture — stopPropagation
          // alone only stops our own pin-reorder handler from reacting to it,
          // it doesn't stop the browser from actually starting that native
          // drag (the ghost-image "screen tearing away" effect).
          e.preventDefault();
          e.stopPropagation();
        }}
        style={style}
      />
      {!value && placeholder && (
        <div aria-hidden="true" style={{
          position: 'absolute', top: spacing[3], left: spacing[4], pointerEvents: 'none',
          ...text('st11', 'regular', semantic.placeholder),
        }}>{placeholder}</div>
      )}
    </div>
  );
}

// ── PinCard ──────────────────────────────────────────────────────────────────
// Who the current viewer is relative to a pin; drives copy, not permissions.
type PinRole = 'dev' | 'owner' | 'editor' | 'assignee' | 'viewer';

function PinCard({ pin, expanded, focused, allGroups, fileKey, inGroup, searchQuery, draggableHint, isReadOnly, canDelete, canChangeStatus, lang,
  onExpand, onSave, onAutoSave, onDelete, onNeedFileKey, onSetNumber, onManage, role, canRequest, onToast, inboxCount, onCanvasAction }: {
  pin: Pin; expanded: boolean; focused: boolean;
  allGroups: string[]; fileKey: string | null; inGroup?: boolean; searchQuery?: string; draggableHint?: boolean; isReadOnly?: boolean; lang: Lang;
  onExpand: () => void; onSave: (p: Pin) => void; onAutoSave: (p: Pin) => void;
  onDelete: (id: string) => void; onNeedFileKey: () => void;
  onSetNumber: (newNumber: number) => void;
  canDelete?: boolean; canChangeStatus?: boolean; onManage: (entry?: Omit<ManageEntry, 'id'>) => void;
  role: PinRole; canRequest: boolean; onToast: (message: string) => void; inboxCount?: number;
  onCanvasAction: (action: 'cleanup' | 'align') => void;
}) {
  const cardRef     = useRef<HTMLDivElement>(null);
  const numberInputRef = useRef<HTMLInputElement>(null);
  const contentInputRef = useRef<HTMLDivElement>(null);
  const contentSyncRef = useRef<(() => void) | null>(null);
  const [title, setTitle]         = useState(pin.title);
  const [content, setContent]     = useState(pin.content);
  const [category, setCategory]   = useState<PinCategory>(pin.category);
  const [group, setGroup]         = useState(pin.group ?? '');
  const [hovered, setHovered]     = useState(false);
  const [editingNumber, setEditingNumber] = useState(false);
  const [numberInput, setNumberInput]     = useState(String(pin.number));
  const syncedRef = useRef({ title: pin.title, content: pin.content, category: pin.category, group: pin.group ?? '' });
  const baseRef = useRef(pin);
  const latestRef = useRef({ pin, isReadOnly, onAutoSave });
  latestRef.current = { pin, isReadOnly, onAutoSave };
  const [recoveryDraft, setRecoveryDraft] = useState<string | null>(() => {
    try { return sessionStorage.getItem(`smart-pin-draft-${pin.id}`); } catch (_) { return null; }
  });

  useEffect(() => {
    setTitle(pin.title); setContent(pin.content);
    setCategory(pin.category); setGroup(pin.group ?? '');
    syncedRef.current = { title: pin.title, content: pin.content, category: pin.category, group: pin.group ?? '' };
  }, [pin.id]);

  useEffect(() => { setNumberInput(String(pin.number)); }, [pin.number]);

  // ── Quiet autosave ──────────────────────────────────────────────────────
  // Debounces while typing, and flushes immediately when the card collapses
  // (Save button, switching to another pin, or this card unmounting) so a
  // long edit is never lost just because Save was never clicked. `syncedRef`
  // (not the `pin` prop) is the source of truth for "already persisted" —
  // the prop only catches up once the UPDATE_PIN round trip resolves, and
  // comparing against it in the meantime would fire a redundant duplicate.
  const draftRef = useRef({ title, content, category, group });
  useEffect(() => { draftRef.current = { title, content, category, group }; });

  const isDirty = () => {
    const d = draftRef.current, s = syncedRef.current;
    return d.title !== s.title || d.content !== s.content
      || d.category !== s.category || d.group.trim() !== s.group.trim();
  };
  const preserveDraft = (draft: { title: string; content: string; category: PinCategory; group: string }) => {
    const raw = JSON.stringify(draft);
    try { sessionStorage.setItem(`smart-pin-draft-${pin.id}`, raw); } catch (_) {}
    setRecoveryDraft(raw);
  };
  const flushAutoSave = () => {
    if (latestRef.current.isReadOnly || !isDirty()) return;
    const d = draftRef.current;
    preserveDraft(d);
    latestRef.current.onAutoSave({ ...baseRef.current, title: d.title, content: d.content, category: d.category, status: latestRef.current.pin.status, group: d.group.trim() || undefined });
    syncedRef.current = { ...d };
  };

  useEffect(() => {
    const s = syncedRef.current;
    const isOwnAck = pin.title === s.title && pin.content === s.content && pin.category === s.category && (pin.group || '') === s.group;
    if (!isDirty() || isOwnAck) {
      baseRef.current = pin;
      if (!isDirty()) {
        setTitle(pin.title); setContent(pin.content); setCategory(pin.category); setGroup(pin.group || '');
        syncedRef.current = { title: pin.title, content: pin.content, category: pin.category, group: pin.group || '' };
      }
    }
  }, [pin.revision]);

  useEffect(() => {
    if (!expanded || isReadOnly || !isDirty()) return;
    const timer = window.setTimeout(flushAutoSave, 1200);
    return () => window.clearTimeout(timer);
  }, [title, content, category, group, expanded]);

  // Fires when this card collapses (Save clicked, another pin opened, list
  // re-filtered) and on unmount — covers every way editing can stop.
  useEffect(() => {
    return () => flushAutoSave();
  }, [expanded]);

  useEffect(() => {
    if (editingNumber) { numberInputRef.current?.focus(); numberInputRef.current?.select(); }
  }, [editingNumber]);

  const commitNumber = () => {
    const n = parseInt(numberInput, 10);
    setEditingNumber(false);
    if (!isNaN(n) && n > 0 && n !== pin.number) onSetNumber(n);
    else setNumberInput(String(pin.number));
  };

  const applyFormat = (command: 'bold' | 'italic' | 'underline' | 'insertUnorderedList') => {
    const el = contentInputRef.current;
    if (!el) return;
    if (!el.contains(document.getSelection()?.anchorNode ?? null)) el.focus();
    // Keep the browser emitting <b>/<u> tags instead of inline-styled spans.
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(command);
    contentSyncRef.current?.();
  };

  // Exiting a bullet list by pressing Enter (or Backspace) on an already-empty
  // item is normally handled by the browser's own contentEditable logic —
  // but that native heuristic turned out to be unreliable on Windows (the
  // bullet dot survives). We replace it with the exact same toggle command
  // the bullet button already uses, so behavior no longer depends on
  // Chromium's own build-specific list-exit handling.
  const exitEmptyBulletIfNeeded = (e: React.KeyboardEvent<HTMLDivElement>): boolean => {
    if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.key !== 'Enter' && e.key !== 'Backspace') return false;
    const sel = document.getSelection();
    const node = sel?.anchorNode;
    if (!sel || !node || !sel.isCollapsed) return false;
    const li = (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element))?.closest('li');
    if (!li || li.textContent?.trim()) return false;
    e.preventDefault();
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand('insertUnorderedList');
    contentSyncRef.current?.();
    return true;
  };

  // Floating format popup that appears under a drag-selection, so formatting
  // an existing sentence doesn't require reaching for the toolbar above.
  const [selPopup, setSelPopup] = useState<{ top: number; left: number } | null>(null);
  const SEL_POPUP_WIDTH = 112;

  const updateSelPopup = () => {
    const el = contentInputRef.current;
    const selection = document.getSelection();
    if (!el || !selection || selection.isCollapsed || selection.rangeCount === 0) { setSelPopup(null); return; }
    const range = selection.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) { setSelPopup(null); return; }
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { setSelPopup(null); return; }
    setSelPopup({
      top: rect.bottom + 6,
      left: Math.min(Math.max(rect.left, 8), window.innerWidth - SEL_POPUP_WIDTH - 8),
    });
  };

  useEffect(() => {
    if (!selPopup) return;
    const hide = () => setSelPopup(null);
    const parent = contentInputRef.current ? findScrollParent(contentInputRef.current) : null;
    parent?.addEventListener('scroll', hide, { passive: true });
    window.addEventListener('resize', hide);
    return () => {
      parent?.removeEventListener('scroll', hide);
      window.removeEventListener('resize', hide);
    };
  }, [!!selPopup]);

  useEffect(() => {
    if (focused) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focused]);

  const isDone    = pin.status === 'done';
  const isPending = pin.status === 'pending';
  const isNew     = isRecentlyUpdated(pin.updatedAt);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [contentFocused, setContentFocused] = useState(false);
  const [foreignHintDismissed, setForeignHintDismissed] = useState(false);
  const foreignHint = !foreignHintDismissed && role === 'viewer' && canRequest && !!pin.author && expanded
    && (foreignHintPinId === pin.id || (foreignHintPinId === null && !foreignHintSeen()));
  useEffect(() => {
    if (!foreignHint || foreignHintPinId) return;
    foreignHintPinId = pin.id;
    setClientFlag(FOREIGN_HINT_KEY);
  }, [foreignHint]);
  const dismissForeignHint = () => setForeignHintDismissed(true);

  const markSynced = () => { syncedRef.current = { title, content, category, group }; };
  const doSave    = () => { preserveDraft({ title, content, category, group }); onSave({ ...baseRef.current, title, content, category, status: pin.status,  group: group.trim() || undefined }); markSynced(); };
  // A status change saves together with the current draft, exactly like the
  // former 보류 / 다시 열기 buttons. Assignees (read-only) send status alone.
  const doStatus  = (status: PinStatus) => {
    if (isReadOnly) { if (canChangeStatus) onSave({ ...pin, status }); return; }
    preserveDraft({ title, content, category, group });
    onSave({ ...baseRef.current, title, content, category, status, group: group.trim() || undefined });
    markSynced();
  };

  const copyLink = () => {
    if (!fileKey) { onNeedFileKey(); return; }
    const nodeId = pin.pinNodeId.replace(':', '-');
    const url = `https://www.figma.com/file/${fileKey}?node-id=${nodeId}`;
    onToast(copyToClipboard(url) ? t(lang, 'toastLinkCopied') : t(lang, 'toastLinkCopyFail'));
  };

  const menuItems: MenuItem[] = [
    { key: 'link', label: t(lang, 'menuCopyLink'), icon: 'link', disabled: !pin.pinNodeId,
      description: fileKey ? undefined : t(lang, 'copyLinkTitleDisabled'), onSelect: copyLink },
    { key: 'manage', label: t(lang, 'menuManage'), icon: 'people', onSelect: () => onManage() },
  ];
  if (canDelete) menuItems.push({ key: 'trash', label: t(lang, 'deleteBtn'), icon: 'trash', tone: 'danger',
    onSelect: () => { flushAutoSave(); onDelete(pin.id); } });
  else if (canRequest) menuItems.push({ key: 'delete-request', label: t(lang, 'menuRequestDelete'), icon: 'trash',
    description: t(lang, 'menuRequestDeleteHint'), onSelect: () => onManage({ view: 'requests', kind: 'delete' }) });

  const roleText = role === 'dev' ? t(lang, 'roleDev') : role === 'owner' ? t(lang, 'roleOwner')
    : role === 'editor' ? t(lang, 'roleEditor') : role === 'assignee' ? t(lang, 'roleAssignee') : t(lang, 'roleViewer', pin.author?.name);
  const statusItems: { value: PinStatus; label: string }[] = [
    { value: 'todo', label: t(lang, 'statusTodo') }, { value: 'pending', label: t(lang, 'statusPendingLabel') }, { value: 'done', label: t(lang, 'statusDoneLabel') },
  ];

  // Margin: when inside group guide container, no horizontal margin (container handles it)
  const outerMargin = inGroup ? `0 0 ${spacing[2]}px 0` : `0 ${GUTTER}px ${spacing[2]}px`;
  const titleColor = isDone || isPending ? semantic.textDisabled : semantic.textPrimary;

  const callouts: React.ReactNode[] = [];
  if (foreignHint) callouts.push(
    <Callout key="foreign" tone="info" onDismiss={dismissForeignHint}>{t(lang, 'foreignHint')}</Callout>);
  if (!pin.author && canRequest && !pin.requests?.some(r => r.kind === 'claim' && !r.resolvedAt)) callouts.push(
    <Callout key="claim" tone="neutral" action={{ label: t(lang, 'claimAction'), onClick: () => onManage({ view: 'requests', kind: 'claim' }) }}>{t(lang, 'claimCallout')}</Callout>);
  if (pin.duplicateBadges && !isReadOnly) callouts.push(pin.badgeMissing
    ? <Callout key="dup" tone="warning" action={{ label: t(lang, 'dupAdoptAction'), onClick: () => onCanvasAction('cleanup') }}>{t(lang, 'dupAdoptCallout', pin.duplicateBadges)}</Callout>
    : <Callout key="dup" tone="warning" action={{ label: t(lang, 'dupAction'), onClick: () => onCanvasAction('cleanup') }}>{t(lang, 'dupCallout', pin.duplicateBadges)}</Callout>);
  if (pin.badgeDrift && !pin.badgeMissing && !isReadOnly) callouts.push(
    <Callout key="drift" tone="neutral" action={{ label: t(lang, 'driftAction'), onClick: () => onCanvasAction('align') }}>{t(lang, 'driftCallout')}</Callout>);
  if (pin.badgeMissing && !pin.duplicateBadges && !isReadOnly) callouts.push(
    <Callout key="badge" tone="warning" action={{ label: t(lang, 'badgeMissingAction'), onClick: () => onManage() }}>{t(lang, 'badgeMissingCallout')}</Callout>);
  if (pin.conflictCount) callouts.push(
    <Callout key="conflict" tone="warning" action={{ label: t(lang, 'conflictAction'), onClick: () => onManage({ view: 'history' }) }}>{t(lang, 'conflictCallout', pin.conflictCount)}</Callout>);

  const formatButton = (label: string, glyph: React.ReactNode, command: 'bold' | 'italic' | 'underline' | 'insertUnorderedList', shortcut?: string, dark = false) => (
    <button type="button" className={dark ? 'tds-press' : 'tds-icon-btn tds-press'} aria-label={label} title={shortcut ? `${label} (${shortcut})` : label}
      onMouseDown={e => e.preventDefault()}
      onClick={() => { applyFormat(command); if (dark) { if (command === 'insertUnorderedList') setSelPopup(null); else updateSelPopup(); } }}
      style={{ ...text('t7', 'semibold', dark ? colors.background : semantic.textSecondary), width: 32, height: 32, border: 'none',
        borderRadius: radius.md, background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
        justifyContent: 'center', padding: 0 }}>{glyph}</button>
  );
  const formatSet = (dark = false) => (
    <>
      {formatButton(t(lang, 'formatBold'), <b>B</b>, 'bold', 'Cmd/Ctrl+B', dark)}
      {formatButton(t(lang, 'formatItalic'), <i style={{ fontFamily: 'Georgia, serif' }}>I</i>, 'italic', 'Cmd/Ctrl+I', dark)}
      {formatButton(t(lang, 'formatUnderline'), <u style={{ textUnderlineOffset: 2 }}>U</u>, 'underline', 'Cmd/Ctrl+U', dark)}
      {formatButton(t(lang, 'formatBullet'), <span style={{ fontSize: 18, lineHeight: 1 }}>•</span>, 'insertUnorderedList', undefined, dark)}
    </>
  );

  return (
    <div ref={cardRef} className="p-card"
      style={{
        margin: outerMargin, borderRadius: radius.xl, background: colors.background,
        boxShadow: focused ? `0 0 0 2px ${colors.blue400}, ${shadow.ring}` : 'none',
        overflow: 'hidden', transition: `box-shadow .3s ${motion}`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ── Header ── */}
      <div onClick={onExpand} style={{
        display: 'flex', alignItems: 'flex-start', gap: spacing[3], cursor: 'pointer',
        padding: `${spacing[4]}px ${spacing[2]}px ${!expanded && pin.content ? spacing[1] : spacing[4]}px ${spacing[4]}px`,
        background: hovered && !expanded ? colors.grey50 : 'transparent', transition: `background .15s ${motion}`,
      }}>
        {/* drag handle (visible when this card can be reordered) */}
        {draggableHint && (
          <div title={t(lang, 'dragHint')} aria-hidden="true" style={{
            flexShrink: 0, width: 8, height: 28, marginLeft: -spacing[2], marginRight: -spacing[1],
            display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: hovered ? 0.6 : 0.3, cursor: 'grab',
            transition: `opacity .2s ${motion}`,
          }}>
            <svg width="8" height="12" viewBox="0 0 8 12" fill="none" style={{ color: C.text3 }}>
              <circle cx="2" cy="2" r="1.3" fill="currentColor"/>
              <circle cx="6" cy="2" r="1.3" fill="currentColor"/>
              <circle cx="2" cy="6" r="1.3" fill="currentColor"/>
              <circle cx="6" cy="6" r="1.3" fill="currentColor"/>
              <circle cx="2" cy="10" r="1.3" fill="currentColor"/>
              <circle cx="6" cy="10" r="1.3" fill="currentColor"/>
            </svg>
          </div>
        )}

        {/* number badge (click to edit) */}
        {editingNumber ? (
          <input ref={numberInputRef} type="number" min={1} value={numberInput} aria-label={t(lang, 'numberBadgeHint')}
            onChange={e => setNumberInput(e.target.value)}
            onClick={e => e.stopPropagation()}
            onDragStart={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Enter')  { e.preventDefault(); commitNumber(); }
              if (e.key === 'Escape') { setNumberInput(String(pin.number)); setEditingNumber(false); }
            }}
            onBlur={commitNumber}
            style={{
              ...text('st12', 'bold', C.text1), width: 36, height: 28, borderRadius: radius.full, flexShrink: 0,
              border: `1.5px solid ${C.primary}`, background: colors.background,
              textAlign: 'center', outline: 'none', padding: 0, boxSizing: 'border-box',
            }}
          />
        ) : (
          <button type="button" className="tds-press"
            onClick={e => { e.stopPropagation(); if (!isReadOnly) setEditingNumber(true); }}
            onMouseDown={e => e.stopPropagation()}
            title={isReadOnly ? undefined : t(lang, 'numberBadgeHint')}
            aria-label={isReadOnly ? `#${pin.number}` : `#${pin.number} · ${t(lang, 'numberBadgeHint')}`}
            style={{
              ...text('st12', 'bold', colors.background), width: 28, height: 28, borderRadius: radius.full, flexShrink: 0,
              background: (isDone || isPending) ? colors.grey300 : CAT_COLOR[pin.category], border: 'none', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isReadOnly ? 'default' : 'pointer',
            }}>{pin.number}</button>
        )}

        {/* title + meta */}
        <button type="button" className="tds-focus" aria-expanded={expanded} data-drag-ok=""
          onClick={e => { e.stopPropagation(); onExpand(); }}
          style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', borderRadius: radius.sm }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: spacing[2] - 2, minHeight: 28, flexWrap: 'wrap' }}>
            <span style={{
              ...text('t6', 'semibold', titleColor), minWidth: 0, maxWidth: '100%',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              textDecoration: isDone ? 'line-through' : 'none',
            }}><HighlightText text={pin.title || t(lang, 'noTitleFallback')} query={searchQuery} /></span>
            {isPending && <Badge color="yellow">{t(lang, 'statusPendingLabel')}</Badge>}
            {isDone && <Badge color="green">{t(lang, 'statusDoneLabel')}</Badge>}
            {!!inboxCount && <Badge color="red" size="xsmall">{t(lang, 'inboxBadge', inboxCount)}</Badge>}
            {isNew && !isDone && !inboxCount && <Badge color="blue" size="xsmall">{t(lang, 'updatedBadge')}</Badge>}
          </span>
          <span style={{ ...text('st12', 'regular', semantic.textTertiary), display: 'flex', alignItems: 'center', gap: spacing[1], flexWrap: 'wrap', marginTop: 2 }}>
            <span style={{ fontWeight: 600, color: CAT_COLOR[pin.category] }}>{CAT_LABEL[pin.category]}</span>
            {pin.group && <><span aria-hidden="true">·</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}><HighlightText text={pin.group} query={searchQuery} /></span></>}
            <span aria-hidden="true">·</span>
            <span>{pin.author?.name || t(lang, 'authorUnknown')}</span>
            {pin.protected && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }} title={t(lang, 'protectedLabel')}>
              <span aria-hidden="true">·</span><Icon name="lock" size={12} /><span>{t(lang, 'protectedLabel')}</span></span>}
          </span>
        </button>

        <IconButton label={t(lang, 'menuMore')} icon="more" haspopup="menu" expanded={!!menuAnchor}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); setMenuAnchor(e.currentTarget); }} />
        <Menu open={!!menuAnchor} anchor={menuAnchor} onClose={() => setMenuAnchor(null)} items={menuItems} label={t(lang, 'menuMore')} />
      </div>

      {/* ── Content preview (collapsed) ── */}
      {!expanded && pin.content && (
        <div onClick={onExpand} style={{
          ...text('t7', 'regular', semantic.textSecondary), cursor: 'pointer',
          padding: `0 ${spacing[4]}px ${spacing[4]}px ${spacing[4] + 28 + spacing[3]}px`,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}><HighlightText text={previewFormattedText(pin.content)} query={searchQuery} /></div>
      )}

      {/* ── Expanded ── */}
      {expanded && (
        <div
          // Belt-and-suspenders: no legitimate drag (pin reorder is gated to
          // collapsed cards only) should ever originate while a card is open
          // for editing. Catching dragstart here, on capture, backstops the
          // rich-text editor's own handler in case some other child element
          // — not the contentEditable div itself — ends up as the event's
          // actual origin.
          onDragStartCapture={e => e.preventDefault()}
          style={{ padding: `0 ${spacing[4]}px ${spacing[5]}px` }}>
          <div style={{ ...text('st12', 'medium', semantic.textTertiary), display: 'flex', alignItems: 'center', gap: spacing[1],
            paddingTop: spacing[3], borderTop: `1px solid ${C.line}`, marginBottom: spacing[4] }}>
            {pin.protected ? <Icon name="lock" size={14} /> : <Icon name={role === 'viewer' || role === 'dev' ? 'info' : 'check'} size={14} />}
            <span>{roleText}</span>
          </div>
          {callouts.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[2], marginBottom: spacing[5] }}>{callouts}</div>}

          {isReadOnly ? (
            /* Read view: other people's pins, assignees, and Dev Mode */
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[5] }}>
              <div style={{ ...text('st11', 'regular', semantic.textPrimary), wordBreak: 'break-word' }}>
                {pin.content ? <FormattedContent text={pin.content} query={searchQuery} />
                  : <span style={{ color: semantic.textDisabled }}>{t(lang, 'noContent')}</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: spacing[4], rowGap: spacing[2], ...text('t7', 'regular', semantic.textSecondary) }}>
                <span style={{ color: semantic.textTertiary }}>{t(lang, 'fieldCategory')}</span>
                <span style={{ color: CAT_COLOR[pin.category], fontWeight: 600 }}>{CAT_LABEL[pin.category]}</span>
                {pin.group && <><span style={{ color: semantic.textTertiary }}>{t(lang, 'fieldGroup')}</span><span style={{ overflowWrap: 'anywhere' }}>{pin.group}</span></>}
                {!canChangeStatus && <><span style={{ color: semantic.textTertiary }}>{t(lang, 'fieldStatus')}</span><span>{statusItems.find(s => s.value === pin.status)?.label}</span></>}
              </div>
              {canChangeStatus && (
                <div>
                  <FieldLabel>{t(lang, 'fieldStatus')}</FieldLabel>
                  <SegmentedControl ariaLabel={t(lang, 'fieldStatus')} value={pin.status} onChange={doStatus} items={statusItems} />
                </div>
              )}
              {canRequest && (
                <Button color="light" variant="weak" size="medium" display="full" icon="message"
                  onClick={() => onManage({ view: 'requests', kind: canChangeStatus ? 'comment' : 'edit' })}>{t(lang, 'leaveComment')}</Button>
              )}
            </div>
          ) : (
            /* Edit form */
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[5] }}>
              <div>
                <FieldLabel htmlFor={`pin-title-${pin.id}`}>{t(lang, 'fieldTitle')}</FieldLabel>
                <TextInput id={`pin-title-${pin.id}`} value={title} onChange={e => setTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); doSave(); } }}
                  onDragStart={e => e.stopPropagation()} />
              </div>
              <div>
                <FieldLabel>{t(lang, 'fieldContent')}</FieldLabel>
                <div style={fieldShell(contentFocused)}
                  onFocusCapture={() => setContentFocused(true)} onBlurCapture={() => setContentFocused(false)}>
                  <div role="toolbar" aria-label={t(lang, 'formatToolbar')} style={{ display: 'flex', gap: 2, padding: `${spacing[1]}px ${spacing[2]}px`,
                    borderBottom: `1px solid ${semantic.divider}` }}>
                    {formatSet()}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <RichTextEditor value={content} onChange={setContent} placeholder={t(lang, 'fieldContentPlaceholder')}
                      editorRef={contentInputRef}
                      syncRef={contentSyncRef}
                      style={{ ...text('st11', 'regular', semantic.textPrimary), display: 'block', minHeight: 96, width: '100%',
                        padding: `${spacing[3]}px ${spacing[4]}px`, boxSizing: 'border-box', outline: 'none', background: 'transparent', border: 'none' }}
                      onKeyDown={e => {
                        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); applyFormat('bold'); }
                        else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); applyFormat('italic'); }
                        else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'u') { e.preventDefault(); applyFormat('underline'); }
                        else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); doSave(); }
                        else if (exitEmptyBulletIfNeeded(e)) { /* handled */ }
                      }}
                      onSelectionChange={updateSelPopup}
                      onBlur={() => setSelPopup(null)} />
                    {selPopup && createPortal(
                      <div
                        onMouseDown={e => e.preventDefault()}
                        role="toolbar" aria-label={t(lang, 'formatToolbar')}
                        style={{
                          position: 'fixed', top: selPopup.top, left: selPopup.left, zIndex: z.selectionPopup,
                          display: 'flex', gap: 2, padding: spacing[1] - 1,
                          background: colors.grey900, borderRadius: radius.lg, boxShadow: shadow.floating,
                        }}
                      >
                        {formatSet(true)}
                      </div>,
                      document.body
                    )}
                  </div>
                </div>
              </div>
              <div>
                <FieldLabel>{t(lang, 'fieldGroup')}</FieldLabel>
                <GroupInput value={group} onChange={setGroup} suggestions={allGroups} lang={lang} />
              </div>
              <div>
                <FieldLabel>{t(lang, 'fieldCategory')}</FieldLabel>
                <div role="radiogroup" aria-label={t(lang, 'fieldCategory')} style={{ display: 'flex', gap: spacing[2] - 2, flexWrap: 'wrap' }}>
                  {(Object.keys(CAT_LABEL) as PinCategory[]).map(cat => {
                    const on = category === cat;
                    return (
                      <button key={cat} type="button" role="radio" aria-checked={on} className="tds-press" onClick={() => setCategory(cat)}
                        style={{ ...text('t7', 'semibold', on ? colors.background : semantic.textSecondary), height: 32,
                          padding: `0 ${spacing[3] + 2}px`, borderRadius: radius.full, border: 'none', cursor: 'pointer',
                          background: on ? CAT_COLOR[cat] : semantic.bgSubtle }}>{CAT_LABEL[cat]}</button>
                    );
                  })}
                </div>
              </div>
              <div>
                <FieldLabel>{t(lang, 'fieldStatus')}</FieldLabel>
                <SegmentedControl ariaLabel={t(lang, 'fieldStatus')} value={pin.status} onChange={doStatus} items={statusItems} disabled={!canChangeStatus} />
              </div>
              {recoveryDraft && (
                <details style={text('st12', 'regular', semantic.textTertiary)}>
                  <summary style={{ cursor: 'pointer', ...text('st12', 'medium', semantic.textTertiary) }}>{t(lang, 'draftCopyLabel')}</summary>
                  <p style={{ margin: `${spacing[2]}px 0` }}>{t(lang, 'draftCopyHint')}</p>
                  <textarea readOnly aria-label="입력 내용 사본" value={(() => { try { const d = JSON.parse(recoveryDraft); return d.title + '\n\n' + d.content; } catch (_) { return recoveryDraft; } })()}
                    style={{ ...fieldShell(false), ...text('t7', 'regular', semantic.textSecondary), width: '100%', minHeight: 90, padding: spacing[3], resize: 'vertical' }}/>
                </details>
              )}
              <BottomCTA caption={t(lang, 'autosaveCaption')}>
                <Button display="full" size="large" onClick={doSave}>{t(lang, 'saveBtn')}</Button>
              </BottomCTA>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ResizeHandle ─────────────────────────────────────────────────────────────
type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const RESIZE_CURSOR: Record<ResizeDir, string> = {
  n: 'ns-resize', s: 'ns-resize',
  e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize',
  nw: 'nwse-resize', se: 'nwse-resize',
};

function ResizeHandle() {
  const EDGE   = 8;  // 변 영역 두께
  const CORNER = 16; // 모서리 영역 크기

  const startResize = (dir: ResizeDir) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX, startY = e.clientY;
    const startW = window.innerWidth, startH = window.innerHeight;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let w = startW, h = startH;
      if (dir.includes('e')) w = startW + dx;
      if (dir.includes('w')) w = startW - dx;
      if (dir.includes('s')) h = startH + dy;
      if (dir.includes('n')) h = startH - dy;
      send({ type: 'RESIZE', width: Math.max(300, Math.round(w)), height: Math.max(400, Math.round(h)) });
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };

  const handle = (dir: ResizeDir, style: React.CSSProperties, children?: React.ReactNode) => (
    <div key={dir} onPointerDown={startResize(dir)}
      style={{ position: 'fixed', cursor: RESIZE_CURSOR[dir], zIndex: 100, ...style }}>
      {children}
    </div>
  );

  return (
    <>
      {/* edges */}
      {handle('n', { top: 0, left: CORNER, right: CORNER, height: EDGE })}
      {handle('s', { bottom: 0, left: CORNER, right: CORNER, height: EDGE })}
      {handle('w', { left: 0, top: CORNER, bottom: CORNER, width: EDGE })}
      {handle('e', { right: 0, top: CORNER, bottom: CORNER, width: EDGE })}
      {/* corners */}
      {handle('nw', { top: 0, left: 0, width: CORNER, height: CORNER })}
      {handle('ne', { top: 0, right: 0, width: CORNER, height: CORNER })}
      {handle('sw', { bottom: 0, left: 0, width: CORNER, height: CORNER })}
      {handle('se', { bottom: 0, right: 0, width: CORNER, height: CORNER },
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: '0 3px 3px 0' }}>
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <path d="M8 1L1 8" stroke={C.line} strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M8 5L5 8" stroke={C.line} strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
      )}
    </>
  );
}

// ── FileCard ──────────────────────────────────────────────────────────────────
function FileCard({ pageId, pageName, count, isCurrent, onNavigate, onRename, onDelete,
  onDragStart, onDragOver, onDrop, dragPosition, lang }: {
  pageId: string; pageName: string; count: number; isCurrent: boolean;
  onNavigate: () => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent, pos: 'before' | 'after') => void;
  onDrop?: () => void;
  dragPosition?: 'before' | 'after' | null;
  lang: Lang;
}) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [renaming, setRenaming]   = useState(false);
  const [renameVal, setRenameVal] = useState(pageName);
  const [hovered, setHovered]     = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (renaming) inputRef.current?.focus(); }, [renaming]);
  useEffect(() => { setRenameVal(pageName); }, [pageName]);

  const commitRename = () => {
    const trimmed = renameVal.trim();
    onRename(trimmed || pageName);
    setRenaming(false);
  };

  const dropLine = (edge: 'top' | 'bottom') => (
    <div style={{ position: 'absolute', [edge]: -spacing[1] - 1, left: 0, right: 0, height: 2,
      background: C.primary, borderRadius: 2, zIndex: 10, boxShadow: shadow.ring } as React.CSSProperties} />
  );

  return (
    <div style={{ position: 'relative', marginBottom: spacing[2] }}>
      {dragPosition === 'before' && dropLine('top')}
      {dragPosition === 'after' && dropLine('bottom')}
      <div
        className="p-card"
        draggable={!!onDragStart && !renaming}
        onDragStart={onDragStart ? e => { e.stopPropagation(); onDragStart(); } : undefined}
        onDragOver={onDragOver ? e => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          onDragOver(e, e.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
        } : undefined}
        onDrop={onDrop ? e => { e.stopPropagation(); onDrop(); } : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={renaming ? undefined : onNavigate}
        style={{
          display: 'flex', alignItems: 'center', gap: spacing[3], borderRadius: radius.xl,
          background: hovered && !renaming ? colors.grey50 : colors.background,
          padding: `${spacing[3]}px ${spacing[2]}px ${spacing[3]}px ${spacing[4]}px`,
          cursor: renaming ? 'default' : 'pointer', transition: `background .15s ${motion}`,
        }}>
        {/* Page icon (doubles as the drag affordance on hover) */}
        <div aria-hidden="true" style={{
          width: 40, height: 40, borderRadius: radius.lg, flexShrink: 0,
          background: isCurrent ? colors.blue50 : semantic.bgSubtle, color: isCurrent ? colors.blue500 : semantic.textTertiary,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <rect x="2.5" y="1.5" width="11" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M5 5.5h6M5 8h6M5 10.5h3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </div>
        {/* Name area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {renaming ? (
            <TextInput ref={inputRef} value={renameVal} aria-label={t(lang, 'renameMenuItem')}
              onChange={e => setRenameVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  commitRename();
                if (e.key === 'Escape') { setRenameVal(pageName); setRenaming(false); }
              }}
              onBlur={commitRename}
              onClick={e => e.stopPropagation()}
              style={{ height: 40 }}
            />
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing[2] - 2 }}>
                <span style={{ ...text('t6', 'semibold', C.text1), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pageName}</span>
                {isCurrent && <Badge color="blue" size="xsmall">{t(lang, 'currentBadge')}</Badge>}
              </div>
              <span style={text('st12', 'regular', C.text3)}>{t(lang, 'pinCount', count)}</span>
            </>
          )}
        </div>
        {!renaming && <>
          <IconButton label={t(lang, 'pageMenuTitle')} icon="more" haspopup="menu" expanded={!!menuAnchor}
            onClick={e => { e.stopPropagation(); setMenuAnchor(e.currentTarget); }} />
          <span aria-hidden="true" style={{ color: colors.grey400, display: 'flex' }}><Icon name="chevronRight" size={18} /></span>
        </>}
      </div>
      <Menu open={!!menuAnchor} anchor={menuAnchor} onClose={() => setMenuAnchor(null)} label={t(lang, 'pageMenuTitle')}
        items={[
          { key: 'rename', label: t(lang, 'renameMenuItem'), onSelect: () => setRenaming(true) },
          { key: 'delete', label: t(lang, 'deleteMenuItem'), tone: 'danger', icon: 'trash', onSelect: onDelete },
        ]} />
    </div>
  );
}

// ── Onboarding illustrations ─────────────────────────────────────────────────

function IllustSelect() {
  return (
    <svg width="220" height="168" viewBox="0 0 220 168" fill="none">
      <rect width="220" height="168" rx="16" fill="#F2F4F6"/>
      {/* Card */}
      <rect x="28" y="26" width="164" height="116" rx="10" fill="white" opacity=".97"/>
      <rect x="46" y="46" width="74" height="7" rx="3.5" fill="#E5E8EB"/>
      <rect x="46" y="60" width="98" height="7" rx="3.5" fill="#E5E8EB"/>
      <rect x="46" y="74" width="58" height="7" rx="3.5" fill="#E5E8EB"/>
      <rect x="46" y="95" width="40" height="14" rx="7" fill="#DCEBFF"/>
      {/* Selection border */}
      <rect x="24" y="22" width="172" height="124" rx="12" fill="none" stroke="#3182F6" strokeWidth="2"/>
      {/* Corner handles */}
      <rect x="20" y="18" width="10" height="10" rx="2.5" fill="white" stroke="#3182F6" strokeWidth="1.5"/>
      <rect x="190" y="18" width="10" height="10" rx="2.5" fill="white" stroke="#3182F6" strokeWidth="1.5"/>
      <rect x="20" y="140" width="10" height="10" rx="2.5" fill="white" stroke="#3182F6" strokeWidth="1.5"/>
      <rect x="190" y="140" width="10" height="10" rx="2.5" fill="white" stroke="#3182F6" strokeWidth="1.5"/>
      {/* Cursor */}
      <path d="M172 126 L172 148 L177 142 L181 151 L184 150 L180 141 L187 141 Z"
        fill="white" stroke="#191F28" strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
  );
}

function IllustAddNote() {
  return (
    <svg width="220" height="168" viewBox="0 0 220 168" fill="none">
      <rect width="220" height="168" rx="16" fill="#F2F4F6"/>
      {/* Design frame */}
      <rect x="28" y="20" width="164" height="82" rx="10" fill="white" opacity=".97"/>
      <rect x="62" y="38" width="72" height="7" rx="3.5" fill="#E5E8EB"/>
      <rect x="62" y="52" width="92" height="7" rx="3.5" fill="#E5E8EB"/>
      <rect x="62" y="66" width="52" height="7" rx="3.5" fill="#E5E8EB"/>
      {/* Pin badge */}
      <circle cx="42" cy="30" r="15" fill="#3182F6"/>
      <circle cx="42" cy="30" r="15" fill="none" stroke="white" strokeWidth="2"/>
      <rect x="37" y="27.5" width="10" height="2.5" rx="1.25" fill="white"/>
      <rect x="40.5" y="23" width="2.5" height="10" rx="1.25" fill="white"/>
      {/* Sparkles */}
      <circle cx="26" cy="14" r="2.5" fill="#3182F6" opacity=".4"/>
      <circle cx="42" cy="9"  r="2"   fill="#3182F6" opacity=".4"/>
      <circle cx="57" cy="14" r="2.5" fill="#3182F6" opacity=".4"/>
      {/* Add Note button */}
      <rect x="28" y="118" width="164" height="38" rx="10" fill="#3182F6"/>
      <rect x="88" y="135" width="12" height="2.5" rx="1.25" fill="white"/>
      <rect x="93.5" y="129" width="2.5" height="14" rx="1.25" fill="white"/>
      <rect x="112" y="133" width="44" height="6" rx="3" fill="rgba(255,255,255,0.6)"/>
    </svg>
  );
}

function IllustEdit() {
  return (
    <svg width="220" height="168" viewBox="0 0 220 168" fill="none">
      <rect width="220" height="168" rx="16" fill="#F2F4F6"/>
      {/* Note card */}
      <rect x="18" y="10" width="184" height="148" rx="12" fill="white" opacity=".97"/>
      {/* Title field */}
      <rect x="30" y="22" width="30" height="6" rx="3" fill="#C4C9D4"/>
      <rect x="30" y="32" width="160" height="20" rx="7" fill="#F8F9FA"/>
      <rect x="40" y="39" width="82" height="6" rx="3" fill="#E5E8EB"/>
      {/* Content field */}
      <rect x="30" y="60" width="36" height="6" rx="3" fill="#C4C9D4"/>
      <rect x="30" y="70" width="160" height="36" rx="7" fill="#F8F9FA"/>
      <rect x="40" y="78" width="112" height="5" rx="2.5" fill="#E5E8EB"/>
      <rect x="40" y="89" width="88" height="5" rx="2.5" fill="#E5E8EB"/>
      {/* Category chips */}
      <rect x="30" y="116" width="36" height="14" rx="7" fill="#3182F6"/>
      <rect x="72" y="116" width="36" height="14" rx="7" fill="#E5E8EB"/>
      <rect x="114" y="116" width="36" height="14" rx="7" fill="#E5E8EB"/>
      <rect x="156" y="116" width="34" height="14" rx="7" fill="#E5E8EB"/>
      {/* Save button */}
      <rect x="30" y="140" width="160" height="12" rx="6" fill="#3182F6" opacity=".85"/>
    </svg>
  );
}

function IllustTeam() {
  return (
    <svg width="220" height="168" viewBox="0 0 220 168" fill="none">
      <rect width="220" height="168" rx="16" fill="#F2F4F6"/>
      {/* Card 1 */}
      <rect x="12" y="12" width="196" height="42" rx="10" fill="white" opacity=".97"/>
      <circle cx="38" cy="33" r="13" fill="#3182F6"/>
      <rect x="58" y="27" width="84" height="7" rx="3.5" fill="#E5E8EB"/>
      <rect x="58" y="39" width="56" height="5" rx="2.5" fill="#E5E8EB"/>
      <rect x="172" y="25" width="28" height="16" rx="8" fill="#DCEBFF"/>
      {/* Card 2 */}
      <rect x="12" y="63" width="196" height="42" rx="10" fill="white" opacity=".97"/>
      <circle cx="38" cy="84" r="13" fill="#00B493"/>
      <rect x="58" y="78" width="92" height="7" rx="3.5" fill="#E5E8EB"/>
      <rect x="58" y="90" width="66" height="5" rx="2.5" fill="#E5E8EB"/>
      <rect x="164" y="76" width="36" height="16" rx="8" fill="#E5FBF6"/>
      {/* Card 3 */}
      <rect x="12" y="114" width="196" height="42" rx="10" fill="white" opacity=".97"/>
      <circle cx="38" cy="135" r="13" fill="#F5A623"/>
      <rect x="58" y="129" width="72" height="7" rx="3.5" fill="#E5E8EB"/>
      <rect x="58" y="141" width="88" height="5" rx="2.5" fill="#E5E8EB"/>
      <rect x="168" y="127" width="32" height="16" rx="8" fill="#FFF3D9"/>
    </svg>
  );
}

// ── Onboarding component ──────────────────────────────────────────────────────

function Onboarding({ onDone, lang }: { onDone: () => void; lang: Lang }) {
  const [slide, setSlide] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const TOTAL = 4;

  const goTo = (i: number) => { setSlide(i); setAnimKey(k => k + 1); };
  const next  = () => slide < TOTAL - 1 ? goTo(slide + 1) : onDone();
  const prev  = () => { if (slide > 0) goTo(slide - 1); };

  const SLIDES = [
    {
      title: t(lang, 'onboardSlide1Title'),
      desc: t(lang, 'onboardSlide1Desc'),
      illus: <IllustSelect />,
    },
    {
      title: t(lang, 'onboardSlide2Title'),
      desc: t(lang, 'onboardSlide2Desc'),
      illus: <IllustAddNote />,
    },
    {
      title: t(lang, 'onboardSlide3Title'),
      desc: t(lang, 'onboardSlide3Desc'),
      illus: <IllustEdit />,
    },
    {
      title: t(lang, 'onboardSlide4Title'),
      desc: t(lang, 'onboardSlide4Desc'),
      illus: <IllustTeam />,
    },
  ];

  const { title, desc, illus } = SLIDES[slide];

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="onboarding-title" style={{
      position: 'fixed', inset: 0, background: colors.background,
      display: 'flex', flexDirection: 'column', zIndex: z.sheet + 1, userSelect: 'none',
    }}>
      {/* Skip */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: `${spacing[4]}px ${GUTTER}px 0`, flexShrink: 0 }}>
        <Button size="small" color="light" variant="weak" style={{ background: 'transparent' }} onClick={onDone}>{t(lang, 'onboardSkip')}</Button>
      </div>

      {/* Illustration + text (animates together on slide change) */}
      <div key={animKey} className="ob-fade"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: `0 ${spacing[7]}px` }}>
        {illus}
        <div style={{ padding: `${spacing[6]}px ${spacing[1]}px 0`, textAlign: 'center' }}>
          <h2 id="onboarding-title" style={{ ...text('t4', 'bold', C.text1), margin: `0 0 ${spacing[2]}px`, letterSpacing: '-0.02em' }}>{title}</h2>
          <p style={{ ...text('t7', 'regular', C.text2), margin: 0, whiteSpace: 'pre-line' }}>{desc}</p>
        </div>
      </div>

      {/* Dot indicators */}
      <div role="tablist" aria-label={t(lang, 'onboardNext')} style={{ display: 'flex', justifyContent: 'center', gap: spacing[2] - 2, padding: `${spacing[4]}px 0`, flexShrink: 0 }}>
        {SLIDES.map((_, i) => (
          <button key={i} type="button" role="tab" aria-selected={slide === i} aria-label={`${i + 1} / ${TOTAL}`} onClick={() => goTo(i)} style={{
            width: slide === i ? 20 : 6, height: 6, borderRadius: radius.full, border: 'none', padding: 0,
            background: slide === i ? C.primary : colors.grey200, cursor: 'pointer', transition: `all .3s ${motion}`,
          }} />
        ))}
      </div>

      {/* Navigation buttons */}
      <div style={{ display: 'flex', gap: spacing[2], padding: `0 ${GUTTER}px ${spacing[7]}px`, flexShrink: 0 }}>
        {slide > 0 && <Button color="light" variant="weak" size="large" onClick={prev}>{t(lang, 'onboardPrev')}</Button>}
        <Button size="large" display="full" style={{ flex: 1 }} onClick={next}>{slide === TOTAL - 1 ? t(lang, 'onboardStart') : t(lang, 'onboardNext')}</Button>
      </div>
    </div>
  );
}

// ── ConfirmModal ──────────────────────────────────────────────────────────────
function ConfirmModal({ title, message, confirmLabel, danger, onConfirm, onCancel, lang }: {
  title: string; message: React.ReactNode; confirmLabel?: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void; lang: Lang;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return createPortal(
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: z.sheet, background: greyOpacity[500],
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: GUTTER, boxSizing: 'border-box',
    }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 320, background: colors.background, borderRadius: radius.xxl,
        padding: `${spacing[6]}px ${spacing[5]}px ${spacing[4]}px`, boxShadow: shadow.floating,
      }}>
        <h3 id="confirm-title" style={{ ...text('t5', 'bold', semantic.textStrong), margin: `0 0 ${spacing[2]}px` }}>{title}</h3>
        <div style={{ ...text('t7', 'regular', semantic.textTertiary), marginBottom: spacing[6] }}>{message}</div>
        <div style={{ display: 'flex', gap: spacing[2] }}>
          <Button color="light" variant="weak" size="large" display="full" style={{ flex: 1 }} onClick={onCancel}>{t(lang, 'modalCancel')}</Button>
          <Button color={danger ? 'danger' : 'primary'} size="large" display="full" style={{ flex: 1 }} onClick={onConfirm}>{confirmLabel ?? t(lang, 'modalConfirm')}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [lang, setLangState]              = useState<Lang>(getInitialLang());
  const setLang = (next: Lang) => { setLangState(next); persistLang(next); setClientFlag(LANG_FLAG_KEY, next); };
  const [pins, setPins]                   = useState<Pin[]>([]);
  const [hasSelection, setHasSelection]   = useState(false);
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [focusedId, setFocusedId]         = useState<string | null>(null);
  const [lastGroup, setLastGroup]         = useState('');
  const [lastCategory, setLastCategory]   = useState<PinCategory>('design');
  const [errorKey, setErrorKey]           = useState(0);
  const [query, setQuery]                 = useState('');
  const [searchFocus, setSearchFocus]     = useState(false);
  const [fileKey, setFileKey]             = useState<string | null>(null);
  const [codeVersion, setCodeVersion]         = useState<number>(0);
  const [safety, setSafety] = useState<SafetyState>({ user: null, admins: [], trash: [], users: [], ready: false });
  const [manage, setManage] = useState<ManageEntry | null>(null);
  const [flagsLoaded, setFlagsLoaded] = useState(false);
  const [pinsLoaded, setPinsLoaded] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState<boolean | null>(null);
  const [history, setHistory] = useState<{ id: string; revisions: PinRevision[] } | null>(null);
  type ListFilter = 'all' | 'mine' | 'requests' | 'pending' | 'protected';
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [deletePage, setDeletePage] = useState<string | null>(null);
  const [collapsedPaths, setCollapsedPaths]   = useState<Set<string>>(new Set());
  const [showOnboarding, setShowOnboarding]   = useState(false);
  const [currentPageId, setCurrentPageId]     = useState<string>('');
  const [currentPageName, setCurrentPageName] = useState<string>('');
  const [pageStubs, setPageStubs]             = useState<PageStub[]>([]);
  const [selectedPageId, setSelectedPageId]   = useState<string | null>(null);
  const [navDir, setNavDir]                   = useState<'forward' | 'back'>('forward');
  const [navKey, setNavKey]                   = useState(0);
  const [showAddPage, setShowAddPage]         = useState(false);
  const [addPageName, setAddPageName]         = useState('');
  const [showKeyPrompt, setShowKeyPrompt] = useState(false);
  const [customKeyUrl, setCustomKeyUrl]   = useState('');
  const [pendingOpenWeb, setPendingOpenWeb] = useState(false);
  const [toast, setToast]                 = useState<ToastData | null>(null);
  const [fileOrder, setFileOrder]               = useState<string[]>([]);
  const [groupOrders, setGroupOrders]           = useState<Record<string, string[]>>({});
  const [pinOrders, setPinOrders]               = useState<Record<string, string[]>>({});
  const [dragOverPageInfo, setDragOverPageInfo]   = useState<{ pageId: string; pos: 'before' | 'after' } | null>(null);
  const [dragOverGroupInfo, setDragOverGroupInfo] = useState<{ path: string; pos: 'before' | 'after' } | null>(null);
  const [dragOverPinInfo, setDragOverPinInfo]     = useState<{ id: string; pos: 'before' | 'after' } | null>(null);
  const [numberConflict, setNumberConflict]       = useState<{ pin: Pin; conflictPin: Pin; newNumber: number } | null>(null);
  const [showCompactConfirm, setShowCompactConfirm] = useState(false);
  const [pageMenuOpen, setPageMenuOpen]           = useState(false);
  const [pageMenuAnchor, setPageMenuAnchor]       = useState<HTMLElement | null>(null);
  const [isDevMode, setIsDevMode]                 = useState(true);
  const focusTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileDragRef        = useRef<string | null>(null);
  const groupDragRef       = useRef<string | null>(null);
  const pinDragRef         = useRef<string | null>(null);
  const dragOriginRef      = useRef<HTMLElement | null>(null);
  const pinsRef            = useRef<Pin[]>([]);          // always-current snapshot for async handlers
  const selectedPageIdRef  = useRef<string | null>(null);
  const langRef            = useRef<Lang>(lang);          // always-current snapshot for the mount-only message handler
  langRef.current = lang;

  const safetyRef          = useRef<SafetyState>(safety);
  safetyRef.current = safety;

  const showToast = (message: string, opts: { tone?: 'error'; action?: ToastData['action'] } = {}) => {
    setToast({ id: Date.now(), message, ...opts });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), opts.action ? 6000 : opts.tone === 'error' ? 5000 : 2500);
  };

  const triggerFocus = (id: string) => {
    setExpandedId(id); setFocusedId(id);
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => setFocusedId(null), 2500);
  };

  // 핀 데이터를 URL이 아닌 클립보드로 전달 → OS/브라우저의 URL 길이 제한(특히 Windows)에 안 걸림
  const openWebViewer = (explicitFileKey?: string | null) => {
    const payload = {
      pins: pinsRef.current.map(p => ({
        id: p.id, number: p.number, title: p.title, content: p.content,
        category: p.category, status: p.status, group: p.group || '',
        pageId: p.pageId, pageName: p.pageName, pinNodeId: p.pinNodeId,
      })),
      stubs: pageStubs.map(s => ({ pageId: s.pageId, pageName: s.pageName })),
      fileKey: explicitFileKey ?? fileKey ?? null,
      exportedAt: Date.now(),
    };
    const ok = copyToClipboard(WEB_VIEWER_CLIP_PREFIX + JSON.stringify(payload));
    send({ type: 'OPEN_WEB_VIEWER' });
    showToast(ok ? t(lang, 'toastWebCopySuccess') : t(lang, 'toastWebCopyFail'));
  };

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data?.pluginMessage as PluginMessage | undefined;
      if (!msg) return;
      switch (msg.type) {
        case 'PINS_LOADED':
          pinsRef.current = msg.pins;
          setPins(msg.pins);
          setPageStubs(msg.pageStubs ?? []);
          setFileKey(msg.fileKey ?? null);
          setCurrentPageId(msg.currentPageId ?? '');
          setCurrentPageName(msg.currentPageName ?? '');
          setCodeVersion(msg.codeVersion ?? 0);
          setFileOrder(msg.fileOrder ?? []);
          setGroupOrders(msg.groupOrders ?? {});
          setPinOrders(msg.pinOrders ?? {});
          setShowOnboarding(!msg.onboardingDone);
          setPinsLoaded(true);
          setIsDevMode(!!msg.isDevMode || !msg.safety?.ready || !msg.safety?.user);
          if (msg.safety) setSafety({ ...msg.safety, user: msg.isDevMode ? null : msg.safety.user });
          break;
        case 'PAGE_CHANGED':
          setCurrentPageId(msg.pageId);
          setCurrentPageName(msg.pageName ?? '');
          break;
        case 'PIN_ADDED':
          pinsRef.current = [...pinsRef.current.filter(p => p.id !== msg.pin.id), msg.pin];
          setPins(prev => [...prev.filter(p => p.id !== msg.pin.id), msg.pin]);
          setCollapsedPaths(prev => {
            const next = new Set(prev);
            const group = msg.pin.group?.trim();
            if (group) {
              const parts = group.split('/');
              parts.forEach((_, i) => next.delete(parts.slice(0, i + 1).join('/')));
            } else {
              next.delete('__ungrouped__');
            }
            return next;
          });
          triggerFocus(msg.pin.id);
          break;
        case 'PIN_UPDATED':
          pinsRef.current = pinsRef.current.map(p => p.id === msg.pin.id ? msg.pin : p);
          setPins(prev => prev.map(p => p.id === msg.pin.id ? msg.pin : p));
          break;
        case 'PIN_DELETED':
          pinsRef.current = pinsRef.current.filter(p => p.id !== msg.id);
          setPins(prev => prev.filter(p => p.id !== msg.id));
          setExpandedId(prev => prev === msg.id ? null : prev);
          break;
        case 'SELECTION_CHANGED': setHasSelection(msg.hasSelection); break;
        case 'PIN_FOCUSED':
        case 'AUTO_FOCUS': {
          const fp = pinsRef.current.find(p => p.id === msg.id);
          if (fp?.pageId && selectedPageIdRef.current !== fp.pageId) {
            selectedPageIdRef.current = fp.pageId;
            setNavDir('forward');
            setNavKey(k => k + 1);
            setSelectedPageId(fp.pageId);
            setQuery('');
          }
          // Auto-expand any collapsed ancestor groups so the pin is visible
          if (fp) {
            setCollapsedPaths(prev => {
              const next = new Set(prev);
              const group = fp.group?.trim();
              if (group) {
                const parts = group.split('/');
                parts.forEach((_, i) => next.delete(parts.slice(0, i + 1).join('/')));
              } else {
                next.delete('__ungrouped__');
              }
              return next;
            });
          }
          triggerFocus(msg.id);
          break;
        }
        case 'REPOSITION_DONE':
          showToast(msg.moved > 0 ? t(langRef.current, 'toastRepositionMoved', msg.moved) : t(langRef.current, 'toastRepositionNone'));
          break;
        case 'PIN_NUMBERS_CHANGED': {
          if (msg.pins.length > 0) {
            const updates = new Map(msg.pins.map(p => [p.id, p]));
            pinsRef.current = pinsRef.current.map(p => updates.get(p.id) ?? p);
            setPins(prev => prev.map(p => updates.get(p.id) ?? p));
          }
          if (msg.reason === 'compact') {
            showToast(msg.pins.length > 0 ? t(langRef.current, 'toastCompactDone', msg.pins.length) : t(langRef.current, 'toastCompactAlready'));
          } else if (msg.reason === 'swap') {
            showToast(t(langRef.current, 'toastSwapDone'));
          } else if (msg.reason === 'edit') {
            showToast(t(langRef.current, 'toastNumberChanged'));
          }
          break;
        }
        case 'NOTICE':
          if (msg.undoIds?.length) {
            const ids = msg.undoIds;
            showToast(msg.message, { action: { label: t(langRef.current, 'toastUndo'), onClick: () => {
              ids.forEach(id => { if (safetyRef.current.trash.some(p => p.id === id)) send({ type: 'SAFETY', action: 'restore', id }); });
              setToast(null);
            } } });
          } else showToast(msg.message);
          break;
        case 'HISTORY': setHistory({ id: msg.id, revisions: msg.revisions }); break;
        case 'BACKUP': {
          const url = URL.createObjectURL(new Blob([msg.data], { type: 'application/json' }));
          const a = document.createElement('a'); a.href = url; a.download = `smart-pin-backup-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); break;
        }
        case 'CLIENT_FLAGS': {
          clientFlags.values = { ...clientFlags.values, ...msg.flags };
          clientFlags.loaded = true;
          const saved = msg.flags[LANG_FLAG_KEY];
          if ((saved === 'ko' || saved === 'en') && saved !== langRef.current) setLangState(saved);
          setFlagsLoaded(true);
          break;
        }
        case 'ERROR':         setErrorKey(k => k + 1); showToast(msg.message, { tone: 'error' }); break;
      }
    };
    window.addEventListener('message', handler);
    send({ type: 'INIT' });
    send({ type: 'CLIENT_GET', keys: [WHATS_NEW_KEY, FOREIGN_HINT_KEY, LANG_FLAG_KEY] });
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleSave = (updated: Pin) => {
    send({ type: 'UPDATE_PIN', pin: updated });
    setLastGroup(updated.group ?? '');
    setLastCategory(updated.category);
  };

  // Quiet save: debounced while typing, or flushed when a card collapses /
  // another pin opens. No toast, no collapsing — the explicit Save button
  // still does that.
  const handleAutoSave = (updated: Pin) => {
    send({ type: 'UPDATE_PIN', pin: updated, quiet: true });
    setLastGroup(updated.group ?? '');
    setLastCategory(updated.category);
  };

  const handleDelete = (id: string) => {
    send({ type: 'DELETE_PIN', id });
  };

  const navigateTo = (pageId: string) => {
    selectedPageIdRef.current = pageId;
    setNavDir('forward'); setNavKey(k => k + 1);
    setSelectedPageId(pageId); setQuery(''); setListFilter('all');
  };

  const navigateBack = () => {
    selectedPageIdRef.current = null;
    setNavDir('back'); setNavKey(k => k + 1);
    setSelectedPageId(null); setQuery(''); setListFilter('all');
  };

  const handleRenamePageGroup = (pageId: string, newName: string) => {
    send({ type: 'RENAME_PAGE_GROUP', pageId, newName });
  };

  const handleDeletePageGroup = (pageId: string) => {
    setDeletePage(pageId);
  };

  // ── Page groups derived from pins (actual pageId — never alias) ────────────
  // KEY FIX: use pin.pageId as-is (may be '') so RENAME/DELETE messages match correctly
  const pageGroups = useMemo(() => {
    const map = new Map<string, { pageId: string; pageName: string; pins: Pin[] }>();
    pins.forEach(pin => {
      const pid = pin.pageId ?? '';
      if (!map.has(pid)) {
        map.set(pid, { pageId: pid, pageName: pin.pageName || t(lang, 'legacyPageLabel'), pins: [] });
      }
      map.get(pid)!.pins.push(pin);
    });
    return [...map.values()];
  }, [pins, lang]);

  // ── Merge pin-groups + stubs (stubs for pages with no pins yet) ─────────────
  const mergedPages = useMemo(() => {
    const result: { pageId: string; pageName: string; pins: Pin[] }[] = [...pageGroups];
    for (const stub of pageStubs) {
      if (!result.find(pg => pg.pageId === stub.pageId)) {
        result.push({ pageId: stub.pageId, pageName: stub.pageName, pins: [] });
      }
    }
    if (fileOrder.length > 0) {
      result.sort((a, b) => {
        const ia = fileOrder.indexOf(a.pageId);
        const ib = fileOrder.indexOf(b.pageId);
        if (ia === -1 && ib === -1) return a.pageName.localeCompare(b.pageName);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
    } else {
      result.sort((a, b) => {
        if (a.pageId === currentPageId) return -1;
        if (b.pageId === currentPageId) return 1;
        return a.pageName.localeCompare(b.pageName);
      });
    }
    return result;
  }, [pageGroups, pageStubs, currentPageId, fileOrder]);

  const selectedPage = useMemo(
    () => selectedPageId !== null ? (mergedPages.find(pg => pg.pageId === selectedPageId) ?? null) : null,
    [mergedPages, selectedPageId]
  );

  const q = query.trim().toLowerCase();
  const filterMatches: Record<ListFilter, (p: Pin) => boolean> = {
    all: () => true,
    mine: p => isOwner(p, safety.user),
    requests: p => !!p.requests?.some(r => !r.resolvedAt),
    pending: p => p.status === 'pending',
    protected: p => !!p.protected,
  };
  const filterCounts = useMemo(() => {
    const source = selectedPage?.pins ?? [];
    const count = (k: ListFilter) => source.filter(filterMatches[k]).length;
    return { mine: count('mine'), requests: count('requests'), pending: count('pending'), protected: count('protected') };
  }, [selectedPage, safety.user]);
  // Only offer filters that would return something (plus the active one, so it can be cleared).
  const filterItems = ([
    { value: 'all' as const, label: t(lang, 'filterAll') },
    { value: 'mine' as const, label: t(lang, 'filterMine'), show: !isDevMode && filterCounts.mine > 0 },
    { value: 'requests' as const, label: t(lang, 'filterRequests'), count: filterCounts.requests, show: filterCounts.requests > 0 },
    { value: 'pending' as const, label: t(lang, 'filterPending'), count: filterCounts.pending, show: filterCounts.pending > 0 },
    { value: 'protected' as const, label: t(lang, 'filterProtected'), show: filterCounts.protected > 0 },
  ]).filter(f => f.value === 'all' || f.show || f.value === listFilter);
  const filtered = useMemo(() => {
    let source = (selectedPage?.pins ?? []).filter(filterMatches[listFilter]);
    if (!q) return source;
    return source.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.content.toLowerCase().includes(q) ||
      (p.group ?? '').toLowerCase().includes(q));
  }, [selectedPage, q, listFilter, safety.user]);
  const inbox = useMemo(() => inboxItems(pins, safety), [pins, safety]);
  const requestBadge = inbox.length;
  const inboxByPin = useMemo(() => inbox.reduce<Record<string, number>>((m, x) => { m[x.pin.id] = (m[x.pin.id] || 0) + 1; return m; }, {}), [inbox]);
  // Announce comments that arrive while the plugin is open (the 5s poll picks them up).
  const seenInboxRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!pinsLoaded || !safety.ready) return;
    const ids = new Set(inbox.map(x => x.request.id));
    const fresh = seenInboxRef.current ? inbox.filter(x => !seenInboxRef.current!.has(x.request.id) && x.request.actor.id !== safety.user?.id).length : 0;
    seenInboxRef.current = ids;
    if (fresh > 0) showToast(t(lang, 'toastNewComment', fresh), { action: { label: t(lang, 'toastView'), onClick: () => { setToast(null); setManage({ screen: 'inbox' }); } } });
  }, [inbox, pinsLoaded, safety.ready]);
  // The what's-new walkthrough runs once per Figma user, after first-run onboarding.
  useEffect(() => {
    if (whatsNewOpen !== null || !flagsLoaded || !pinsLoaded || showOnboarding || isDevMode) return;
    setWhatsNewOpen(clientFlags.values[WHATS_NEW_KEY] !== '1');
  }, [flagsLoaded, pinsLoaded, showOnboarding, isDevMode]);
  const closeWhatsNew = () => { setWhatsNewOpen(false); setClientFlag(WHATS_NEW_KEY); };
  const expandedPin = expandedId ? pins.find(p => p.id === expandedId) : undefined;
  const ctaVisible = !!expandedPin && selectedPageId !== null && !isDevMode && canEdit(expandedPin, safety.user) && !manage;

  const allGroups = useMemo(
    () => [...new Set((selectedPage?.pins ?? []).map(p => p.group?.trim() ?? '').filter(Boolean))],
    [selectedPage]
  );

  const togglePath = (path: string) => {
    setCollapsedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        // Expanding: only open this level; children stay in their current state
        next.delete(path);
      } else {
        // Collapsing: cascade — also collapse all descendant paths
        next.add(path);
        const prefix = path + '/';
        const pagePins = selectedPageId !== null
          ? pinsRef.current.filter(p => p.pageId === selectedPageId)
          : pinsRef.current;
        pagePins.forEach(pin => {
          const g = pin.group?.trim();
          if (!g) return;
          const parts = g.split('/');
          for (let i = 1; i <= parts.length; i++) {
            const p = parts.slice(0, i).join('/');
            if (p.startsWith(prefix)) next.add(p);
          }
        });
      }
      return next;
    });
  };

  // ── Pin number editing (with collision → swap confirmation) ──────────────
  const handleSetNumber = (pin: Pin, newNumber: number) => {
    if (!Number.isInteger(newNumber) || newNumber < 1 || newNumber === pin.number) return;
    const conflict = pinsRef.current.find(p => p.id !== pin.id && p.number === newNumber);
    if (conflict) {
      setNumberConflict({ pin, conflictPin: conflict, newNumber });
    } else {
      send({ type: 'SET_PIN_NUMBER', id: pin.id, number: newNumber });
    }
  };

  // ── Card factory ────────────────────────────────────────────────────────
  const makeCard = (pin: Pin, inGroup = false, draggableHint = false) => (
    <PinCard key={pin.id} pin={pin} inGroup={inGroup} draggableHint={isDevMode || !canEdit(pin, safety.user) ? false : draggableHint}
      isReadOnly={isDevMode || !canEdit(pin, safety.user)}
      canDelete={!isDevMode && isOwner(pin, safety.user)}
      canChangeStatus={!isDevMode && canStatus(pin, safety.user)}
      canRequest={!isDevMode && safety.ready && !!safety.user}
      role={isDevMode ? 'dev' : isOwner(pin, safety.user) ? 'owner' : canEdit(pin, safety.user) ? 'editor'
        : canStatus(pin, safety.user) ? 'assignee' : 'viewer'}
      onToast={message => showToast(message)}
      inboxCount={inboxByPin[pin.id]}
      onCanvasAction={action => action === 'cleanup'
        ? send({ type: 'BADGE_CLEANUP', ids: [pin.id] })
        : send({ type: 'REPOSITION_PINS', pageId: pin.pageId, ids: [pin.id] })}
      onManage={entry => setManage({ id: pin.id, ...entry })}
      expanded={expandedId === pin.id} focused={focusedId === pin.id}
      allGroups={allGroups} fileKey={fileKey} searchQuery={query.trim() || undefined} lang={lang}
      onExpand={() => {
        const opening = expandedId !== pin.id;
        setExpandedId(opening ? pin.id : null);
        if (opening) send({ type: 'FOCUS_PIN', pinNodeId: pin.pinNodeId });
      }}
      onSave={handleSave} onAutoSave={handleAutoSave} onDelete={handleDelete}
      onNeedFileKey={() => setShowKeyPrompt(true)}
      onSetNumber={(n) => handleSetNumber(pin, n)}
    />
  );

  // ── Pin order helpers ──────────────────────────────────────────────────
  const sortByPinOrder = (list: Pin[], orderKey: string): Pin[] => {
    const order = pinOrders[orderKey];
    if (!order || order.length === 0) return list;
    const idx = new Map(order.map((id, i) => [id, i]));
    return [...list].sort((a, b) => {
      const ia = idx.has(a.id) ? idx.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const ib = idx.has(b.id) ? idx.get(b.id)! : Number.MAX_SAFE_INTEGER;
      return ia - ib;
    });
  };

  // Renders a list of sibling pins with drag-to-reorder (linked number reassignment)
  const renderPinGroup = (pinList: Pin[], orderKey: string): React.ReactNode => {
    const sorted = sortByPinOrder(pinList, orderKey);
    if (sorted.length < 2) return sorted.map(pin => makeCard(pin, true));

    const handleDrop = (targetId: string) => {
      if (isDevMode || sorted.some(p => !canEdit(p, safety.user))) return;
      const fromId = pinDragRef.current;
      const pos = dragOverPinInfo?.id === targetId ? dragOverPinInfo.pos : 'before';
      pinDragRef.current = null;
      setDragOverPinInfo(null);
      if (!fromId || fromId === targetId) return;

      const order = sorted.map(p => p.id);
      reorder(order, fromId, targetId, pos);

      const renumbers: { id: string; number: number }[] = [];
      if (sorted.every(p => typeof p.number === 'number' && !isNaN(p.number))) {
        const sortedNumbers = sorted.map(p => p.number).sort((a, b) => a - b);
        order.forEach((id, i) => {
          const pin = sorted.find(p => p.id === id)!;
          if (pin.number !== sortedNumbers[i]) renumbers.push({ id, number: sortedNumbers[i] });
        });
      }

      setPinOrders(prev => ({ ...prev, [orderKey]: order }));
      send({ type: 'REORDER_PINS', orderKey, order, renumbers });
    };

    return sorted.map(pin => {
      const isExpanded = expandedId === pin.id;
      const dragPos = dragOverPinInfo?.id === pin.id ? dragOverPinInfo.pos : null;
      return (
        <div key={pin.id} style={{ position: 'relative' }}
          draggable={!isExpanded && !isDevMode && sorted.every(p => canEdit(p, safety.user))}
          onMouseDownCapture={e => { dragOriginRef.current = e.target as HTMLElement; }}
          onDragStart={e => {
            const origin = dragOriginRef.current;
            // The rich text note editor is a contentEditable div, not a
            // <textarea> — it must be excluded here too, or a text-selection
            // drag inside it gets misread as a pin-reorder drag.
            // The collapsed card's title toggle is a <button> but is also the natural grab area.
            if (origin?.closest('input, textarea, [contenteditable], button:not([data-drag-ok])')) { e.preventDefault(); return; }
            e.stopPropagation();
            pinDragRef.current = pin.id;
          }}
          onDragOver={e => {
            e.preventDefault(); e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setDragOverPinInfo({ id: pin.id, pos: e.clientY < rect.top + rect.height / 2 ? 'before' : 'after' });
          }}
          onDrop={e => { e.stopPropagation(); handleDrop(pin.id); }}
          onDragLeave={() => setDragOverPinInfo(null)}
        >
          {dragPos === 'before' && (
            <div style={{ position: 'absolute', top: -3, left: 0, right: 0, height: 2,
              background: C.primary, borderRadius: 2, zIndex: 10, boxShadow: `0 0 0 3px ${C.blue10}` }} />
          )}
          {dragPos === 'after' && (
            <div style={{ position: 'absolute', bottom: 3, left: 0, right: 0, height: 2,
              background: C.primary, borderRadius: 2, zIndex: 10, boxShadow: `0 0 0 3px ${C.blue10}` }} />
          )}
          {makeCard(pin, true, !isExpanded)}
        </div>
      );
    });
  };

  // ── Group header ─────────────────────────────────────────────────────────
  // LAYOUT CONSTANTS (px)
  // OUTER=16: horizontal padding of each root block wrapper
  // INDENT=12: gap from guide line (borderLeft) to child content
  const OUTER = GUTTER;
  const INDENT = 12;

  const groupHeader = (label: string, count: number, path?: string, depth = 0) => {
    const lvl = Math.min(depth, 2) as 0 | 1 | 2;
    const LBL = {
      0: { style: text('t7', 'bold', semantic.textStrong), pad: `${spacing[4]}px 0 ${spacing[2]}px` },
      1: { style: text('st12', 'semibold', semantic.textSecondary), pad: `${spacing[3]}px 0 ${spacing[2] - 2}px` },
      2: { style: text('st12', 'medium', semantic.textTertiary), pad: `${spacing[2]}px 0 ${spacing[1]}px` },
    }[lvl];
    const collapsed = !!path && collapsedPaths.has(path);
    const labelNode = (
      <>
        <span style={{ ...LBL.style, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{label}</span>
        <span style={text('st12', 'medium', semantic.textDisabled)}>{count}</span>
      </>
    );
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing[1], padding: LBL.pad, minWidth: 0 }}>
        {path ? (
          <button type="button" className="tds-press tds-focus" onClick={() => togglePath(path)} aria-expanded={!collapsed}
            aria-label={`${label} ${t(lang, 'itemCount', count)}`}
            style={{ display: 'flex', alignItems: 'center', gap: spacing[1] + 2, background: 'none', border: 'none', padding: `${spacing[1]}px ${spacing[1]}px`,
              margin: `-${spacing[1]}px`, borderRadius: radius.md, cursor: 'pointer', minWidth: 0, maxWidth: '100%' }}>
            <span style={{ color: semantic.textDisabled, display: 'flex', transform: collapsed ? 'rotate(-90deg)' : 'none', transition: `transform .3s ${motion}` }}>
              <Icon name="chevronDown" size={14} strokeWidth={2.2} />
            </span>
            {labelNode}
          </button>
        ) : labelNode}
      </div>
    );
  };

  // ── Recursive tree renderer ──────────────────────────────────────────────
  // Pixel map (plugin width = 400px):
  //   Depth-0 group title    x = OUTER (16px)
  //   Depth-0 guide line     x = OUTER (16px)  ← same as title left ✓
  //   Depth-0 card content   x = OUTER + INDENT (28px)
  //   Depth-1 group title    x = OUTER + INDENT (28px)
  //   Depth-1 guide line     x = OUTER + INDENT (28px) ← same as title left ✓
  //   Depth-1 card content   x = OUTER + INDENT×2 (40px)
  type GroupDragHandlers = {
    onDragStart: (path: string) => void;
    onDragOver: (e: React.DragEvent, path: string) => void;
    onDrop: (path: string) => void;
    onDragLeave: () => void;
    overInfo: { path: string; pos: 'before' | 'after' } | null;
  };

  // Helper: reorder array with before/after insertion
  const reorder = (arr: string[], from: string, to: string, pos: 'before' | 'after') => {
    const fi = arr.indexOf(from), ti = arr.indexOf(to);
    arr.splice(fi, 1);
    const newTi = fi < ti ? ti - 1 : ti;
    arr.splice(pos === 'after' ? newTi + 1 : newTi, 0, from);
  };

  const renderTreeNode = (nodes: NestedTreeNode[], isRoot = true, dragHandlers?: GroupDragHandlers, pageId?: string | null): React.ReactNode => (
    <>
      {nodes.map((node, idx) => {
        const collapsed = collapsedPaths.has(node.path);
        const hasContent = node.pins.length > 0 || node.children.length > 0;
        const overInfo = dragHandlers?.overInfo;
        const dragPos = overInfo?.path === node.path ? overInfo.pos : null;

        // Build drag handlers for this node's children (any depth)
        let sortedChildren = node.children;
        let childDragHandlers: GroupDragHandlers | undefined = undefined;
        if (pageId && node.children.length >= 2) {
          const childKey = `${pageId}::${node.path}`;
          const savedChildOrder = groupOrders[childKey] ?? [];
          if (savedChildOrder.length > 0) {
            sortedChildren = [...node.children].sort((a, b) => {
              const ia = savedChildOrder.indexOf(a.path);
              const ib = savedChildOrder.indexOf(b.path);
              if (ia === -1 && ib === -1) return 0;
              if (ia === -1) return 1;
              if (ib === -1) return -1;
              return ia - ib;
            });
          }
          childDragHandlers = {
            onDragStart: (path) => { groupDragRef.current = path; },
            onDragOver: (e, path) => {
              e.preventDefault();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const pos: 'before' | 'after' = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
              setDragOverGroupInfo({ path, pos });
            },
            onDrop: (path) => {
              const fromPath = groupDragRef.current;
              const pos = dragOverGroupInfo?.path === path ? dragOverGroupInfo.pos : 'before';
              if (!fromPath || fromPath === path) { setDragOverGroupInfo(null); return; }
              const order = sortedChildren.map(n => n.path);
              reorder(order, fromPath, path, pos);
              setGroupOrders(prev => ({ ...prev, [childKey]: order }));
              send({ type: 'SET_GROUP_ORDER', pageId: childKey, order });
              setDragOverGroupInfo(null);
              groupDragRef.current = null;
            },
            onDragLeave: () => setDragOverGroupInfo(null),
            overInfo: dragOverGroupInfo,
          };
        }

        const inner = (
          <>
            {/* Drag handle — shown at any depth when draggable */}
            {dragHandlers && (
              <div className="grp-handle" aria-hidden="true" title={t(lang, 'dragHint')}
                style={{ position: 'absolute', left: -12, top: spacing[4] + 3, display: 'flex', cursor: 'grab' }}>
                <svg width="8" height="12" viewBox="0 0 8 12" fill="none"
                  style={{ color: C.text3 }}>
                  <circle cx="2" cy="2" r="1.3" fill="currentColor"/>
                  <circle cx="6" cy="2" r="1.3" fill="currentColor"/>
                  <circle cx="2" cy="6" r="1.3" fill="currentColor"/>
                  <circle cx="6" cy="6" r="1.3" fill="currentColor"/>
                  <circle cx="2" cy="10" r="1.3" fill="currentColor"/>
                  <circle cx="6" cy="10" r="1.3" fill="currentColor"/>
                </svg>
              </div>
            )}
            {groupHeader(node.label, node.totalCount, node.path, node.depth)}

            {!collapsed && hasContent && (
              <div style={{
                paddingLeft: INDENT,
                marginTop: 2,
                marginBottom: isRoot ? 4 : 2,
                borderLeft: `1px solid ${C.guideLine}`,
              }}>
                {renderPinGroup(node.pins, `${pageId ?? selectedPageId ?? ''}::${node.path}`)}
                {sortedChildren.length > 0 && (
                  <div style={{ marginTop: node.pins.length > 0 ? 4 : 0 }}>
                    {renderTreeNode(sortedChildren, false, childDragHandlers, pageId)}
                  </div>
                )}
              </div>
            )}
          </>
        );

        return (
          <React.Fragment key={node.path}>
            {isRoot && idx > 0 && <div style={{ height: 20 }} />}
            {!isRoot && idx > 0 && dragHandlers && <div style={{ height: 6 }} />}
            {dragHandlers ? (
              <div style={{ position: 'relative', padding: isRoot ? `0 ${OUTER}px` : undefined }}>
                {dragPos === 'before' && (
                  <div style={{ position: 'absolute', top: -2, left: isRoot ? OUTER : 0, right: isRoot ? OUTER : 0,
                    height: 2, background: C.primary, borderRadius: 2, zIndex: 10,
                    boxShadow: `0 0 0 3px ${C.blue10}` }} />
                )}
                {dragPos === 'after' && (
                  <div style={{ position: 'absolute', bottom: -2, left: isRoot ? OUTER : 0, right: isRoot ? OUTER : 0,
                    height: 2, background: C.primary, borderRadius: 2, zIndex: 10,
                    boxShadow: `0 0 0 3px ${C.blue10}` }} />
                )}
                <div
                  draggable className="grp" style={{ position: 'relative' }}
                  onMouseDownCapture={e => { dragOriginRef.current = e.target as HTMLElement; }}
                  onDragStart={e => {
                    const origin = dragOriginRef.current;
                    const tag = origin?.tagName ?? '';
                    if (tag === 'INPUT' || tag === 'TEXTAREA') { e.preventDefault(); return; }
                    e.stopPropagation();
                    dragHandlers.onDragStart(node.path);
                  }}
                  onDragOver={e => { e.stopPropagation(); dragHandlers.onDragOver(e, node.path); }}
                  onDrop={e => { e.stopPropagation(); dragHandlers.onDrop(node.path); }}
                  onDragLeave={() => dragHandlers.onDragLeave()}
                >{inner}</div>
              </div>
            ) : inner}
          </React.Fragment>
        );
      })}
    </>
  );

  const inPinView = selectedPageId !== null;

  // ── Pin list renderer (used in pin view) ─────────────────────────────────
  const renderPinList = () => {
    if (filtered.length === 0) {
      return (
        <div style={{ padding: `${spacing[8]}px ${GUTTER}px` }}>
          <p style={{ ...text('t6', 'semibold', C.text2), margin: 0, whiteSpace: 'pre-line' }}>
            {q ? t(lang, 'emptySearchTitle', q) : listFilter !== 'all' ? t(lang, 'emptyFilterTitle') : t(lang, 'emptyDefaultTitle')}
          </p>
          {!q && listFilter === 'all' && <p style={{ ...text('t7', 'regular', C.text3), margin: `${spacing[1]}px 0 0` }}>{t(lang, 'emptyHint')}</p>}
          {listFilter !== 'all' && <div style={{ marginTop: spacing[4] }}><Button size="medium" color="light" variant="weak" onClick={() => setListFilter('all')}>{t(lang, 'filterShowAll')}</Button></div>}
        </div>
      );
    }
    const pgTree      = buildGroupTree(filtered);
    const pgUngrouped = filtered.filter(p => !p.group?.trim());
    const hasGroups   = pgTree.length > 0;

    // Sort root groups by saved order
    const savedGroupOrder = selectedPageId ? (groupOrders[selectedPageId] ?? []) : [];
    const sortedPgTree = savedGroupOrder.length > 0
      ? [...pgTree].sort((a, b) => {
          const ia = savedGroupOrder.indexOf(a.path);
          const ib = savedGroupOrder.indexOf(b.path);
          if (ia === -1 && ib === -1) return 0;
          if (ia === -1) return 1;
          if (ib === -1) return -1;
          return ia - ib;
        })
      : pgTree;

    const groupDragHandlers: GroupDragHandlers = {
      onDragStart: (path) => { groupDragRef.current = path; },
      onDragOver: (e, path) => {
        e.preventDefault();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const pos: 'before' | 'after' = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
        setDragOverGroupInfo({ path, pos });
      },
      onDrop: (path) => {
        const fromPath = groupDragRef.current;
        const pos = dragOverGroupInfo?.path === path ? dragOverGroupInfo.pos : 'before';
        if (!fromPath || fromPath === path) { setDragOverGroupInfo(null); return; }
        const order = sortedPgTree.map(n => n.path);
        reorder(order, fromPath, path, pos);
        if (selectedPageId) {
          setGroupOrders(prev => ({ ...prev, [selectedPageId]: order }));
          send({ type: 'SET_GROUP_ORDER', pageId: selectedPageId, order });
        }
        setDragOverGroupInfo(null);
        groupDragRef.current = null;
      },
      onDragLeave: () => setDragOverGroupInfo(null),
      overInfo: dragOverGroupInfo,
    };

    return hasGroups ? (
      <>
        {renderTreeNode(sortedPgTree, true, groupDragHandlers, selectedPageId)}
        {pgUngrouped.length > 0 && (
          <>
            {sortedPgTree.length > 0 && <div style={{ height: 20 }} />}
            <div style={{ padding: `0 ${OUTER}px` }}>
              {groupHeader(t(lang, 'ungroupedLabel'), pgUngrouped.length, '__ungrouped__', 0)}
              {!collapsedPaths.has('__ungrouped__') && renderPinGroup(pgUngrouped, `${selectedPageId}::__ungrouped__`)}
            </div>
          </>
        )}
      </>
    ) : (
      <div style={{ padding: `0 ${OUTER}px` }}>
        {renderPinGroup(filtered, `${selectedPageId}::__root__`)}
      </div>
    );
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh', width: '100%',
      background: C.bg, fontFamily: FONT,
    }}>
      <ResizeHandle />
      {manage && <SafetyPanel pins={pins} state={safety} entry={manage} history={history} errorKey={errorKey} send={send}
        onClose={() => setManage(null)} onToast={(message, tone) => showToast(message, { tone })}
        onShowWhatsNew={() => { setManage(null); setWhatsNewOpen(true); }} />}
      {whatsNewOpen && <WhatsNew lang={lang} onDone={closeWhatsNew} />}
      {deletePage !== null && <ConfirmModal lang={lang} title="이 페이지의 내 핀 삭제" danger
        message={`내 핀 ${pins.filter(p => p.pageId === deletePage && isOwner(p, safety.user)).length}개를 휴지통으로 이동합니다. 다른 작성자의 핀은 유지됩니다.`}
        confirmLabel="휴지통으로 이동" onCancel={() => setDeletePage(null)} onConfirm={() => { send({ type: 'DELETE_PAGE_GROUP', pageId: deletePage }); setDeletePage(null); }} />}

      {showOnboarding && (
        <Onboarding lang={lang} onDone={() => {
          send({ type: 'ONBOARDING_DONE' });
          setShowOnboarding(false);
          setWhatsNewOpen(false); setClientFlag(WHATS_NEW_KEY);
        }} />
      )}

      {/* ── Header ── */}
      <header style={{ background: colors.background, flexShrink: 0, paddingBottom: inPinView ? spacing[4] : spacing[2] }}>
        {inPinView ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing[1], minHeight: 56, padding: `${spacing[2]}px ${spacing[3]}px` }}>
              <IconButton label={t(lang, 'backLabel')} icon="chevronLeft" onClick={navigateBack} color={C.text1} iconSize={22} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 style={{ ...text('t6', 'bold', C.text1), margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedPage?.pageName ?? ''}
                </h1>
                {selectedPage && <span style={text('st12', 'regular', C.text3)}>{t(lang, 'pinCount', selectedPage.pins.length)}</span>}
              </div>
              {safety.ready && <IconButton label={t(lang, 'manageTitle')} icon="gear" badge={requestBadge} haspopup="dialog" onClick={() => setManage({})} />}
              {!isDevMode && (
                <IconButton label={t(lang, 'pageMenuTitle')} icon="more" haspopup="menu" expanded={pageMenuOpen}
                  onClick={e => { setPageMenuAnchor(e.currentTarget); setPageMenuOpen(v => !v); }} />
              )}
              <Menu open={pageMenuOpen} anchor={pageMenuAnchor} onClose={() => setPageMenuOpen(false)} label={t(lang, 'pageMenuTitle')}
                items={[
                  { key: 'reposition', label: t(lang, 'repositionBtn'), description: t(lang, 'repositionTitle'), icon: 'relink',
                    onSelect: () => { if (selectedPageId) send({ type: 'REPOSITION_PINS', pageId: selectedPageId }); } },
                  { key: 'compact', label: t(lang, 'compactBtn'), description: t(lang, 'compactTitle'), icon: 'refresh',
                    onSelect: () => setShowCompactConfirm(true) },
                ]} />
            </div>

            <div style={{ padding: `0 ${GUTTER}px`, display: 'flex', flexDirection: 'column', gap: spacing[3] }}>
              {isDevMode && <Callout tone="warning">{t(lang, 'devModeBanner')}</Callout>}

              {/* Search */}
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: spacing[3], top: '50%', transform: 'translateY(-50%)', color: semantic.textDisabled, display: 'flex', pointerEvents: 'none' }}>
                  <Icon name="search" size={18} />
                </span>
                <input type="search" value={query} aria-label={t(lang, 'searchPlaceholder')}
                  onChange={e => setQuery(e.target.value)}
                  onFocus={() => setSearchFocus(true)}
                  onBlur={() => setSearchFocus(false)}
                  placeholder={t(lang, 'searchPlaceholder')}
                  style={{
                    ...text('st11', 'regular', C.text1), width: '100%', height: 44, boxSizing: 'border-box',
                    padding: `0 ${spacing[10]}px 0 ${spacing[10]}px`, border: 'none', outline: 'none', borderRadius: radius.lg,
                    background: semantic.bgSubtle, boxShadow: searchFocus ? `inset 0 0 0 1.5px ${colors.blue500}` : 'none',
                    transition: `box-shadow .15s ${motion}`, WebkitAppearance: 'none',
                  }}
                />
                {query && (
                  <span style={{ position: 'absolute', right: spacing[1], top: '50%', transform: 'translateY(-50%)' }}>
                    <IconButton label={t(lang, 'searchClear')} icon="close" size={32} iconSize={16} onClick={() => setQuery('')} />
                  </span>
                )}
              </div>

              <FilterChips value={listFilter} onChange={setListFilter} items={filterItems} ariaLabel={t(lang, 'filterLabel')} />

              {/* Add Note */}
              {!isDevMode && (
                <div>
                  <Button display="full" size="large" icon="plus" disabled={!hasSelection} variant={ctaVisible ? 'weak' : 'fill'}
                    onClick={() => send({ type: 'ADD_PIN', category: lastCategory, group: lastGroup })}>{t(lang, 'addNote')}</Button>
                  <p style={{ ...text('st12', 'regular', hasSelection ? colors.green600 : C.text3), margin: `${spacing[2]}px 0 0`, textAlign: 'center' }}>
                    {hasSelection ? t(lang, 'selectionSelected') : t(lang, 'selectionNotSelected')}
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          /* File list view: title row */
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing[2], minHeight: 56, padding: `${spacing[2]}px ${spacing[3]}px ${spacing[2]}px ${GUTTER}px` }}>
            <div dangerouslySetInnerHTML={{ __html: resizeSvg(pinSvg, 20) }} aria-hidden="true" style={{ flexShrink: 0, lineHeight: 0 }} />
            <h1 style={{ ...text('t5', 'bold', C.text1), margin: 0, letterSpacing: '-0.02em' }}>Smart pin</h1>
            <IconButton label={t(lang, 'refreshTitle')} icon="refresh" size={32} iconSize={16} onClick={() => send({ type: 'INIT' })} />
            <span style={{ flex: 1 }} />
            <div role="radiogroup" aria-label={t(lang, 'langLabel')} style={{ display: 'inline-flex', background: semantic.bgSubtle, borderRadius: radius.full, padding: 2 }}>
              {(['ko', 'en'] as Lang[]).map(l => (
                <button key={l} type="button" role="radio" aria-checked={lang === l} className="tds-press" onClick={() => setLang(l)}
                  style={{
                    ...text('st12', 'semibold', lang === l ? C.text1 : C.text3), height: 26, padding: `0 ${spacing[2] + 2}px`,
                    borderRadius: radius.full, border: 'none', cursor: 'pointer',
                    background: lang === l ? colors.background : 'transparent', boxShadow: lang === l ? shadow.raised : 'none',
                  }}>{l === 'ko' ? '한' : 'EN'}</button>
              ))}
            </div>
            {safety.ready && <IconButton label={t(lang, 'manageTitle')} icon="gear" badge={requestBadge} haspopup="dialog" onClick={() => setManage({})} />}
          </div>
        )}
      </header>

      {/* ── Update banner ── */}
      {codeVersion < EXPECTED_CODE_VERSION && (
        <div style={{ background: colors.background, padding: `0 ${GUTTER}px ${spacing[3]}px`, flexShrink: 0 }}>
          <Callout tone="warning">
            {t(lang, 'updateBannerPre')}<strong style={{ fontWeight: 700 }}>code.js</strong>{t(lang, 'updateBannerPost')}
            {' '}<a href={UPDATE_URL} target="_blank" rel="noreferrer" style={{ ...text('t7', 'bold', colors.grey900), textDecoration: 'underline', textUnderlineOffset: 2 }}>{t(lang, 'downloadBtn')}</a>
          </Callout>
        </div>
      )}

      {/* ── File key prompt ── */}
      {showKeyPrompt && !fileKey && (
        <div style={{ background: colors.background, padding: `0 ${GUTTER}px ${spacing[4]}px`, flexShrink: 0 }}>
          <div style={{ background: colors.blue50, borderRadius: radius.lg, padding: spacing[4] }}>
            <p style={{ ...text('t7', 'semibold', colors.blue700), margin: `0 0 ${spacing[2]}px` }}>{t(lang, 'keyPromptLabel')}</p>
            <div style={{ display: 'flex', gap: spacing[2] }}>
              <TextInput value={customKeyUrl} onChange={e => setCustomKeyUrl(e.target.value)} aria-label={t(lang, 'keyPromptLabel')}
                placeholder="https://www.figma.com/design/..." style={{ flex: 1, minWidth: 0, height: 40, background: colors.background }} />
              <Button size="medium" onClick={() => {
                  if (customKeyUrl) {
                    send({ type: 'SET_CUSTOM_KEY', key: customKeyUrl });
                    if (pendingOpenWeb) {
                      const m = customKeyUrl.trim().match(/figma\.com\/(?:file|design|board)\/([^/?]+)/);
                      const k = m ? m[1] : customKeyUrl.trim();
                      openWebViewer(k);
                    }
                  }
                  setShowKeyPrompt(false);
                  setPendingOpenWeb(false);
                }}>{t(lang, 'saveBtnShort')}</Button>
              <Button size="medium" color="light" variant="weak" onClick={() => setShowKeyPrompt(false)}>{t(lang, 'modalCancel')}</Button>
            </div>
          </div>
        </div>
      )}
      {/* ── Content (animated) ── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <div key={navKey} className={navDir === 'forward' ? 'v-fwd' : 'v-back'}
          style={{ paddingTop: spacing[3], paddingBottom: ctaVisible ? BOTTOM_CTA_SPACE + spacing[4] : spacing[6] }}>
          {!inPinView ? (
            /* ── File list view ── */
            <div style={{ padding: `0 ${GUTTER}px` }}>
              {mergedPages.length === 0 && !showAddPage && (
                <div style={{ padding: `${spacing[8]}px 0 ${spacing[6]}px` }}>
                  <p style={{ ...text('t6', 'semibold', C.text2), margin: 0 }}>{t(lang, 'fileListEmptyTitle')}</p>
                  <p style={{ ...text('t7', 'regular', C.text3), margin: `${spacing[1]}px 0 0` }}>{t(lang, 'fileListEmptyHint')}</p>
                </div>
              )}
              {mergedPages.map(pg => (
                <FileCard key={pg.pageId}
                  pageId={pg.pageId} pageName={pg.pageName} count={pg.pins.length}
                  isCurrent={pg.pageId === currentPageId}
                  onNavigate={() => navigateTo(pg.pageId)}
                  onRename={newName => handleRenamePageGroup(pg.pageId, newName)}
                  onDelete={() => handleDeletePageGroup(pg.pageId)}
                  dragPosition={dragOverPageInfo?.pageId === pg.pageId ? dragOverPageInfo.pos : null}
                  lang={lang}
                  onDragStart={() => { fileDragRef.current = pg.pageId; }}
                  onDragOver={(e, pos) => { e.preventDefault(); setDragOverPageInfo({ pageId: pg.pageId, pos }); }}
                  onDrop={() => {
                    const fromId = fileDragRef.current;
                    const pos = dragOverPageInfo?.pageId === pg.pageId ? dragOverPageInfo.pos : 'before';
                    if (!fromId || fromId === pg.pageId) { setDragOverPageInfo(null); return; }
                    const ids = mergedPages.map(p => p.pageId);
                    reorder(ids, fromId, pg.pageId, pos);
                    setFileOrder(ids);
                    send({ type: 'SET_FILE_ORDER', order: ids });
                    setDragOverPageInfo(null);
                    fileDragRef.current = null;
                  }}
                />
              ))}

              {/* ── 새 파일 추가 form / button ── */}
              {showAddPage ? (
                <div style={{ borderRadius: radius.xl, background: colors.background, padding: spacing[4], marginBottom: spacing[2] }}>
                  <Callout tone="info" style={{ marginBottom: spacing[4] }}>
                    {t(lang, 'addPageCurrentNotice', currentPageName || t(lang, 'unknownPageName'))}
                  </Callout>
                  <FieldLabel htmlFor="add-page-name">{t(lang, 'fileNameLabel')}</FieldLabel>
                  <TextInput
                    id="add-page-name"
                    autoFocus
                    value={addPageName}
                    onChange={e => setAddPageName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const name = addPageName.trim();
                        if (!name) return;
                        setPageStubs(prev => {
                          const f = prev.filter(s => s.pageId !== currentPageId);
                          return [...f, { pageId: currentPageId, pageName: name }];
                        });
                        send({ type: 'ADD_PAGE_STUB', pageName: name });
                        setShowAddPage(false); setAddPageName('');
                      }
                      if (e.key === 'Escape') { setShowAddPage(false); setAddPageName(''); }
                    }}
                    placeholder={currentPageName || t(lang, 'fileNamePlaceholder')}
                  />
                  <p style={{ ...text('st12', 'regular', C.text3), margin: `${spacing[2]}px 0 ${spacing[4]}px` }}>{t(lang, 'fileNameHint')}</p>
                  <div style={{ display: 'flex', gap: spacing[2] }}>
                    <Button color="light" variant="weak" size="large" display="full" style={{ flex: 1 }}
                      onClick={() => { setShowAddPage(false); setAddPageName(''); }}>{t(lang, 'modalCancel')}</Button>
                    <Button size="large" display="full" style={{ flex: 1 }} disabled={!addPageName.trim()}
                      onClick={() => {
                        const name = addPageName.trim();
                        if (!name) return;
                        // Optimistic update: add stub to local state immediately
                        setPageStubs(prev => {
                          const filtered = prev.filter(s => s.pageId !== currentPageId);
                          return [...filtered, { pageId: currentPageId, pageName: name }];
                        });
                        send({ type: 'ADD_PAGE_STUB', pageName: name });
                        setShowAddPage(false); setAddPageName('');
                      }}>{t(lang, 'addBtn')}</Button>
                  </div>
                </div>
              ) : (
                <Button color="light" variant="weak" size="large" display="full" icon="plus"
                  style={{ background: colors.background, color: semantic.textSecondary, marginBottom: spacing[2] }}
                  onClick={() => { setShowAddPage(true); setAddPageName(currentPageName); }}>{t(lang, 'addFileBtn')}</Button>
              )}

              {/* ── Dev Mode 웹 뷰어 진입 ── */}
              <div style={{ marginTop: spacing[6] }}>
                <button type="button" className="tds-row" onClick={() => {
                    if (!fileKey) { setPendingOpenWeb(true); setShowKeyPrompt(true); return; }
                    openWebViewer();
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: spacing[3], width: '100%', padding: spacing[4], border: 'none',
                    borderRadius: radius.xl, background: colors.background, cursor: 'pointer', textAlign: 'left' }}>
                  <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: radius.lg, background: colors.blue50, color: colors.blue500,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                      <path d="M7 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                      <path d="M10 2h4v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M14 2L8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    </svg>
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ ...text('st11', 'semibold', C.text1), display: 'block' }}>{t(lang, 'webViewBtn')}</span>
                    <span style={{ ...text('st12', 'regular', C.text3), display: 'block' }}>{t(lang, 'devModeSectionNote')}</span>
                  </span>
                  <span aria-hidden="true" style={{ color: colors.grey400, display: 'flex' }}><Icon name="chevronRight" size={18} /></span>
                </button>
              </div>
            </div>
          ) : (
            /* ── Pin list view ── */
            <>
              {(() => {
                const editable = isDevMode ? [] : (selectedPage?.pins ?? []).filter(p => canEdit(p, safety.user));
                const drifted = editable.filter(p => p.badgeDrift && !p.badgeMissing);
                const duplicated = editable.filter(p => p.duplicateBadges);
                if (!drifted.length && !duplicated.length) return null;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[2], padding: `0 ${GUTTER}px ${spacing[3]}px` }}>
                    {drifted.length > 0 && <Callout tone="neutral" action={{ label: t(lang, 'driftAction'),
                      onClick: () => send({ type: 'REPOSITION_PINS', pageId: selectedPageId!, ids: drifted.map(p => p.id) }) }}>
                      {t(lang, 'pageDriftBanner', drifted.length)}</Callout>}
                    {duplicated.length > 0 && <Callout tone="warning" action={{ label: t(lang, 'pageDupAction'),
                      onClick: () => send({ type: 'BADGE_CLEANUP', ids: duplicated.map(p => p.id) }) }}>
                      {t(lang, 'pageDupBanner', duplicated.length)}</Callout>}
                  </div>
                );
              })()}
              {renderPinList()}
            </>
          )}
        </div>
      </div>

      {/* ── Toast ── */}
      <Toast toast={toast} bottomOffset={ctaVisible ? BOTTOM_CTA_SPACE + spacing[2] : spacing[5]} />

      {/* ── Number swap confirm ── */}
      {numberConflict && (
        <ConfirmModal
          lang={lang}
          title={t(lang, 'numberSwapTitle')}
          message={t(lang, 'numberSwapMessage', numberConflict.newNumber, numberConflict.conflictPin.title || t(lang, 'noTitleFallback'))}
          confirmLabel={t(lang, 'numberSwapConfirm')}
          onCancel={() => setNumberConflict(null)}
          onConfirm={() => {
            send({ type: 'SET_PIN_NUMBER', id: numberConflict.pin.id, number: numberConflict.newNumber, swapWithId: numberConflict.conflictPin.id });
            setNumberConflict(null);
          }}
        />
      )}

      {/* ── Compact numbers confirm ── */}
      {showCompactConfirm && (
        <ConfirmModal
          lang={lang}
          title={t(lang, 'compactConfirmTitle')}
          message={t(lang, 'compactConfirmMessage')}
          confirmLabel={t(lang, 'compactConfirmBtn')}
          danger
          onCancel={() => setShowCompactConfirm(false)}
          onConfirm={() => {
            send({ type: 'COMPACT_NUMBERS' });
            setShowCompactConfirm(false);
          }}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
