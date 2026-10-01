import { Pin, PinCategory, PinAnchor, PageStub, UIMessage, PluginMessage, PinUser } from './types';
import { PinStore, canEdit, canTrash, canRestore, isOwner, isAdmin, editablePatch, uid } from './safety';

const NAMESPACE          = 'smart_pin';
const STORAGE_KEY        = 'smart-pin-v1';
const CHUNK_META_KEY     = 'smart-pin-v1-meta';
const CHUNK_PREFIX       = 'smart-pin-v1-c';
const STUBS_KEY          = 'smart-pin-stubs-v1';
const FILE_ORDER_KEY     = 'smart-pin-file-order-v1';
const GROUP_ORDER_KEY    = 'smart-pin-group-order-v1';
const PIN_ORDER_KEY      = 'smart-pin-pin-order-v1';
const ONBOARDING_KEY     = 'smart-pin-onboarding-done';
const PIN_SIZE = 24;
const CODE_VERSION = 7;
const store = new PinStore({
  keys: () => figma.root.getSharedPluginDataKeys(NAMESPACE).filter(k => !!figma.root.getSharedPluginData(NAMESPACE, k)),
  get: k => figma.root.getSharedPluginData(NAMESPACE, k),
  set: (k, value) => figma.root.setSharedPluginData(NAMESPACE, k, value),
});
const currentUser = (): PinUser | null => {
  const u = figma.currentUser;
  return u?.id && u.name !== 'Anonymous' ? { id: u.id, name: u.name } : null;
};
const actor = (): PinUser => {
  const u = currentUser();
  if (!u) throw new Error('Figma에 로그인한 뒤 다시 실행해주세요.');
  return u;
};
let loadedSnapshot = new Map<string, string>();

// Read-only support for the legacy chunked format during migration.
const MAX_CHUNKS = 40;

figma.showUI(__html__, { width: 720, height: 960, title: 'Smart Pin' });

let pins: Pin[] = [];
let pageStubs: PageStub[] = [];
let autoFocusPinId: string | null = null;
let pinsLoaded = false;
let pendingSelectionId: string | null = null;
let onboardingDone = false;

const CAT_COLORS: Record<PinCategory, RGB> = {
  design:   { r: 0.388, g: 0.4,   b: 1.0   },
  descript: { r: 0.067, g: 0.733, b: 0.522 },
  dev:      { r: 1.0,   g: 0.584, b: 0.196 },
  ask:      { r: 0.918, g: 0.267, b: 0.267 },
};

// ─── helpers ───────────────────────────────────

function post(msg: PluginMessage): void {
  figma.ui.postMessage(msg);
}

function migrateStatus(raw: any): 'todo' | 'done' | 'pending' {
  if (raw === 'done' || raw === 'resolved') return 'done';
  if (raw === 'pending') return 'pending';
  return 'todo';
}

function migrateCategory(raw: any): PinCategory {
  if (raw === 'copy') return 'descript';
  if (raw === 'qa') return 'ask';
  if (raw === 'design' || raw === 'descript' || raw === 'dev' || raw === 'ask') return raw;
  return 'design';
}

function parseRawPins(rawData: string): Pin[] {
    const data = JSON.parse(rawData);
    if (!Array.isArray(data) || data.some(p => !p || typeof p.id !== 'string' || typeof p.title !== 'string' || typeof p.content !== 'string')) {
      throw new Error('기존 핀 데이터 형식을 확인할 수 없습니다. 원본을 보존하고 중단했습니다.');
    }
    if (new Set(data.map(p => p.id)).size !== data.length) throw new Error('중복된 핀 ID가 있습니다. 원본을 보존하고 중단했습니다.');
    return data.map((p: any) => ({
      ...p,
      category: migrateCategory(p.category),
      status: migrateStatus(p.status),
      group: p.group ?? '',
      pageId: p.pageId ?? '',
      pageName: p.pageName ?? '',
    }));
}

// ─── chunked storage ────────────────────────────
// Pin data outgrew Figma's 100kB-per-entry cap, so it is split across
// `smart-pin-v1-c0..cN` with `smart-pin-v1-meta` as the manifest/commit marker.

function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h.toString(36);
}

// Null means "no chunked data, or it read back inconsistent" — callers must then
// keep whatever they already have rather than treating it as an empty list.
function readChunked(): { data: string; meta: string } | null {
  const meta = figma.root.getSharedPluginData(NAMESPACE, CHUNK_META_KEY);
  if (!meta) return null;
  try {
    const m = JSON.parse(meta);
    const count = typeof m.c === 'number' ? m.c : 0;
    if (count <= 0 || count > MAX_CHUNKS) return null;
    let data = '';
    for (let i = 0; i < count; i++) {
      const part = figma.root.getSharedPluginData(NAMESPACE, CHUNK_PREFIX + i);
      if (!part && count > 1) return null;
      data += part;
    }
    if (typeof m.h === 'string' && hashString(data) !== m.h) return null;
    return { data, meta };
  } catch { return null; }
}

async function load(): Promise<Pin[]> {
  if (!store.ready) {
    const chunked = readChunked();
    if (!chunked && figma.root.getSharedPluginData(NAMESPACE, CHUNK_META_KEY)) {
      throw new Error('기존 저장 데이터가 불완전합니다. 덮어쓰지 않고 중단했습니다.');
    }
    const raw = chunked?.data || figma.root.getSharedPluginData(NAMESPACE, STORAGE_KEY) || figma.root.getPluginData(STORAGE_KEY);
    if (raw && !Array.isArray(JSON.parse(raw))) throw new Error('기존 핀 데이터를 읽지 못했습니다.');
    const legacy = raw ? parseRawPins(raw) : await scanAndRecover();
    if (figma.editorType === 'dev' || !currentUser()) return legacy;
    store.migrate(legacy);
  }
  const active = store.all().filter(p => !p.deletedAt);
  loadedSnapshot = new Map(active.map(p => [p.id, JSON.stringify(p)]));
  return active;
}

