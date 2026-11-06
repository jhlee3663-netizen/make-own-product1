import React, { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { inviteUrl, socialCall, socialErrorMessage, timeAgo } from '../../lib/socialApi';
import { toggleSaved, watchSaved } from '../../lib/socialLocal';
import { Avatar, Btn, EmptyState, FadeLine, PersonRow, Screen, Spinner, Tabs, Tag, TopBar, useAsync } from './ui';
import { FriendActionSheet } from './ProfileScreen';
import { IcDown, IcLink, IcMoreDots, IxPlay, IxSearch } from './SocialIcons';

/* 알림(15) · 친구 관리(26 친구 · 39 받은 요청 · 40 차단 목록) · 저장한 루틴·식단(42) */

const BADGE = { workout: '운', comment: '댓', friendRequest: '+', clap: '박', youtubeDone: '▶', routineImport: '↓', poke: '콕', friendAccepted: '친' };

function sectionOf(ms) {
  const d = new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  if (d === today) return '오늘';
  if (Date.now() - ms < 7 * 86400000) return '이번 주';
  return '이전';
}

export function NotificationsScreen({ nav, leaving }) {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'users', nav.uid, 'notifications'), orderBy('at', 'desc'), limit(80));
    return onSnapshot(q, (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setItems([]));
  }, [nav.uid]);

  /* 화면을 떠날 때 모두 읽음 */
  useEffect(() => () => {
    if (!items) return;
    const unread = items.filter((n) => !n.read);
    if (!unread.length) return;
    const batch = writeBatch(db);
    unread.forEach((n) => batch.update(doc(db, 'users', nav.uid, 'notifications', n.id), { read: true }));
    batch.commit().then(() => nav.refreshMe()).catch(() => {});
  }, [items, nav]);

  function open(n) {
    const t = n.target || {};
    if (t.kind === 'profile') nav.push('profile', { uid: t.uid });
    else if (t.kind === 'post') nav.push(t.key.startsWith('log:') ? 'post' : t.key.startsWith('cur:') && n.type === 'routineImport' ? 'routine' : t.key.startsWith('rt:') ? 'routine' : 'post', { key: t.key, commentId: t.commentId || null });
    else if (t.kind === 'youtube') nav.push('youtube', { videoId: t.videoId });
  }

  async function respond(n, action) {
    setBusy(n.id);
    try {
      await nav.requireProfile(async () => {
        await socialCall(action, { uid: n.from.uid });
        nav.toast(action === 'friend-accept' ? `${n.from.name}님과 친구가 됐어요` : '요청을 거절했어요');
      });
    } catch (e) { nav.toast(socialErrorMessage(e)); }
    setBusy(null);
  }

  const groups = [];
  (items || []).forEach((n) => {
    const s = sectionOf(n.at);
    if (!groups.length || groups[groups.length - 1].label !== s) groups.push({ label: s, items: [] });
    groups[groups.length - 1].items.push(n);
  });

  return (
    <Screen leaving={leaving}>
      <TopBar onBack={() => nav.pop()} title="알림" right={<button type="button" onClick={() => nav.push('notifSettings', {})} className="font-pretendard font-medium text-[14px] text-typo-alternative">설정</button>} />
      <div className="flex-1 overflow-y-auto pb-8">
        {items === null ? <div className="py-16 flex justify-center"><Spinner /></div>
          : items.length === 0 ? <EmptyState className="pt-32 px-8" title="아직 알림이 없어요" sub="친구가 박수·댓글을 남기면 여기에 떠요" />
          : groups.map((g) => (
            <section key={g.label} className="flex flex-col">
              <h3 className="px-5 pt-4 pb-2 font-pretendard font-medium text-[13px] text-typo-alternative">{g.label}</h3>
              {g.items.map((n) => (
                <div key={n.id} className={`flex items-center gap-3 px-5 py-4 ${n.read ? 'bg-white' : 'bg-[rgba(113,113,255,0.07)]'}`}>
                  <button type="button" onClick={() => n.from && nav.push('profile', { uid: n.from.uid })} className="relative flex-none">
                    {n.from ? <Avatar profile={n.from} size={42} /> : <span className="w-[42px] h-[42px] rounded-full bg-ui-1 flex items-center justify-center"><img src="/brand/youtube.png" alt="" className="w-6" /></span>}
                    <span className="absolute -right-0.5 -bottom-0.5 w-5 h-5 rounded-full bg-white flex items-center justify-center font-pretendard font-bold text-[10px] text-brand">{BADGE[n.type] || '•'}</span>
                  </button>
                  <button type="button" onClick={() => open(n)} className="flex-1 min-w-0 flex flex-col gap-1 text-left">
                    <span className="font-pretendard text-[14px] leading-5 text-typo-strong">{n.text}{n.quote ? ` “${n.quote}”` : ''}</span>
                    <span className="font-pretendard text-[12px] text-ui-6">{timeAgo(n.at)}</span>
                  </button>
                  {n.type === 'friendRequest' && !n.resolved && (
                    <span className="flex gap-1.5 flex-none">
                      <Btn size="XS" kind="secondary" full={false} disabled={busy === n.id} onClick={() => respond(n, 'friend-decline')}>거절</Btn>
                      <Btn size="XS" full={false} disabled={busy === n.id} onClick={() => respond(n, 'friend-accept')}>수락</Btn>
                    </span>
                  )}
                  {n.type === 'friendWorkout' && <Btn size="XS" full={false} onClick={() => open(n)}>박수</Btn>}
                </div>
              ))}
            </section>
          ))}
      </div>
    </Screen>
  );
}

