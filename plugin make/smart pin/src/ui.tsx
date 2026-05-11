import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { Pin, PinCategory, PageStub, UIMessage, PluginMessage } from './types';
import pinSvg from './pin.svg';

function resizeSvg(svg: string, size: number): string {
  return svg.replace(/(<svg[^>]*)\swidth="[^"]*"/, `$1 width="${size}"`)
            .replace(/(<svg[^>]*)\sheight="[^"]*"/, `$1 height="${size}"`);
}

function send(msg: UIMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

const EXPECTED_CODE_VERSION = 2; // code.ts의 CODE_VERSION과 항상 동일하게 유지
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
    '.p-card:active:not(:has(.p-btn:active)):not(:has(textarea:active)):not(:has(input:active)){transform:scale(0.99)}',
    '.p-btn{transition:transform 0.45s cubic-bezier(0.22,1,0.36,1)}',
    '.p-btn:active{transform:scale(0.99)}',
    // View navigation slide animations
    '@keyframes vFwd{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}',
    '@keyframes vBack{from{opacity:0;transform:translateX(-24px)}to{opacity:1;transform:none}}',
    '.v-fwd{animation:vFwd 0.32s cubic-bezier(0.22,1,0.36,1) both}',
    '.v-back{animation:vBack 0.32s cubic-bezier(0.22,1,0.36,1) both}',
    '@keyframes obFade{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}',
    '.ob-fade{animation:obFade 0.35s cubic-bezier(0.22,1,0.36,1) both}',
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
function GroupInput({ value, onChange, suggestions }: {
  value: string; onChange: (v: string) => void; suggestions: string[];
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
        placeholder="/를 눌러 그룹 안에 그룹을 만들 수 있어요"
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

// ── AutoTextarea ─────────────────────────────────────────────────────────────
function AutoTextarea({ value, onChange, placeholder, style, onKeyDown }: {
  value: string; onChange: (v: string) => void; placeholder?: string; style?: React.CSSProperties;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight, 72) + 'px';
  }, [value]);
  return (
    <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      onKeyDown={onKeyDown}
      onDragStart={e => e.stopPropagation()}
      style={{ resize: 'none', overflow: 'hidden', minHeight: 72, ...style }} />
  );
}

// ── PinCard ──────────────────────────────────────────────────────────────────
function PinCard({ pin, expanded, focused, allGroups, fileKey, inGroup, searchQuery,
  onExpand, onSave, onDelete, onNeedFileKey }: {
  pin: Pin; expanded: boolean; focused: boolean;
  allGroups: string[]; fileKey: string | null; inGroup?: boolean; searchQuery?: string;
  onExpand: () => void; onSave: (p: Pin) => void;
  onDelete: (id: string) => void; onNeedFileKey: () => void;
}) {
  const cardRef     = useRef<HTMLDivElement>(null);
  const [title, setTitle]         = useState(pin.title);
  const [content, setContent]     = useState(pin.content);
  const [category, setCategory]   = useState<PinCategory>(pin.category);
  const [group, setGroup]         = useState(pin.group ?? '');
  const [copied, setCopied]       = useState(false);
  const [hovered, setHovered]     = useState(false);

  useEffect(() => {
    setTitle(pin.title); setContent(pin.content);
    setCategory(pin.category); setGroup(pin.group ?? '');
  }, [pin.id]);

  useEffect(() => {
    if (focused) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focused]);

  const isDone    = pin.status === 'done';
  const isPending = pin.status === 'pending';
  const isNew     = isRecentlyUpdated(pin.updatedAt);

  const doSave    = () => onSave({ ...pin, title, content, category, status: pin.status,  group: group.trim() || undefined });
  const doPend    = () => onSave({ ...pin, title, content, category, status: 'pending',   group: group.trim() || undefined });
  const doRestore = () => onSave({ ...pin, title, content, category, status: 'todo',      group: group.trim() || undefined });

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
        {/* number badge */}
        <div style={{
          width: 26, height: 26, borderRadius: 9999, flexShrink: 0,
          background: (isDone || isPending) ? C.text3 : CAT_COLOR[pin.category],
          color: '#FFF', fontSize: 11, fontWeight: 700, fontFamily: FONT,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: (isDone || isPending) ? 0.5 : 1, transition: 'all 0.45s cubic-bezier(0.22,1,0.36,1)',
        }}>{pin.number}</div>

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
            title={fileKey ? '링크 복사' : '팀 스페이스 파일에서 사용 가능'}
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
              title={isDone ? '다시 열기' : '완료 처리'}
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
        }}><HighlightText text={pin.content} query={searchQuery} /></div>
      )}

      {/* ── Expanded form ── */}
      {expanded && (
        <div style={{
          padding: '16px', background: '#FFFFFF',
          borderTop: `1px solid ${C.line}`,
        }}>
          <div style={{ marginBottom: 12 }}>
            <label style={fieldLabel}>제목</label>
            <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); doSave(); } }}
              onDragStart={e => e.stopPropagation()} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={fieldLabel}>내용 <span style={{ fontWeight: 400, color: C.text3 }}>(Cmd+Enter로 저장)</span></label>
            <AutoTextarea value={content} onChange={setContent} placeholder="내용을 입력하세요"
              style={{ ...inputStyle, display: 'block' }}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); doSave(); } }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={fieldLabel}>그룹</label>
            <GroupInput value={group} onChange={setGroup} suggestions={allGroups} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={fieldLabel}>카테고리</label>
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
          >저장하기</button>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="p-btn" onClick={copyLink}
              title={fileKey ? 'Copy Figma link' : '팀 스페이스 파일에서만 사용 가능'}
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
                <><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>복사됨!</>
              ) : (
                <><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M7 9a4.95 4.95 0 007 0l2-2a4.95 4.95 0 00-7-7L8 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M9 7a4.95 4.95 0 00-7 0l-2 2a4.95 4.95 0 007 7l1-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>링크 복사</>
              )}
            </button>
            {!isPending ? (
              <button className="p-btn" onClick={doPend}
                style={{
                  flex: 1, height: 38, background: 'transparent', border: 'none',
                  borderRadius: 10, color: C.text2, fontSize: 13, fontWeight: 600,
                  lineHeight: 1.5, fontFamily: FONT, cursor: 'pointer', transition: 'all 0.45s cubic-bezier(0.22,1,0.36,1)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.inputBg; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >보류</button>
            ) : (
              <button className="p-btn" onClick={doRestore}
                style={{
                  flex: 1, height: 38, background: C.success + '18', border: 'none',
                  borderRadius: 10, color: C.success, fontSize: 13, fontWeight: 600,
                  lineHeight: 1.5, fontFamily: FONT, cursor: 'pointer', transition: 'all 0.45s cubic-bezier(0.22,1,0.36,1)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.success + '28'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = C.success + '18'; }}
              >복구</button>
            )}
            <button className="p-btn" onClick={() => onDelete(pin.id)}
              style={{
                flex: 1, height: 38, background: 'transparent', border: 'none',
                borderRadius: 10, color: C.error, fontSize: 13, fontWeight: 600,
                lineHeight: 1.5, fontFamily: FONT, cursor: 'pointer', transition: 'all 0.45s cubic-bezier(0.22,1,0.36,1)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.error + '12'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >완전삭제</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ResizeHandle ─────────────────────────────────────────────────────────────
function ResizeHandle() {
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX, startY = e.clientY;
    const startW = window.innerWidth, startH = window.innerHeight;
    const onMove = (ev: PointerEvent) => {
      send({ type: 'RESIZE',
        width:  Math.max(300, Math.round(startW + ev.clientX - startX)),
        height: Math.max(400, Math.round(startH + ev.clientY - startY)),
      });
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
  return (
    <div onPointerDown={onPointerDown}
      style={{ position: 'fixed', bottom: 0, right: 0, width: 18, height: 18, cursor: 'nwse-resize',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: '0 3px 3px 0', zIndex: 100 }}>
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
        <path d="M8 1L1 8" stroke={C.line} strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M8 5L5 8" stroke={C.line} strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

// ── FileCard ──────────────────────────────────────────────────────────────────
function FileCard({ pageId, pageName, count, isCurrent, onNavigate, onRename, onDelete,
  onDragStart, onDragOver, onDrop, dragPosition }: {
  pageId: string; pageName: string; count: number; isCurrent: boolean;
  onNavigate: () => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent, pos: 'before' | 'after') => void;
  onDrop?: () => void;
  dragPosition?: 'before' | 'after' | null;
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
                }}>현재</span>
              )}
            </div>
          )}
          <span style={{ fontSize: 11, color: C.text3, fontFamily: FONT, lineHeight: 1.5 }}>
            핀 {count}개
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
                >이름 수정</button>
                <button
                  onClick={e => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
                  style={{
                    width: '100%', padding: '10px 14px', border: 'none', background: 'none',
                    fontSize: 13, fontWeight: 500, fontFamily: FONT, color: C.error,
                    cursor: 'pointer', textAlign: 'left', display: 'block',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.error + '12'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                >삭제</button>
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

function Onboarding({ onDone }: { onDone: () => void }) {
  const [slide, setSlide] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const TOTAL = 4;

  const goTo = (i: number) => { setSlide(i); setAnimKey(k => k + 1); };
  const next  = () => slide < TOTAL - 1 ? goTo(slide + 1) : onDone();
  const prev  = () => { if (slide > 0) goTo(slide - 1); };

  const SLIDES = [
    {
      title: '레이어를 선택하세요',
      desc: '피그마 캔버스에서 핀을 달고 싶은\n레이어를 클릭해 선택해주세요.',
      illus: <IllustSelect />,
    },
    {
      title: 'Add Note로 핀을 추가하세요',
      desc: '레이어를 선택한 뒤 Add Note 버튼을\n누르면 핀이 바로 생성돼요.',
      illus: <IllustAddNote />,
    },
    {
      title: '내용과 상태를 기록하세요',
      desc: '제목·내용·카테고리·그룹을 편집하고\n완료·보류 상태를 관리할 수 있어요.',
      illus: <IllustEdit />,
    },
    {
      title: '팀원과 함께 관리하세요',
      desc: '모든 핀은 파일에 저장돼\n팀원 누구나 함께 확인하고 편집할 수 있어요.',
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
        >건너뛰기</button>
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
            이전
          </button>
        )}
        <button onClick={next} className="p-btn"
          style={{ flex: 1, height: 44, background: C.primary, border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, fontFamily: FONT, color: '#FFF', cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.background = C.primaryDark)}
          onMouseLeave={e => (e.currentTarget.style.background = C.primary)}
        >{slide === TOTAL - 1 ? '시작하기' : '다음'}</button>
      </div>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────
function App() {
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
  const [toast, setToast]                 = useState<string | null>(null);
  const [fileOrder, setFileOrder]               = useState<string[]>([]);
  const [groupOrders, setGroupOrders]           = useState<Record<string, string[]>>({});
  const [dragOverPageInfo, setDragOverPageInfo]   = useState<{ pageId: string; pos: 'before' | 'after' } | null>(null);
  const [dragOverGroupInfo, setDragOverGroupInfo] = useState<{ path: string; pos: 'before' | 'after' } | null>(null);
  const focusTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileDragRef        = useRef<string | null>(null);
  const groupDragRef       = useRef<string | null>(null);
  const dragOriginRef      = useRef<HTMLElement | null>(null);
  const pinsRef            = useRef<Pin[]>([]);          // always-current snapshot for async handlers
  const selectedPageIdRef  = useRef<string | null>(null);

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
          setShowOnboarding(!msg.onboardingDone);
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
    showToast('저장했어요');
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
        map.set(pid, { pageId: pid, pageName: pin.pageName || '(이전 버전 핀)', pins: [] });
      }
      map.get(pid)!.pins.push(pin);
    });
    return [...map.values()];
  }, [pins]);

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

  // ── Card factory ────────────────────────────────────────────────────────
  const makeCard = (pin: Pin, inGroup = false) => (
    <PinCard key={pin.id} pin={pin} inGroup={inGroup}
      expanded={expandedId === pin.id} focused={focusedId === pin.id}
      allGroups={allGroups} fileKey={fileKey} searchQuery={query.trim() || undefined}
      onExpand={() => {
        const opening = expandedId !== pin.id;
        setExpandedId(opening ? pin.id : null);
        if (opening) send({ type: 'FOCUS_PIN', pinNodeId: pin.pinNodeId });
      }}
      onSave={handleSave} onDelete={handleDelete}
      onNeedFileKey={() => setShowKeyPrompt(true)}
    />
  );

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
        }}>{count}개</span>
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
                {node.pins.map(pin => makeCard(pin, true))}
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
            {q ? <>"{q}"에 대한 결과가 없어요</> : <>레이어를 선택하고<br />Add Note를 눌러주세요</>}
          </p>
          {!q && <p style={{ fontSize: 12, color: C.text3, lineHeight: 1.6, margin: '6px 0 0', fontFamily: FONT }}>핀을 추가하면 여기에 목록이 표시돼요</p>}
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
              {groupHeader('기타', pgUngrouped.length, '__ungrouped__', 0)}
              {!collapsedPaths.has('__ungrouped__') && pgUngrouped.map(pin => makeCard(pin, true))}
            </div>
          </>
        )}
      </>
    ) : (
      <div style={{ padding: `0 ${OUTER}px` }}>
        {filtered.map(pin => makeCard(pin, true))}
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
        <Onboarding onDone={() => {
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
            </div>

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
                placeholder="핀 검색..."
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
                { key: 'all' as const, label: '전체' },
                { key: 'pending' as const, label: `보류${pendingCount > 0 ? ` ${pendingCount}` : ''}` },
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
              {hasSelection ? '레이어가 선택되었어요' : '레이어를 먼저 선택해주세요'}
            </p>
          </>
        ) : (
          /* File list view: title row only */
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div dangerouslySetInnerHTML={{ __html: resizeSvg(pinSvg, 18) }} style={{ flexShrink: 0, lineHeight: 0 }} />
              <span style={{ fontSize: 16, fontWeight: 800, fontFamily: FONT, color: C.text1, letterSpacing: '-0.03em', lineHeight: 1.4 }}>
                imbc_smart pin
              </span>
              <button className="p-btn" onClick={() => send({ type: 'INIT' })} title="새로고침"
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
            {pins.length > 0 && (
              <span style={{ background: C.primary, color: '#FFF', borderRadius: 9999, padding: '2px 9px', fontSize: 11, fontWeight: 700, fontFamily: FONT, lineHeight: 1.5 }}>
                {pins.length}
              </span>
            )}
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
            플러그인 업데이트가 필요해요.{' '}
            <strong style={{ fontWeight: 700 }}>code.js</strong>를 다시 받아주세요.
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
          >다운로드</a>
        </div>
      )}

      {/* ── File key prompt ── */}
      {showKeyPrompt && !fileKey && (
        <div style={{ padding: '10px 14px', background: C.blue10, borderBottom: `1px solid ${C.line}` }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: C.primary, margin: '0 0 7px', lineHeight: 1.5, fontFamily: FONT }}>
            파일 공유 링크를 붙여넣어주세요
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={customKeyUrl} onChange={e => setCustomKeyUrl(e.target.value)}
              placeholder="https://www.figma.com/design/..."
              style={{ flex: 1, padding: '7px 10px', fontSize: 12, lineHeight: 1.5,
                borderRadius: 8, border: `1.5px solid ${C.primary}`,
                outline: 'none', minWidth: 0, fontFamily: FONT,
                boxSizing: 'border-box', background: C.card, color: C.text1 }} />
            <button onClick={() => { if (customKeyUrl) send({ type: 'SET_CUSTOM_KEY', key: customKeyUrl }); setShowKeyPrompt(false); }}
              style={{ background: C.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '0 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
              저장
            </button>
            <button onClick={() => setShowKeyPrompt(false)}
              style={{ background: 'transparent', color: C.text2, border: 'none', borderRadius: 8, padding: '0 10px', fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>
              취소
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
                    아직 등록된 파일이 없어요
                  </p>
                  <p style={{ fontSize: 12, color: C.text3, lineHeight: 1.6, margin: '6px 0 0', fontFamily: FONT }}>
                    아래 버튼으로 파일을 추가해보세요
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
                      현재 피그마 페이지 <strong style={{ fontWeight: 700 }}>"{currentPageName || '(알 수 없음)'}"</strong>에 파일이 등록됩니다.{'\u00A0'}
                      다른 페이지에 추가하려면 해당 페이지로 이동 후 다시 시도해주세요.
                    </span>
                  </div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.text3, fontFamily: FONT, marginBottom: 6, letterSpacing: '0.04em' }}>
                    파일 이름
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
                    placeholder={currentPageName || '페이지 이름 입력'}
                    style={{
                      width: '100%', padding: '9px 12px', fontSize: 13, lineHeight: 1.5,
                      fontFamily: FONT, color: C.text1, border: `1.5px solid ${C.line}`,
                      borderRadius: 10, outline: 'none', background: C.inputBg,
                      boxSizing: 'border-box', marginBottom: 6,
                    }}
                  />
                  <p style={{ margin: '0 0 12px', fontSize: 11, color: C.text3, fontFamily: FONT, lineHeight: 1.5 }}>
                    피그마 드래프트 내 개별 페이지와 동일한 이름으로 만들어주세요.
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
                    >추가</button>
                    <button className="p-btn"
                      onClick={() => { setShowAddPage(false); setAddPageName(''); }}
                      style={{
                        flex: 1, height: 40, background: C.inputBg, color: C.text2,
                        border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600,
                        fontFamily: FONT, cursor: 'pointer',
                      }}
                    >취소</button>
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
                  새 파일 추가
                </button>
              )}
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
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
