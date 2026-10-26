import React, { useCallback, useEffect, useRef, useState } from 'react';
import { socialCall, socialErrorMessage } from '../../lib/socialApi';
import { isSaved, loadCachedFeed, loadSeenStories, saveCachedFeed, STORY_SEEN_EVENT, toggleSaved, watchSaved } from '../../lib/socialLocal';
import FeedPost, { describePost } from './FeedPost';
import { Avatar, Btn, Sheet, Skeleton, overlay } from './ui';
import ConfirmModal from '../common/ConfirmModal';
import usePullRefresh from '../../lib/usePullRefresh';
import { PullGap, PullSpinner } from '../home/HomeHeader';
import { IxAddUser, IxPlusSquare, IxSearch, IcCheck } from './SocialIcons';
import { ContentShareSheet } from './InviteParts';
import ReportSheet from './ReportSheet';
import { isNativeApp, WEB_ORIGIN } from '../../lib/native';

/* 공유 링크: /p/{key} 로 들어오면 앱이 그 글을 연다 (App.jsx) */
function sharePayload(post) {
  const d = describePost(post);
  const title = (post.video?.routineTitle || d?.media?.title || '운동 루틴').replace(/\n/g, ' ');
  return {
    url: `${isNativeApp ? WEB_ORIGIN : window.location.origin}/p/${encodeURIComponent(post.key)}`,
    title,
    description: d?.caption ? String(d.caption).slice(0, 60) : 'Context Health에서 루틴을 내 무게로 가져와 보세요',
    imageUrl: post.video?.thumbnail || undefined,
    buttonTitle: '루틴 보기',
  };
}

/* 피드 탭 (Figma 06-1: 01 메인 · 02 친구 0명 · 21 끝까지 · 32 오프라인 · 32-2 불러오기 실패)
   보라 머리 → 스토리 줄 → 흰 시트(위 모서리 24) 안에 글 목록 */

const STORY_RING = 'linear-gradient(45deg, #FFD600 0%, #FF7A00 30%, #FF0069 65%, #D300C5 100%)';

