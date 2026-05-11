import { Pin, PinCategory, PageStub, UIMessage, PluginMessage } from './types';

const STORAGE_KEY      = 'smart-pin-v1';
const STUBS_KEY        = 'smart-pin-stubs-v1';
const FILE_ORDER_KEY   = 'smart-pin-file-order-v1';
const GROUP_ORDER_KEY  = 'smart-pin-group-order-v1';
const PIN_SIZE = 24;
const CODE_VERSION = 2; // ← 기능 추가/변경 시 이 숫자를 올려주세요

figma.showUI(__html__, { width: 400, height: 550, title: 'Smart Pin' });

let pins: Pin[] = [];
let pageStubs: PageStub[] = [];
let autoFocusPinId: string | null = null;
let pinsLoaded = false;
let pendingSelectionId: string | null = null; // badge node id to focus after load
let onboardingDone = false; // cached across calls; persisted in clientStorage (global, cross-file)

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

async function load(): Promise<Pin[]> {
  try {
    const rawData = figma.root.getPluginData(STORAGE_KEY);
    if (!rawData) return [];
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
  } catch {
    return [];
  }
}

async function save(): Promise<void> {
  figma.root.setPluginData(STORAGE_KEY, JSON.stringify(pins));
}

function loadStubs(): PageStub[] {
  try {
    const raw = figma.root.getPluginData(STUBS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

function saveStubs(): void {
  figma.root.setPluginData(STUBS_KEY, JSON.stringify(pageStubs));
}

function loadFileOrder(): string[] {
  try {
    const raw = figma.root.getPluginData(FILE_ORDER_KEY);
    if (!raw) return [];
    const d = JSON.parse(raw);
    return Array.isArray(d) ? d : [];
  } catch { return []; }
}

function loadGroupOrders(): Record<string, string[]> {
  try {
    const raw = figma.root.getPluginData(GROUP_ORDER_KEY);
    if (!raw) return {};
    return JSON.parse(raw) ?? {};
  } catch { return {}; }
}

function postPinsLoaded(): void {
  const fileKey = figma.fileKey || figma.root.getPluginData('customFileKey') || null;
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
    onboardingDone: onboardingDone || pins.length > 0,
  });
}

function selectionInfo(): { hasSelection: boolean } {
  return { hasSelection: figma.currentPage.selection.length === 1 };
}

// Check if currently selected node is a pin badge → store for AUTO_FOCUS
function checkAutoFocus(): void {
  const sel = figma.currentPage.selection;
  if (sel.length !== 1) return;
  const pinId = sel[0].getPluginData('smartPinId');
  if (pinId && pins.find(p => p.id === pinId)) {
    autoFocusPinId = pinId;
  }
}

// ─── badge helpers ──────────────────────────────

function getBadgeEllipse(pinNodeId: string): EllipseNode | null {
  const frame = figma.getNodeById(pinNodeId);
  if (!frame || frame.type !== 'FRAME') return null;
  const el = (frame as FrameNode).children.find(c => c.type === 'ELLIPSE');
  return el ? (el as EllipseNode) : null;
}

function updateBadgeColor(pin: Pin): void {
  try {
    const ellipse = getBadgeEllipse(pin.pinNodeId);
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

// ─── pin badge creation ─────────────────────────

async function createBadge(node: SceneNode, num: number, category: PinCategory): Promise<string> {
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
  circle.fills = [{ type: 'SOLID' as const, color: CAT_COLORS[category] }];
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

  return frame.id;
}

// ─── init ───────────────────────────────────────

(async () => {
  pins = await load();
  pins = pins.filter(p => figma.getNodeById(p.pinNodeId) !== null);
  await save();
  pinsLoaded = true;
  pageStubs = loadStubs();

  const storedOD = await figma.clientStorage.getAsync('onboardingDone');
  onboardingDone = storedOD === true || pins.length > 0;

  checkAutoFocus();

  // Re-check any selection that arrived before pins finished loading
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
      // Pins not ready yet — remember this node to re-check after load
      pendingSelectionId = selectedId;
      return;
    }
    const matched = pins.find(p => p.pinNodeId === selectedId || p.nodeId === selectedId);
    if (matched) {
      post({ type: 'PIN_FOCUSED', id: matched.id });
    }
  }
});

// ─── poll for externally deleted pin badges ───────
// Figma's plugin API doesn't expose a node-delete event, so we poll
// every 2 s to detect badges removed directly on the canvas.

setInterval(() => {
  if (!pinsLoaded) return;
  const toDelete = pins.filter(p => figma.getNodeById(p.pinNodeId) === null);
  if (toDelete.length === 0) return;
  const deletedIds = new Set(toDelete.map(p => p.pinNodeId));
  pins = pins.filter(p => !deletedIds.has(p.pinNodeId));
  save();
  toDelete.forEach(p => post({ type: 'PIN_DELETED', id: p.id }));
}, 2000);

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
      pageStubs = loadStubs();
      const storedOD = await figma.clientStorage.getAsync('onboardingDone');
      onboardingDone = storedOD === true || pins.length > 0;
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
      const category: PinCategory = msg.category ?? 'design';
      try {
        const num = pins.length > 0 ? Math.max(...pins.map(p => p.number)) + 1 : 1;
        const pinNodeId = await createBadge(node, num, category);
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
        };
        // Tag badge frame with pin id for deep link auto-focus
        const badgeFrame = figma.getNodeById(pinNodeId);
        if (badgeFrame && badgeFrame.type === 'FRAME') {
          (badgeFrame as FrameNode).setPluginData('smartPinId', pin.id);
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
      const idx = pins.findIndex(p => p.id === msg.pin.id);
      if (idx !== -1) {
        const updated: Pin = { ...msg.pin, updatedAt: new Date().toISOString() };
        pins[idx] = updated;
        await save();
        updateBadgeColor(updated);
        post({ type: 'PIN_UPDATED', pin: updated });
      }
      break;
    }

    case 'DELETE_PIN': {
      const pin = pins.find(p => p.id === msg.id);
      if (pin) {
        const node = figma.getNodeById(pin.pinNodeId);
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
        // Cross-page navigation: switch page first if the pin is on a different page
        if (pin?.pageId && pin.pageId !== figma.currentPage.id) {
          const pageNode = figma.getNodeById(pin.pageId);
          if (pageNode && pageNode.type === 'PAGE') {
            await figma.setCurrentPageAsync(pageNode as PageNode);
          }
        }
        const node = figma.getNodeById(msg.pinNodeId);
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
      figma.root.setPluginData('customFileKey', key);
      postPinsLoaded();
      break;
    }

    case 'RENAME_PAGE_GROUP': {
      pins = pins.map(p =>
        p.pageId === msg.pageId ? { ...p, pageName: msg.newName } : p
      );
      // Also update matching stub
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
          const node = figma.getNodeById(pin.pinNodeId);
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
      figma.root.setPluginData(FILE_ORDER_KEY, JSON.stringify(msg.order));
      break;

    case 'SET_GROUP_ORDER': {
      const orders = loadGroupOrders();
      orders[msg.pageId] = msg.order;
      figma.root.setPluginData(GROUP_ORDER_KEY, JSON.stringify(orders));
      break;
    }

    case 'RESIZE': {
      figma.ui.resize(msg.width, msg.height);
      break;
    }

    case 'ONBOARDING_DONE': {
      onboardingDone = true;
      await figma.clientStorage.setAsync('onboardingDone', true);
      break;
    }
  }
};
