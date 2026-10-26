import React, { useEffect, useRef, useState } from 'react';
import StoryScreen from './StoryScreen';
import YoutubeScreen from './YoutubeScreen';
import SearchScreen from './SearchScreen';
import ProfileScreen from './ProfileScreen';
import RoutineEditScreen from './RoutineEditScreen';
import ComposeScreen from './ComposeScreen';
import { ChannelScreen, DietDetailCurationScreen, PostDetailScreen, RoutineDetailScreen } from './DetailScreens';
import { NotificationSettingsScreen, ProfileEditScreen, ProfileSetupScreen, VisibilityScreen } from './ProfileForms';
import { FriendsManageScreen, NotificationsScreen, SavedScreen } from './ListScreens';
import ImportFlow from './ImportFlow';
import { InviteReceiveSheet, InviteShareSheet } from './InviteParts';
import { Avatar, Btn, Screen, overlay } from './ui';
import { IcBell } from './SocialIcons';

/* 피드·친구 화면 층. App의 socialStack(히스토리에 같이 저장)을 그린다.
   빠진 화면은 300ms 동안 나가는 모션을 보여준 뒤 걷어낸다 (뒤로 가기 버튼·하드웨어 뒤로 모두). */

function renderScreen(entry, nav, leaving) {
  const p = entry.props || {};
  const common = { nav, leaving };
  switch (entry.type) {
    case 'story': return <StoryScreen {...common} uid={p.uid} queue={p.queue} start={p.start} />;
    case 'youtube': return <YoutubeScreen {...common} url={p.url} videoId={p.videoId} />;
    case 'search': return <SearchScreen {...common} />;
    case 'profile': return <ProfileScreen key={p.uid} {...common} uid={p.uid} initialTab={p.tab} />;
    case 'routine': return <RoutineDetailScreen {...common} routeKey={p.key} focusComments={p.focusComments} />;
    case 'diet': return <DietDetailCurationScreen {...common} routeKey={p.key} focusComments={p.focusComments} />;
    case 'post': return <PostDetailScreen {...common} routeKey={p.key} focusComments={p.focusComments} commentId={p.commentId} />;
    case 'channel': return <ChannelScreen {...common} channelId={p.channelId} />;
    case 'routineEdit': return <RoutineEditScreen {...common} draft={p.draft} id={p.id} />;
    case 'compose': return <ComposeScreen {...common} videoId={p.videoId} postId={p.postId} caption={p.caption} />;
    case 'settings': return <Screen leaving={leaving} bg="bg-ui-1">{nav.renderSettings?.()}</Screen>;
    case 'setup': return <ProfileSetupScreen {...common} />;
    case 'profileEdit': return <ProfileEditScreen {...common} />;
    case 'visibility': return <VisibilityScreen {...common} />;
    case 'notifSettings': return <NotificationSettingsScreen {...common} />;
    case 'notifications': return <NotificationsScreen {...common} />;
    case 'friends': return <FriendsManageScreen {...common} initialTab={p.tab} />;
    case 'saved': return <SavedScreen {...common} />;
    default: return null;
  }
}

export default function SocialLayer({ stack, nav, importReq, onImportClose, inviteShareOpen, onInviteShareClose, inviteCode, onInviteClose, pushAsk, onPushAskClose }) {
  const [leavingEntries, setLeavingEntries] = useState([]);
  const prevRef = useRef(stack);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = stack;
    const ids = new Set(stack.map((e) => e.id));
    const removed = prev.filter((e) => !ids.has(e.id));
    if (!removed.length) return undefined;
    setLeavingEntries((l) => [...l, ...removed]);
    const t = setTimeout(() => setLeavingEntries((l) => l.filter((e) => !removed.includes(e))), 300);
    return () => clearTimeout(t);
  }, [stack]);

  /* 같은 key로 그려서, 스택에서 빠진 화면도 그대로 살아 있는 채로 나가는 모션만 바뀐다 (다시 불러오지 않는다) */
  const live = new Set(stack.map((e) => e.id));
  const rendered = [...stack, ...leavingEntries.filter((e) => !live.has(e.id))];
  return (
    <>
      {rendered.map((entry, i) => {
        const leaving = !live.has(entry.id);
        const depth = stack.length - 1 - i;
        return (
          <div
            key={entry.id}
            className={`absolute inset-0 ${leaving ? 'z-[31] pointer-events-none' : 'z-[30]'} ${!leaving && depth > 1 ? 'invisible' : ''}`}
            aria-hidden={!leaving && depth > 0}
            inert={!leaving && depth > 0 ? '' : undefined}
          >
            {renderScreen(entry, nav, leaving)}
          </div>
        );
      })}
      {importReq && overlay(<ImportFlow key={importReq.key} nav={nav} request={importReq} onClose={onImportClose} />)}
      <InviteShareSheet open={inviteShareOpen} onClose={onInviteShareClose} nav={nav} />
      {inviteCode && <InviteReceiveSheet code={inviteCode} nav={nav} onClose={onInviteClose} />}
      {pushAsk && overlay(
        <div className="absolute inset-0 z-[80] flex items-center justify-center px-8 pointer-events-auto">
          <div className="absolute inset-0 bg-black/45 diet-fade-in" onClick={onPushAskClose} />
          <div className="relative w-full max-w-[300px] rounded-[24px] bg-white px-5 pt-7 pb-5 flex flex-col gap-6 diet-pop-up">
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="w-12 h-12 rounded-full bg-brand-light text-brand flex items-center justify-center"><IcBell size={22} /></span>
              <div className="flex flex-col gap-1">
                <p className="font-pretendard font-bold text-[18px] leading-7 text-typo-strong">{pushAsk.name ? `${pushAsk.name}님과 친구가 됐어요!` : '친구가 생겼어요!'}</p>
                <p className="font-pretendard text-[14px] leading-5 text-typo-alternative">친구가 운동하거나 댓글을 남기면<br />알림으로 알려드릴까요?</p>
              </div>
            </div>
            <div className="flex flex-col gap-1 items-center">
              <Btn size="M" onClick={async () => { onPushAskClose(); const ok = await nav.enablePush(); nav.toast(ok ? '알림을 켰어요' : '폰 설정에서 알림을 켤 수 있어요'); }}>알림 받기</Btn>
              <Btn kind="text" size="S" onClick={onPushAskClose}>나중에</Btn>
              <span className="font-pretendard text-[11px] text-ui-6">첫 친구가 생기는 순간에만 물어봐요</span>
            </div>
          </div>
        </div>,
      )}
    </>
  );
}

/* 홈 오른쪽 위 종 (Figma 20). 안 읽은 알림이 있으면 빨간 점 */
export function BellButton({ unread, onClick, light = true }) {
  return (
    /* 날짜 줄 높이(72)를 그대로 지키도록 버튼 높이는 글자 줄(24)과 같게 둔다. 크면 아래 탭이 붙는 자리가 어긋난다. */
    <button type="button" onClick={onClick} aria-label={unread ? `알림 ${unread}개` : '알림'} className={`relative w-9 h-6 -mr-1.5 flex items-center justify-center ${light ? 'text-white' : 'text-typo-strong'}`}>
      <IcBell size={20} />
      {unread > 0 && <span className="absolute top-0 right-1.5 w-2 h-2 rounded-full bg-[#FF4D5E] ring-2 ring-brand" />}
    </button>
  );
}

export { Avatar };
