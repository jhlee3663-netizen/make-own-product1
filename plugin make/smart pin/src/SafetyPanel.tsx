// Management flows (requests, collaborators, history, trash, admins, backup).
// Screens are a push/pop stack of ListRow hubs; anything destructive or
// reason-bearing goes through a bottom sheet. Permission checks here only
// decide what to *show* — code.ts re-validates every message.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pin, PinRequest, PinRevision, PinUser, SafetyState, UIMessage } from './types';
import { canEdit, canRestore, isAdmin, isOwner } from './safety';
import { colors, spacing, radius, text, semantic, z, GUTTER } from './tds';
import {
  Avatar, Badge, BottomSheet, Button, Callout, Divider, EmptyState, FilterChips, Icon, IconButton, IconTile, ListHeader, ListRow,
  Menu, MenuItem, NavBar, Paragraph, SegmentedControl, SheetCTA, TextArea, TextButton, TextInput,
} from './tds-ui';

type Action = Extract<UIMessage, { type: 'SAFETY' }>;
export type RequestKind = PinRequest['kind'];
export type ManageEntry = { id?: string; view?: 'requests' | 'people' | 'history'; kind?: RequestKind; screen?: 'inbox' };

type View =
  | { name: 'home' } | { name: 'inbox' } | { name: 'trash' } | { name: 'admin' } | { name: 'backup' }
  | { name: 'pin'; id: string } | { name: 'pinRequests'; id: string } | { name: 'pinPeople'; id: string } | { name: 'pinHistory'; id: string };

type Confirm = { msg: Action; title: string; description: string; confirmLabel: string; tone?: 'danger' };
type Picker = { title: string; description: string; exclude: string[]; onPick: (u: PinUser) => void };

const KIND: Record<RequestKind, { label: string; color: 'grey' | 'blue' | 'red' | 'yellow'; help: string }> = {
  comment: { label: '의견', color: 'grey', help: '작성자에게 남기는 메모예요. 원문은 바뀌지 않아요.' },
  edit: { label: '수정 요청', color: 'blue', help: '원문을 고쳐야 할 때 작성자에게 요청해요.' },
  delete: { label: '삭제 요청', color: 'red', help: '작성자나 관리자가 승인하면 휴지통으로 이동해요.' },
  claim: { label: '작성자 등록 요청', color: 'yellow', help: '이 핀을 직접 작성했다면 관리자 확인 후 작성자로 등록돼요.' },
};

const fmt = (at: number) => new Date(at).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
// The inbox holds what other people left for me: every unresolved comment or
// request on pins I own, plus — for administrators — the decisions only they
// can make elsewhere (authorship claims, deletion requests on others' pins).
// An administrator's own claim or deletion request still needs a decision, so
// it stays in their inbox; otherwise a sole admin could never approve it.
const inInbox = (p: Pin, r: PinRequest, user: PinUser | null, admin: boolean) =>
  !r.resolvedAt && !p.deletedAt && !!user &&
  (isOwner(p, user) ? r.actor.id !== user.id : admin && r.kind !== 'comment');

export function inboxItems(pins: Pin[], state: SafetyState): { pin: Pin; request: PinRequest }[] {
  const admin = isAdmin(state.admins, state.user);
  return pins.flatMap(pin => (pin.requests || []).filter(r => inInbox(pin, r, state.user, admin)).map(request => ({ pin, request })))
    .sort((a, b) => b.request.at - a.request.at);
}

/** Closing a comment is acknowledgement, not a decision: no reason prompt. */
const ACK_REASON = '의견 확인';