async function save(): Promise<void> {
  if (figma.editorType === 'dev') throw new Error('읽기 전용 모드입니다.');
  const u = actor();
  for (const pin of pins) {
    if (loadedSnapshot.get(pin.id) === JSON.stringify(pin)) continue;
    const old = store.get(pin.id);
    if (old && !canEdit(old, u)) throw new Error('다른 사람의 핀을 변경할 수 없습니다.');
    const saved = store.commit(old ? pin : { ...pin, author: u, editors: [] }, u, old ? '핀 변경' : '핀 생성', pin.revision);
    Object.assign(pin, saved);
  }
  loadedSnapshot = new Map(pins.map(p => [p.id, JSON.stringify(p)]));
}

// Scan canvas for badge frames to recover lost pin data
async function scanAndRecover(): Promise<Pin[]> {
  const recovered: Pin[] = [];
  try {
    await figma.loadAllPagesAsync();
    for (const page of figma.root.children) {
      const frames = (page as PageNode).findAll(
        n => n.type === 'FRAME' && n.name.startsWith('📌 Pin #')
      );
      for (const frame of frames) {
        const numMatch = frame.name.match(/📌 Pin #(\d+)/);
        if (!numMatch) continue;
        const num = parseInt(numMatch[1]);

        // Try to infer category from badge ellipse color
        let category: PinCategory = 'design';
        const ellipse = (frame as FrameNode).children.find(c => c.type === 'ELLIPSE') as EllipseNode | undefined;
        const fills = ellipse?.fills;
        if (ellipse && Array.isArray(fills) && fills.length > 0) {
          const fill = fills[0] as SolidPaint;
          if (fill.color) {
            for (const [cat, color] of Object.entries(CAT_COLORS)) {
              if (Math.abs(fill.color.r - color.r) < 0.05 && Math.abs(fill.color.g - color.g) < 0.05) {
                category = cat as PinCategory;
                break;
              }
            }
          }
        }

        const storedId = frame.getSharedPluginData(NAMESPACE, 'smartPinId')
                      || frame.getPluginData('smartPinId');

        recovered.push({
          id: storedId || `recovered_${frame.id}`,
          nodeId: frame.id,
          pinNodeId: frame.id,
          pageId: page.id,
          pageName: page.name,
          number: num,
          title: `Note #${num}`,
          content: '',
          category,
          status: 'todo',
          group: '',
          createdAt: Date.now(),
        });
      }
    }
  } catch (_) {}
  return recovered;
}

function loadStubs(): PageStub[] {
  try {
    let raw = figma.root.getSharedPluginData(NAMESPACE, STUBS_KEY);
    if (!raw) raw = figma.root.getPluginData(STUBS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

function saveStubs(): void {
  if (figma.editorType === 'dev') return;
  figma.root.setSharedPluginData(NAMESPACE, STUBS_KEY, JSON.stringify(pageStubs));
}

function loadFileOrder(): string[] {
  try {
    let raw = figma.root.getSharedPluginData(NAMESPACE, FILE_ORDER_KEY);
    if (!raw) raw = figma.root.getPluginData(FILE_ORDER_KEY);
    if (!raw) return [];
    const d = JSON.parse(raw);
    return Array.isArray(d) ? d : [];
  } catch { return []; }
}

function loadGroupOrders(): Record<string, string[]> {
  try {
    let raw = figma.root.getSharedPluginData(NAMESPACE, GROUP_ORDER_KEY);
    if (!raw) raw = figma.root.getPluginData(GROUP_ORDER_KEY);
    if (!raw) return {};
    return JSON.parse(raw) ?? {};
  } catch { return {}; }
}

function loadPinOrders(): Record<string, string[]> {
  try {
    const raw = figma.root.getSharedPluginData(NAMESPACE, PIN_ORDER_KEY);
    if (!raw) return {};
    return JSON.parse(raw) ?? {};
  } catch { return {}; }
}

function postPinsLoaded(): void {
  let fileKey = figma.fileKey || null;
  if (!fileKey) {
    fileKey = figma.root.getSharedPluginData(NAMESPACE, 'customFileKey')
           || figma.root.getPluginData('customFileKey')
           || null;
  }
  post({
    type: 'PINS_LOADED',
    pins: pins.map(p => {
      const dup = canvasState.duplicates.get(p.id)?.length || 0;
      const drift = canvasState.drifted.has(p.id);
      return dup || drift ? { ...p, duplicateBadges: dup || undefined, badgeDrift: drift || undefined } : p;
    }),
    pageStubs,
    fileKey,
    currentPageId: figma.currentPage.id,
    currentPageName: figma.currentPage.name,
    codeVersion: CODE_VERSION,
    fileOrder: loadFileOrder(),
    groupOrders: loadGroupOrders(),
    pinOrders: loadPinOrders(),
    onboardingDone: onboardingDone || pins.length > 0,
    isDevMode: figma.editorType === 'dev',
    safety: { user: currentUser(), admins: store.admins, ready: store.ready,
      trash: store.ready ? store.all().filter(p => !!p.deletedAt) : [],
      users: knownUsers(),
      adminHistory: figma.root.getSharedPluginDataKeys(NAMESPACE).filter(k => k.startsWith('sp2-audit-'))
        .map(k => JSON.parse(figma.root.getSharedPluginData(NAMESPACE, k))).sort((a, b) => b.at - a.at),
    },
  });
}

function selectionInfo(): { hasSelection: boolean } {
  return { hasSelection: figma.currentPage.selection.length === 1 };
}

function knownUsers(): PinUser[] {
  const users = new Map<string, PinUser>();
  const add = (u?: PinUser | null) => { if (u && u.id !== 'system') users.set(u.id, u); };
  add(currentUser());
  store.admins.forEach(add);
  if (store.ready) store.all().forEach(p => {
    add(p.author); add(p.assignee); p.editors?.forEach(add); p.requests?.forEach(r => add(r.actor));
  });
  return [...users.values()];
}
function requireEditable(targets: Pin[]): void {
  if (targets.some(p => !canEdit(p, currentUser()))) throw new Error('다른 작성자의 핀이 포함되어 있어 변경할 수 없습니다.');
}
async function refresh(): Promise<void> { pins = await load(); postPinsLoaded(); }

async function trashPins(ids: string[], reason: string, requestId?: string): Promise<void> {
  const u = actor();
  const targets = ids.map(id => store.get(id));
  if (targets.some(p => !p || !canTrash(p, u, store.admins))) throw new Error('삭제할 권한이 없습니다.');
  const saved: Pin[] = [];
  try {
    for (const original of targets as Pin[]) {
      const p = store.get(original.id)!;
      const requests = p.requests?.map(r => r.id === requestId ? { ...r, resolvedAt: Date.now(), resolvedBy: u } : r);
      saved.push(store.commit({ ...p, requests, deletedAt: Date.now(), deletedBy: u, deleteReason: reason }, u, `휴지통 이동: ${reason}`, p.revision));
    }
  } finally {
    // The full text is durable before touching any canvas nodes.
    for (const p of saved) {
      try { const node = await figma.getNodeByIdAsync(p.pinNodeId); if (node) node.remove(); } catch (_) {}
    }
    await refresh();
    if (saved.length) post({ type: 'NOTICE', message: `${saved.length}개 핀을 휴지통으로 이동했어요.`, undoIds: saved.map(p => p.id) });
  }
}

async function reconnect(pin: Pin, target?: SceneNode): Promise<void> {
  const existing = await figma.getNodeByIdAsync(pin.pinNodeId);
  if (existing && !target) return;
  const node = target || await figma.getNodeByIdAsync(pin.nodeId);
  if (!node || !('absoluteBoundingBox' in node)) {
    post({ type: 'NOTICE', message: '내용은 복구됐어요. 대상 레이어를 선택한 뒤 다시 연결해주세요.' });
    return;
  }
  let page: BaseNode | null = node;
  while (page && page.type !== 'PAGE') page = page.parent;
  if (!page || page.type !== 'PAGE') throw new Error('연결할 페이지를 찾지 못했습니다.');
  await figma.setCurrentPageAsync(page);
  const badge = await createBadge(node as SceneNode, pin.number, pin.category);
  const badgeNode = await figma.getNodeByIdAsync(badge.pinNodeId);
  try {
    badgeNode?.setSharedPluginData(NAMESPACE, 'smartPinId', pin.id);
    const current = store.get(pin.id)!;
    store.commit({ ...current, nodeId: node.id, pinNodeId: badge.pinNodeId, anchor: badge.anchor,
      pageId: page.id, pageName: page.name, badgeMissing: false }, actor(), '배지 다시 연결', current.revision);
  } catch (e) { badgeNode?.remove(); throw e; }
  if (existing && target) existing.remove();
  await updateBadgeColor(store.get(pin.id)!);
}

async function handleSafety(msg: Extract<UIMessage, { type: 'SAFETY' }>): Promise<void> {
  if (msg.action === 'export') { post({ type: 'BACKUP', data: store.backup() }); return; }
  if (msg.action === 'history') { post({ type: 'HISTORY', id: msg.id!, revisions: store.history(msg.id!) }); return; }
  const u = actor();
  const admin = isAdmin(store.admins, u);
  const reason = (msg.reason || '').trim();
  if (msg.action === 'emptyTrash') {
    if (!reason || !Array.isArray(msg.value) || !msg.value.length) throw new Error('삭제 대상과 사유를 확인해주세요.');
    // Only the explicitly confirmed IDs, never new arrivals after the dialog opened.
    const targets = msg.value.map((id: string) => store.get(id));
    if (targets.some((p: Pin | undefined) => !p?.deletedAt || (!isOwner(p, u) && (!admin || p.protected)))) throw new Error('영구 삭제할 권한이 없는 핀이 포함되어 있습니다.');
    for (const p of targets as Pin[]) store.purge(p, u, reason);
    await refresh(); post({ type: 'NOTICE', message: `${targets.length}개 핀을 영구 삭제했어요. 휴지통에서 복구할 수 없습니다.` }); return;
  }
  if (msg.action === 'setupAdmin' || msg.action === 'admins') {
    if (msg.action === 'setupAdmin' ? store.admins.length > 0 : !admin) throw new Error('관리자 설정 권한이 없습니다.');
    if (!reason) throw new Error('관리자 변경 사유를 입력해주세요.');
    const ids = msg.action === 'setupAdmin' ? [u.id] : msg.value;
    if (!Array.isArray(ids) || !ids.length) throw new Error('관리자는 최소 1명이어야 합니다.');
    const admins = ids.map(id => knownUsers().find(v => v.id === id));
    if (admins.some(v => !v)) throw new Error('확인되지 않은 사용자입니다.');
    figma.root.setSharedPluginData(NAMESPACE, `sp2-audit-${uid()}`, JSON.stringify({ at: Date.now(), actor: u, reason, before: store.admins, after: admins }));
    store.setAdmins(admins as PinUser[]);
    await refresh(); return;
  }
  if (msg.action === 'import') {
    if (typeof msg.value !== 'string' || msg.value.length > 5_000_000) throw new Error('백업은 5MB 이하여야 합니다.');
    const data = JSON.parse(msg.value);
    if (data.format !== 'SMARTPIN_BACKUP_V2' || !Array.isArray(data.pins) || data.pins.length > 500) throw new Error('지원하지 않는 백업입니다.');
    for (const p of data.pins) {
      if (typeof p.title !== 'string' || typeof p.content !== 'string' || !['design', 'descript', 'dev', 'ask'].includes(p.category)) throw new Error('백업 내용이 올바르지 않습니다.');
    }
    for (const p of data.pins) {
      const imported: Pin = { id: `import_${uid()}`, nodeId: '', pinNodeId: '', pageId: figma.currentPage.id,
        pageName: figma.currentPage.name, number: (store.all().reduce((m, p) => Math.max(m, p.number || 0), 0)) + 1,
        title: p.title, content: p.content, category: p.category, status: ['todo', 'done', 'pending'].includes(p.status) ? p.status : 'todo',
        group: typeof p.group === 'string' ? p.group : '', createdAt: Date.now(), author: u, badgeMissing: true };
      store.commit(imported, u, '백업에서 새 핀으로 가져오기');
    }
    await refresh(); post({ type: 'NOTICE', message: '백업을 새 핀으로 가져왔어요. 대상 레이어에 다시 연결해주세요.' }); return;
  }
  const p = store.get(msg.id!);
  if (!p) throw new Error('핀을 찾을 수 없습니다.');
  if (msg.revision && msg.revision !== p.revision) throw new Error('핀 정보가 변경됐습니다. 최신 상태에서 다시 시도해주세요.');
  let next = { ...p };
  const owner = isOwner(p, u);
  const targetUser = () => {
    const target = knownUsers().find(v => v.id === msg.value);
    if (!target) throw new Error('확인되지 않은 사용자입니다.');
    return target;
  };
  switch (msg.action) {
    case 'restore': {
      if (!canRestore(p, u, store.admins)) throw new Error('복구할 권한이 없습니다.');
      next = { ...p, deletedAt: undefined, deletedBy: undefined, deleteReason: undefined, badgeMissing: true };
      const all = store.all();
      if (all.some(other => other.id !== p.id && !other.deletedAt && other.number === p.number)) {
        next.number = all.reduce((max, other) => Math.max(max, other.number || 0), 0) + 1;
      }
      const restored = store.commit(next, u, '휴지통에서 복구', p.revision);
      await reconnect(restored);
      await refresh(); post({ type: 'NOTICE', message: '핀을 복구했어요.' }); return;
    }
    case 'purge':
      if (!p.deletedAt || (!owner && !admin) || !reason || (p.protected && !owner)) throw new Error('영구 삭제 권한과 사유를 확인해주세요.');
      store.purge(p, u, reason); await refresh(); post({ type: 'NOTICE', message: '영구 삭제했어요. 휴지통에서는 복구할 수 없습니다.' }); return;
    case 'protect':
      if (!owner || p.deletedAt) throw new Error('작성자만 보호 설정을 변경할 수 있습니다.');
      next.protected = !!msg.value; break;
    case 'editors':
      if (!owner || p.deletedAt || !Array.isArray(msg.value)) throw new Error('작성자만 공동 편집자를 지정할 수 있습니다.');
      const editors = msg.value.map((id: string) => knownUsers().find(v => v.id === id));
      if (editors.some((v: PinUser | undefined) => !v)) throw new Error('확인되지 않은 사용자입니다.');
      next.editors = editors as PinUser[];
      break;
    case 'assignee':
      if (!owner || p.deletedAt) throw new Error('작성자만 담당자를 지정할 수 있습니다.');
      next.assignee = msg.value ? targetUser() : undefined; break;
    case 'transfer':
      if ((!owner && !admin) || !reason || p.deletedAt) throw new Error('소유권 변경 권한과 사유를 확인해주세요.');
      next.author = targetUser(); next.editors = []; next.assignee = undefined; break;
    case 'request': {
      if (p.deletedAt) throw new Error('휴지통의 핀에는 요청을 남길 수 없습니다.');
      if (!['comment', 'edit', 'delete', 'claim'].includes(msg.value?.kind) || typeof msg.value?.text !== 'string' || !msg.value.text.trim() || msg.value.text.length > 4000) throw new Error('의견이나 요청 내용을 4,000자 이내로 입력해주세요.');
      if (msg.value.kind === 'claim' && p.author) throw new Error('이미 작성자가 지정된 핀입니다.');
      next.requests = [...(p.requests || []), { id: uid(), actor: u, at: Date.now(), kind: msg.value.kind, text: msg.value.text.trim() }];
      break;
    }
    case 'resolve': {
      if ((!owner && !admin) || !reason) throw new Error('요청 처리 권한과 사유를 확인해주세요.');
      const request = p.requests?.find(r => r.id === msg.value?.id);
      if (!request || request.resolvedAt) throw new Error('이미 처리된 요청입니다.');
      if (msg.value.accept && request.kind === 'delete') {
        await trashPins([p.id], `삭제 요청 승인: ${reason}`, request.id); return;
      }
      if (msg.value.accept && request.kind === 'claim') {
        if (!admin || p.author) throw new Error('관리자만 기존 핀의 작성자를 지정할 수 있습니다.');
        next.author = request.actor;
      }
      next.requests = p.requests!.map(r => r.id === request.id ? { ...r, resolvedAt: Date.now(), resolvedBy: u } : r);
      break;
    }
    case 'rollback': {
      if (!canEdit(p, u) || !reason) throw new Error('내용 복원 권한과 사유를 확인해주세요.');
      const revision = store.history(p.id).find(r => r.id === msg.value);
      if (!revision) throw new Error('수정 이력을 찾지 못했습니다.');
      const old = revision.pin;
      next = { ...p, title: old.title, content: old.content, category: old.category, status: old.status, group: old.group };
      break;
    }
    case 'relink':
      if (!canEdit(p, u)) throw new Error('다시 연결할 권한이 없습니다.');
      if (figma.currentPage.selection.length !== 1) throw new Error('연결할 레이어 하나를 선택해주세요.');
      await reconnect(p, figma.currentPage.selection[0]); await refresh(); return;
    default: throw new Error('지원하지 않는 작업입니다.');
  }
  const labels: Record<string, string> = { protect: next.protected ? '보호 잠금' : '보호 해제', editors: '공동 편집자 변경', assignee: '담당자 변경', transfer: '소유권 이전', request: '의견 / 요청 등록', resolve: '요청 처리', rollback: '이전 내용으로 복원' };
  store.commit(next, u, `${labels[msg.action]}${reason ? ': ' + reason : ''}`, p.revision);
  await refresh(); post({ type: 'NOTICE', message: '반영했어요.' });
}

function checkAutoFocus(): void {
  const sel = figma.currentPage.selection;
  if (sel.length !== 1) return;
  const pinId = sel[0].getSharedPluginData(NAMESPACE, 'smartPinId')
             || sel[0].getPluginData('smartPinId');
  if (pinId && pins.find(p => p.id === pinId)) {
    autoFocusPinId = pinId;
  }
}

// ─── badge helpers ──────────────────────────────

async function getBadgeEllipse(pinNodeId: string): Promise<EllipseNode | null> {
  const frame = await figma.getNodeByIdAsync(pinNodeId);
  if (!frame || frame.type !== 'FRAME') return null;
  const el = (frame as FrameNode).children.find(c => c.type === 'ELLIPSE');
  return el ? (el as EllipseNode) : null;
}

async function updateBadgeColor(pin: Pin): Promise<void> {
  try {
    const ellipse = await getBadgeEllipse(pin.pinNodeId);
    if (!ellipse) return;
    if (pin.status === 'done') {
      ellipse.fills = [{ type: 'SOLID' as const, color: { r: 0.5, g: 0.5, b: 0.5 }, opacity: 0.5 }];
    } else {
      const color = CAT_COLORS[pin.category];
      if (!color) return;
      ellipse.fills = [{ type: 'SOLID' as const, color }];
    }
  } catch (_) {}
}

// Sync the badge frame's name and visible label with pin.number
async function updateBadgeNumber(pin: Pin): Promise<void> {
  try {
    const frame = await figma.getNodeByIdAsync(pin.pinNodeId);
    if (!frame || frame.type !== 'FRAME') return;
    frame.name = `📌 Pin #${pin.number}`;
    const label = (frame as FrameNode).children.find(c => c.type === 'TEXT') as TextNode | undefined;
    if (!label) return;
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
    label.fontSize = pin.number >= 10 ? 9 : 11;
    label.characters = String(pin.number);
  } catch (_) {}
}

// ─── pin badge creation ─────────────────────────

async function createBadge(node: SceneNode, num: number, category: PinCategory): Promise<{ pinNodeId: string; anchor: PinAnchor }> {
  const bbox = node.absoluteBoundingBox;
  if (!bbox) throw new Error('선택한 레이어의 위치를 가져올 수 없습니다.');

  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

  const frame = figma.createFrame();
  frame.name = `📌 Pin #${num}`;
  frame.resize(PIN_SIZE, PIN_SIZE);
  frame.fills = [];
  frame.strokes = [];
  frame.clipsContent = false;
  frame.locked = false;

  const circle = figma.createEllipse();
  circle.resize(PIN_SIZE, PIN_SIZE);
  circle.x = 0;
  circle.y = 0;
  const badgeColor: RGB = CAT_COLORS[category] ?? CAT_COLORS['design'];
  circle.fills = [{ type: 'SOLID' as const, color: badgeColor }];
  circle.strokes = [{ type: 'SOLID' as const, color: { r: 1, g: 1, b: 1 } }];
  circle.strokeWeight = 1.5;
  circle.strokeAlign = 'OUTSIDE';
  frame.appendChild(circle);

  const label = figma.createText();
  label.fontName = { family: 'Inter', style: 'Bold' };
  label.fontSize = num >= 10 ? 9 : 11;
  label.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  label.textAutoResize = 'NONE';
  label.resize(PIN_SIZE, PIN_SIZE);
  label.textAlignHorizontal = 'CENTER';
  label.textAlignVertical = 'CENTER';
  label.x = 0;
  label.y = 0;
  label.characters = String(num);
  frame.appendChild(label);

  figma.currentPage.appendChild(frame);
  frame.x = bbox.x - PIN_SIZE / 2;
  frame.y = bbox.y - PIN_SIZE / 2;

  const anchor: PinAnchor = {
    left: frame.x - bbox.x,
    top: frame.y - bbox.y,
    right: (bbox.x + bbox.width) - frame.x,
    bottom: (bbox.y + bbox.height) - frame.y,
  };

  return { pinNodeId: frame.id, anchor };
}

// Reposition pin badges to follow their target layer's current position/size,
// using each pin's edge-anchor offsets (closest-edge, like Figma's constraints).
// Where a badge should sit, from its target layer and stored edge anchor.
async function badgePlacement(pin: Pin): Promise<{ frame: FrameNode; target: SceneNode; x: number; y: number } | null> {
  const targetNode = await figma.getNodeByIdAsync(pin.nodeId);
  const badgeNode = await figma.getNodeByIdAsync(pin.pinNodeId);
  if (!targetNode || !badgeNode || badgeNode.type !== 'FRAME' || !pin.anchor) return null;
  const t = (targetNode as SceneNode).absoluteBoundingBox;
  if (!t) return null;
  const { left, top, right, bottom } = pin.anchor;
  return { frame: badgeNode as FrameNode, target: targetNode as SceneNode,
    x: left <= right ? t.x + left : t.x + t.width - right,
    y: top <= bottom ? t.y + top : t.y + t.height - bottom };
}

const absXY = (n: SceneNode) => ({ x: n.absoluteTransform[0][2], y: n.absoluteTransform[1][2] });
const pageOf = (n: BaseNode | null): PageNode | null => { while (n && n.type !== 'PAGE') n = n.parent; return n as PageNode | null; };

async function repositionPins(pageId: string, ids?: string[]): Promise<{ moved: number; total: number }> {
  const targetPins = pins.filter(p => p.pageId === pageId && (!ids || ids.includes(p.id)));
  let moved = 0;
  let changed = false;

  for (const pin of targetPins) {
    try {
      if (!pin.anchor) {
        // Legacy pin: establish baseline anchor from its current position (no movement yet)
        const targetNode = await figma.getNodeByIdAsync(pin.nodeId);
        const badgeNode = await figma.getNodeByIdAsync(pin.pinNodeId);
        const tBbox = targetNode && (targetNode as SceneNode).absoluteBoundingBox;
        if (!badgeNode || !tBbox) continue;
        const { x, y } = absXY(badgeNode as SceneNode);
        pin.anchor = { left: x - tBbox.x, top: y - tBbox.y, right: (tBbox.x + tBbox.width) - x, bottom: (tBbox.y + tBbox.height) - y };
        changed = true;
        continue;
      }
      const place = await badgePlacement(pin);
      if (!place) continue;
      const { frame, target, x, y } = place;
      // A badge dragged onto a frame gets reparented into it; put it back at
      // page level so it never ships inside exported or auto-layout frames.
      const page = pageOf(target);
      if (page && frame.parent !== page) { page.appendChild(frame); moved++; }
      const cur = absXY(frame);
      if (Math.abs(cur.x - x) > 0.5 || Math.abs(cur.y - y) > 0.5) {
        frame.x = x;
        frame.y = y;
        moved++;
      }
    } catch (_) {}
  }

  if (changed) await save();
  return { moved, total: targetPins.length };
}

// ─── read-only canvas diagnostics ───────────────
// The poll only *looks*: copies of a badge (they carry the same smartPinId)
// and badges that drifted from their layer are reported to the UI, which
// offers explicit 정리 / 위치 맞추기 actions. Nothing moves on its own, so the
// canvas never changes under someone's undo history.
const canvasState = { duplicates: new Map<string, string[]>(), drifted: new Set<string>() };

async function scanCanvas(): Promise<void> {
  const page = figma.currentPage;
  const byId = new Map(pins.map(p => [p.id, p]));
  const duplicates = new Map<string, string[]>();
  const frames: SceneNode[] = typeof (page as any).findAllWithCriteria === 'function'
    ? page.findAllWithCriteria({ types: ['FRAME'] })
    : page.findAll(n => n.type === 'FRAME');
  for (const f of frames) {
    if (!f.name.startsWith('📌 Pin #')) continue;
    const id = f.getSharedPluginData(NAMESPACE, 'smartPinId');
    const pin = id ? byId.get(id) : undefined;
    if (pin && f.id !== pin.pinNodeId) duplicates.set(pin.id, [...(duplicates.get(pin.id) || []), f.id]);
  }
  const drifted = new Set<string>();
  for (const pin of pins) {
    if (pin.pageId !== page.id || !pin.anchor) continue;
    try {
      const place = await badgePlacement(pin);
      if (!place) continue;
      const cur = absXY(place.frame);
      if (place.frame.parent?.type !== 'PAGE' || Math.abs(cur.x - place.x) > 1 || Math.abs(cur.y - place.y) > 1) drifted.add(pin.id);
    } catch (_) {}
  }
  canvasState.duplicates = duplicates;
  canvasState.drifted = drifted;
}

async function cleanupBadges(ids: string[]): Promise<number> {
  await scanCanvas();
  let removed = 0;
  for (const id of ids) {
    const pin = store.get(id);
    const copies = canvasState.duplicates.get(id) || [];
    if (!pin || pin.deletedAt || !copies.length) continue;
    requireEditable([pin]);
    const original = await figma.getNodeByIdAsync(pin.pinNodeId);
    let keep: string | null = null;
    if (!original) {
      // The original is gone but a copy survives: adopt that copy instead of
      // reporting a missing badge and making the user create yet another one.
      keep = copies[0];
      store.commit({ ...pin, pinNodeId: keep, badgeMissing: false }, actor(), '복제된 배지로 다시 연결', pin.revision);
    }
    for (const nodeId of copies) {
      if (nodeId === keep) continue;
      const node = await figma.getNodeByIdAsync(nodeId);
      if (node) { node.remove(); removed++; }
    }
    const current = store.get(id);
    if (current) { await updateBadgeNumber(current); await updateBadgeColor(current); }
  }
  return removed;
}

// ─── init ───────────────────────────────────────

const initialized = (async () => {
  pins = await load();

  pinsLoaded = true;
  pageStubs = loadStubs();

  const storedOD = figma.root.getSharedPluginData(NAMESPACE, ONBOARDING_KEY)
                || figma.root.getPluginData(ONBOARDING_KEY);
  onboardingDone = storedOD === 'true' || pins.length > 0;

  checkAutoFocus();

  if (pendingSelectionId) {
    const matched = pins.find(p => p.pinNodeId === pendingSelectionId || p.nodeId === pendingSelectionId);
    if (matched) post({ type: 'PIN_FOCUSED', id: matched.id });
    pendingSelectionId = null;
  }

  postPinsLoaded();
  post({ type: 'SELECTION_CHANGED', ...selectionInfo() });
  if (autoFocusPinId) {
    post({ type: 'AUTO_FOCUS', id: autoFocusPinId });
  }
})();
initialized.catch(e => post({ type: 'ERROR', message: String(e.message || e) }));

// ─── selection listener ─────────────────────────

figma.on('selectionchange', () => {
  const sel = figma.currentPage.selection;
  post({ type: 'SELECTION_CHANGED', hasSelection: sel.length === 1 });

  if (sel.length === 1) {
    const selectedId = sel[0].id;
    if (!pinsLoaded) {
      pendingSelectionId = selectedId;
      return;
    }
    const matched = pins.find(p => p.pinNodeId === selectedId || p.nodeId === selectedId);
    if (matched) {
      post({ type: 'PIN_FOCUSED', id: matched.id });
    }
  }
});

// ─── real-time sync: detect pins added by other users ───────────────────────

let workQueue = Promise.resolve();
function enqueue(work: () => Promise<void>): void {
  workQueue = workQueue.then(work).catch(async e => {
    post({ type: 'ERROR', message: String(e.message || e) });
    try { pins = await load(); postPinsLoaded(); } catch (_) { /* preserve last UI on read failure */ }
  });
}
setInterval(() => enqueue(async () => {
  if (!pinsLoaded) return;
  pins = await load();
  // A missing canvas badge does NOT prove who deleted it. Keep the original
  // text active and offer reconnection; never attribute deletion to the observer.
  for (const p of pins) p.badgeMissing = !(await figma.getNodeByIdAsync(p.pinNodeId));
  try { await scanCanvas(); } catch (_) {}
  postPinsLoaded();
}), 5000);

// ─── page change listener ────────────────────────

figma.on('currentpagechange', () => {
  post({ type: 'PAGE_CHANGED', pageId: figma.currentPage.id, pageName: figma.currentPage.name });
  post({ type: 'SELECTION_CHANGED', hasSelection: figma.currentPage.selection.length === 1 });
});

// ─── message handler ────────────────────────────

async function handleMessage(msg: UIMessage): Promise<void> {
  await initialized;
  if (!['INIT', 'FOCUS_PIN', 'RESIZE', 'OPEN_WEB_VIEWER', 'CLIENT_GET', 'CLIENT_SET'].includes(msg.type)) {
    if (msg.type === 'SAFETY' && ['history', 'export'].includes(msg.action)) { /* read only */ }
    else {
      if (figma.editorType === 'dev') throw new Error('읽기 전용 모드입니다.');
      actor();
    }
  }
  pins = await load();
  switch (msg.type) {
    case 'INIT': {
      pageStubs = loadStubs();
      const storedOD = figma.root.getSharedPluginData(NAMESPACE, ONBOARDING_KEY)
                    || figma.root.getPluginData(ONBOARDING_KEY);
      onboardingDone = storedOD === 'true' || pins.length > 0;
      checkAutoFocus();
      postPinsLoaded();
      post({ type: 'SELECTION_CHANGED', ...selectionInfo() });
      if (autoFocusPinId) {
        post({ type: 'AUTO_FOCUS', id: autoFocusPinId });
      }
      break;
    }

    case 'ADD_PIN': {
      const sel = figma.currentPage.selection;
      if (sel.length !== 1) {
        post({ type: 'ERROR', message: '레이어를 하나만 선택해주세요.' });
        break;
      }
      const node = sel[0];
      const rawCat = msg.category ?? 'design';
      const category: PinCategory = (rawCat in CAT_COLORS) ? rawCat : 'design';
      try {
        const validNums = store.all().map(p => p.number).filter((n): n is number => typeof n === 'number' && !isNaN(n));
        const num = validNums.length > 0 ? Math.max(...validNums) + 1 : 1;
        const { pinNodeId, anchor } = await createBadge(node, num, category);
        const pin: Pin = {
          id: `pin_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          nodeId: node.id,
          pinNodeId,
          pageId: figma.currentPage.id,
          pageName: figma.currentPage.name,
          number: num,
          title: `Note #${num}`,
          content: '',
          category,
          status: 'todo',
          group: msg.group ?? '',
          createdAt: Date.now(),
          anchor,
        };
        const badgeFrame = await figma.getNodeByIdAsync(pinNodeId);
        if (badgeFrame && badgeFrame.type === 'FRAME') {
          (badgeFrame as FrameNode).setSharedPluginData(NAMESPACE, 'smartPinId', pin.id);
        }
        pins.push(pin);
        await save();
        post({ type: 'PIN_ADDED', pin });
      } catch (e: any) {
        post({ type: 'ERROR', message: e?.message ?? '핀 생성에 실패했습니다.' });
      }
      break;
    }

    case 'UPDATE_PIN': {
      const old = store.get(msg.pin.id);
      if (!old) throw new Error('핀을 찾을 수 없습니다.');
      const next = editablePatch(old, msg.pin, currentUser());
      const updated = JSON.stringify(old) === JSON.stringify(next) ? old : store.commit(next, actor(), '내용 / 상태 변경', old.revision);
      await updateBadgeColor(updated);
      post({ type: 'PIN_UPDATED', pin: updated });
      if (!msg.quiet) post({ type: 'NOTICE', message: '저장했어요.' });
      break;
    }

    case 'DELETE_PIN': {
      await trashPins([msg.id], '작성자 삭제');
      break;
    }
    case 'SAFETY': await handleSafety(msg); break;

    case 'FOCUS_PIN': {
      const pin = pins.find(p => p.pinNodeId === msg.pinNodeId);
      try {
        if (pin?.pageId && pin.pageId !== figma.currentPage.id) {
          const pageNode = await figma.getNodeByIdAsync(pin.pageId);
          if (pageNode && pageNode.type === 'PAGE') {
            await figma.setCurrentPageAsync(pageNode as PageNode);
          }
        }
        const node = await figma.getNodeByIdAsync(msg.pinNodeId);
        if (node) {
          figma.currentPage.selection = [node as SceneNode];
          figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
        }
      } catch (e: any) {
        post({ type: 'ERROR', message: '페이지 이동에 실패했습니다.' });
      }
      break;
    }

    case 'SET_CUSTOM_KEY': {
      let key = msg.key;
      if (key.includes('figma.com')) {
        const match = key.match(/figma\.com\/(file|design|board)\/([^\/?]+)/);
        if (match) key = match[2];
      }
      figma.root.setSharedPluginData(NAMESPACE, 'customFileKey', key);
      postPinsLoaded();
      break;
    }

    case 'RENAME_PAGE_GROUP': {
      requireEditable(pins.filter(p => p.pageId === msg.pageId));
      pins = pins.map(p =>
        p.pageId === msg.pageId ? { ...p, pageName: msg.newName } : p
      );
      pageStubs = pageStubs.map(s =>
        s.pageId === msg.pageId ? { ...s, pageName: msg.newName } : s
      );
      await save();
      saveStubs();
      postPinsLoaded();
      break;
    }

    case 'DELETE_PAGE_GROUP': {
      const targets = pins.filter(p => p.pageId === msg.pageId && isOwner(p, currentUser()));
      if (!targets.length) throw new Error('이 페이지에 삭제할 내 핀이 없습니다.');
      await trashPins(targets.map(p => p.id), '페이지에서 내 핀 일괄 삭제');
      break;
    }

    case 'ADD_PAGE_STUB': {
      const stubPageId = figma.currentPage.id;
      pageStubs = pageStubs.filter(s => s.pageId !== stubPageId);
      pageStubs.push({ pageId: stubPageId, pageName: msg.pageName || figma.currentPage.name });
      saveStubs();
      postPinsLoaded();
      break;
    }

    case 'SET_FILE_ORDER':
      figma.root.setSharedPluginData(NAMESPACE, FILE_ORDER_KEY, JSON.stringify(msg.order));
      break;

    case 'SET_GROUP_ORDER': {
      const orders = loadGroupOrders();
      orders[msg.pageId] = msg.order;
      figma.root.setSharedPluginData(NAMESPACE, GROUP_ORDER_KEY, JSON.stringify(orders));
      break;
    }

    case 'RESIZE': {
      figma.ui.resize(msg.width, msg.height);
      break;
    }

    // The UI iframe is sandboxed without same-origin, so localStorage is not
    // available there; per-user UI flags live in figma.clientStorage instead.
    case 'CLIENT_GET': {
      const flags: Record<string, string> = {};
      const keys = Array.isArray(msg.keys) ? msg.keys.filter(k => typeof k === 'string' && k.length <= 64).slice(0, 20) : [];
      for (const k of keys) {
        try { const v = figma.clientStorage ? await figma.clientStorage.getAsync(`ui:${k}`) : undefined; flags[k] = typeof v === 'string' ? v : ''; }
        catch (_) { flags[k] = ''; }
      }
      post({ type: 'CLIENT_FLAGS', flags });
      break;
    }
    case 'CLIENT_SET': {
      if (typeof msg.key !== 'string' || msg.key.length > 64 || typeof msg.value !== 'string' || msg.value.length > 2000) break;
      try { if (figma.clientStorage) await figma.clientStorage.setAsync(`ui:${msg.key}`, msg.value); } catch (_) {}
      break;
    }

    case 'ONBOARDING_DONE': {
      onboardingDone = true;
      figma.root.setSharedPluginData(NAMESPACE, ONBOARDING_KEY, 'true');
      break;
    }

    case 'REPOSITION_PINS': {
      const ids = Array.isArray(msg.ids) ? msg.ids.filter((id): id is string => typeof id === 'string') : undefined;
      requireEditable(pins.filter(p => p.pageId === msg.pageId && (!ids || ids.includes(p.id))));
      const { moved, total } = await repositionPins(msg.pageId, ids);
      try { await scanCanvas(); } catch (_) {}
      postPinsLoaded();
      post({ type: 'REPOSITION_DONE', pageId: msg.pageId, moved, total });
      break;
    }

    case 'BADGE_CLEANUP': {
      const ids = Array.isArray(msg.ids) ? msg.ids.filter((id): id is string => typeof id === 'string') : [];
      const removed = await cleanupBadges(ids);
      await scanCanvas();
      await refresh();
      post({ type: 'NOTICE', message: removed ? `복제된 배지 ${removed}개를 정리했어요.` : '배지를 정리했어요.' });
      break;
    }

    case 'REORDER_PINS': {
      requireEditable(msg.order.map(id => pins.find(p => p.id === id)).filter((p): p is Pin => !!p));
      requireEditable(msg.renumbers.map(r => pins.find(p => p.id === r.id)).filter((p): p is Pin => !!p));
      const orders = loadPinOrders();
      orders[msg.orderKey] = msg.order;
      figma.root.setSharedPluginData(NAMESPACE, PIN_ORDER_KEY, JSON.stringify(orders));

      const changed: Pin[] = [];
      for (const { id, number } of msg.renumbers) {
        const pin = pins.find(p => p.id === id);
        if (pin && pin.number !== number) {
          pin.number = number;
          await updateBadgeNumber(pin);
          changed.push(pin);
        }
      }
      if (changed.length > 0) {
        await save();
        post({ type: 'PIN_NUMBERS_CHANGED', pins: changed, reason: 'reorder' });
      }
      break;
    }

    case 'SET_PIN_NUMBER': {
      const pin = pins.find(p => p.id === msg.id);
      if (!pin) break;
      if (!Number.isInteger(msg.number) || msg.number < 1) throw new Error('올바른 번호를 입력해주세요.');
      requireEditable([pin, ...pins.filter(p => p.id === msg.swapWithId)]);
      const changed: Pin[] = [];
      if (msg.swapWithId) {
        const other = pins.find(p => p.id === msg.swapWithId);
        if (other) {
          const tmp = pin.number;
          pin.number = other.number;
          other.number = tmp;
          await updateBadgeNumber(pin);
          await updateBadgeNumber(other);
          changed.push(pin, other);
        }
      } else if (pin.number !== msg.number) {
        pin.number = msg.number;
        await updateBadgeNumber(pin);
        changed.push(pin);
      }
      if (changed.length > 0) {
        await save();
        post({ type: 'PIN_NUMBERS_CHANGED', pins: changed, reason: msg.swapWithId ? 'swap' : 'edit' });
      }
      break;
    }

    case 'OPEN_WEB_VIEWER': {
      // 핀 데이터는 UI 쪽에서 이미 클립보드로 복사됨(URL 길이 제한 회피).
      // 여기서는 짧은 URL만 열어 OS/브라우저별 URL 길이 제한 문제를 원천 차단한다.
      const base = 'https://jhlee3663-netizen.github.io/imbc_smart-pin/';
      figma.openExternal(`${base}#paste=1`);
      break;
    }

    case 'COMPACT_NUMBERS': {
      requireEditable(pins);
      await figma.loadAllPagesAsync();
      const sorted = [...pins].sort((a, b) => {
        const an = typeof a.number === 'number' && !isNaN(a.number) ? a.number : Infinity;
        const bn = typeof b.number === 'number' && !isNaN(b.number) ? b.number : Infinity;
        return an - bn;
      });
      const changed: Pin[] = [];
      sorted.forEach((pin, i) => {
        const newNum = i + 1;
        if (pin.number !== newNum) {
          pin.number = newNum;
          changed.push(pin);
        }
      });
      for (const pin of changed) await updateBadgeNumber(pin);
      if (changed.length > 0) await save();
      post({ type: 'PIN_NUMBERS_CHANGED', pins: changed, reason: 'compact' });
      break;
    }
  }
}
figma.ui.onmessage = (msg: UIMessage) => enqueue(() => handleMessage(msg));
