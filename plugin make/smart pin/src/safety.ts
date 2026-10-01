import { Pin, PinRevision, PinUser } from './types';

// Application-level collaboration rules, not a security boundary against file editors.
export const isOwner = (p: Pin, u: PinUser | null) => !!u && p.author?.id === u.id;
export const canEdit = (p: Pin, u: PinUser | null) => !p.deletedAt && !!u &&
  (isOwner(p, u) || (!p.protected && !!p.editors?.some(e => e.id === u.id)));
export const canStatus = (p: Pin, u: PinUser | null) => canEdit(p, u) ||
  (!p.deletedAt && !p.protected && !!u && p.assignee?.id === u.id);
export const isAdmin = (admins: PinUser[], u: PinUser | null) => !!u && admins.some(a => a.id === u.id);
export const canTrash = (p: Pin, u: PinUser | null, admins: PinUser[]) =>
  !p.deletedAt && (isOwner(p, u) || (!p.protected && isAdmin(admins, u)));
export const canRestore = (p: Pin, u: PinUser | null, admins: PinUser[]) =>
  !!p.deletedAt && (isOwner(p, u) || isAdmin(admins, u));

export interface Storage {
  keys(): string[];
  get(key: string): string;
  set(key: string, value: string): void;
}
const PREFIX = 'sp2-';
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
function hash(s: string): string {
  let n = 2166136261;
  for (let i = 0; i < s.length; i++) n = Math.imul(n ^ s.charCodeAt(i), 16777619);
  return (n >>> 0).toString(36);
}
export function uid(): string { return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`; }

interface RecordVersion extends PinRevision { base?: string; purged?: boolean }

/** Immutable, chunked revisions. Each writer gets unique keys; a partial write
 * has no manifest and is invisible. Concurrent branches stay recoverable in history. */
export class PinStore {
  constructor(private storage: Storage) {}
  get ready(): boolean {
    const version = this.storage.get('sp2-ready');
    if (version && version !== '2') throw new Error('더 최신 저장 형식입니다. Smart Pin을 업데이트해주세요.');
    return version === '2';
  }
  get admins(): PinUser[] {
    const raw = this.storage.get('sp2-admins');
    if (!raw) return [];
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) throw new Error('관리자 설정을 읽지 못했습니다.');
    return value;
  }
  setAdmins(value: PinUser[]): void { this.storage.set('sp2-admins', JSON.stringify(value)); }

  private read(key: string): RecordVersion {
    const m = JSON.parse(this.storage.get(key));
    if (!Number.isInteger(m.count) || m.count < 1 || m.count > 400) throw new Error('핀 저장 정보가 손상되었습니다.');
    let raw = '';
    for (let i = 0; i < m.count; i++) raw += this.storage.get(`${key}.${i}`);
    if (hash(raw) !== m.hash) throw new Error('핀 저장을 동기화 중입니다. 잠시 후 다시 시도해주세요.');
    return JSON.parse(raw);
  }
  private records(): RecordVersion[] {
    return this.storage.keys().filter(k => k.startsWith(`${PREFIX}r-`) && !k.includes('.'))
      .map(k => this.read(k)).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  }
  private write(record: RecordVersion): void {
    const key = `${PREFIX}r-${record.id}`;
    const raw = JSON.stringify(record);
    // 10k UTF-16 units stay comfortably below Figma's entry size cap, even for emoji.
    const chunks: string[] = [];
    for (let start = 0; start < raw.length;) {
      let end = Math.min(raw.length, start + 10000);
      const last = raw.charCodeAt(end - 1);
      if (end < raw.length && last >= 0xD800 && last <= 0xDBFF) end--;
      chunks.push(raw.slice(start, end)); start = end;
    }
    const count = chunks.length;
    if (count > 400) throw new Error('핀 기록이 너무 큽니다. 백업 후 내용을 나눠주세요.');
    for (let i = 0; i < count; i++) this.storage.set(`${key}.${i}`, chunks[i]);
    this.storage.set(key, JSON.stringify({ count, hash: hash(raw) }));
    this.read(key); // Never acknowledge a failed/partial save.
  }
  private materialize(records: RecordVersion[]): Map<string, Pin> {
    const pins = new Map<string, Pin>();
    const conflicts = new Map<string, number>();
    const purged = new Set(records.filter(r => r.purged).map(r => r.pin.id));
    for (const r of records) {
      if (purged.has(r.pin.id)) continue;
      const current = pins.get(r.pin.id);
      if (r.base !== current?.revision) {
        conflicts.set(r.pin.id, (conflicts.get(r.pin.id) || 0) + 1);
        continue;
      }
      pins.set(r.pin.id, { ...clone(r.pin), revision: r.id });
    }
    pins.forEach((pin, id) => { if (conflicts.has(id)) pin.conflictCount = conflicts.get(id); });
    return pins;
  }
  all(): Pin[] { return [...this.materialize(this.records()).values()]; }
  get(id: string): Pin | undefined { return this.all().find(p => p.id === id); }
  history(id: string): PinRevision[] {
    const records = this.records().filter(r => r.pin.id === id);
    if (records.some(r => r.purged)) return [];
    let head: string | undefined;
    return records.map(r => {
      const conflict = r.base !== head;
      if (!conflict) head = r.id;
      return { ...r, conflict };
    }).reverse();
  }
  commit(pin: Pin, actor: PinUser, action: string, base?: string): Pin {
    const records = this.records();
    if (records.some(r => r.pin.id === pin.id && r.purged)) throw new Error('영구 삭제된 핀입니다.');
    const current = this.materialize(records).get(pin.id);
    if (current?.revision !== base) throw new Error('다른 변경이 먼저 저장됐습니다. 최신 내용을 확인한 뒤 다시 시도해주세요.');
    const id = uid();
    const at = Math.max(Date.now(), ...records.map(r => r.at + 1));
    const saved = { ...clone(pin), revision: id, updatedAt: new Date(at).toISOString() };
    delete saved.conflictCount;
    this.write({ id, at, actor, action, base, pin: saved });
    return saved;
  }
  migrate(pins: Pin[]): void {
    if (this.ready) return;
    for (const p of pins) {
      if (!this.get(p.id)) this.commit({ ...p, author: undefined, editors: [], revision: undefined },
        { id: 'system', name: '기존 데이터 보존' }, '기존 핀 가져오기');
    }
    this.storage.set('sp2-ready', '2');
  }
  purge(pin: Pin, actor: PinUser, reason: string): void {
    if (!pin.deletedAt) throw new Error('휴지통의 핀만 영구 삭제할 수 있습니다.');
    // Write the tombstone BEFORE clearing bodies. Old clients cannot resurrect the ID.
    const records = this.records().filter(r => r.pin.id === pin.id);
    const tombstone: RecordVersion = { id: uid(), at: Math.max(Date.now(), ...records.map(r => r.at + 1)), actor,
      action: `영구 삭제: ${reason}`, purged: true, pin: { id: pin.id } as Pin };
    this.write(tombstone);
    for (const r of records) {
      const key = `${PREFIX}r-${r.id}`;
      const m = JSON.parse(this.storage.get(key));
      this.storage.set(key, '');
      for (let i = 0; i < m.count; i++) this.storage.set(`${key}.${i}`, '');
    }
  }
  backup(): string { return JSON.stringify({ format: 'SMARTPIN_BACKUP_V2', exportedAt: Date.now(), pins: this.all(), revisions: this.records() }, null, 2); }
}

export function editablePatch(current: Pin, input: Pin, actor: PinUser | null): Pin {
  if (!canStatus(current, actor)) throw new Error('작성자 또는 지정된 협업자만 변경할 수 있습니다.');
  if (current.revision !== input.revision) throw new Error('다른 변경이 먼저 저장됐습니다. 최신 내용을 확인해주세요.');
  const fields: (keyof Pin)[] = ['title', 'content', 'category', 'group'];
  const contentChanged = fields.some(k => (current[k] ?? '') !== (input[k] ?? ''));
  if (contentChanged && !canEdit(current, actor)) throw new Error('작성자와 공동 편집자만 내용을 수정할 수 있습니다.');
  if (input.status !== current.status && !canStatus(current, actor)) throw new Error('상태를 변경할 권한이 없습니다.');
  if (current.deletedAt) throw new Error('휴지통의 핀은 먼저 복구해주세요.');
  if (!['todo', 'done', 'pending'].includes(input.status) || !['design', 'descript', 'dev', 'ask'].includes(input.category)) throw new Error('잘못된 핀 상태입니다.');
  if (typeof input.title !== 'string' || typeof input.content !== 'string' || (input.group != null && typeof input.group !== 'string')) throw new Error('잘못된 핀 내용입니다.');
  // Explicit whitelist: UI messages can never alter ownership, deletion or sharing.
  return { ...current, title: input.title, content: input.content, category: input.category, group: input.group, status: input.status };
}
