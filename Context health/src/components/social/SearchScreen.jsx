import React, { useEffect, useRef, useState } from 'react';
import { socialCall, socialErrorMessage } from '../../lib/socialApi';
import { loadRecentSearches, saveRecentSearches } from '../../lib/socialLocal';
import { Btn, EmptyState, PersonRow, Screen, SectionLabel, Spinner, Tabs, Tag } from './ui';
import { IcX, IxSearch, IxPlay } from './SocialIcons';

/* 검색 (Figma 11 결과 · 22 입력 전·결과 없음).
   친구는 이름·아이디로, 친구가 아닌 사람은 아이디로만 찾는다. */

const TABS = [{ id: 'people', label: '사람' }, { id: 'routines', label: '루틴' }, { id: 'channels', label: '채널' }];

function RelationButton({ person, nav, onChange }) {
  const [busy, setBusy] = useState(false);
  async function act(action) {
    setBusy(true);
    try {
      await nav.requireProfile(async () => {
        const res = await socialCall(action, { uid: person.uid });
        onChange(res.relation);
      });
    } catch (e) { nav.toast(socialErrorMessage(e)); }
    setBusy(false);
  }
  if (person.relation === 'friend') return <Tag>친구</Tag>;
  if (person.relation === 'requested') return <Btn size="XS" kind="tint" full={false} disabled={busy} onClick={() => act('friend-cancel')}>요청 보냄</Btn>;
  if (person.relation === 'incoming') return <Btn size="XS" full={false} disabled={busy} onClick={() => act('friend-accept')}>수락</Btn>;
  return <Btn size="XS" full={false} disabled={busy} onClick={() => act('friend-request')}>친구 요청</Btn>;
}

