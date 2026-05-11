export type PinCategory = 'design' | 'descript' | 'dev' | 'ask';
export type PinStatus = 'todo' | 'done' | 'pending';

export interface PageStub {
  pageId: string;
  pageName: string;
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
}

// UI → Plugin
export type UIMessage =
  | { type: 'INIT' }
  | { type: 'ADD_PIN'; category: PinCategory; group: string }
  | { type: 'UPDATE_PIN'; pin: Pin }
  | { type: 'DELETE_PIN'; id: string }
  | { type: 'FOCUS_PIN'; pinNodeId: string }
  | { type: 'RESIZE'; width: number; height: number }
  | { type: 'SET_CUSTOM_KEY'; key: string }
  | { type: 'RENAME_PAGE_GROUP'; pageId: string; newName: string }
  | { type: 'DELETE_PAGE_GROUP'; pageId: string }
  | { type: 'ADD_PAGE_STUB'; pageName: string }
  | { type: 'SET_FILE_ORDER'; order: string[] }
  | { type: 'SET_GROUP_ORDER'; pageId: string; order: string[] }
  | { type: 'ONBOARDING_DONE' };

// Plugin → UI
export type PluginMessage =
  | { type: 'PINS_LOADED'; pins: Pin[]; pageStubs: PageStub[]; fileKey: string | null | undefined; currentPageId: string; currentPageName: string; codeVersion: number; fileOrder: string[]; groupOrders: Record<string, string[]>; onboardingDone: boolean }
  | { type: 'PIN_ADDED'; pin: Pin }
  | { type: 'PIN_UPDATED'; pin: Pin }
  | { type: 'PIN_DELETED'; id: string }
  | { type: 'SELECTION_CHANGED'; hasSelection: boolean }
  | { type: 'PIN_FOCUSED'; id: string }
  | { type: 'AUTO_FOCUS'; id: string }
  | { type: 'PAGE_CHANGED'; pageId: string; pageName: string }
  | { type: 'ERROR'; message: string };
