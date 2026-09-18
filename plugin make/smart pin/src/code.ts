import { Pin, PinCategory, PinAnchor, PageStub, UIMessage, PluginMessage } from './types';

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
const CODE_VERSION = 6;

// Figma caps each pluginData entry at 100kB. Budget both UTF-8 bytes and UTF-16
// code units so the chunk stays under the cap regardless of how Figma measures it.
const CHUNK_MAX_BYTES = 70 * 1024;
const CHUNK_MAX_CHARS = 40000;
const MAX_CHUNKS = 40;

figma.showUI(__html__, { width: 720, height: 960, title: 'Smart Pin' });

let pins: Pin[] = [];
let pageStubs: PageStub[] = [];
let autoFocusPinId: string | null = null;
let pinsLoaded = false;
let pendingSelectionId: string | null = null;
let onboardingDone = false;
let lastSharedData = ''; // for real-time sync detection
let lastMeta = '';       // chunk manifest last written/read by this session

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
  try {
    const data = JSON.parse(rawData);
    if (!Array.isArray(data)) return [];
    return data.map((p: any) => ({
      ...p,
      category: migrateCategory(p.category),
      status: migrateStatus(p.status),
      group: p.group ?? '',
      pageId: p.pageId ?? '',
      pageName: p.pageName ?? '',
    }));
  } catch { return []; }
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

function splitIntoChunks(s: string): string[] {
  const chunks: string[] = [];
  let start = 0, bytes = 0, chars = 0, i = 0;
  while (i < s.length) {
    const code = s.charCodeAt(i);
    const isPair = code >= 0xd800 && code <= 0xdbff && i + 1 < s.length;
    const step = isPair ? 2 : 1;
    const size = code < 0x80 ? 1 : code < 0x800 ? 2 : isPair ? 4 : 3;
    if (i > start && (bytes + size > CHUNK_MAX_BYTES || chars + step > CHUNK_MAX_CHARS)) {
      chunks.push(s.slice(start, i));
      start = i; bytes = 0; chars = 0;
    }
    bytes += size; chars += step; i += step;
  }
  chunks.push(s.slice(start));
  return chunks;
}

function clearChunksFrom(firstUnused: number): void {
  try {
    for (const key of figma.root.getSharedPluginDataKeys(NAMESPACE)) {
      if (key.indexOf(CHUNK_PREFIX) !== 0) continue;
      const idx = parseInt(key.slice(CHUNK_PREFIX.length), 10);
      if (!isNaN(idx) && idx >= firstUnused) {
        figma.root.setSharedPluginData(NAMESPACE, key, '');
      }
    }
  } catch (_) {}
}

// Returns the manifest written, so callers can keep their sync marker in step.
function writeChunked(data: string): string {
  const chunks = splitIntoChunks(data);
  if (chunks.length > MAX_CHUNKS) {
    throw new Error('핀 데이터가 저장 한도를 초과했습니다. 오래된 핀을 정리해주세요.');
  }
  for (let i = 0; i < chunks.length; i++) {
    figma.root.setSharedPluginData(NAMESPACE, CHUNK_PREFIX + i, chunks[i]);
  }
  const meta = JSON.stringify({ c: chunks.length, h: hashString(data), t: Date.now() });
  figma.root.setSharedPluginData(NAMESPACE, CHUNK_META_KEY, meta);
  clearChunksFrom(chunks.length);

  // Keep the legacy single entry usable for older plugin builds while it fits.
  if (chunks.length === 1) {
    figma.root.setSharedPluginData(NAMESPACE, STORAGE_KEY, data);
  } else if (figma.root.getSharedPluginData(NAMESPACE, STORAGE_KEY)) {
    figma.root.setSharedPluginData(NAMESPACE, STORAGE_KEY, '');
  }
  return meta;
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
  try {
    const chunked = readChunked();
    if (chunked) {
      lastSharedData = chunked.data;
      lastMeta = chunked.meta;
      return parseRawPins(chunked.data);
    }

    // Try shared storage first (works across all plugin ID versions)
    let rawData = figma.root.getSharedPluginData(NAMESPACE, STORAGE_KEY);
    if (!rawData) {
      // Migrate from old plugin-specific storage
      rawData = figma.root.getPluginData(STORAGE_KEY);
    }
    if (rawData) {
      lastSharedData = rawData;
      if (figma.editorType !== 'dev') {
        try {
          lastMeta = writeChunked(rawData);
          figma.root.setPluginData(STORAGE_KEY, '');
        } catch (_) {}
      }
      return parseRawPins(rawData);
    }
    return [];
  } catch {
    return [];
  }
}