export function FriendsManageScreen({ nav, initialTab = 'friends', leaving }) {
  const [tab, setTab] = useState(initialTab);
  const friends = useAsync(() => socialCall('friends'), []);
  const requests = useAsync(() => socialCall('requests'), []);
  const blocks = useAsync(() => socialCall('blocks'), []);
  const [invite, setInvite] = useState(null);
  const [actionFor, setActionFor] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => { socialCall('invite-create').then(setInvite).catch(() => {}); }, []);

  async function act(action, uid, msg, after) {
    setBusy(uid);
    try { await socialCall(action, { uid }); nav.toast(msg); after(); nav.refreshMe(); } catch (e) { nav.toast(socialErrorMessage(e)); }
    setBusy(null);
  }

  const tabs = [
    { id: 'friends', label: `친구 ${friends.data?.friends.length ?? ''}` },
    { id: 'requests', label: `받은 요청 ${requests.data?.requests.length ?? ''}` },
    { id: 'blocks', label: `차단 ${blocks.data?.blocks.length ?? ''}` },
  ];
  const since = (ms) => `함께한 지 ${Math.max(1, Math.round((Date.now() - ms) / 86400000))}일`;

  return (
    <Screen leaving={leaving}>
      <TopBar onBack={() => nav.pop()} title="친구 관리" right={<button type="button" aria-label="검색" onClick={() => nav.push('search', {})}><IxSearch size={24} /></button>} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-8 flex flex-col gap-6">
        {tab === 'friends' && (
          <>
            <div className="flex flex-col">
              {!friends.data ? <div className="py-10 flex justify-center"><Spinner /></div>
                : friends.data.friends.length === 0 ? <EmptyState className="py-10" title="아직 친구가 없어요" sub="초대 링크를 보내면 바로 친구가 돼요" />
                : friends.data.friends.map((f, i) => (
                  <React.Fragment key={f.uid}>
                    {i > 0 && <FadeLine />}
                    <PersonRow profile={f} sub={`@${f.handle} · ${since(f.since)}`} onClick={() => nav.push('profile', { uid: f.uid })} right={<button type="button" aria-label="더보기" onClick={() => setActionFor(f)} className="text-ui-6"><IcMoreDots size={20} /></button>} />
                  </React.Fragment>
                ))}
            </div>
            <div className="flex flex-col gap-2">
              <div className="rounded-[20px] bg-ui-1 px-4 py-4 flex flex-col gap-3">
                <span className="font-pretendard font-semibold text-[14px] text-typo-strong">내 초대 링크</span>
                <div className="flex flex-col gap-2">
                  <span className="h-10 px-3 rounded-[10px] bg-white flex items-center gap-2 font-pretendard text-[13px] text-typo-normal"><span className="text-brand"><IcLink size={16} /></span><span className="truncate">{invite ? inviteUrl(invite.code).replace(/^https?:\/\//, '') : '만드는 중…'}</span></span>
                  <span className="font-pretendard text-[12px] text-typo-alternative">7일 뒤 만료 · 여러 명이 써도 돼요</span>
                </div>
                <div className="flex gap-2">
                  <Btn kind="kakao" size="S" onClick={() => nav.openInviteShare()}>카카오톡으로 보내기</Btn>
                  <Btn kind="secondary" size="S" onClick={async () => { try { setInvite(await socialCall('invite-create', { renew: true })); nav.toast('새 링크를 만들었어요 · 예전 링크는 더 이상 안 돼요'); } catch (e) { nav.toast(socialErrorMessage(e)); } }}>새 링크</Btn>
                </div>
              </div>
              <span className="px-1 font-pretendard text-[12px] text-ui-6">친구 최대 100명 · 받은 요청은 수락/거절 · 차단은 차단 목록에서 해제</span>
            </div>
          </>
        )}
        {tab === 'requests' && (
          <>
            <div className="flex flex-col">
              {!requests.data ? <div className="py-10 flex justify-center"><Spinner /></div>
                : requests.data.requests.length === 0 ? <EmptyState className="py-10" title="받은 요청이 없어요" />
                : requests.data.requests.map((r, i) => (
                  <React.Fragment key={r.uid}>
                    {i > 0 && <FadeLine />}
                    <PersonRow profile={r} sub={`@${r.handle} · ${timeAgo(r.at)}`} onClick={() => nav.push('profile', { uid: r.uid })} right={(
                      <span className="flex gap-1.5">
                        <Btn size="XS" kind="secondary" full={false} disabled={busy === r.uid} onClick={() => act('friend-decline', r.uid, '요청을 거절했어요', requests.reload)}>거절</Btn>
                        <Btn size="XS" full={false} disabled={busy === r.uid} onClick={() => nav.requireProfile(() => act('friend-accept', r.uid, `${r.name}님과 친구가 됐어요`, () => { requests.reload(); friends.reload(); }))}>수락</Btn>
                      </span>
                    )} />
                  </React.Fragment>
                ))}
            </div>
            <div className="rounded-[16px] bg-ui-1 px-4 py-4 flex flex-col gap-1">
              <span className="font-pretendard font-semibold text-[13px] text-typo-strong">거절해도 상대에게 알리지 않아요</span>
              <span className="font-pretendard text-[12px] leading-[18px] text-typo-alternative">거절한 사람은 7일 동안 다시 요청할 수 없어요 · 받은 요청은 알림 목록에도 떠요</span>
            </div>
          </>
        )}
        {tab === 'blocks' && (
          <>
            <div className="flex flex-col">
              {!blocks.data ? <div className="py-10 flex justify-center"><Spinner /></div>
                : blocks.data.blocks.length === 0 ? <EmptyState className="py-10" title="차단한 사람이 없어요" />
                : blocks.data.blocks.map((b) => (
                  <PersonRow key={b.uid} profile={b} sub={`${new Date(b.at).getMonth() + 1}. ${new Date(b.at).getDate()} 차단`} right={<Btn size="XS" kind="secondary" full={false} disabled={busy === b.uid} onClick={() => act('unblock', b.uid, '차단을 풀었어요', blocks.reload)}>차단 해제</Btn>} />
                ))}
            </div>
            <div className="flex flex-col gap-2">
              <div className="rounded-[16px] bg-ui-1 px-4 py-4 flex flex-col gap-1.5">
                <span className="font-pretendard font-semibold text-[13px] text-typo-strong">차단한 사람은</span>
                {['나를 검색해도 찾을 수 없어요', '내 기록·스토리·댓글이 보이지 않아요', '친구 요청을 보낼 수 없어요', '차단한 사실은 상대에게 알리지 않아요'].map((t) => <span key={t} className="font-pretendard text-[12px] text-typo-alternative">· {t}</span>)}
              </div>
              <span className="px-1 font-pretendard text-[12px] text-ui-6">차단 해제해도 친구로 돌아가지 않아요 · 다시 친구 요청부터</span>
            </div>
          </>
        )}
      </div>
      <FriendActionSheet open={Boolean(actionFor)} onClose={() => setActionFor(null)} profile={actionFor} nav={nav} onDone={() => { friends.reload(); blocks.reload(); nav.refreshMe(); }} />
    </Screen>
  );
}

const SAVED_FILTERS = [{ id: 'all', label: '전체' }, { id: 'routine', label: '운동' }, { id: 'diet', label: '식단' }, { id: 'youtube', label: '유튜브에서' }];

export function SavedScreen({ nav, leaving }) {
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('all');
  const pressRef = React.useRef(null);
  async function unsave(it) {
    clearTimeout(pressRef.current);
    try { await toggleSaved(nav.uid, it.key, {}, false); nav.toast('저장을 취소했어요'); } catch { nav.toast('잠시 후 다시 시도해 주세요'); }
  }
  useEffect(() => watchSaved(nav.uid, (map) => setItems([...map.values()].sort((a, b) => b.at - a.at))), [nav.uid]);

  function open(it) {
    if (it.key.startsWith('cur:') && it.kind === 'diet') nav.push('diet', { key: it.key });
    else nav.push('routine', { key: it.key });
  }

  const list = (items || []).filter((it) => filter === 'all' || it.kind === filter);
  const date = (ms) => `${new Date(ms).getMonth() + 1}. ${new Date(ms).getDate()}`;
  return (
    <Screen leaving={leaving} bg="bg-ui-1">
      <div className="bg-white">
        <TopBar onBack={() => nav.pop()} title="저장한 루틴·식단" />
        <div className="flex gap-2 px-5 pt-1 pb-3">
          {SAVED_FILTERS.map((f) => (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)} className={`h-[34px] px-3 rounded-full font-pretendard font-semibold text-[13px] ${filter === f.id ? 'bg-typo-strong text-white' : 'bg-white text-typo-normal border border-ui-3'}`}>{f.label}</button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-8 flex flex-col gap-3">
        {items === null ? <div className="py-16 flex justify-center"><Spinner /></div>
          : list.length === 0 ? <EmptyState className="pt-24" title="저장한 것이 없어요" sub="피드에서 북마크를 누르면 여기에 모여요" action={<Btn size="S" full={false} className="px-5" onClick={() => nav.goTab('feed')}>피드 둘러보기</Btn>} />
          : (
            <>
              {list.map((it) => (
                <div
                  key={it.key}
                  className="flex items-center gap-4 p-4 rounded-[20px] bg-white select-none"
                  onContextMenu={(e) => { e.preventDefault(); unsave(it); }}
                  onPointerDown={() => { pressRef.current = setTimeout(() => unsave(it), 600); }}
                  onPointerUp={() => clearTimeout(pressRef.current)}
                  onPointerLeave={() => clearTimeout(pressRef.current)}
                >
                  <button type="button" onClick={() => open(it)} className="flex-1 min-w-0 flex items-center gap-4 text-left">
                    {it.thumbnail ? (
                      <span className="relative w-20 h-14 rounded-[12px] overflow-hidden flex-none bg-ui-3"><img src={it.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" /><span className="absolute inset-0 flex items-center justify-center"><span className="w-7 h-7 rounded-full bg-black/55 text-white flex items-center justify-center"><IxPlay size={12} /></span></span></span>
                    ) : (
                      <span className={`w-14 h-14 rounded-[12px] flex-none flex items-center justify-center font-pretendard font-semibold text-[12px] ${it.kind === 'diet' ? 'bg-state-success-weak text-state-success' : 'bg-brand-light text-brand'}`}>{it.tag || (it.kind === 'diet' ? '식단' : '루틴')}</span>
                    )}
                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <span className="font-pretendard font-semibold text-[15px] leading-[22px] text-typo-strong truncate">{it.title}</span>
                      <span className="font-pretendard text-[12px] leading-[18px] text-typo-alternative truncate">{it.sub}</span>
                      <span className="font-pretendard text-[12px] leading-[18px] text-ui-6">{it.note ? `${it.note} · ` : '저장 · '}{date(it.at)}</span>
                    </span>
                  </button>
                  <button type="button" aria-label="가져오기" onClick={() => nav.startImport({ key: it.key })} className="w-9 h-9 rounded-[10px] bg-brand text-white flex items-center justify-center flex-none"><IcDown size={16} /></button>
                </div>
              ))}
              <p className="text-center font-pretendard text-[12px] text-ui-6">길게 누르면 저장을 취소해요</p>
            </>
          )}
      </div>
    </Screen>
  );
}

