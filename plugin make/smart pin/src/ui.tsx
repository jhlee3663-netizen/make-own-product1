import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { Pin, PinCategory, PageStub, UIMessage, PluginMessage } from './types';
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

const EXPECTED_CODE_VERSION = 6; // code.ts의 CODE_VERSION과 항상 동일하게 유지
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
    '.p-card:active:not(:has(.p-btn:active)):not(:has(textarea:active)):not(:has(input:active)):not(:has([contenteditable]:active)){transform:scale(0.99)}',
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

// ── TDS Color Tokens ─────────────────────────────────────────────────────────
const C = {
  primary:     '#3182F6',
  primaryDark: '#1B64DA',
  bg:          '#F2F4F6',
  card:        '#FFFFFF',
  cardHover:   '#F8F9FA',
  inputBg:     '#F8F9FA',
  text1:       '#191F28',
  text2:       '#4E5968',
  text3:       '#8B95A1',
  line:        '#F2F4F5',
  guideLine:   '#E5E8EB',
  success:     '#00B493',
  error:       '#F04452',
  blue10:      'rgba(49,130,246,0.10)',
  disabledBg:  '#DCEBFF',
  disabledText:'#99C3FF',
} as const;

const CAT_COLOR: Record<PinCategory, string> = {
  design: '#3182F6', descript: '#00B493', dev: '#F5A623', ask: '#F04452',
};
const CAT_LABEL: Record<PinCategory, string> = {
  design: 'Design', descript: 'Descript', dev: 'Dev', ask: 'Ask',
};
const FONT = '-apple-system, "Pretendard", BlinkMacSystemFont, "Segoe UI", sans-serif';

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
        style={{
          width: '100%', padding: '9px 12px',
          border: `1.5px solid ${focused ? C.primary : C.line}`,
          borderRadius: 10, fontSize: 13, lineHeight: 1.5,
          fontFamily: FONT, color: C.text1,
          background: C.inputBg, outline: 'none', boxSizing: 'border-box',
          transition: 'border-color 0.15s',
        }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
          background: C.card, border: `1px solid ${C.line}`,
          borderRadius: 10, marginTop: 4,
          boxShadow: '0 8px 24px rgba(0,0,0,0.10)', overflow: 'hidden',
        }}>
          {filtered.map(s => (
            <div key={s}
              onMouseDown={e => { e.preventDefault(); onChange(s); setOpen(false); }}
              style={{ padding: '9px 12px', fontSize: 13, lineHeight: 1.5, fontFamily: FONT, color: C.text1, cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = C.inputBg; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = C.card; }}
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
        background: '#FFE566', color: 'inherit',
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
        onDragStart={e => e.stopPropagation()}
        style={style}
      />
      {!value && placeholder && (
        <div style={{
          position: 'absolute', top: 9, left: 12, pointerEvents: 'none',
          fontSize: 13, lineHeight: 1.5, fontFamily: FONT, color: C.text3,
        }}>{placeholder}</div>
      )}
    </div>
  );
}

// ── PinCard ──────────────────────────────────────────────────────────────────
function PinCard({ pin, expanded, focused, allGroups, fileKey, inGroup, searchQuery, draggableHint, isReadOnly, lang,
  onExpand, onSave, onAutoSave, onDelete, onNeedFileKey, onSetNumber }: {
  pin: Pin; expanded: boolean; focused: boolean;
  allGroups: string[]; fileKey: string | null; inGroup?: boolean; searchQuery?: string; draggableHint?: boolean; isReadOnly?: boolean; lang: Lang;
  onExpand: () => void; onSave: (p: Pin) => void; onAutoSave: (p: Pin) => void;
  onDelete: (id: string) => void; onNeedFileKey: () => void;
  onSetNumber: (newNumber: number) => void;
}) {
  const cardRef     = useRef<HTMLDivElement>(null);
  const numberInputRef = useRef<HTMLInputElement>(null);
  const contentInputRef = useRef<HTMLDivElement>(null);
  const contentSyncRef = useRef<(() => void) | null>(null);
  const [title, setTitle]         = useState(pin.title);
  const [content, setContent]     = useState(pin.content);
  const [category, setCategory]   = useState<PinCategory>(pin.category);
  const [group, setGroup]         = useState(pin.group ?? '');
  const [copied, setCopied]       = useState(false);
  const [hovered, setHovered]     = useState(false);
  const [editingNumber, setEditingNumber] = useState(false);
  const [numberInput, setNumberInput]     = useState(String(pin.number));
  const syncedRef = useRef({ title: pin.title, content: pin.content, category: pin.category, group: pin.group ?? '' });

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
  const flushAutoSave = () => {
    if (!isDirty()) return;
    const d = draftRef.current;
    onAutoSave({ ...pin, title: d.title, content: d.content, category: d.category, status: pin.status, group: d.group.trim() || undefined });
    syncedRef.current = { ...d };
  };

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

  const markSynced = () => { syncedRef.current = { title, content, category, group }; };
  const doSave    = () => { onSave({ ...pin, title, content, category, status: pin.status,  group: group.trim() || undefined }); markSynced(); };
  const doPend    = () => { onSave({ ...pin, title, content, category, status: 'pending',   group: group.trim() || undefined }); markSynced(); };
  const doRestore = () => { onSave({ ...pin, title, content, category, status: 'todo',      group: group.trim() || undefined }); markSynced(); };

  const toggleDone = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSave({ ...pin, status: isDone ? 'todo' : 'done' });
  };

  const copyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!fileKey) { onNeedFileKey(); return; }
    const nodeId = pin.pinNodeId.replace(':', '-');
    const url = `https://www.figma.com/file/${fileKey}?node-id=${nodeId}`;
    const el = document.createElement('textarea');
    el.value = url;
    el.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(el);
    el.focus(); el.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(el);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const cardBg = (hovered && !expanded) ? C.cardHover : '#FFFFFF';

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    border: `1.5px solid ${C.line}`, borderRadius: 10,
    fontSize: 13, lineHeight: 1.5, fontFamily: FONT,
    color: C.text1, background: C.inputBg, outline: 'none',
    boxSizing: 'border-box',
  };
  const fieldLabel: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: C.text3,
    fontFamily: FONT, display: 'block', marginBottom: 6, lineHeight: 1.5,
  };

  // Margin: when inside group guide container, no horizontal margin (container handles it)
  const outerMargin = inGroup ? '0 0 6px 0' : '0 16px 8px';

  return (
    <div ref={cardRef} className="p-card"
      style={{
        margin: outerMargin, borderRadius: 14,
        background: cardBg,
        border: focused ? `1.5px solid ${C.primary}` : '1.5px solid transparent',
        boxShadow: focused
          ? `0 0 0 3px ${C.blue10}, 0 2px 8px rgba(0,0,0,0.04)`
          : '0 2px 8px rgba(0,0,0,0.04)',
        overflow: 'hidden',
        transition: 'all 0.45s cubic-bezier(0.22,1,0.36,1)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ── Header ── */}
      <div onClick={onExpand} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 14px', cursor: 'pointer', background: '#FFFFFF',
      }}>
        {/* drag handle (visible when this card can be reordered) */}
        {draggableHint && (
          <div title={t(lang, 'dragHint')} style={{
            flexShrink: 0, width: 8, height: 12, marginLeft: -6, marginRight: -2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: 0.35, cursor: 'grab',
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
          <input ref={numberInputRef} type="number" min={1} value={numberInput}
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
              width: 30, height: 26, borderRadius: 9999, flexShrink: 0,
              border: `1.5px solid ${C.primary}`, background: '#FFFFFF',
              color: C.text1, fontSize: 11, fontWeight: 700, fontFamily: FONT,
              textAlign: 'center', outline: 'none', padding: 0, boxSizing: 'border-box',
            }}
          />
        ) : (
          <div onClick={e => { if (isReadOnly) return; e.stopPropagation(); setEditingNumber(true); }}
            onMouseDown={e => e.stopPropagation()}
            title={isReadOnly ? undefined : t(lang, 'numberBadgeHint')}
            style={{
              width: 26, height: 26, borderRadius: 9999, flexShrink: 0,
              background: (isDone || isPending) ? C.text3 : CAT_COLOR[pin.category],
              color: '#FFF', fontSize: 11, fontWeight: 700, fontFamily: FONT,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: (isDone || isPending) ? 0.5 : 1, transition: 'all 0.45s cubic-bezier(0.22,1,0.36,1)',
              cursor: 'pointer',
            }}>{pin.number}</div>
        )}

        {/* title + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{
              fontSize: 14, fontWeight: 600, fontFamily: FONT,
              color: (isDone || isPending) ? C.text3 : C.text1, lineHeight: 1.5,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              textDecoration: (isDone || isPending) ? 'line-through' : 'none', transition: 'color 0.2s',
            }}><HighlightText text={pin.title} query={searchQuery} /></span>
            {isNew && (
              <span style={{
                flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '1px 7px', borderRadius: 9999, background: C.blue10,
                fontSize: 10, fontWeight: 700, fontFamily: FONT, color: C.primary,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: 9999, background: C.primary, display: 'inline-block' }} />
                Updated
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            {pin.group && (
              <span style={{ fontSize: 11, color: C.text3, fontFamily: FONT, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}><HighlightText text={pin.group} query={searchQuery} /></span>
            )}
            {pin.group && <span style={{ color: C.text3, fontSize: 10 }}>·</span>}
            <span style={{ fontSize: 11, fontWeight: 500, fontFamily: FONT, lineHeight: 1.5, color: CAT_COLOR[pin.category] }}>{CAT_LABEL[pin.category]}</span>
          </div>
        </div>

        {/* icon row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button className="p-btn" onClick={copyLink}
            title={fileKey ? t(lang, 'copyLinkTitle') : t(lang, 'copyLinkTitleDisabled')}
            style={{
              width: 28, height: 28, borderRadius: 8, border: 'none',
              background: copied ? C.success + '20' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: copied ? C.success : C.text3, transition: 'all 0.45s cubic-bezier(0.22,1,0.36,1)',
            }}
            onMouseEnter={e => { if (!copied) (e.currentTarget as HTMLButtonElement).style.background = C.line; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = copied ? C.success + '20' : 'transparent'; }}
          >
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M7 9a4.95 4.95 0 007 0l2-2a4.95 4.95 0 00-7-7L8 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M9 7a4.95 4.95 0 00-7 0l-2 2a4.95 4.95 0 007 7l1-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            )}
          </button>

          {!isPending && (
            <button className="p-btn" onClick={toggleDone}
              title={isDone ? t(lang, 'toggleReopenTitle') : t(lang, 'toggleDoneTitle')}
              style={{
                width: 28, height: 28, borderRadius: 9999,
                border: `2px solid ${isDone ? C.success : C.line}`,
                background: isDone ? C.success : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0, transition: 'all 0.45s cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              {isDone && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6.5L5 9L9.5 3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          )}

          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
            style={{ color: C.text3, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.45s cubic-bezier(0.22,1,0.36,1)' }}>
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* ── Content preview (collapsed) ── */}
      {!expanded && pin.content && (
        <div style={{
          padding: '0 14px 12px', background: '#FFFFFF',
          fontSize: 12, color: C.text2, fontFamily: FONT, lineHeight: 1.6,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}><HighlightText text={previewFormattedText(pin.content)} query={searchQuery} /></div>
      )}

      {/* ── Expanded form ── */}
      {expanded && (
        <div style={{
          padding: '16px', background: '#FFFFFF',
          borderTop: `1px solid ${C.line}`,
        }}>
          {isReadOnly ? (
            /* Dev Mode: read-only view */
            <>
              {pin.title && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.text3, fontFamily: FONT, marginBottom: 4 }}>{t(lang, 'fieldTitle')}</div>
                  <div style={{ fontSize: 13, color: C.text1, fontFamily: FONT, lineHeight: 1.6 }}>{pin.title}</div>
                </div>
              )}
              {pin.content && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.text3, fontFamily: FONT, marginBottom: 4 }}>{t(lang, 'fieldContent')}</div>
                  <div style={{ fontSize: 13, color: C.text2, fontFamily: FONT, lineHeight: 1.6, wordBreak: 'break-word' }}><FormattedContent text={pin.content} query={searchQuery} /></div>
                </div>
              )}
              {pin.group && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.text3, fontFamily: FONT, marginBottom: 4 }}>{t(lang, 'fieldGroup')}</div>
                  <div style={{ fontSize: 12, color: C.text2, fontFamily: FONT }}>{pin.group}</div>
                </div>
              )}
            </>
          ) : (
            /* Design Mode: editable form */
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={fieldLabel}>{t(lang, 'fieldTitle')}</label>
                <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); doSave(); } }}
                  onDragStart={e => e.stopPropagation()} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={fieldLabel}>{t(lang, 'fieldContent')} <span style={{ fontWeight: 400, color: C.text3 }}>{t(lang, 'fieldContentHint')}</span></label>
                <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                  <button type="button" className="p-btn" aria-label={t(lang, 'formatBold')} title={`${t(lang, 'formatBold')} (Cmd/Ctrl+B)`}
                    onMouseDown={e => e.preventDefault()} onClick={() => applyFormat('bold')}
                    style={{ width: 30, height: 28, border: `1px solid ${C.line}`, borderRadius: 7, background: C.inputBg, color: C.text2, fontFamily: FONT, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>B</button>
                  <button type="button" className="p-btn" aria-label={t(lang, 'formatItalic')} title={`${t(lang, 'formatItalic')} (Cmd/Ctrl+I)`}
                    onMouseDown={e => e.preventDefault()} onClick={() => applyFormat('italic')}
                    style={{ width: 30, height: 28, border: `1px solid ${C.line}`, borderRadius: 7, background: C.inputBg, color: C.text2, fontFamily: FONT, fontSize: 13, fontStyle: 'italic', cursor: 'pointer' }}>I</button>
                  <button type="button" className="p-btn" aria-label={t(lang, 'formatUnderline')} title={`${t(lang, 'formatUnderline')} (Cmd/Ctrl+U)`}
                    onMouseDown={e => e.preventDefault()} onClick={() => applyFormat('underline')}
                    style={{ width: 30, height: 28, border: `1px solid ${C.line}`, borderRadius: 7, background: C.inputBg, color: C.text2, fontFamily: FONT, fontSize: 13, textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer' }}>U</button>
                  <button type="button" className="p-btn" aria-label={t(lang, 'formatBullet')} title={t(lang, 'formatBullet')}
                    onMouseDown={e => e.preventDefault()} onClick={() => applyFormat('insertUnorderedList')}
                    style={{ width: 34, height: 28, border: `1px solid ${C.line}`, borderRadius: 7, background: C.inputBg, color: C.text2, fontFamily: FONT, fontSize: 16, lineHeight: 1, cursor: 'pointer' }}>•</button>
                </div>
                <div style={{ position: 'relative' }}>
                  <RichTextEditor value={content} onChange={setContent} placeholder={t(lang, 'fieldContentPlaceholder')}
                    editorRef={contentInputRef}
                    syncRef={contentSyncRef}
                    style={{ ...inputStyle, display: 'block', minHeight: 72 }}
                    onKeyDown={e => {
                      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); applyFormat('bold'); }
                      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); applyFormat('italic'); }
                      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'u') { e.preventDefault(); applyFormat('underline'); }
                      else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); doSave(); }
                    }}
                    onSelectionChange={updateSelPopup}
                    onBlur={() => setSelPopup(null)} />
                  {selPopup && createPortal(
                    <div
                      onMouseDown={e => e.preventDefault()}
                      style={{
                        position: 'fixed', top: selPopup.top, left: selPopup.left, zIndex: 50,
                        display: 'flex', gap: 3, padding: 3,
                        background: '#25282D', borderRadius: 8,
                        boxShadow: '0 4px 14px rgba(0,0,0,0.28)',
                      }}
                    >
                      <button type="button" aria-label={t(lang, 'formatBold')} title={t(lang, 'formatBold')}
                        onClick={() => { applyFormat('bold'); updateSelPopup(); }}
                        style={{ width: 26, height: 24, border: 'none', borderRadius: 5, background: 'transparent', color: '#FFF', fontFamily: FONT, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>B</button>
                      <button type="button" aria-label={t(lang, 'formatItalic')} title={t(lang, 'formatItalic')}
                        onClick={() => { applyFormat('italic'); updateSelPopup(); }}
                        style={{ width: 26, height: 24, border: 'none', borderRadius: 5, background: 'transparent', color: '#FFF', fontFamily: FONT, fontSize: 12, fontStyle: 'italic', cursor: 'pointer' }}>I</button>
                      <button type="button" aria-label={t(lang, 'formatUnderline')} title={t(lang, 'formatUnderline')}
                        onClick={() => { applyFormat('underline'); updateSelPopup(); }}
                        style={{ width: 26, height: 24, border: 'none', borderRadius: 5, background: 'transparent', color: '#FFF', fontFamily: FONT, fontSize: 12, textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer' }}>U</button>
                      <button type="button" aria-label={t(lang, 'formatBullet')} title={t(lang, 'formatBullet')}
                        onClick={() => { applyFormat('insertUnorderedList'); setSelPopup(null); }}
                        style={{ width: 26, height: 24, border: 'none', borderRadius: 5, background: 'transparent', color: '#FFF', fontFamily: FONT, fontSize: 14, lineHeight: 1, cursor: 'pointer' }}>•</button>
                    </div>,
                    document.body
                  )}
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={fieldLabel}>{t(lang, 'fieldGroup')}</label>
                <GroupInput value={group} onChange={setGroup} suggestions={allGroups} lang={lang} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={fieldLabel}>{t(lang, 'fieldCategory')}</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(Object.keys(CAT_LABEL) as PinCategory[]).map(cat => (
                    <button key={cat} className="p-btn" onClick={() => setCategory(cat)}
                      style={{
                        padding: '5px 14px', borderRadius: 9999, border: 'none',
                        background: category === cat ? CAT_COLOR[cat] : C.inputBg,
                        color: category === cat ? '#FFF' : C.text2,
                        fontSize: 12, fontWeight: 600, lineHeight: 1.5,
                        fontFamily: FONT, cursor: 'pointer', transition: 'all 0.45s cubic-bezier(0.22,1,0.36,1)',
                      }}>{CAT_LABEL[cat]}</button>
                  ))}
                </div>
              </div>
              <button className="p-btn"
                onClick={doSave}
                style={{
                  width: '100%', height: 44, background: C.primary, color: '#FFF',
                  border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700,
                  lineHeight: 1.5, fontFamily: FONT, cursor: 'pointer', marginBottom: 8,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.primaryDark; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = C.primary; }}
              >{t(lang, 'saveBtn')}</button>
            </>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="p-btn" onClick={copyLink}
              title={fileKey ? 'Copy Figma link' : t(lang, 'copyLinkBtnTitleDisabled')}
              style={{
                flex: 1, height: 38, background: copied ? C.success + '18' : C.inputBg,
                border: 'none', borderRadius: 10, color: copied ? C.success : C.text2,
                fontSize: 13, fontWeight: 600, lineHeight: 1.5, fontFamily: FONT, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all 0.45s cubic-bezier(0.22,1,0.36,1)',
              }}
              onMouseEnter={e => { if (!copied) (e.currentTarget as HTMLButtonElement).style.background = C.cardHover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = copied ? C.success + '18' : C.inputBg; }}
            >
              {copied ? (
                <><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>{t(lang, 'copiedBtn')}</>
              ) : (
                <><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M7 9a4.95 4.95 0 007 0l2-2a4.95 4.95 0 00-7-7L8 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M9 7a4.95 4.95 0 00-7 0l-2 2a4.95 4.95 0 007 7l1-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>{t(lang, 'copyLinkBtn')}</>
              )}
            </button>
            {!isReadOnly && !isPending ? (
              <button className="p-btn" onClick={doPend}
                style={{
                  flex: 1, height: 38, background: 'transparent', border: 'none',
                  borderRadius: 10, color: C.text2, fontSize: 13, fontWeight: 600,
                  lineHeight: 1.5, fontFamily: FONT, cursor: 'pointer', transition: 'all 0.45s cubic-bezier(0.22,1,0.36,1)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.inputBg; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >{t(lang, 'pendingBtn')}</button>
            ) : (
              <button className="p-btn" onClick={doRestore}
                style={{
                  flex: 1, height: 38, background: C.success + '18', border: 'none',
                  borderRadius: 10, color: C.success, fontSize: 13, fontWeight: 600,
                  lineHeight: 1.5, fontFamily: FONT, cursor: 'pointer', transition: 'all 0.45s cubic-bezier(0.22,1,0.36,1)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.success + '28'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = C.success + '18'; }}
              >{t(lang, 'restoreBtn')}</button>
            )}
            {!isReadOnly && (
              <button className="p-btn" onClick={() => onDelete(pin.id)}
                style={{
                  flex: 1, height: 38, background: 'transparent', border: 'none',
                  borderRadius: 10, color: C.error, fontSize: 13, fontWeight: 600,
                  lineHeight: 1.5, fontFamily: FONT, cursor: 'pointer', transition: 'all 0.45s cubic-bezier(0.22,1,0.36,1)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.error + '12'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >{t(lang, 'deleteBtn')}</button>
            )}
          </div>
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
  const [menuOpen, setMenuOpen]   = useState(false);
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

  return (
    <div style={{ position: 'relative', marginBottom: 8 }}>
      {dragPosition === 'before' && (
        <div style={{ position: 'absolute', top: -2, left: 0, right: 0, height: 2,
          background: C.primary, borderRadius: 2, zIndex: 10,
          boxShadow: `0 0 0 3px ${C.blue10}` }} />
      )}
      {dragPosition === 'after' && (
        <div style={{ position: 'absolute', bottom: -2, left: 0, right: 0, height: 2,
          background: C.primary, borderRadius: 2, zIndex: 10,
          boxShadow: `0 0 0 3px ${C.blue10}` }} />
      )}
    <div
      className="p-card"
      draggable={!!onDragStart}
      onDragStart={onDragStart ? e => { e.stopPropagation(); onDragStart(); } : undefined}
      onDragOver={onDragOver ? e => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        onDragOver(e, e.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
      } : undefined}
      onDrop={onDrop ? e => { e.stopPropagation(); onDrop(); } : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 14, background: '#FFFFFF',
        border: '1.5px solid transparent',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
      {/* Backdrop — closes menu when clicking outside */}
      {menuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setMenuOpen(false)} />
      )}
      <div onClick={renaming ? undefined : onNavigate} style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 14px', cursor: renaming ? 'default' : 'pointer',
      }}>
        {/* Drag handle */}
        {onDragStart && (
          <div style={{
            flexShrink: 0, width: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: hovered ? 0.5 : 0, transition: 'opacity 0.2s', cursor: 'grab', marginLeft: -4,
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
        {/* Page icon */}
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: isCurrent ? C.blue10 : C.inputBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2.5" y="1.5" width="11" height="13" rx="1.5"
              stroke={isCurrent ? C.primary : C.text3} strokeWidth="1.4"/>
            <path d="M5 5.5h6M5 8h6M5 10.5h3.5"
              stroke={isCurrent ? C.primary : C.text3} strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </div>
        {/* Name area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {renaming ? (
            <input ref={inputRef} value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  commitRename();
                if (e.key === 'Escape') { setRenameVal(pageName); setRenaming(false); }
              }}
              onBlur={commitRename}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', fontSize: 14, fontWeight: 600, fontFamily: FONT,
                color: C.text1, border: `1.5px solid ${C.primary}`, borderRadius: 8,
                padding: '4px 8px', outline: 'none', background: C.inputBg,
                boxSizing: 'border-box',
              }}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{
                fontSize: 14, fontWeight: 600, fontFamily: FONT, color: C.text1, lineHeight: 1.4,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{pageName}</span>
              {isCurrent && (
                <span style={{
                  flexShrink: 0, fontSize: 10, fontWeight: 700, fontFamily: FONT,
                  color: C.primary, background: C.blue10,
                  padding: '1px 7px', borderRadius: 9999, lineHeight: 1.6,
                }}>{t(lang, 'currentBadge')}</span>
              )}
            </div>
          )}
          <span style={{ fontSize: 11, color: C.text3, fontFamily: FONT, lineHeight: 1.5 }}>
            {t(lang, 'pinCount', count)}
          </span>
        </div>
        {/* Right: more-menu + navigate arrow */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          {/* More button */}
          <div style={{ position: 'relative' }}>
            <button className="p-btn"
              onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
              style={{
                width: 28, height: 28, borderRadius: 8, border: 'none',
                background: menuOpen ? C.inputBg : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: C.text3,
                transition: 'all 0.45s cubic-bezier(0.22,1,0.36,1)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.inputBg; }}
              onMouseLeave={e => { if (!menuOpen) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              <svg width="3" height="13" viewBox="0 0 3 13" fill="none">
                <circle cx="1.5" cy="1.5" r="1.5" fill="currentColor"/>
                <circle cx="1.5" cy="6.5" r="1.5" fill="currentColor"/>
                <circle cx="1.5" cy="11.5" r="1.5" fill="currentColor"/>
              </svg>
            </button>
            {menuOpen && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50,
                background: C.card, borderRadius: 12, overflow: 'hidden',
                boxShadow: '0 8px 24px rgba(0,0,0,0.14)', minWidth: 130,
                border: `1px solid ${C.line}`,
              }}>
                <button
                  onClick={e => { e.stopPropagation(); setRenaming(true); setMenuOpen(false); }}
                  style={{
                    width: '100%', padding: '10px 14px', border: 'none', background: 'none',
                    fontSize: 13, fontWeight: 500, fontFamily: FONT, color: C.text1,
                    cursor: 'pointer', textAlign: 'left', display: 'block',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.inputBg; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                >{t(lang, 'renameMenuItem')}</button>
                <button
                  onClick={e => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
                  style={{
                    width: '100%', padding: '10px 14px', border: 'none', background: 'none',
                    fontSize: 13, fontWeight: 500, fontFamily: FONT, color: C.error,
                    cursor: 'pointer', textAlign: 'left', display: 'block',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.error + '12'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                >{t(lang, 'deleteMenuItem')}</button>
              </div>
            )}
          </div>
          {/* Navigate chevron */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
            style={{ color: C.text3, flexShrink: 0 }}>
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </div>
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
    <div style={{
      position: 'fixed', inset: 0, background: '#FFFFFF',
      display: 'flex', flexDirection: 'column', fontFamily: FONT,
      zIndex: 9999, userSelect: 'none',
    }}>
      {/* Skip */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 16px 0', flexShrink: 0 }}>
        <button onClick={onDone}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.text3, fontFamily: FONT, padding: '4px 8px', borderRadius: 8, lineHeight: 1.5 }}
          onMouseEnter={e => (e.currentTarget.style.color = C.text2)}
          onMouseLeave={e => (e.currentTarget.style.color = C.text3)}
        >{t(lang, 'onboardSkip')}</button>
      </div>

      {/* Illustration + text (animates together on slide change) */}
      <div key={animKey} className="ob-fade"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 28px' }}>
        {illus}
        <div style={{ padding: '22px 4px 0', textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 800, color: C.text1, lineHeight: 1.4, fontFamily: FONT, letterSpacing: '-0.02em' }}>{title}</h2>
          <p style={{ margin: 0, fontSize: 13, color: C.text2, lineHeight: 1.7, fontFamily: FONT, whiteSpace: 'pre-line' }}>{desc}</p>
        </div>
      </div>

      {/* Dot indicators */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '16px 0', flexShrink: 0 }}>
        {SLIDES.map((_, i) => (
          <div key={i} onClick={() => goTo(i)} style={{
            width: slide === i ? 20 : 6, height: 6, borderRadius: 3,
            background: slide === i ? C.primary : C.line,
            cursor: 'pointer', transition: 'all 0.3s ease',
          }} />
        ))}
      </div>

      {/* Navigation buttons */}
      <div style={{ display: 'flex', gap: 8, padding: '0 16px 28px', flexShrink: 0 }}>
        {slide > 0 && (
          <button onClick={prev} className="p-btn"
            style={{ height: 44, background: C.inputBg, border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600, fontFamily: FONT, color: C.text2, cursor: 'pointer', padding: '0 20px', flexShrink: 0 }}>
            {t(lang, 'onboardPrev')}
          </button>
        )}
        <button onClick={next} className="p-btn"
          style={{ flex: 1, height: 44, background: C.primary, border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, fontFamily: FONT, color: '#FFF', cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.background = C.primaryDark)}
          onMouseLeave={e => (e.currentTarget.style.background = C.primary)}
        >{slide === TOTAL - 1 ? t(lang, 'onboardStart') : t(lang, 'onboardNext')}</button>
      </div>
    </div>
  );
}

// ── ConfirmModal ──────────────────────────────────────────────────────────────
function ConfirmModal({ title, message, confirmLabel, danger, onConfirm, onCancel, lang }: {
  title: string; message: React.ReactNode; confirmLabel?: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void; lang: Lang;
}) {
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(15,23,32,0.40)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, boxSizing: 'border-box',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 280, background: C.card, borderRadius: 16,
        padding: '18px 18px 14px', boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
        fontFamily: FONT,
      }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: C.text1, lineHeight: 1.5 }}>
          {title}
        </h3>
        <div style={{ fontSize: 12.5, lineHeight: 1.6, color: C.text2, marginBottom: 16 }}>
          {message}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '8px 14px', borderRadius: 9999, border: 'none',
            background: C.inputBg, color: C.text2,
            fontSize: 12.5, fontWeight: 600, fontFamily: FONT, cursor: 'pointer',
          }}>{t(lang, 'modalCancel')}</button>
          <button onClick={onConfirm} style={{
            padding: '8px 14px', borderRadius: 9999, border: 'none',
            background: danger ? C.error : C.primary, color: '#FFF',
            fontSize: 12.5, fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
          }}>{confirmLabel ?? t(lang, 'modalConfirm')}</button>
        </div>
      </div>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [lang, setLangState]              = useState<Lang>(getInitialLang());
  const setLang = (next: Lang) => { setLangState(next); persistLang(next); };
  const [pins, setPins]                   = useState<Pin[]>([]);
  const [hasSelection, setHasSelection]   = useState(false);
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [focusedId, setFocusedId]         = useState<string | null>(null);
  const [lastGroup, setLastGroup]         = useState('');
  const [lastCategory, setLastCategory]   = useState<PinCategory>('design');
  const [error, setError]                 = useState<string | null>(null);
  const [query, setQuery]                 = useState('');
  const [searchFocus, setSearchFocus]     = useState(false);
  const [fileKey, setFileKey]             = useState<string | null>(null);
  const [codeVersion, setCodeVersion]         = useState<number>(EXPECTED_CODE_VERSION);
  const [collapsedPaths, setCollapsedPaths]   = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter]       = useState<'all' | 'pending'>('all');
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
  const [toast, setToast]                 = useState<string | null>(null);
  const [fileOrder, setFileOrder]               = useState<string[]>([]);
  const [groupOrders, setGroupOrders]           = useState<Record<string, string[]>>({});
  const [pinOrders, setPinOrders]               = useState<Record<string, string[]>>({});
  const [dragOverPageInfo, setDragOverPageInfo]   = useState<{ pageId: string; pos: 'before' | 'after' } | null>(null);
  const [dragOverGroupInfo, setDragOverGroupInfo] = useState<{ path: string; pos: 'before' | 'after' } | null>(null);
  const [dragOverPinInfo, setDragOverPinInfo]     = useState<{ id: string; pos: 'before' | 'after' } | null>(null);
  const [numberConflict, setNumberConflict]       = useState<{ pin: Pin; conflictPin: Pin; newNumber: number } | null>(null);
  const [showCompactConfirm, setShowCompactConfirm] = useState(false);
  const [pageMenuOpen, setPageMenuOpen]           = useState(false);
  const [isDevMode, setIsDevMode]                 = useState(false);
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

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
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
          setIsDevMode(msg.isDevMode ?? false);
          break;
        case 'PAGE_CHANGED':
          setCurrentPageId(msg.pageId);
          setCurrentPageName(msg.pageName ?? '');
          break;
        case 'PIN_ADDED':
          pinsRef.current = [...pinsRef.current, msg.pin];
          setPins(prev => [...prev, msg.pin]);
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
        case 'ERROR':         setError(msg.message); setTimeout(() => setError(null), 3000); break;
      }
    };
    window.addEventListener('message', handler);
    send({ type: 'INIT' });
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleSave = (updated: Pin) => {
    send({ type: 'UPDATE_PIN', pin: updated });
    setLastGroup(updated.group ?? '');
    setLastCategory(updated.category);
    setExpandedId(null);
    showToast(t(lang, 'toastSaved'));
  };

  // Quiet save: debounced while typing, or flushed when a card collapses /
  // another pin opens. No toast, no collapsing — the explicit Save button
  // still does that.
  const handleAutoSave = (updated: Pin) => {
    send({ type: 'UPDATE_PIN', pin: updated });
    setLastGroup(updated.group ?? '');
    setLastCategory(updated.category);
  };

  const handleDelete = (id: string) => {
    // Optimistic update: immediately remove from UI state without waiting for PIN_DELETED
    pinsRef.current = pinsRef.current.filter(p => p.id !== id);
    setPins(prev => prev.filter(p => p.id !== id));
    setExpandedId(null);
    send({ type: 'DELETE_PIN', id });
  };

  const navigateTo = (pageId: string) => {
    selectedPageIdRef.current = pageId;
    setNavDir('forward'); setNavKey(k => k + 1);
    setSelectedPageId(pageId); setQuery(''); setStatusFilter('all');
  };

  const navigateBack = () => {
    selectedPageIdRef.current = null;
    setNavDir('back'); setNavKey(k => k + 1);
    setSelectedPageId(null); setQuery(''); setStatusFilter('all');
  };

  const handleRenamePageGroup = (pageId: string, newName: string) => {
    send({ type: 'RENAME_PAGE_GROUP', pageId, newName });
  };

  const handleDeletePageGroup = (pageId: string) => {
    send({ type: 'DELETE_PAGE_GROUP', pageId });
    if (selectedPageId === pageId) navigateBack();
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
  const pendingCount = useMemo(
    () => (selectedPage?.pins ?? []).filter(p => p.status === 'pending').length,
    [selectedPage]
  );
  const filtered = useMemo(() => {
    let source = selectedPage?.pins ?? [];
    if (statusFilter === 'pending') source = source.filter(p => p.status === 'pending');
    if (!q) return source;
    return source.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.content.toLowerCase().includes(q) ||
      (p.group ?? '').toLowerCase().includes(q));
  }, [selectedPage, q, statusFilter]);

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
    <PinCard key={pin.id} pin={pin} inGroup={inGroup} draggableHint={isDevMode ? false : draggableHint}
      isReadOnly={isDevMode}
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
          draggable={!isExpanded}
          onMouseDownCapture={e => { dragOriginRef.current = e.target as HTMLElement; }}
          onDragStart={e => {
            const origin = dragOriginRef.current;
            if (origin?.closest('input, textarea, button')) { e.preventDefault(); return; }
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
  const OUTER = 16;
  const INDENT = 12;

  const groupHeader = (label: string, count: number, path?: string, depth = 0) => {
    const lvl = Math.min(depth, 2) as 0 | 1 | 2;
    const LBL = {
      0: { fontSize: 12, fontWeight: 800, color: C.text1, spacing: '0.08em', pad: '13px 0 8px' },
      1: { fontSize: 11, fontWeight: 700, color: C.text2, spacing: '0.06em', pad: '9px 0 6px'  },
      2: { fontSize: 10, fontWeight: 600, color: C.text3, spacing: '0.04em', pad: '7px 0 4px'  },
    }[lvl];
    const CHIP = {
      0: { background: C.primary,   color: '#FFF',    fontSize: 11, fontWeight: 700, padding: '2px 9px'  },
      1: { background: C.inputBg,   color: C.text2,   fontSize: 11, fontWeight: 600, padding: '1px 8px'  },
      2: { background: 'transparent', color: C.text3, fontSize: 10, fontWeight: 500, padding: '0 4px'    },
    }[lvl];
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: LBL.pad }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
          {path && (
            <button className="p-btn" onClick={() => togglePath(path)}
              style={{
                width: 16, height: 16, flexShrink: 0, background: 'none', border: 'none',
                cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: lvl === 0 ? C.text2 : C.text3,
                transform: collapsedPaths.has(path) ? 'rotate(-90deg)' : 'none',
                transition: 'transform 0.45s cubic-bezier(0.22,1,0.36,1)',
              }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
          <span style={{
            fontSize: LBL.fontSize, fontWeight: LBL.fontWeight, color: LBL.color,
            textTransform: 'uppercase', letterSpacing: LBL.spacing,
            fontFamily: FONT, lineHeight: 1.5, whiteSpace: 'nowrap',
          }}>{label}</span>
          <div style={{ flex: 1, height: 1, background: lvl === 0 ? C.guideLine : C.line, minWidth: 8 }} />
        </div>
        <span style={{
          flexShrink: 0, fontFamily: FONT, borderRadius: 9999, lineHeight: 1.5, ...CHIP,
        }}>{t(lang, 'itemCount', count)}</span>
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
              <div style={{ display: 'flex', alignItems: 'center', height: 0, overflow: 'visible', marginBottom: -4 }}>
                <svg width="8" height="12" viewBox="0 0 8 12" fill="none"
                  style={{ color: C.text3, opacity: 0.4, cursor: 'grab', marginLeft: -2 }}>
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
                borderLeft: `1.5px solid ${C.guideLine}`,
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
                  draggable
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
        <div style={{ padding: '56px 16px', textAlign: 'center', fontFamily: FONT }}>
          <div style={{ fontSize: 32, marginBottom: 14 }}>📌</div>
          <p style={{ fontSize: 14, fontWeight: 600, color: C.text2, lineHeight: 1.6, margin: 0 }}>
            {q ? t(lang, 'emptySearchTitle', q) : t(lang, 'emptyDefaultTitle').split('\n').map((line, i) => <React.Fragment key={i}>{i > 0 && <br />}{line}</React.Fragment>)}
          </p>
          {!q && <p style={{ fontSize: 12, color: C.text3, lineHeight: 1.6, margin: '6px 0 0', fontFamily: FONT }}>{t(lang, 'emptyHint')}</p>}
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

      {showOnboarding && (
        <Onboarding lang={lang} onDone={() => {
          send({ type: 'ONBOARDING_DONE' });
          setShowOnboarding(false);
        }} />
      )}

      {/* ── Header ── */}
      <div style={{
        background: '#FFFFFF', borderBottom: `1px solid ${C.line}`,
        padding: '14px 16px 12px', flexShrink: 0,
      }}>
        {inPinView ? (
          <>
            {/* Back row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <button className="p-btn" onClick={navigateBack}
                style={{ width: 32, height: 32, borderRadius: 9, border: 'none', background: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: C.text2, flexShrink: 0 }}
                onMouseEnter={e => (e.currentTarget.style.background = C.bg)}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <span style={{
                fontSize: 15, fontWeight: 700, fontFamily: FONT, color: C.text1,
                lineHeight: 1.4, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{selectedPage?.pageName ?? ''}</span>
              {selectedPage && (
                <span style={{ background: C.primary, color: '#FFF', borderRadius: 9999, padding: '2px 9px', fontSize: 11, fontWeight: 700, fontFamily: FONT, lineHeight: 1.5, flexShrink: 0 }}>
                  {selectedPage.pins.length}
                </span>
              )}
              {/* ⋮ 더보기 메뉴 */}
              {!isDevMode && <div style={{ position: 'relative', flexShrink: 0 }}>
                {pageMenuOpen && (
                  <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setPageMenuOpen(false)} />
                )}
                <button className="p-btn" onClick={() => setPageMenuOpen(v => !v)}
                  title={t(lang, 'pageMenuTitle')}
                  style={{
                    width: 32, height: 32, borderRadius: 9, border: 'none',
                    background: pageMenuOpen ? C.bg : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: C.text2,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.bg)}
                  onMouseLeave={e => { if (!pageMenuOpen) e.currentTarget.style.background = 'none'; }}
                >
                  <svg width="3" height="13" viewBox="0 0 3 13" fill="none">
                    <circle cx="1.5" cy="1.5" r="1.5" fill="currentColor"/>
                    <circle cx="1.5" cy="6.5" r="1.5" fill="currentColor"/>
                    <circle cx="1.5" cy="11.5" r="1.5" fill="currentColor"/>
                  </svg>
                </button>
                {pageMenuOpen && (
                  <div style={{
                    position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50,
                    background: C.card, borderRadius: 12, overflow: 'hidden',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.14)', minWidth: 140,
                    border: `1px solid ${C.line}`,
                  }}>
                    <button
                      title={t(lang, 'repositionTitle')}
                      onClick={() => { setPageMenuOpen(false); if (selectedPageId) send({ type: 'REPOSITION_PINS', pageId: selectedPageId }); }}
                      style={{
                        width: '100%', padding: '10px 14px', border: 'none', background: 'none',
                        fontSize: 13, fontWeight: 500, fontFamily: FONT, color: C.text1,
                        cursor: 'pointer', textAlign: 'left', display: 'block',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.inputBg; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                    >{t(lang, 'repositionBtn')}</button>
                    <button
                      title={t(lang, 'compactTitle')}
                      onClick={() => { setPageMenuOpen(false); setShowCompactConfirm(true); }}
                      style={{
                        width: '100%', padding: '10px 14px', border: 'none', background: 'none',
                        fontSize: 13, fontWeight: 500, fontFamily: FONT, color: C.text1,
                        cursor: 'pointer', textAlign: 'left', display: 'block',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.inputBg; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                    >{t(lang, 'compactBtn')}</button>
                  </div>
                )}
              </div>}
            </div>

            {/* Dev Mode banner */}
            {isDevMode && (
              <div style={{
                margin: '0 0 10px', padding: '8px 12px', borderRadius: 10,
                background: 'rgba(255,190,0,0.12)', border: '1px solid rgba(255,190,0,0.35)',
                display: 'flex', alignItems: 'center', gap: 7,
              }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M8 1.5L1 14.5h14L8 1.5z" stroke="#C47F00" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M8 6v4" stroke="#C47F00" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="8" cy="12" r="0.7" fill="#C47F00"/>
                </svg>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#8A5700', fontFamily: FONT, lineHeight: 1.5 }}>
                  {t(lang, 'devModeBanner')}
                </span>
              </div>
            )}

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
                style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: C.text3, pointerEvents: 'none' }}>
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <input type="text" value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => setSearchFocus(true)}
                onBlur={() => setSearchFocus(false)}
                placeholder={t(lang, 'searchPlaceholder')}
                style={{
                  width: '100%', padding: '9px 32px 9px 32px',
                  border: `1.5px solid ${searchFocus ? C.primary : 'transparent'}`,
                  borderRadius: 10, fontSize: 13, lineHeight: 1.5,
                  fontFamily: FONT, color: C.text1,
                  background: searchFocus ? '#FFFFFF' : C.inputBg,
                  outline: 'none', boxSizing: 'border-box',
                  transition: 'all 0.45s cubic-bezier(0.22,1,0.36,1)',
                }}
              />
              {query && (
                <button onClick={() => setQuery('')}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: C.line, border: 'none', cursor: 'pointer', color: C.text3,
                    fontSize: 11, lineHeight: 1, padding: '1px 5px', borderRadius: 9999,
                    display: 'flex', alignItems: 'center' }}>✕</button>
              )}
            </div>

            {/* Status filter tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {([
                { key: 'all' as const, label: t(lang, 'statusAll') },
                { key: 'pending' as const, label: t(lang, 'statusPending', pendingCount) },
              ]).map(({ key, label }) => (
                <button key={key} className="p-btn" onClick={() => setStatusFilter(key)}
                  style={{
                    padding: '4px 12px', borderRadius: 9999,
                    border: `1.5px solid ${statusFilter === key ? C.primary : C.line}`,
                    background: statusFilter === key ? C.blue10 : 'transparent',
                    color: statusFilter === key ? C.primary : C.text3,
                    fontSize: 11, fontWeight: 600, fontFamily: FONT, cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Add Note */}
            {!isDevMode && (
              <>
                <button className="p-btn"
                  onClick={() => send({ type: 'ADD_PIN', category: lastCategory, group: lastGroup })}
                  disabled={!hasSelection}
                  style={{
                    width: '100%', height: 44,
                    background: hasSelection ? C.primary : C.disabledBg,
                    color: hasSelection ? '#FFF' : C.disabledText,
                    border: 'none', borderRadius: 12,
                    fontSize: 14, fontWeight: 700, lineHeight: 1.5, fontFamily: FONT,
                    cursor: hasSelection ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                  onMouseEnter={e => { if (hasSelection) (e.currentTarget as HTMLButtonElement).style.background = C.primaryDark; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = hasSelection ? C.primary : C.disabledBg; }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
                  </svg>
                  Add Note
                </button>
                <p style={{ marginTop: 7, fontSize: 11, textAlign: 'center', fontFamily: FONT, lineHeight: 1.5, color: hasSelection ? C.success : C.text3 }}>
                  {hasSelection ? t(lang, 'selectionSelected') : t(lang, 'selectionNotSelected')}
                </p>
              </>
            )}
          </>
        ) : (
          /* File list view: title row only */
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div dangerouslySetInnerHTML={{ __html: resizeSvg(pinSvg, 18) }} style={{ flexShrink: 0, lineHeight: 0 }} />
              <span style={{ fontSize: 16, fontWeight: 800, fontFamily: FONT, color: C.text1, letterSpacing: '-0.03em', lineHeight: 1.4 }}>
                Smart pin
              </span>
              <button className="p-btn" onClick={() => send({ type: 'INIT' })} title={t(lang, 'refreshTitle')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                  display: 'flex', alignItems: 'center', color: C.text3, borderRadius: 6 }}
                onMouseEnter={e => (e.currentTarget.style.background = C.bg)}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M13.5 8a5.5 5.5 0 11-1.6-3.9M13.5 2v3h-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'inline-flex', background: C.bg, borderRadius: 9999, padding: 2 }}>
                {(['ko', 'en'] as Lang[]).map(l => (
                  <button key={l} className="p-btn" onClick={() => setLang(l)}
                    style={{
                      padding: '3px 9px', borderRadius: 9999, border: 'none',
                      background: lang === l ? C.primary : 'transparent',
                      color: lang === l ? '#FFF' : C.text3,
                      fontSize: 10.5, fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}>{l === 'ko' ? '한' : 'EN'}</button>
                ))}
              </div>
              {pins.length > 0 && (
                <span style={{ background: C.primary, color: '#FFF', borderRadius: 9999, padding: '2px 9px', fontSize: 11, fontWeight: 700, fontFamily: FONT, lineHeight: 1.5 }}>
                  {pins.length}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Update banner ── */}
      {codeVersion < EXPECTED_CODE_VERSION && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px',
          background: '#FFF8EC',
          borderBottom: `1px solid #FFD87A`,
          flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <path d="M8 2.5L14 13.5H2L8 2.5Z" stroke="#F5A623" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M8 6.5v3" stroke="#F5A623" strokeWidth="1.6" strokeLinecap="round"/>
            <circle cx="8" cy="11.2" r="0.8" fill="#F5A623"/>
          </svg>
          <span style={{ flex: 1, fontSize: 12, fontFamily: FONT, lineHeight: 1.5, color: '#7A4F00' }}>
            {t(lang, 'updateBannerPre')}
            <strong style={{ fontWeight: 700 }}>code.js</strong>{t(lang, 'updateBannerPost')}
          </span>
          <a href={UPDATE_URL} target="_blank" rel="noreferrer"
            style={{
              flexShrink: 0, fontSize: 12, fontWeight: 700, fontFamily: FONT,
              color: '#FFFFFF', background: '#F5A623',
              padding: '5px 11px', borderRadius: 8,
              textDecoration: 'none', lineHeight: 1.5,
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#D4891C')}
            onMouseLeave={e => (e.currentTarget.style.background = '#F5A623')}
          >{t(lang, 'downloadBtn')}</a>
        </div>
      )}

      {/* ── File key prompt ── */}
      {showKeyPrompt && !fileKey && (
        <div style={{ padding: '10px 14px', background: C.blue10, borderBottom: `1px solid ${C.line}` }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: C.primary, margin: '0 0 7px', lineHeight: 1.5, fontFamily: FONT }}>
            {t(lang, 'keyPromptLabel')}
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={customKeyUrl} onChange={e => setCustomKeyUrl(e.target.value)}
              placeholder="https://www.figma.com/design/..."
              style={{ flex: 1, padding: '7px 10px', fontSize: 12, lineHeight: 1.5,
                borderRadius: 8, border: `1.5px solid ${C.primary}`,
                outline: 'none', minWidth: 0, fontFamily: FONT,
                boxSizing: 'border-box', background: C.card, color: C.text1 }} />
            <button onClick={() => {
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
              }}
              style={{ background: C.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '0 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
              {t(lang, 'saveBtnShort')}
            </button>
            <button onClick={() => setShowKeyPrompt(false)}
              style={{ background: 'transparent', color: C.text2, border: 'none', borderRadius: 8, padding: '0 10px', fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>
              {t(lang, 'modalCancel')}
            </button>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div style={{ margin: '8px 12px 0', padding: '10px 14px', background: C.error + '12', borderRadius: 12, fontSize: 13, lineHeight: 1.5, fontFamily: FONT, color: C.error }}>
          {error}
        </div>
      )}

      {/* ── Content (animated) ── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <div key={navKey} className={navDir === 'forward' ? 'v-fwd' : 'v-back'}
          style={{ paddingTop: 12, paddingBottom: 24 }}>
          {!inPinView ? (
            /* ── File list view ── */
            <div style={{ padding: '0 16px' }}>
              {mergedPages.length === 0 && !showAddPage && (
                <div style={{ padding: '40px 0 24px', textAlign: 'center', fontFamily: FONT }}>
                  <div style={{ fontSize: 32, marginBottom: 14 }}>📌</div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: C.text2, lineHeight: 1.6, margin: 0 }}>
                    {t(lang, 'fileListEmptyTitle')}
                  </p>
                  <p style={{ fontSize: 12, color: C.text3, lineHeight: 1.6, margin: '6px 0 0', fontFamily: FONT }}>
                    {t(lang, 'fileListEmptyHint')}
                  </p>
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
                <div style={{
                  borderRadius: 14, background: '#FFFFFF',
                  border: `1.5px solid ${C.primary}`,
                  boxShadow: `0 0 0 3px ${C.blue10}`,
                  padding: '14px 14px 12px', marginBottom: 8,
                }}>
                  {/* Current page notice */}
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 7,
                    padding: '9px 11px', marginBottom: 12,
                    background: C.blue10, borderRadius: 10,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                      <circle cx="8" cy="8" r="6.5" stroke={C.primary} strokeWidth="1.4"/>
                      <path d="M8 7v4" stroke={C.primary} strokeWidth="1.6" strokeLinecap="round"/>
                      <circle cx="8" cy="5.2" r="0.8" fill={C.primary}/>
                    </svg>
                    <span style={{ fontSize: 11, fontFamily: FONT, lineHeight: 1.55, color: C.primary }}>
                      {t(lang, 'addPageCurrentNotice', currentPageName || t(lang, 'unknownPageName'))}
                    </span>
                  </div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.text3, fontFamily: FONT, marginBottom: 6, letterSpacing: '0.04em' }}>
                    {t(lang, 'fileNameLabel')}
                  </label>
                  <input
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
                    style={{
                      width: '100%', padding: '9px 12px', fontSize: 13, lineHeight: 1.5,
                      fontFamily: FONT, color: C.text1, border: `1.5px solid ${C.line}`,
                      borderRadius: 10, outline: 'none', background: C.inputBg,
                      boxSizing: 'border-box', marginBottom: 6,
                    }}
                  />
                  <p style={{ margin: '0 0 12px', fontSize: 11, color: C.text3, fontFamily: FONT, lineHeight: 1.5 }}>
                    {t(lang, 'fileNameHint')}
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="p-btn"
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
                      }}
                      style={{
                        flex: 1, height: 40, background: addPageName.trim() ? C.primary : C.disabledBg,
                        color: addPageName.trim() ? '#FFF' : C.disabledText,
                        border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700,
                        fontFamily: FONT, cursor: addPageName.trim() ? 'pointer' : 'default',
                      }}
                    >{t(lang, 'addBtn')}</button>
                    <button className="p-btn"
                      onClick={() => { setShowAddPage(false); setAddPageName(''); }}
                      style={{
                        flex: 1, height: 40, background: C.inputBg, color: C.text2,
                        border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600,
                        fontFamily: FONT, cursor: 'pointer',
                      }}
                    >{t(lang, 'modalCancel')}</button>
                  </div>
                </div>
              ) : (
                <button className="p-btn"
                  onClick={() => { setShowAddPage(true); setAddPageName(currentPageName); }}
                  style={{
                    width: '100%', height: 44, background: 'transparent',
                    border: `1.5px dashed ${C.guideLine}`, borderRadius: 14,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    fontSize: 13, fontWeight: 600, fontFamily: FONT, color: C.text2,
                    cursor: 'pointer', marginBottom: 8,
                    transition: 'all 0.45s cubic-bezier(0.22,1,0.36,1)',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = C.inputBg;
                    (e.currentTarget as HTMLButtonElement).style.borderColor = C.primary;
                    (e.currentTarget as HTMLButtonElement).style.color = C.primary;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                    (e.currentTarget as HTMLButtonElement).style.borderColor = C.guideLine;
                    (e.currentTarget as HTMLButtonElement).style.color = C.text2;
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  {t(lang, 'addFileBtn')}
                </button>
              )}

              {/* ── Dev Mode 웹 뷰어 진입 ── */}
              <div style={{
                marginTop: 16,
                paddingTop: 16,
                borderTop: `1px solid ${C.guideLine}`,
              }}>
                <p style={{
                  fontSize: 11.5, color: C.text3, fontFamily: FONT,
                  lineHeight: 1.6, marginBottom: 10, textAlign: 'center',
                }}>{t(lang, 'devModeSectionNote')}</p>
                <button className="p-btn"
                  onClick={() => {
                    if (!fileKey) { setPendingOpenWeb(true); setShowKeyPrompt(true); return; }
                    openWebViewer();
                  }}
                  style={{
                    width: '100%', height: 40,
                    background: C.blue10, color: C.primary,
                    border: `1px solid rgba(49,130,246,0.18)`,
                    borderRadius: 10,
                    fontSize: 13, fontWeight: 600, fontFamily: FONT,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(49,130,246,0.16)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = C.blue10; }}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M7 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    <path d="M10 2h4v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 2L8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                  {t(lang, 'webViewBtn')}
                </button>
              </div>
            </div>
          ) : (
            /* ── Pin list view ── */
            renderPinList()
          )}
        </div>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: C.text1, color: '#FFF', padding: '10px 18px', borderRadius: 12,
          fontSize: 13, lineHeight: 1.5, fontWeight: 600, fontFamily: FONT,
          zIndex: 1000, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', whiteSpace: 'nowrap',
        }}>{toast}</div>
      )}

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