async function save(): Promise<void> {
  if (figma.editorType === 'dev') return;
  const data = JSON.stringify(pins);
  try {
    lastMeta = writeChunked(data);
    lastSharedData = data;
  } catch (e: any) {
    post({ type: 'ERROR', message: e?.message ?? '핀 데이터 저장에 실패했습니다.' });
  }
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
    pins,
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
  });
}

function selectionInfo(): { hasSelection: boolean } {
  return { hasSelection: figma.currentPage.selection.length === 1 };
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
async function repositionPins(pageId: string): Promise<{ moved: number; total: number }> {
  const targetPins = pins.filter(p => p.pageId === pageId);
  let moved = 0;
  let changed = false;

  for (const pin of targetPins) {
    try {
      const targetNode = await figma.getNodeByIdAsync(pin.nodeId);
      const badgeNode = await figma.getNodeByIdAsync(pin.pinNodeId);
      if (!targetNode || !badgeNode) continue;

      const tBbox = (targetNode as SceneNode).absoluteBoundingBox;
      if (!tBbox) continue;

      const frame = badgeNode as FrameNode;

      if (!pin.anchor) {
        // Legacy pin: establish baseline anchor from its current position (no movement yet)
        pin.anchor = {
          left: frame.x - tBbox.x,
          top: frame.y - tBbox.y,
          right: (tBbox.x + tBbox.width) - frame.x,
          bottom: (tBbox.y + tBbox.height) - frame.y,
        };
        changed = true;
        continue;
      }

      const { left, top, right, bottom } = pin.anchor;
      const newX = left <= right ? tBbox.x + left : tBbox.x + tBbox.width - right;
      const newY = top <= bottom ? tBbox.y + top : tBbox.y + tBbox.height - bottom;

      if (Math.abs(frame.x - newX) > 0.5 || Math.abs(frame.y - newY) > 0.5) {
        frame.x = newX;
        frame.y = newY;
        moved++;
        changed = true;
      }
    } catch (_) {}
  }

  if (changed) await save();
  return { moved, total: targetPins.length };
}

// ─── init ───────────────────────────────────────

(async () => {
  pins = await load();

  // If no stored data found, scan canvas badges to recover
  if (pins.length === 0) {
    pins = await scanAndRecover();
    if (pins.length > 0) {
      await save(); // persist recovered data
    }
  }

  // Filter orphaned badges (badge node deleted from canvas)
  // Only save if we actually removed some — never save an all-zero result to avoid data wipe
  if (pins.length > 0) {
    const nodeChecks = await Promise.all(pins.map(p => figma.getNodeByIdAsync(p.pinNodeId)));
    const filtered = pins.filter((_, i) => nodeChecks[i] !== null);
    if (filtered.length > 0 && filtered.length < pins.length) {
      pins = filtered;
      await save();
    } else if (filtered.length > 0) {
      pins = filtered;
    }
    // If filtered.length === 0, keep original pins (suspicious — don't wipe data)
  }

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

setInterval(() => {
  if (!pinsLoaded) return;

  const meta = figma.root.getSharedPluginData(NAMESPACE, CHUNK_META_KEY);
  if (meta) {
    if (meta === lastMeta) return;
    // Null here usually means another editor is mid-write; retry on the next tick.
    const chunked = readChunked();
    if (!chunked) return;
    lastMeta = chunked.meta;
    lastSharedData = chunked.data;
    const freshPins = parseRawPins(chunked.data);
    if (freshPins.length > 0) {
      pins = freshPins;
      postPinsLoaded();
    }
    return;
  }

  // File still on the legacy single-entry format (edited by an older build).
  const currentData = figma.root.getSharedPluginData(NAMESPACE, STORAGE_KEY);
  if (currentData && currentData !== lastSharedData) {
    lastSharedData = currentData;
    const freshPins = parseRawPins(currentData);
    if (freshPins.length > 0) {
      pins = freshPins;
      postPinsLoaded();
    }
  }
}, 5000);

// ─── poll for externally deleted pin badges ───────

setInterval(async () => {
  if (!pinsLoaded || pins.length === 0) return;
  const nodeChecks = await Promise.all(pins.map(p => figma.getNodeByIdAsync(p.pinNodeId)));
  const toDelete = pins.filter((p, i) => nodeChecks[i] === null);
  if (toDelete.length === 0) return;
  if (toDelete.length === pins.length) return; // all gone — suspicious, skip
  const deletedIds = new Set(toDelete.map(p => p.pinNodeId));
  pins = pins.filter(p => !deletedIds.has(p.pinNodeId));
  save();
  toDelete.forEach(p => post({ type: 'PIN_DELETED', id: p.id }));
}, 5000);

// ─── page change listener ────────────────────────

figma.on('currentpagechange', () => {
  post({ type: 'PAGE_CHANGED', pageId: figma.currentPage.id, pageName: figma.currentPage.name });
  post({ type: 'SELECTION_CHANGED', hasSelection: figma.currentPage.selection.length === 1 });
});

// ─── message handler ────────────────────────────

figma.ui.onmessage = async (msg: UIMessage) => {
  switch (msg.type) {
    case 'INIT': {
      pins = await load();
      if (pins.length === 0) {
        pins = await scanAndRecover();
        if (pins.length > 0) await save();
      }
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
        const validNums = pins.map(p => p.number).filter((n): n is number => typeof n === 'number' && !isNaN(n));
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
      let idx = pins.findIndex(p => p.id === msg.pin.id);
      if (idx === -1) {
        pins = await load();
        idx = pins.findIndex(p => p.id === msg.pin.id);
      }
      if (idx !== -1) {
        const inCat = msg.pin.category;
        const safeCat: PinCategory = (inCat in CAT_COLORS) ? inCat : 'design';
        const updated: Pin = { ...msg.pin, category: safeCat, updatedAt: new Date().toISOString() };
        pins[idx] = updated;
        await save();
        await updateBadgeColor(updated);
        post({ type: 'PIN_UPDATED', pin: updated });
      }
      break;
    }

    case 'DELETE_PIN': {
      const pin = pins.find(p => p.id === msg.id);
      if (pin) {
        const node = await figma.getNodeByIdAsync(pin.pinNodeId);
        if (node) (node as SceneNode).remove();
        pins = pins.filter(p => p.id !== msg.id);
        await save();
        post({ type: 'PIN_DELETED', id: msg.id });
      }
      break;
    }

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
      const toDelete = pins.filter(p => p.pageId === msg.pageId);
      for (const pin of toDelete) {
        try {
          const node = await figma.getNodeByIdAsync(pin.pinNodeId);
          if (node) (node as SceneNode).remove();
        } catch (_) {}
      }
      pins = pins.filter(p => p.pageId !== msg.pageId);
      pageStubs = pageStubs.filter(s => s.pageId !== msg.pageId);
      await save();
      saveStubs();
      postPinsLoaded();
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

    case 'ONBOARDING_DONE': {
      onboardingDone = true;
      figma.root.setSharedPluginData(NAMESPACE, ONBOARDING_KEY, 'true');
      break;
    }

    case 'REPOSITION_PINS': {
      const { moved, total } = await repositionPins(msg.pageId);
      post({ type: 'REPOSITION_DONE', pageId: msg.pageId, moved, total });
      break;
    }

    case 'REORDER_PINS': {
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
};