export default function SearchScreen({ nav, leaving }) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('people');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [friends, setFriends] = useState(null);
  const [recent, setRecent] = useState(() => loadRecentSearches(nav.uid));
  const inputRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 350);
    socialCall('friends').then((d) => setFriends(d.friends)).catch(() => setFriends([]));
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    const query = q.trim();
    if (!query) { setResult(null); return undefined; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const d = await socialCall('search', { q: query, tab });
        setResult({ q: query, tab, ...d });
      } catch (e) { setResult({ q: query, tab, error: e }); }
      setLoading(false);
    }, 280);
    return () => clearTimeout(timer.current);
  }, [q, tab]);

  function remember(term) {
    const next = [term, ...recent.filter((r) => r !== term)].slice(0, 10);
    setRecent(next);
    saveRecentSearches(nav.uid, next);
  }

  function openProfile(p) { remember(q.trim() || p.name); nav.push('profile', { uid: p.uid }); }
  const setRel = (uid, relation) => setResult((r) => ({ ...r, others: r.others.map((o) => (o.uid === uid ? { ...o, relation } : o)) }));

  const empty = result && !result.error && (result.tab === 'people' ? !result.friends?.length && !result.others?.length : !result.results?.length);

  return (
    <Screen leaving={leaving}>
      <div className="flex-none flex items-center gap-2 px-4 py-2">
        <label className="flex-1 min-w-0 h-[42px] px-3 rounded-[12px] bg-ui-2 flex items-center gap-2">
          <span className="text-ui-6"><IxSearch size={20} /></span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && q.trim() && remember(q.trim())}
            placeholder="친구 이름, 아이디, 루틴, 채널"
            className="flex-1 min-w-0 bg-transparent font-pretendard text-[15px] text-typo-strong placeholder:text-ui-6 outline-none"
          />
          {q && <button type="button" onClick={() => setQ('')} aria-label="지우기" className="text-ui-6"><IcX size={16} /></button>}
        </label>
        <button type="button" onClick={() => nav.pop()} className="flex-none whitespace-nowrap font-pretendard font-medium text-[15px] text-typo-normal px-1">취소</button>
      </div>

      {q.trim() && <Tabs tabs={TABS} value={tab} onChange={setTab} />}

      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-8 flex flex-col gap-6">
        {!q.trim() ? (
          <>
            {recent.length > 0 && (
              <div className="flex flex-col gap-3">
                <SectionLabel right={<button type="button" onClick={() => { setRecent([]); saveRecentSearches(nav.uid, []); }} className="font-pretendard text-[13px] text-ui-6">모두 지우기</button>}>최근 검색</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {recent.map((r) => (
                    <span key={r} className="h-9 pl-3 pr-2 rounded-full bg-ui-2 flex items-center gap-1 font-pretendard text-[13px] text-typo-normal">
                      <button type="button" onClick={() => setQ(r)}>{r}</button>
                      <button type="button" aria-label={`${r} 지우기`} onClick={() => { const n = recent.filter((x) => x !== r); setRecent(n); saveRecentSearches(nav.uid, n); }} className="text-ui-6"><IcX size={12} /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="rounded-[16px] bg-ui-1 px-4 py-3 flex flex-col gap-0.5">
              <span className="font-pretendard font-semibold text-[14px] text-typo-strong">친구 아이디로 찾기</span>
              <span className="font-pretendard text-[13px] leading-5 text-typo-alternative">친구에게 아이디를 물어보고 위에 입력하면 친구 요청을 보낼 수 있어요{nav.me?.profile?.handle ? ` · 내 아이디 @${nav.me.profile.handle}` : ''}</span>
            </div>
            <div className="flex flex-col gap-1">
              <SectionLabel>내 친구 {friends?.length || ''}</SectionLabel>
              {friends === null ? <div className="py-6 flex justify-center"><Spinner /></div>
                : friends.length === 0 ? <p className="py-2 font-pretendard text-[14px] text-ui-6">아직 친구가 없어요</p>
                : friends.map((f) => <PersonRow key={f.uid} profile={f} onClick={() => nav.push('profile', { uid: f.uid })} />)}
            </div>
          </>
        ) : loading && !result ? (
          <div className="py-10 flex justify-center"><Spinner /></div>
        ) : result?.error ? (
          <EmptyState className="pt-16" title={socialErrorMessage(result.error)} />
        ) : empty ? (
          <div className="rounded-[20px] bg-ui-1 px-5 py-6">
            <EmptyState
              title={`“${result.q}”을 찾지 못했어요`}
              sub={result.tab === 'people' ? '친구가 아닌 사람은 아이디가 정확해야 나와요' : '다른 말로 찾아보세요'}
              action={result.tab === 'people' ? (
                <div className="w-full flex gap-2 pt-1">
                  <Btn kind="kakao" size="S" onClick={() => nav.openInviteShare()}>초대 링크 보내기</Btn>
                  <Btn kind="secondary" size="S" onClick={() => nav.push('youtube', {})}>유튜브에서 가져오기</Btn>
                </div>
              ) : null}
            />
          </div>
        ) : result?.tab === 'people' ? (
          <>
            {result.friends?.length > 0 && (
              <div className="flex flex-col gap-1">
                <SectionLabel>내 친구</SectionLabel>
                {result.friends.map((p) => <PersonRow key={p.uid} profile={p} onClick={() => openProfile(p)} right={<Tag>친구</Tag>} />)}
              </div>
            )}
            {result.others?.length > 0 && (
              <div className="flex flex-col gap-1">
                <SectionLabel>아이디로 찾은 사람</SectionLabel>
                {result.others.map((p) => <PersonRow key={p.uid} profile={p} onClick={() => openProfile(p)} right={<RelationButton person={p} nav={nav} onChange={(rel) => setRel(p.uid, rel)} />} />)}
                <p className="pt-1 font-pretendard text-[12px] leading-[18px] text-ui-6">친구가 아닌 사람은 아이디로만 찾을 수 있어요</p>
              </div>
            )}
            <div className="mt-auto rounded-[16px] bg-ui-1 px-4 py-4 flex items-center gap-3">
              <div className="flex-1 flex flex-col gap-1">
                <span className="font-pretendard font-semibold text-[14px] text-typo-strong">찾는 친구가 없나요?</span>
                <span className="font-pretendard text-[12px] text-typo-alternative">초대 링크를 보내면 바로 친구가 돼요</span>
              </div>
              <Btn kind="kakao" size="XS" full={false} onClick={() => nav.openInviteShare()}>초대하기</Btn>
            </div>
          </>
        ) : result?.tab === 'routines' ? (
          <div className="flex flex-col gap-1">
            {result.results.map((r) => (
              <button key={`${r.kind}${r.id}`} type="button" onClick={() => { remember(q.trim()); nav.push('routine', { key: `${r.kind}:${r.id}` }); }} className="flex items-center gap-3 py-2 text-left">
                {r.thumbnail ? <img src={r.thumbnail} alt="" className="w-16 h-10 rounded-[8px] object-cover flex-none" /> : <span className="w-10 h-10 rounded-[10px] bg-brand-light text-brand flex items-center justify-center font-pretendard font-bold text-[12px] flex-none">루틴</span>}
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="font-pretendard font-semibold text-[15px] leading-[22px] text-typo-strong truncate">{r.title}</span>
                  <span className="font-pretendard text-[13px] leading-5 text-typo-alternative truncate">{r.sub}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {result?.results?.map((c) => (
              <button key={c.channelId} type="button" onClick={() => { remember(q.trim()); nav.push('channel', { channelId: c.channelId }); }} className="flex items-center gap-3 py-2 text-left">
                <span className="w-10 h-10 rounded-full bg-ui-1 flex items-center justify-center flex-none"><img src="/brand/youtube.png" alt="" className="w-6" /></span>
                <span className="flex flex-col">
                  <span className="font-pretendard font-semibold text-[15px] text-typo-strong">{c.name}</span>
                  <span className="font-pretendard text-[13px] text-typo-alternative">가져온 루틴 {c.routines}개</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Screen>
  );
}