export function SafetyPanel({ pins, state, entry, history, errorKey, send, onClose, onToast, onShowWhatsNew }: {
  pins: Pin[]; state: SafetyState; entry: ManageEntry; history: { id: string; revisions: PinRevision[] } | null;
  errorKey: number; send: (msg: UIMessage) => void; onClose: () => void; onToast: (message: string, tone?: 'error') => void;
  onShowWhatsNew: () => void;
}) {
  const initialStack = (): View[] => {
    if (!entry.id) return entry.screen === 'inbox' ? [{ name: 'home' }, { name: 'inbox' }] : [{ name: 'home' }];
    const base: View[] = [{ name: 'pin', id: entry.id }];
    if (entry.view === 'requests') base.push({ name: 'pinRequests', id: entry.id });
    if (entry.view === 'people') base.push({ name: 'pinPeople', id: entry.id });
    if (entry.view === 'history') base.push({ name: 'pinHistory', id: entry.id });
    return base;
  };
  const [stack, setStack] = useState<View[]>(initialStack);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [reason, setReason] = useState('');
  const [picker, setPicker] = useState<Picker | null>(null);
  const [composer, setComposer] = useState<RequestKind | null>(entry.kind ?? null);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [protectSheet, setProtectSheet] = useState(false);
  const [rolesSheet, setRolesSheet] = useState(false);
  const [importData, setImportData] = useState<string | null>(null);
  const [trashMenu, setTrashMenu] = useState<{ id: string; el: HTMLElement } | null>(null);
  const [openRevision, setOpenRevision] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const view = stack[stack.length - 1];
  const user = state.user;
  const admin = isAdmin(state.admins, user);
  const writable = state.ready && !!user;
  const all = useMemo(() => [...pins, ...state.trash], [pins, state.trash]);
  const pinId = 'id' in view ? view.id : undefined;
  const pin = pinId ? all.find(p => p.id === pinId) : undefined;
  const owner = !!pin && isOwner(pin, user);
  const purgeable = state.trash.filter(p => isOwner(p, user) || (admin && !p.protected));
  const inbox = inboxItems(pins, state);
  const [inboxFilter, setInboxFilter] = useState<'all' | RequestKind>('all');
  // Pins with an in-flight one-tap resolve; each needs the next revision first.
  const [busy, setBusy] = useState<Record<string, string>>({});
  const revisions = all.map(p => `${p.id}:${p.revision}`).join('|');
  useEffect(() => { setBusy(b => Object.keys(b).length ? {} : b); }, [revisions, errorKey]);
  const acknowledge = (p: Pin, r: PinRequest) => {
    setBusy(b => ({ ...b, [p.id]: r.id }));
    send({ type: 'SAFETY', action: 'resolve', id: p.id, revision: p.revision, value: { id: r.id, accept: false }, reason: ACK_REASON });
  };

  const push = (v: View) => { setStack(s => [...s, v]); setOpenRevision(null); };
  const back = () => { if (stack.length <= 1) onClose(); else setStack(s => s.slice(0, -1)); };
  const act = (action: Action['action'], value?: unknown, target: Pin | undefined = pin) =>
    send({ type: 'SAFETY', action, id: target?.id, revision: target?.revision, value });
  const actGlobal = (action: 'export' | 'import', value?: unknown) => send({ type: 'SAFETY', action, value });
  const ask = (c: Confirm) => { setReason(''); setConfirm(c); };

  useEffect(() => { rootRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { if (view.name === 'pinHistory' && pin) send({ type: 'SAFETY', action: 'history', id: pin.id }); }, [view.name, pin?.id, pin?.revision]);
  // Close the composer only once our request is actually stored.
  useEffect(() => {
    if (submitting && pin?.requests?.some(r => r.actor.id === user?.id && r.text === submitting)) {
      setSubmitting(null); setComposer(null); setDraft('');
    }
  }, [pin?.revision]);
  useEffect(() => { setSubmitting(null); }, [errorKey]);
  // A pin can vanish (permanently deleted elsewhere) while one of its screens is open.
  useEffect(() => { if (pinId && !pin) setStack(s => s.filter(v => !('id' in v))); }, [pinId, !!pin]);
  useEffect(() => { if (!stack.length) onClose(); }, [stack.length]);

  const roleBadge = (p: Pin) => {
    if (!user) return <Badge color="grey">읽기 전용</Badge>;
    if (isOwner(p, user)) return <Badge color="blue">내 핀</Badge>;
    if (canEdit(p, user)) return <Badge color="blue">공동 편집자</Badge>;
    if (!p.protected && p.assignee?.id === user.id) return <Badge color="green">담당자</Badge>;
    return <Badge color="grey">읽기 전용</Badge>;
  };
  const pinSubtitle = (p: Pin) => (
    <>
      <span>#{p.number}</span><span aria-hidden="true">·</span>
      <span>{p.author ? `작성자 ${p.author.name}` : '작성자 미상'}</span>
      {p.protected && <><span aria-hidden="true">·</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><Icon name="lock" size={12} />보호됨</span></>}
      {p.deletedAt && <><span aria-hidden="true">·</span><span>휴지통</span></>}
    </>
  );
  const pickUser = (title: string, description: string, exclude: string[], onPick: (u: PinUser) => void) =>
    setPicker({ title, description, exclude, onPick });

  // ── Screens ────────────────────────────────────────────────────────────────
  const screenHome = () => (
    <>
      <ListRow left={<IconTile icon="message" tone="blue" />} title="받은 의견함" withArrow onClick={() => push({ name: 'inbox' })}
        description={admin ? '내 핀에 남겨진 의견과 요청, 작성자 등록 요청' : '내 핀에 남겨진 의견과 요청'}
        right={inbox.length ? <Badge color="red" variant="fill">{inbox.length}</Badge> : undefined} />
      <ListRow left={<IconTile icon="trash" />} title="휴지통" withArrow onClick={() => push({ name: 'trash' })}
        description="영구 삭제하기 전까지 보관돼요"
        right={state.trash.length ? <span style={text('t7', 'semibold', semantic.textTertiary)}>{state.trash.length}</span> : undefined} />
      <ListRow left={<IconTile icon="shield" />} title="팀 권한 및 관리자" withArrow onClick={() => push({ name: 'admin' })}
        description={state.admins.length ? `관리자 ${state.admins.map(u => u.name).join(', ')}` : '아직 관리자가 없어요'} />
      <ListRow left={<IconTile icon="download" />} title="백업 및 복원" withArrow onClick={() => push({ name: 'backup' })}
        description="JSON 파일로 내보내고 가져와요" />
      <div style={{ padding: `${spacing[6]}px ${GUTTER}px`, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: spacing[4] }}>
        <TextButton onClick={() => setRolesSheet(true)}>권한은 어떻게 나뉘나요?</TextButton>
        <TextButton onClick={onShowWhatsNew}>새로워진 점 다시 보기</TextButton>
      </div>
    </>
  );

  const requestActions = (p: Pin, r: PinRequest, compact = false) => {
    if (!writable || r.resolvedAt || p.deletedAt || !(isOwner(p, user) || admin)) return null;
    const canApprove = r.kind === 'delete' || (r.kind === 'claim' && admin && !p.author);
    const pending = busy[p.id] !== undefined;
    return (
      <div style={{ display: 'flex', gap: spacing[2], marginTop: spacing[3], flexWrap: 'wrap' }}>
        {r.kind === 'comment' && <Button size="small" variant="weak" color="light" disabled={pending} onClick={() => acknowledge(p, r)}>
          {busy[p.id] === r.id ? '확인 중…' : '확인'}</Button>}
        {canApprove && <Button size="small" variant="weak" color={r.kind === 'delete' ? 'danger' : 'primary'} disabled={pending} onClick={() => ask({
          msg: { type: 'SAFETY', action: 'resolve', id: p.id, revision: p.revision, value: { id: r.id, accept: true } },
          tone: r.kind === 'delete' ? 'danger' : undefined, confirmLabel: '승인',
          title: r.kind === 'delete' ? '삭제 요청을 승인할까요?' : `${r.actor.name}님을 작성자로 등록할까요?`,
          description: r.kind === 'delete' ? '승인하면 이 핀이 휴지통으로 이동해요. 휴지통에서 복구할 수 있어요.' : '등록하면 이 핀의 원문 수정과 삭제 권한이 생겨요.' })}>승인</Button>}
        {r.kind !== 'comment' && <Button size="small" variant="weak" color="light" disabled={pending} onClick={() => ask({
          msg: { type: 'SAFETY', action: 'resolve', id: p.id, revision: p.revision, value: { id: r.id, accept: false } },
          confirmLabel: '처리 완료', title: r.kind === 'edit' ? '검토 완료로 표시할까요?' : '요청을 거절할까요?',
          description: '요청 내용은 기록에 그대로 남아요.' })}>{r.kind === 'edit' ? '검토 완료' : '거절'}</Button>}
        {compact && <TextButton onClick={() => push({ name: 'pinRequests', id: p.id })}>핀 보기</TextButton>}
      </div>
    );
  };

  const screenInbox = () => {
    const kinds = (['comment', 'edit', 'delete', 'claim'] as RequestKind[]).filter(k => inbox.some(x => x.request.kind === k));
    const shown = inbox.filter(x => inboxFilter === 'all' || x.request.kind === inboxFilter);
    if (!inbox.length) return <EmptyState title="받은 의견이 없어요" description="다른 사람이 내 핀에 의견이나 요청을 남기면 여기에 모여요." />;
    return (
      <>
        {kinds.length > 1 && (
          <div style={{ padding: `${spacing[2]}px ${GUTTER}px ${spacing[2]}px` }}>
            <FilterChips ariaLabel="의견 종류" value={inboxFilter} onChange={setInboxFilter}
              items={[{ value: 'all' as const, label: '전체', count: inbox.length },
                ...kinds.map(k => ({ value: k, label: k === 'claim' ? '작성자 등록' : KIND[k].label, count: inbox.filter(x => x.request.kind === k).length }))]} />
          </div>
        )}
        {shown.map(({ pin: p, request: r }, i) => (
          <div key={r.id}>
            {i > 0 && <Divider inset />}
            <div style={{ padding: `${spacing[4]}px ${GUTTER}px` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' }}>
                <Badge color={KIND[r.kind].color}>{KIND[r.kind].label}</Badge>
                <button type="button" className="tds-press tds-focus" onClick={() => push({ name: 'pinRequests', id: p.id })}
                  style={{ ...text('st12', 'semibold', semantic.textSecondary), background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                  #{p.number} {p.title || '제목 없음'}
                </button>
              </div>
              <p style={{ ...text('t7', 'regular', semantic.textStrong), margin: `${spacing[2]}px 0 0`, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.text}</p>
              <p style={{ ...text('st12', 'regular', semantic.textTertiary), margin: `${spacing[1]}px 0 0` }}>{r.actor.name} · {fmt(r.at)}</p>
              {requestActions(p, r, true)}
            </div>
          </div>
        ))}
        <Paragraph tone="tertiary" style={{ paddingTop: spacing[4] }}>확인한 의견은 각 핀의 ‘의견 및 요청’에서 다시 볼 수 있어요.</Paragraph>
      </>
    );
  };

  const screenTrash = () => (
    <>
      <Paragraph tone="tertiary" style={{ paddingTop: spacing[2], paddingBottom: spacing[2] }}>
        삭제한 핀의 글과 작성자 정보는 직접 영구 삭제하기 전까지 보관돼요.
      </Paragraph>
      {!state.trash.length && <EmptyState title="휴지통이 비어 있어요" />}
      {state.trash.map(p => (
        <ListRow key={p.id} title={p.title || '제목 없음'} alignTop
          description={`작성 ${p.author?.name || '미상'} · 삭제 ${p.deletedBy?.name || '알 수 없음'} · ${fmt(p.deletedAt!)}`}
          extra={p.deleteReason ? <span style={text('st12', 'regular', semantic.textDisabled)}>{p.deleteReason}</span> : undefined}
          right={<IconButton label={`${p.title || '핀'} 더보기`} icon="more" haspopup="menu" expanded={trashMenu?.id === p.id}
            onClick={e => setTrashMenu({ id: p.id, el: e.currentTarget })} />} />
      ))}
      {(() => {
        const p = trashMenu && state.trash.find(x => x.id === trashMenu.id);
        if (!p) return null;
        const items: MenuItem[] = [];
        if (writable && canRestore(p, user, state.admins)) items.push({ key: 'restore', label: '복구', icon: 'restore', onSelect: () => act('restore', undefined, p) });
        items.push({ key: 'open', label: '내용 · 이력 보기', icon: 'history', onSelect: () => push({ name: 'pin', id: p.id }) });
        if (writable && (isOwner(p, user) || (admin && !p.protected))) items.push({ key: 'purge', label: '영구 삭제', icon: 'trash', tone: 'danger',
          onSelect: () => ask({ msg: { type: 'SAFETY', action: 'purge', id: p.id, revision: p.revision }, tone: 'danger', confirmLabel: '영구 삭제',
            title: '영구 삭제할까요?', description: '글과 수정 이력이 모두 지워지고 휴지통에서도 복구할 수 없어요.' }) });
        return <Menu open anchor={trashMenu!.el} onClose={() => setTrashMenu(null)} items={items} label="휴지통 핀 메뉴" />;
      })()}
    </>
  );

  const screenAdmin = () => (
    <>
      <ListHeader title="관리자" description="기존 핀의 작성자 확인, 소유권 이전, 복구를 처리해요. Figma 파일 권한과는 별개예요." />
      {state.admins.map(u => (
        <ListRow key={u.id} left={<Avatar name={u.name} />} title={u.name} description={u.id}
          right={admin && writable && state.admins.length > 1 ? <TextButton onClick={() => ask({
            msg: { type: 'SAFETY', action: 'admins', value: state.admins.filter(a => a.id !== u.id).map(a => a.id) },
            title: `${u.name}님을 관리자에서 해제할까요?`, description: '변경 사유가 관리자 변경 기록에 남아요.', confirmLabel: '해제' })}>해제</TextButton> : undefined} />
      ))}
      {!state.admins.length && (
        <div style={{ padding: `${spacing[2]}px ${GUTTER}px ${spacing[4]}px` }}>
          <p style={{ ...text('t7', 'regular', semantic.textTertiary), margin: `0 0 ${spacing[3]}px` }}>아직 관리자가 없어요. 팀이 합의한 한 사람이 먼저 등록해주세요.</p>
          {writable && <Button color="primary" variant="weak" size="medium" onClick={() => ask({
            msg: { type: 'SAFETY', action: 'setupAdmin' }, confirmLabel: '관리자로 등록', title: '나를 첫 관리자로 등록할까요?',
            description: '관리자는 다른 사람 핀의 소유권을 옮기고 휴지통을 비울 수 있어요. 팀과 합의했을 때만 등록해주세요. 이후 변경은 관리자만 할 수 있어요.' })}>
            나를 첫 관리자로 등록</Button>}
        </div>
      )}
      {admin && writable && (
        <ListRow left={<IconTile icon="plus" tone="blue" />} title="관리자 추가" onClick={() => pickUser('관리자 추가', '이 파일에서 핀이나 의견을 남긴 사용자만 선택할 수 있어요.',
          state.admins.map(a => a.id), u => ask({ msg: { type: 'SAFETY', action: 'admins', value: [...state.admins.map(a => a.id), u.id] },
            title: `${u.name}님을 관리자로 추가할까요?`, description: '관리자는 소유권 이전, 복구, 휴지통 비우기를 할 수 있어요.', confirmLabel: '추가' }))} />
      )}
      {!!state.adminHistory?.length && <>
        <ListHeader title="변경 기록" />
        {state.adminHistory.map((a, i) => (
          <ListRow key={i} title={a.reason} description={`${fmt(a.at)} · ${a.actor.name}`}
            extra={<span style={text('st12', 'regular', semantic.textDisabled)}>{a.before.map(u => u.name).join(', ') || '없음'} → {a.after.map(u => u.name).join(', ')}</span>} />
        ))}
      </>}
    </>
  );

  const screenBackup = () => (
    <>
      <ListRow left={<IconTile icon="download" />} title="JSON 백업 다운로드" description="활성 핀, 휴지통, 수정 이력을 파일로 저장해요"
        onClick={() => actGlobal('export')} />
      {writable && <ListRow left={<IconTile icon="upload" />} title="백업에서 가져오기" description="기존 핀을 덮어쓰지 않고 내 새 핀으로 추가해요"
        onClick={() => fileRef.current?.click()} />}
      <input ref={fileRef} type="file" accept=".json,application/json" aria-label="백업 파일 선택" style={{ display: 'none' }}
        onChange={async e => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          if (f.size > 5_000_000) { onToast('5MB 이하 파일을 선택해주세요.', 'error'); return; }
          try {
            const raw = await f.text();
            if (JSON.parse(raw).format !== 'SMARTPIN_BACKUP_V2') throw new Error();
            setImportData(raw);
          } catch (_) { onToast('Smart Pin 백업 파일이 아니에요.', 'error'); }
        }} />
      <Paragraph tone="tertiary" style={{ paddingTop: spacing[4] }}>
        가져온 핀은 캔버스 레이어와 연결되지 않은 상태로 추가돼요. 필요한 레이어를 선택해 다시 연결해주세요.
      </Paragraph>
    </>
  );

  const screenPin = (p: Pin) => {
    const requests = p.requests || [];
    const open = requests.filter(r => !r.resolvedAt).length;
    const callouts: React.ReactNode[] = [];
    if (p.deletedAt) callouts.push(
      <Callout key="trash" tone="warning">
        휴지통에 있는 핀이에요 · {p.deletedBy?.name || '알 수 없음'} · {fmt(p.deletedAt)}{p.deleteReason ? ` · ${p.deleteReason}` : ''}
        {writable && (canRestore(p, user, state.admins) || isOwner(p, user) || (admin && !p.protected)) && (
          <div style={{ display: 'flex', gap: spacing[2], marginTop: spacing[3] }}>
            {canRestore(p, user, state.admins) && <Button size="small" variant="weak" onClick={() => act('restore')}>복구</Button>}
            {(isOwner(p, user) || (admin && !p.protected)) && <Button size="small" variant="weak" color="danger" onClick={() => ask({
              msg: { type: 'SAFETY', action: 'purge', id: p.id, revision: p.revision }, tone: 'danger', confirmLabel: '영구 삭제',
              title: '영구 삭제할까요?', description: '글과 수정 이력이 모두 지워지고 휴지통에서도 복구할 수 없어요.' })}>영구 삭제</Button>}
          </div>
        )}
      </Callout>);
    if (!p.author && !p.deletedAt) callouts.push(
      <Callout key="claim" tone="info" action={writable && !requests.some(r => r.kind === 'claim' && !r.resolvedAt && r.actor.id === user?.id)
        ? { label: '작성자 등록 요청', onClick: () => { push({ name: 'pinRequests', id: p.id }); setComposer('claim'); } } : undefined}>
        작성자 확인이 필요한 기존 핀이에요. 직접 작성했다면 등록을 요청해주세요. 관리자가 확인하면 작성자로 지정돼요.
      </Callout>);
    if (p.badgeMissing && !p.deletedAt && writable && canEdit(p, user)) callouts.push(
      <Callout key="badge" tone="warning" action={{ label: '선택한 레이어에 다시 연결', onClick: () => act('relink') }}>
        캔버스에서 배지가 사라졌지만 글은 그대로 보존돼 있어요.
      </Callout>);
    if (p.conflictCount) callouts.push(
      <Callout key="conflict" tone="warning" action={{ label: '수정 이력 확인', onClick: () => push({ name: 'pinHistory', id: p.id }) }}>
        동시에 저장된 수정본 {p.conflictCount}개가 적용되지 않았어요.
      </Callout>);
    return (
      <>
        {callouts.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[2], padding: `${spacing[2]}px ${GUTTER}px ${spacing[3]}px` }}>{callouts}</div>}
        {p.deletedAt && (
          <div style={{ margin: `0 ${GUTTER}px ${spacing[3]}px`, padding: spacing[4], background: semantic.bgSubtle, borderRadius: radius.lg }}>
            <p style={{ ...text('st11', 'semibold', semantic.textPrimary), margin: 0 }}>{p.title || '제목 없음'}</p>
            <p style={{ ...text('t7', 'regular', semantic.textSecondary), margin: `${spacing[1]}px 0 0`, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{p.content || '내용 없음'}</p>
          </div>
        )}
        <ListRow left={<IconTile icon="message" />} title="의견 및 요청" withArrow onClick={() => push({ name: 'pinRequests', id: p.id })}
          description={requests.length ? `전체 ${requests.length}개 · 처리 전 ${open}개` : '아직 남겨진 의견이 없어요'}
          right={open ? <Badge color="blue">{open}</Badge> : undefined} />
        <ListRow left={<IconTile icon="people" />} title="공동 편집자와 담당자" withArrow onClick={() => push({ name: 'pinPeople', id: p.id })}
          description={`공동 편집자 ${p.editors?.length || 0}명 · 담당자 ${p.assignee?.name || '없음'}`} />
        <ListRow left={<IconTile icon="history" />} title="수정 이력" withArrow onClick={() => push({ name: 'pinHistory', id: p.id })}
          description="누가 언제 바꿨는지 보고 이전 내용으로 되돌려요" />
        {!p.deletedAt && <ListRow left={<IconTile icon="lock" />} title="보호 설정"
          description={p.protected ? '보호 중 · 작성자만 수정하고 삭제할 수 있어요' : '꺼짐 · 공동 편집자도 수정할 수 있어요'}
          withArrow={owner && writable} onClick={owner && writable ? () => setProtectSheet(true) : undefined}
          right={!(owner && writable) ? <span style={text('st12', 'regular', semantic.textDisabled)}>작성자만 변경</span> : undefined} />}
        {!p.deletedAt && writable && (owner || admin) && <ListRow left={<IconTile icon="transfer" />} title="소유권 이전" withArrow
          description="다른 사용자를 이 핀의 작성자로 지정해요"
          onClick={() => pickUser('새 작성자 선택', '소유권을 넘기면 기존 공동 편집자와 담당자는 해제돼요.', [p.author?.id || ''],
            u => ask({ msg: { type: 'SAFETY', action: 'transfer', id: p.id, revision: p.revision, value: u.id }, confirmLabel: '소유권 이전',
              title: `${u.name}님에게 소유권을 넘길까요?`, description: `${u.name}님이 새 작성자가 되고, 기존 공동 편집자와 담당자는 해제돼요.` }))} />}
        <div style={{ padding: `${spacing[6]}px ${GUTTER}px` }}>
          <TextButton onClick={() => setRolesSheet(true)}>권한은 어떻게 나뉘나요?</TextButton>
        </div>
      </>
    );
  };

  const screenPinRequests = (p: Pin) => {
    const requests = [...(p.requests || [])].reverse();
    return requests.length === 0
      ? <EmptyState title="아직 의견이나 요청이 없어요" description={writable && !p.deletedAt ? '궁금한 점이나 수정이 필요한 부분을 남겨주세요.' : undefined} />
      : <>{requests.map((r, i) => {
          return (
            <div key={r.id}>
              {i > 0 && <Divider inset />}
              <div style={{ padding: `${spacing[4]}px ${GUTTER}px` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' }}>
                  <Badge color={KIND[r.kind].color}>{KIND[r.kind].label}</Badge>
                  <span style={text('st12', 'regular', semantic.textTertiary)}>{r.actor.name} · {fmt(r.at)}</span>
                </div>
                <p style={{ ...text('t7', 'regular', semantic.textStrong), margin: `${spacing[2]}px 0 0`, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.text}</p>
                {r.resolvedAt && <p style={{ ...text('st12', 'regular', semantic.textDisabled), margin: `${spacing[2]}px 0 0` }}>{r.resolvedBy?.name || '알 수 없음'}님이 처리했어요</p>}
                {requestActions(p, r)}
              </div>
            </div>
          );
        })}</>;
  };

  const screenPinPeople = (p: Pin) => {
    const manage = owner && writable && !p.deletedAt;
    const editors = p.editors || [];
    return (
      <>
        {!manage && <Paragraph tone="tertiary" style={{ paddingTop: spacing[2] }}>작성자만 공동 편집자와 담당자를 바꿀 수 있어요.</Paragraph>}
        <ListHeader title="작성자" />
        <ListRow left={<Avatar name={p.author?.name} />} title={p.author?.name || '작성자 미상'} description={p.author ? '원문 수정, 삭제, 권한 관리를 할 수 있어요' : '관리자 확인 후 지정돼요'} />
        <ListHeader title="공동 편집자" description={p.protected ? '보호 중에는 공동 편집자도 원문을 수정할 수 없어요.' : '원문을 함께 고칠 수 있어요. 삭제는 작성자만 할 수 있어요.'} />
        {!editors.length && <Paragraph tone="tertiary" style={{ paddingBottom: spacing[2] }}>지정된 공동 편집자가 없어요.</Paragraph>}
        {editors.map(u => (
          <ListRow key={u.id} left={<Avatar name={u.name} />} title={u.name}
            right={manage ? <TextButton onClick={() => act('editors', editors.filter(e => e.id !== u.id).map(e => e.id))} aria-label={`${u.name} 편집 권한 해제`}>해제</TextButton> : undefined} />
        ))}
        {manage && <ListRow left={<IconTile icon="plus" tone="blue" />} title="공동 편집자 추가" onClick={() => pickUser('공동 편집자 추가',
          '이 파일에서 핀이나 의견을 남긴 사용자만 선택할 수 있어요.', [p.author?.id || '', ...editors.map(e => e.id)],
          u => act('editors', [...editors.map(e => e.id), u.id]))} />}
        <ListHeader title="담당자" description="원문은 고칠 수 없고 상태만 바꿀 수 있어요." />
        {p.assignee
          ? <ListRow left={<Avatar name={p.assignee.name} />} title={p.assignee.name}
              right={manage ? <TextButton onClick={() => act('assignee', null)} aria-label={`${p.assignee.name} 담당자 해제`}>해제</TextButton> : undefined} />
          : <Paragraph tone="tertiary" style={{ paddingBottom: spacing[2] }}>지정된 담당자가 없어요.</Paragraph>}
        {manage && <ListRow left={<IconTile icon="plus" tone="blue" />} title={p.assignee ? '담당자 변경' : '담당자 지정'} onClick={() => pickUser('담당자 지정',
          '담당자는 이 핀의 상태만 바꿀 수 있어요.', [p.author?.id || '', p.assignee?.id || ''], u => act('assignee', u.id))} />}
      </>
    );
  };

  const screenPinHistory = (p: Pin) => {
    const revisions = history?.id === p.id ? history.revisions : null;
    if (!revisions) return <EmptyState title="수정 이력을 불러오는 중이에요" />;
    if (!revisions.length) return <EmptyState title="수정 이력이 없어요" />;
    return <>{revisions.map((r, i) => {
      const expanded = openRevision === r.id;
      return (
        <div key={r.id}>
          {i > 0 && <Divider inset />}
          <ListRow title={r.action} description={`${r.actor.name} · ${fmt(r.at)}`} onClick={() => setOpenRevision(expanded ? null : r.id)}
            aria-label={`${r.action}, ${r.actor.name}, ${fmt(r.at)}${expanded ? ' 접기' : ' 펼치기'}`}
            right={<>
              {r.conflict && <Badge color="yellow">동시 수정 · 미적용</Badge>}
              <span style={{ color: colors.grey400, display: 'flex', transform: expanded ? 'rotate(180deg)' : 'none' }}><Icon name="chevronDown" size={18} /></span>
            </>} />
          {expanded && (
            <div style={{ margin: `0 ${GUTTER}px ${spacing[4]}px`, padding: spacing[4], background: semantic.bgSubtle, borderRadius: radius.lg }}>
              <p style={{ ...text('st11', 'semibold', semantic.textPrimary), margin: 0 }}>{r.pin.title || '제목 없음'}</p>
              <p style={{ ...text('t7', 'regular', semantic.textSecondary), margin: `${spacing[1]}px 0 0`, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.pin.content || '내용 없음'}</p>
              {r.conflict && r.pin.requests?.map(q => (
                <p key={q.id} style={{ ...text('st12', 'regular', semantic.textTertiary), margin: `${spacing[2]}px 0 0`, whiteSpace: 'pre-wrap' }}>보존된 {KIND[q.kind].label} · {q.actor.name}: {q.text}</p>
              ))}
              {writable && canEdit(p, user) && i > 0 && (
                <div style={{ marginTop: spacing[3] }}>
                  <Button size="small" variant="weak" onClick={() => ask({ msg: { type: 'SAFETY', action: 'rollback', id: p.id, revision: p.revision, value: r.id },
                    confirmLabel: '복원', title: '이 내용으로 복원할까요?', description: '제목과 내용이 이 시점으로 바뀌어요. 지금 내용도 수정 이력에 남아요.' })}>
                    이 내용으로 복원</Button>
                </div>
              )}
            </div>
          )}
        </div>
      );
    })}</>;
  };

  // ── Frame ──────────────────────────────────────────────────────────────────
  const titles: Record<View['name'], string> = {
    home: '관리', inbox: '받은 의견함', trash: '휴지통', admin: '팀 권한 및 관리자', backup: '백업 및 복원',
    pin: pin?.title || '제목 없음', pinRequests: '의견 및 요청', pinPeople: '공동 편집자와 담당자', pinHistory: '수정 이력',
  };
  const subtitle = !pin ? undefined : view.name === 'pin' ? <>{pinSubtitle(pin)}<span style={{ marginLeft: spacing[1] }}>{roleBadge(pin)}</span></> : <span>#{pin.number} {pin.title || '제목 없음'}</span>;
  const composerKinds = (p: Pin): RequestKind[] => (['comment', 'edit', 'delete', 'claim'] as RequestKind[]).filter(k =>
    k === 'comment' || (k === 'edit' && !canEdit(p, user)) || (k === 'delete' && !isOwner(p, user)) || (k === 'claim' && !p.author));
  const canCompose = !!pin && writable && !pin.deletedAt;
  const showComposerCTA = view.name === 'pinRequests' && canCompose;
  const navRight = view.name === 'trash' && writable && purgeable.length
    ? <TextButton color={colors.red500} onClick={() => ask({ msg: { type: 'SAFETY', action: 'emptyTrash', value: purgeable.map(p => p.id) }, tone: 'danger',
        confirmLabel: '비우기', title: `${purgeable.length}개 핀을 영구 삭제할까요?`,
        description: '삭제 권한이 있는 핀만 비워요. 글과 수정 이력이 지워지고 복구할 수 없어요.' })}>휴지통 비우기</TextButton>
    : undefined;

  const screen = () => {
    switch (view.name) {
      case 'home': return screenHome();
      case 'inbox': return screenInbox();
      case 'trash': return screenTrash();
      case 'admin': return screenAdmin();
      case 'backup': return screenBackup();
      case 'pin': return pin ? screenPin(pin) : null;
      case 'pinRequests': return pin ? screenPinRequests(pin) : null;
      case 'pinPeople': return pin ? screenPinPeople(pin) : null;
      case 'pinHistory': return pin ? screenPinHistory(pin) : null;
    }
  };

  return (
    <div ref={rootRef} role="dialog" aria-modal="true" aria-labelledby="sp-panel-title" tabIndex={-1}
      onKeyDown={e => { if (e.key === 'Escape' && !confirm && !picker && !composer && !protectSheet && !rolesSheet && !importData && !trashMenu) back(); }}
      style={{ position: 'fixed', inset: 0, zIndex: z.page, background: colors.background, display: 'flex', flexDirection: 'column', outline: 'none' }}>
      <NavBar titleId="sp-panel-title" title={titles[view.name]} subtitle={subtitle} onBack={back}
        backLabel={stack.length <= 1 ? '관리 닫기' : '뒤로'}
        right={(navRight || stack.length > 1) ? <>{navRight}{stack.length > 1 && <IconButton label="관리 닫기" icon="close" onClick={onClose} color={semantic.textPrimary} />}</> : undefined} />
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <div key={`${stack.length}-${view.name}`} className="tds-page-in" style={{ maxWidth: 640, margin: '0 auto', paddingBottom: spacing[8] }}>
          {screen()}
        </div>
      </div>
      {showComposerCTA && (
        <div style={{ padding: `${spacing[3]}px ${GUTTER}px ${spacing[4]}px`, flexShrink: 0, maxWidth: 640, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          <Button display="full" size="large" onClick={() => setComposer(composerKinds(pin!)[0])}>의견 · 요청 남기기</Button>
        </div>
      )}

      {/* Composer */}
      <BottomSheet open={!!composer && canCompose} onClose={() => { setComposer(null); setSubmitting(null); }} title="의견 · 요청 남기기"
        description="요청은 이 파일 안에만 남고, 이메일 같은 알림은 가지 않아요."
        cta={<SheetCTA secondary={{ label: '취소', onClick: () => { setComposer(null); setSubmitting(null); } }}
          primary={{ label: submitting ? '등록 중…' : '등록', disabled: !draft.trim() || !!submitting,
            onClick: () => { if (!composer || !pin) return; setSubmitting(draft.trim()); act('request', { kind: composer, text: draft }); } }} />}>
        {composer && pin && (
          <div style={{ padding: `0 ${GUTTER}px`, display: 'flex', flexDirection: 'column', gap: spacing[3] }}>
            {composerKinds(pin).length > 1 && <SegmentedControl ariaLabel="요청 종류" value={composer} onChange={setComposer}
              items={composerKinds(pin).map(k => ({ value: k, label: k === 'claim' ? '작성자 등록' : KIND[k].label }))} />}
            <p style={{ ...text('t7', 'regular', semantic.textTertiary), margin: 0 }}>{KIND[composer].help}</p>
            <TextArea aria-label="의견 또는 요청 내용" data-autofocus maxLength={4000} value={draft} onChange={e => setDraft(e.target.value)}
              placeholder={composer === 'claim' ? '예: 9월 회의 때 제가 작성한 핀이에요.' : '내용을 입력해주세요'} />
          </div>
        )}
      </BottomSheet>

      {/* Reason-bearing confirmation */}
      <BottomSheet open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title} description={confirm?.description}
        cta={<SheetCTA secondary={{ label: '취소', onClick: () => setConfirm(null) }}
          primary={{ label: confirm?.confirmLabel || '확인', tone: confirm?.tone, disabled: !reason.trim(),
            onClick: () => { if (!confirm) return; send({ ...confirm.msg, reason }); setConfirm(null); } }} />}>
        <div style={{ padding: `0 ${GUTTER}px` }}>
          <TextInput aria-label="변경 사유" data-autofocus placeholder="사유를 입력해주세요 (기록에 남아요)" value={reason} maxLength={500}
            onChange={e => setReason(e.target.value)} />
        </div>
      </BottomSheet>

      {/* User picker */}
      <BottomSheet open={!!picker} onClose={() => setPicker(null)} title={picker?.title} description={picker?.description}
        cta={<SheetCTA primary={{ label: '닫기', onClick: () => setPicker(null) }} />}>
        {picker && (() => {
          const users = state.users.filter(u => !picker.exclude.includes(u.id));
          return users.length ? users.map(u => (
            <ListRow key={u.id} left={<Avatar name={u.name} />} title={u.name} description={u.id} withArrow
              onClick={() => { const pick = picker.onPick; setPicker(null); pick(u); }} />
          )) : <EmptyState title="선택할 수 있는 사용자가 없어요" description="이 파일에서 핀이나 의견을 남긴 사용자가 여기에 표시돼요." />;
        })()}
      </BottomSheet>

      {/* Protection */}
      <BottomSheet open={protectSheet && !!pin} onClose={() => setProtectSheet(false)}
        title={pin?.protected ? '보호를 해제할까요?' : '이 핀을 보호할까요?'}
        description={pin?.protected ? '해제하면 공동 편집자도 다시 원문을 수정할 수 있어요.' : '보호하면 작성자만 원문을 수정하고 삭제할 수 있어요. 담당자의 상태 변경도 막혀요. 관리자는 보호된 핀을 휴지통으로 옮길 수 없어요.'}
        cta={<SheetCTA secondary={{ label: '취소', onClick: () => setProtectSheet(false) }}
          primary={{ label: pin?.protected ? '보호 해제' : '보호하기', onClick: () => { act('protect', !pin?.protected); setProtectSheet(false); } }} />} />

      {/* Import */}
      <BottomSheet open={!!importData} onClose={() => setImportData(null)} title="백업을 가져올까요?"
        description="백업의 핀을 내 새 핀으로 추가해요. 현재 파일의 권한과 수정 이력은 덮어쓰지 않아요."
        cta={<SheetCTA secondary={{ label: '취소', onClick: () => setImportData(null) }}
          primary={{ label: '가져오기', onClick: () => { actGlobal('import', importData); setImportData(null); } }} />} />

      {/* Roles guide */}
      <BottomSheet open={rolesSheet} onClose={() => setRolesSheet(false)} title="권한은 이렇게 나뉘어요"
        cta={<SheetCTA primary={{ label: '확인', onClick: () => setRolesSheet(false) }} />}>
        <ListRow left={<IconTile icon="people" tone="blue" />} title="작성자" description="원문 수정, 휴지통 이동, 보호 설정, 공동 편집자·담당자 지정을 할 수 있어요." />
        <ListRow left={<IconTile icon="people" />} title="공동 편집자" description="원문을 함께 고칠 수 있어요. 삭제와 보호 설정은 할 수 없어요." />
        <ListRow left={<IconTile icon="check" />} title="담당자" description="원문은 고칠 수 없고 상태(진행 전·보류·완료)만 바꿀 수 있어요." />
        <ListRow left={<IconTile icon="lock" />} title="보호된 핀" description="작성자만 수정하고 삭제할 수 있어요." />
        <ListRow left={<IconTile icon="message" />} title="다른 사용자" description="원문을 직접 고치지 않고 의견, 수정 요청, 삭제 요청을 남겨요." />
        <ListRow left={<IconTile icon="trash" />} title="휴지통" description="삭제한 핀은 바로 지워지지 않아요. 작성자나 관리자가 복구하거나 영구 삭제해요." />
      </BottomSheet>
    </div>
  );
}