function StoryItem({ label, profile, ring, onClick, invite, add }) {
  return (
    <button type="button" onClick={onClick} className="flex-none w-16 flex flex-col items-center gap-1">
      {invite ? (
        <span className="w-[61px] h-[61px] rounded-full bg-white/20 text-white flex items-center justify-center"><IxAddUser size={24} /></span>
      ) : (
        /* 새 스토리: 인스타처럼 진한 그라데이션 테두리 / 본 스토리: 얇은 흐린 선 + 사진도 흐리게 / 기록 없음(내 기록): 테두리 없음.
           세 경우 모두 바깥 크기는 같아서 테두리가 바뀌어도 줄이 밀리지 않는다 */
        <span
          className="relative inline-flex rounded-full p-[2.5px]"
          style={ring === 'new' ? { background: STORY_RING } : ring === 'seen' ? { boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.45)' } : undefined}
        >
          <span className={`inline-flex rounded-full p-[2px] ${ring === 'new' ? 'bg-brand' : ''}`}>
            <span className={ring === 'seen' ? 'opacity-50' : ''}>
              <Avatar profile={profile?.color === '#7171FF' && !profile.photoUrl ? { ...profile, color: 'rgba(255,255,255,0.22)' } : profile} size={52} />
            </span>
          </span>
          {add && <span className="absolute -right-0.5 -bottom-0.5 w-5 h-5 rounded-full bg-white text-brand flex items-center justify-center font-pretendard font-bold text-[14px] leading-none">+</span>}
        </span>
      )}
      <span className={`max-w-full truncate font-pretendard text-[12px] leading-[18px] ${ring === 'new' ? 'font-semibold text-white' : ring === 'seen' ? 'font-medium text-white/55' : 'font-medium text-white'}`}>{label}</span>
    </button>
  );
}

function EmptyFriends({ onInvite }) {
  return (
    <div className="flex items-center gap-4 px-4 pt-2 pb-4">
      <StoryItem invite label="친구 초대" onClick={onInvite} />
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <p className="font-pretendard font-semibold text-[14px] leading-5 text-white">같이 운동하는 친구를 불러보세요</p>
        <p className="font-pretendard text-[13px] leading-5 text-white/70">친구가 운동하면 여기에 떠요</p>
      </div>
      <button type="button" onClick={onInvite} className="flex-none h-8 px-3 rounded-full bg-white font-pretendard font-semibold text-[13px] text-brand">초대하기</button>
    </div>
  );
}

function FeedEnd({ onYoutube }) {
  return (
    <div className="flex flex-col items-center gap-6 px-4 pt-8 pb-8">
      <div className="flex flex-col items-center gap-4">
        <span className="w-10 h-10 rounded-full bg-ui-2 text-typo-alternative flex items-center justify-center"><IcCheck size={16} /></span>
        <div className="flex flex-col items-center gap-1">
          <p className="font-pretendard font-semibold text-[14px] leading-5 text-typo-strong">최근 소식을 다 봤어요</p>
          <p className="font-pretendard text-[13px] leading-5 text-typo-alternative">새 글이 올라오면 위에 떠요</p>
        </div>
      </div>
      <button type="button" onClick={onYoutube} className="h-[38px] px-3.5 rounded-full border border-ui-4 font-pretendard font-medium text-[13px] text-typo-normal">유튜브에서 루틴 가져오기</button>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-3 pt-3">
      <div className="flex items-center gap-2 px-4"><Skeleton className="w-8 h-8 rounded-full" /><Skeleton className="w-32 h-4" /></div>
      <Skeleton className="w-full aspect-square rounded-none" />
      <div className="px-4 flex flex-col gap-2"><Skeleton className="w-40 h-4" /><Skeleton className="w-60 h-4" /></div>
    </div>
  );
}

export default function FeedScreen({ nav, active }) {
  const { uid } = nav;
  const [data, setData] = useState(() => loadCachedFeed(uid));
  const [status, setStatus] = useState('loading'); // loading | ok | error | offline
  const [saved, setSaved] = useState(new Map());
  const [seen, setSeen] = useState(() => loadSeenStories(uid));
  const [moreFor, setMoreFor] = useState(null);
  const [shareFor, setShareFor] = useState(null);
  const scrollRef = useRef(null);
  const loadedOnce = useRef(false);

  /* 박수는 '바라는 상태'를 서버에 보낸다. 누르는 사이에 피드를 다시 불러와도,
     방금 누른 글의 숫자는 내가 누른 값을 지킨다 (눌렸다 풀렸다 하던 문제). */
  const touchedRef = useRef({});
  const wantRef = useRef({});

  /* refresh: 당겨서 새로고침이면 서버가 지난번 위쪽 글을 내리고 새 글을 먼저 준다 */
  const load = useCallback(async ({ refresh = false } = {}) => {
    if (!navigator.onLine) { setStatus('offline'); return; }
    setStatus((s) => (s === 'ok' ? 'ok' : 'loading'));
    const startedAt = Date.now();
    try {
      const fetched = await socialCall('feed', refresh ? { refresh: true } : {});
      let next = fetched;
      setData((prev) => {
        const counts = { ...fetched.counts };
        Object.entries(touchedRef.current).forEach(([key, at]) => {
          if (at >= startedAt - 2000 && prev?.counts?.[key]) counts[key] = prev.counts[key];
        });
        next = { ...fetched, counts };
        return next;
      });
      saveCachedFeed(uid, next);
      setStatus('ok');
    } catch (error) {
      setStatus(error.code === 'network' ? 'offline' : 'error');
    }
  }, [uid]);

  useEffect(() => watchSaved(uid, setSaved), [uid]);
  useEffect(() => {
    const on = () => setSeen(loadSeenStories(uid));
    window.addEventListener(STORY_SEEN_EVENT, on);
    return () => window.removeEventListener(STORY_SEEN_EVENT, on);
  }, [uid]);
  useEffect(() => {
    if (!active) return;
    setSeen(loadSeenStories(uid));
    if (!loadedOnce.current || Date.now() - (load.lastAt || 0) > 60000) {
      loadedOnce.current = true;
      load.lastAt = Date.now();
      load();
    }
  }, [active, load, uid]);
  useEffect(() => {
    const on = () => load();
    const off = () => setStatus('offline');
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [load]);

  const setCounts = (key, next) => setData((d) => (d ? { ...d, counts: { ...d.counts, [key]: { ...(d.counts?.[key] || {}), ...next } } } : d));

  async function clap(post) {
    const prev = data?.counts?.[post.key] || {};
    const want = !prev.clapped;
    wantRef.current[post.key] = want;
    touchedRef.current[post.key] = Date.now();
    setCounts(post.key, { clapped: want, claps: Math.max(0, (prev.claps || 0) + (want ? 1 : -1)) });
    try {
      const res = await socialCall('clap', { key: post.key, on: want });
      /* 그사이 또 눌렀으면 이 응답은 버린다 (마지막으로 누른 상태가 이긴다) */
      if (wantRef.current[post.key] === want) setCounts(post.key, res.counts);
    } catch (error) {
      if (wantRef.current[post.key] === want) setCounts(post.key, prev);
      nav.toast(socialErrorMessage(error));
    }
  }

  async function save(post) {
    const d = describePost(post);
    if (!d?.save) return;
    const on = !isSaved(saved, post.key);
    try {
      await toggleSaved(uid, post.key, d.save, on);
      nav.toast(on ? '저장했어요 · 마이 › 저장한 루틴·식단' : '저장을 취소했어요');
    } catch {
      nav.toast('저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  }

  /* 관심 있어요/없어요: 서버에 쌓아 다음 피드부터 순서에 반영한다. 관심 없는 글은 바로 뺀다. */
  async function feedback(post, value) {
    if (value === 'less') setData((d) => ({ ...d, posts: d.posts.filter((p) => p.key !== post.key) }));
    nav.toast(value === 'less' ? '이런 글은 덜 보여드릴게요' : '비슷한 글을 더 보여드릴게요');
    try { await socialCall('feed-feedback', { key: post.key, value }); } catch { /* 다음에 다시 */ }
  }

  const [reportFor, setReportFor] = useState(null);
  /* 신고하면 내 피드에서 바로 뺀다 (서버도 가린다) */
  function hideReported(key) {
    setData((d) => ({ ...d, posts: d.posts.filter((p) => p.key !== key) }));
  }

  const [confirmDel, setConfirmDel] = useState(null);
  function removePost(post) { setConfirmDel(post); }
  async function doRemovePost(post) {
    setConfirmDel(null);
    try {
      await socialCall('post-delete', { id: post.key.slice(5) });
      setData((d) => ({ ...d, posts: d.posts.filter((p) => p.key !== post.key) }));
      nav.toast('글을 지웠어요');
    } catch (e) { nav.toast(socialErrorMessage(e)); }
  }

  function openPost(post) {
    if (post.kind === 'friend-log') nav.push('post', { key: post.key });
    else if (post.kind === 'cur-diet' || post.video?.kind === 'diet') nav.push('diet', { key: post.key });
    else nav.push('routine', { key: post.key });
  }

  function openStory(story) {
    if (story.self && !story.hasToday) { nav.openRecord('workout'); return; }
    /* 인스타처럼 스토리 줄 순서대로 이어 본다: 누른 사람부터 시작해 좌우로 넘길 수 있다 */
    const queue = [...(selfStory?.hasToday ? [selfStory] : []), ...orderedStories].map((s) => ({ uid: s.uid, storyKey: s.storyKey || '' }));
    const start = Math.max(0, queue.findIndex((s) => s.uid === story.uid));
    nav.push('story', { uid: story.uid, storyKey: story.storyKey || '', queue: queue.length ? queue : [{ uid: story.uid }], start });
  }

  const { pull, refreshing, handlers: pullHandlers } = usePullRefresh(scrollRef, () => load({ refresh: true }));

  const posts = data?.posts || [];
  const stories = data?.stories || [];
  const friendStories = stories.filter((s) => !s.self);
  const selfStory = stories.find((s) => s.self);
  const orderedStories = [...friendStories.filter((s) => !seen.has(s.storyKey)), ...friendStories.filter((s) => seen.has(s.storyKey))];
  const noFriends = data && data.friendCount === 0;

  return (
    <div className="h-full flex flex-col bg-brand">
      {/* 머리: 제목 · 친구 초대 · 검색 */}
      <header className="flex-none h-14 flex items-center justify-between px-4 text-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <h1 className="font-pretendard font-bold text-[24px] leading-[30px] tracking-[-0.6px]">피드</h1>
        <div className="flex items-center gap-4">
          <button type="button" aria-label="친구 초대" onClick={() => nav.openInviteShare()}><IxPlusSquare size={24} /></button>
          <button type="button" aria-label="검색" onClick={() => nav.push('search', {})}><IxSearch size={24} /></button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-none" {...pullHandlers}>
        {/* 스토리 줄 */}
        {/* 친구가 없어도 큐레이터 스토리가 있으면 스토리 줄을 보여 준다 */}
        {noFriends && friendStories.length === 0 ? (
          <EmptyFriends onInvite={() => nav.openInviteShare()} />
        ) : (
          <div className="flex gap-4 overflow-x-auto px-4 pt-2 pb-4 no-scrollbar" data-no-pull>
            {selfStory ? (
              <StoryItem label="내 기록" profile={selfStory} ring={selfStory.hasToday ? (seen.has(selfStory.storyKey) ? 'seen' : 'new') : 'none'} add={!selfStory.hasToday} onClick={() => openStory(selfStory)} />
            ) : (
              <StoryItem invite label="친구 초대" onClick={() => nav.openInviteShare()} />
            )}
            {selfStory && noFriends && <StoryItem invite label="친구 초대" onClick={() => nav.openInviteShare()} />}
            {orderedStories.map((s) => (
              <StoryItem key={s.uid} label={s.name} profile={s} ring={seen.has(s.storyKey) ? 'seen' : 'new'} onClick={() => openStory(s)} />
            ))}
            {!data && [0, 1, 2, 3].map((i) => <span key={i} className="flex-none w-14 h-14 rounded-full bg-white/20" />)}
          </div>
        )}

        {/* 흰 시트 */}
        {/* 당겨서 새로고침: 스토리 줄과 시트 사이가 벌어진다 (홈과 같은 값) */}
        <PullGap height={pull} pull={pull} detached={refreshing} tabIndex={0} width={scrollRef.current?.clientWidth || 390} animate={false} neck={false}>
          <PullSpinner pull={pull} refreshing={refreshing} />
        </PullGap>
        {/* 스크롤 안의 둥근 모서리는 일부 폰에서 흰색·검은색이 비친다(docs/motion_and_ui_notes.md).
            시트는 네모로 두고 모서리 자리에 보라 조각을 덮어 둥글게 보이게 한다 (홈 SheetCorners와 같은 방식). */}
        <div className="relative min-h-full bg-white pt-2" style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
          <span aria-hidden="true" className="absolute left-0 top-0 w-6 h-6 pointer-events-none" style={{ background: 'radial-gradient(circle at 100% 100%, transparent 23.5px, #7171FF 24px)' }} />
          <span aria-hidden="true" className="absolute right-0 top-0 w-6 h-6 pointer-events-none" style={{ background: 'radial-gradient(circle at 0 100%, transparent 23.5px, #7171FF 24px)' }} />
          {status === 'offline' && (
            <div className="mx-4 mt-2 mb-2 h-10 px-4 rounded-[12px] bg-[#171A1D] flex items-center font-pretendard text-[13px] text-white">
              연결이 끊겼어요 · 마지막으로 본 피드예요
            </div>
          )}
          {status === 'error' && !posts.length ? (
            <div className="flex flex-col items-center gap-2 px-8 pt-[120px] text-center">
              <p className="font-pretendard font-bold text-[16px] leading-6 text-typo-strong">피드를 불러오지 못했어요</p>
              <p className="font-pretendard text-[14px] leading-5 text-typo-alternative">잠시 후 다시 시도해 주세요</p>
              <div className="pt-2"><Btn size="S" full={false} className="px-5" onClick={load}>다시 시도</Btn></div>
            </div>
          ) : !data ? (
            <><FeedSkeleton /><FeedSkeleton /></>
          ) : (
            <>
              {posts.map((post) => (
                <FeedPost
                  key={post.key}
                  post={post}
                  counts={data.counts?.[post.key]}
                  saved={isSaved(saved, post.key)}
                  onOpen={() => openPost(post)}
                  onAuthor={() => post.author && nav.push('profile', { uid: post.author.uid })}
                  onClap={() => clap(post)}
                  onComment={() => nav.push(post.kind === 'friend-log' ? 'post' : post.kind === 'cur-diet' ? 'diet' : 'routine', { key: post.key, focusComments: true })}
                  onShare={() => setShareFor(post)}
                  onSave={() => save(post)}
                  onMore={() => setMoreFor(post)}
                />
              ))}
              {status !== 'error' && <FeedEnd onYoutube={() => nav.push('youtube', {})} />}
              {status === 'error' && (
                <div className="flex justify-center pb-8"><Btn size="S" full={false} kind="secondary" className="px-5" onClick={load}>다시 불러오기</Btn></div>
              )}
            </>
          )}
        </div>
      </div>

      {overlay(<div className="pointer-events-auto"><ConfirmModal isOpen={Boolean(confirmDel)} title="이 글을 지울까요?" subtitle="피드에서 사라지고 되돌릴 수 없어요" confirmText="지우기" confirmVariant="danger" onConfirm={() => doRemovePost(confirmDel)} onCancel={() => setConfirmDel(null)} /></div>)}
      <ContentShareSheet open={Boolean(shareFor)} onClose={() => setShareFor(null)} nav={nav} payload={shareFor ? sharePayload(shareFor) : null} preview={shareFor ? { thumbnail: shareFor.video?.thumbnail, bg: describePost(shareFor)?.media?.bg } : null} />
      <Sheet open={Boolean(moreFor)} onClose={() => setMoreFor(null)} label="더보기">
        {moreFor && (() => {
          const d = describePost(moreFor);
          const items = [
            moreFor.mine && { label: '글 고치기', run: () => nav.push('compose', { videoId: moreFor.video.videoId, postId: moreFor.key.slice(5), caption: moreFor.caption }) },
            moreFor.mine && { label: '글 지우기', danger: true, run: () => removePost(moreFor) },
            !moreFor.mine && moreFor.kind !== 'friend-log' && { label: '관심 있어요', run: () => feedback(moreFor, 'more') },
            !moreFor.mine && moreFor.kind !== 'friend-log' && { label: '관심 없어요', run: () => feedback(moreFor, 'less') },
            d?.save && { label: isSaved(saved, moreFor.key) ? '저장 취소' : '저장하기', run: () => save(moreFor) },
            moreFor.author && !moreFor.mine && !moreFor.author.official && { label: `${moreFor.author.name} 프로필 보기`, run: () => nav.push('profile', { uid: moreFor.author.uid }) },
            moreFor.kind === 'youtube' && { label: `${moreFor.video.channelName} 채널 보기`, run: () => nav.push('channel', { channelId: moreFor.video.channelId }) },
            moreFor.kind === 'youtube' && { label: '유튜브에서 보기', run: () => window.open(moreFor.video.url, '_blank', 'noopener') },
            !moreFor.mine && moreFor.kind !== 'cur-routine' && moreFor.kind !== 'cur-diet' && { label: '신고하기', danger: true, run: () => setReportFor({ key: moreFor.key, what: '글' }) },
          ].filter(Boolean);
          return (
            <div className="flex flex-col">
              {items.map((it) => (
                <button key={it.label} type="button" onClick={() => { setMoreFor(null); it.run(); }} className={`h-12 text-left font-pretendard font-medium text-[16px] ${it.danger ? 'text-state-danger' : 'text-typo-strong'}`}>{it.label}</button>
              ))}
              <Btn kind="secondary" className="mt-2" onClick={() => setMoreFor(null)}>닫기</Btn>
            </div>
          );
        })()}
      </Sheet>

      <ReportSheet
        target={reportFor}
        onClose={() => setReportFor(null)}
        onDone={() => hideReported(reportFor.key)}
        toast={nav.toast}
      />
    </div>
  );
}
