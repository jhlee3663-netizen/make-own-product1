import { getUserStorage, removeUserStorage, setUserStorage } from './userStorage.js';

const DRAFT_VERSION = 1;
const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function recordDraftKey(kind, targetId = 'new') {
  return `record_draft:${kind}:${targetId || 'new'}`;
}

export function loadRecordDraft(uid, kind, targetId = 'new', now = Date.now()) {
  const key = recordDraftKey(kind, targetId);
  const raw = getUserStorage(uid, key);
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw);
    const valid = draft?.version === DRAFT_VERSION
      && draft.kind === kind
      && draft.targetId === (targetId || 'new')
      && Number.isFinite(draft.updatedAt)
      && now - draft.updatedAt <= DRAFT_MAX_AGE_MS
      && draft.data && typeof draft.data === 'object';
    if (valid) return draft.data;
  } catch {}
  removeUserStorage(uid, key);
  return null;
}

export function saveRecordDraft(uid, kind, targetId = 'new', data, now = Date.now()) {
  return setUserStorage(uid, recordDraftKey(kind, targetId), JSON.stringify({
    version: DRAFT_VERSION,
    kind,
    targetId: targetId || 'new',
    updatedAt: now,
    data,
  }));
}

export function clearRecordDraft(uid, kind, targetId = 'new') {
  removeUserStorage(uid, recordDraftKey(kind, targetId));
}

export function withSaveTimeout(promise, timeoutMs = 8000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('서버 저장 확인이 지연되고 있습니다. 작성 내용은 이 기기에 보관했습니다. 네트워크 연결 후 다시 시도해주세요.')), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
