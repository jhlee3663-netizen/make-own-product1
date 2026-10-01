export type PinCategory = 'design' | 'descript' | 'dev' | 'ask';
export type PinStatus = 'todo' | 'done' | 'pending';

export interface PinUser { id: string; name: string }
export interface PinRequest {
  id: string; kind: 'comment' | 'edit' | 'delete' | 'claim'; text: string;
  actor: PinUser; at: number; resolvedAt?: number; resolvedBy?: PinUser;
}
export interface PinRevision { id: string; at: number; actor: PinUser; action: string; pin: Pin; conflict?: boolean }
export interface SafetyState {
  user: PinUser | null; admins: PinUser[]; trash: Pin[]; users: PinUser[];
  ready: boolean;
  adminHistory?: { at: number; actor: PinUser; reason: string; before: PinUser[]; after: PinUser[] }[];
}

export interface PageStub {
  pageId: string;
  pageName: string;
}

export interface PinAnchor {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Pin {
  id: string;
  nodeId: string;
  pinNodeId: string;
  pageId: string;      // figma.currentPage.id at creation time
  pageName: string;    // figma.currentPage.name at creation time
  number: number;
  title: string;
  content: string;
  category: PinCategory;
  status: PinStatus;
  group?: string;
  createdAt: number;
  updatedAt?: string;
  anchor?: PinAnchor;  // offsets from target node's edges, used to reposition pin after layout changes
  author?: PinUser;
  editors?: PinUser[];
  assignee?: PinUser;
  protected?: boolean;
  revision?: string;
  deletedAt?: number;
  deletedBy?: PinUser;
  deleteReason?: string;
  badgeMissing?: boolean;
  requests?: PinRequest[];
  conflictCount?: number; // derived from retained concurrent branches, never an authority field
}

// UI → Plugin
export type UIMessage =
  | { type: 'INIT' }
  | { type: 'ADD_PIN'; category: PinCategory; group: string }
  | { type: 'UPDATE_PIN'; pin: Pin; quiet?: boolean }
  | { type: 'SAFETY'; action: 'restore' | 'purge' | 'emptyTrash' | 'protect' | 'editors' | 'transfer' | 'assignee' | 'request' | 'resolve' | 'history' | 'rollback' | 'relink' | 'setupAdmin' | 'admins' | 'export' | 'import'; id?: string; revision?: string; value?: any; reason?: string }
  | { type: 'DELETE_PIN'; id: string }
  | { type: 'FOCUS_PIN'; pinNodeId: string }
  | { type: 'RESIZE'; width: number; height: number }
  | { type: 'SET_CUSTOM_KEY'; key: string }
  | { type: 'RENAME_PAGE_GROUP'; pageId: string; newName: string }
  | { type: 'DELETE_PAGE_GROUP'; pageId: string }
  | { type: 'ADD_PAGE_STUB'; pageName: string }
  | { type: 'SET_FILE_ORDER'; order: string[] }
  | { type: 'SET_GROUP_ORDER'; pageId: string; order: string[] }
  | { type: 'ONBOARDING_DONE' }
  | { type: 'REPOSITION_PINS'; pageId: string }
  | { type: 'REORDER_PINS'; orderKey: string; order: string[]; renumbers: { id: string; number: number }[] }
  | { type: 'SET_PIN_NUMBER'; id: string; number: number; swapWithId?: string }
  | { type: 'COMPACT_NUMBERS' }
  | { type: 'OPEN_WEB_VIEWER' }
  // Per-user UI preferences (tutorial seen, hints). Never pin data or permissions.
  | { type: 'CLIENT_GET'; keys: string[] }
  | { type: 'CLIENT_SET'; key: string; value: string };

// Plugin → UI
export type PluginMessage =
  | { type: 'PINS_LOADED'; pins: Pin[]; pageStubs: PageStub[]; fileKey: string | null | undefined; currentPageId: string; currentPageName: string; codeVersion: number; fileOrder: string[]; groupOrders: Record<string, string[]>; pinOrders: Record<string, string[]>; onboardingDone: boolean; isDevMode?: boolean; safety?: SafetyState }
  | { type: 'NOTICE'; message: string; undoIds?: string[] }
  | { type: 'HISTORY'; id: string; revisions: PinRevision[] }
  | { type: 'BACKUP'; data: string }
  | { type: 'PIN_ADDED'; pin: Pin }
  | { type: 'PIN_UPDATED'; pin: Pin }
  | { type: 'PIN_DELETED'; id: string }
  | { type: 'SELECTION_CHANGED'; hasSelection: boolean }
  | { type: 'PIN_FOCUSED'; id: string }
  | { type: 'AUTO_FOCUS'; id: string }
  | { type: 'PAGE_CHANGED'; pageId: string; pageName: string }
  | { type: 'REPOSITION_DONE'; pageId: string; moved: number; total: number }
  | { type: 'PIN_NUMBERS_CHANGED'; pins: Pin[]; reason: 'reorder' | 'swap' | 'edit' | 'compact' }
  | { type: 'CLIENT_FLAGS'; flags: Record<string, string> }
  | { type: 'ERROR'; message: string };
