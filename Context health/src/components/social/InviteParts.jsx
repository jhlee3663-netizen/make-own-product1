import React, { useEffect, useState } from 'react';
import { inviteUrl, socialCall, socialErrorMessage } from '../../lib/socialApi';
import { Avatar, Btn, Sheet, SheetTitle, Spinner } from './ui';
import { IcCheck } from './SocialIcons';
import { isNativeApp, WEB_ORIGIN } from '../../lib/native';

/* 초대 (Figma 06-5: 28 공유 시트 · 14 초대 받기 · 29 앱 없을 때 웹 미리보기 · 30 예외 안내) */

const INVITE_STATUS_MESSAGES = {
  already: '이미 친구예요',
  self: '내 초대 링크예요 · 친구에게 보내 보세요',
  expired: '기간이 지난 초대예요 · 아이디로 친구 요청을 보내 보세요',
  unavailable: '찾을 수 없는 초대예요',
  invalid: '찾을 수 없는 초대예요',
  gone: '찾을 수 없는 초대예요',
  'limit-self': '친구가 가득 찼어요 · 친구 관리에서 정리해 주세요',
  'limit-other': '상대의 친구가 가득 찼어요',
};

/* 카카오톡 공유: Kakao JS SDK를 처음 쓸 때 불러온다. 앱 키가 없거나 실패하면 기본 공유로 넘어간다. */
let kakaoReady = null;
function loadKakao() {
  const key = import.meta.env.VITE_KAKAO_APP_KEY;
  if (!key) return Promise.reject(new Error('no-kakao-key'));
  if (!kakaoReady) {
    kakaoReady = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
      script.crossOrigin = 'anonymous';
      script.onload = () => { if (!window.Kakao.isInitialized()) window.Kakao.init(key); resolve(window.Kakao); };
      script.onerror = () => { kakaoReady = null; reject(new Error('kakao-load-failed')); };
      document.head.appendChild(script);
    });
  }
  return kakaoReady;
}

function ShareIcon({ action, loading }) {
  const [failed, setFailed] = useState(false);
  if (action.img && !failed) {
    /* 원본마다 모서리 둥글기가 달라서, 가장 둥근 인스타그램(약 21%)보다 큰 15px(29%) 틀로 똑같이 자른다 */
    return <img src={action.img} alt="" onError={() => setFailed(true)} className="w-[52px] h-[52px] rounded-[15px] object-cover" draggable="false" />;
  }
  return <span className={`w-[52px] h-[52px] rounded-[15px] flex items-center justify-center ${action.className}`}>{loading ? <Spinner size={16} /> : action.icon}</span>;
}

/* 공유할 곳: 카카오톡 · 인스타그램 · 네이버 · 메시지 · 링크 복사 · 더보기.
   payload { url, title, description, imageUrl, buttonTitle } — 친구 초대와 글 공유가 같이 쓴다. */
const SHARE_ACTIONS = [
  { id: 'kakao', label: '카카오톡', img: '/share/kakaotalk.png', className: 'bg-[#FEE500] text-[#191919]', icon: <span className="font-pretendard font-black text-[18px]">K</span> },
  { id: 'instagram', label: '인스타그램', img: '/share/instagram.png', className: 'bg-[linear-gradient(45deg,#FFC107,#F44336,#9C27B0)] text-white', icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="4" stroke="currentColor" strokeWidth="1.6" /><circle cx="10" cy="10" r="3.2" stroke="currentColor" strokeWidth="1.6" /><circle cx="14.2" cy="5.8" r="0.9" fill="currentColor" /></svg> },
  { id: 'naver', label: '네이버', img: '/share/naver.png', className: 'bg-[#03C75A] text-white', icon: <span className="font-pretendard font-black text-[18px]">N</span> },
  { id: 'sms', label: '메시지', img: '/share/message.png', className: 'bg-[#03B26C] text-white', icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 4.5h12v8H7l-4 3v-11Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg> },
  { id: 'copy', label: '링크 복사', className: 'bg-ui-2 text-typo-normal', icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="6" y="6" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M12 6V4.5A1.5 1.5 0 0 0 10.5 3h-6A1.5 1.5 0 0 0 3 4.5v6A1.5 1.5 0 0 0 4.5 12H6" stroke="currentColor" strokeWidth="1.6" /></svg> },
  { id: 'more', label: '더보기', className: 'bg-ui-2 text-typo-normal', icon: <span className="font-pretendard font-bold text-[16px] tracking-[1px]">···</span> },
];

function ShareTargets({ payload, nav, onDone }) {
  async function share(kind) {
    if (!payload) return;
    const { url, title, description = '', imageUrl, buttonTitle = '자세히 보기' } = payload;
    const text = `${title}${description ? ` · ${description}` : ''}\n${url}`;
    if (kind === 'copy') {
      try { await navigator.clipboard.writeText(url); nav.toast('링크를 복사했어요'); } catch { nav.toast(url); }
      return;
    }
    if (kind === 'sms') { window.location.href = `sms:?&body=${encodeURIComponent(text)}`; return; }
    if (kind === 'naver') {
      window.open(`https://share.naver.com/web/shareView?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`, '_blank', 'noopener');
      return;
    }
    if (kind === 'instagram') {
      /* 인스타그램은 링크를 바로 넣어 줄 방법이 없어서, 링크를 복사해 두고 DM 화면을 연다 */
      try { await navigator.clipboard.writeText(url); } catch { /* 복사 못 해도 앱은 연다 */ }
      nav.toast('링크를 복사했어요 · 인스타그램 DM에 붙여넣어 주세요');
      setTimeout(() => { window.location.href = 'https://www.instagram.com/direct/inbox/'; }, 700);
      return;
    }
    if (kind === 'kakao') {
      try {
        const Kakao = await loadKakao();
        Kakao.Share.sendDefault({
          objectType: 'feed',
          content: { title, description, imageUrl: imageUrl || `${isNativeApp ? WEB_ORIGIN : window.location.origin}/logo-gradient-fill.jpg`, link: { mobileWebUrl: url, webUrl: url } },
          buttons: [{ title: buttonTitle, link: { mobileWebUrl: url, webUrl: url } }],
        });
        onDone?.();
        return;
      } catch { /* 아래 기본 공유로 */ }
    }
    if (navigator.share) {
      try { await navigator.share({ title, text: description || title, url }); onDone?.(); } catch { /* 취소 */ }
    } else {
      try { await navigator.clipboard.writeText(text); nav.toast('복사했어요 · 원하는 곳에 붙여넣어 주세요'); } catch { nav.toast(url); }
    }
  }
  return (
    <div className="-mx-5 px-5 flex gap-3 overflow-x-auto no-scrollbar" data-no-pull>
      {SHARE_ACTIONS.map((a) => (
        <button key={a.id} type="button" disabled={!payload} onClick={() => share(a.id)} className="flex-none w-16 flex flex-col items-center gap-2">
          <ShareIcon action={a} loading={!payload} />
          <span className="font-pretendard font-medium text-[12px] text-typo-normal whitespace-nowrap">{a.label}</span>
        </button>
      ))}
    </div>
  );
}

export function InviteShareSheet({ open, onClose, nav }) {
  const [invite, setInvite] = useState(null);
  useEffect(() => {
    if (!open || invite) return;
    socialCall('invite-create').then(setInvite).catch((e) => { nav.toast(socialErrorMessage(e)); onClose(); });
  }, [open]);

  const me = nav.me?.profile;
  const payload = invite ? {
    url: inviteUrl(invite.code),
    title: `${me?.name || '친구'}님이 같이 운동하재요`,
    description: 'Context Health에서 서로 오늘 운동을 볼 수 있어요',
    buttonTitle: '친구 되기',
  } : null;

  return (
    <Sheet open={open} onClose={onClose} label="친구 초대하기">
      <SheetTitle title="친구 초대하기" sub="링크를 받은 친구가 수락하면 바로 친구가 돼요" />
      <div className="flex items-center gap-3 px-4 py-3 rounded-[16px] bg-ui-1">
        <Avatar profile={me} size={40} />
        <span className="flex flex-col min-w-0">
          <span className="font-pretendard font-semibold text-[14px] text-typo-strong truncate">{me?.name}님이 같이 운동하재요</span>
          <span className="font-pretendard text-[12px] text-typo-alternative">Context Health · 서로 오늘 운동을 볼 수 있어요</span>
        </span>
      </div>
      <div className="flex flex-col gap-4">
        <ShareTargets payload={payload} nav={nav} onDone={onClose} />
        {me?.handle && (
          <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(me.handle); nav.toast('아이디를 복사했어요'); } catch { nav.toast(`@${me.handle}`); } }} className="flex items-center justify-between px-4 h-12 rounded-[14px] bg-ui-1 text-left">
            <span className="font-pretendard text-[13px] text-typo-alternative">링크가 안 열리면 내 아이디로 찾게 해 주세요</span>
            <span className="font-pretendard font-semibold text-[14px] text-brand">@{me.handle} 복사</span>
          </button>
        )}
        <p className="text-center font-pretendard text-[12px] leading-[18px] text-ui-6">친구는 피드 › 검색에서 아이디로 찾을 수 있어요 · 링크 7일 뒤 만료</p>
      </div>
    </Sheet>
  );
}

/* 글 공유 (피드 아이콘 줄의 공유 버튼). 받은 사람은 링크로 앱의 그 글로 바로 들어온다 (/p/{key}) */
export function ContentShareSheet({ open, onClose, nav, payload, preview }) {
  return (
    <Sheet open={open} onClose={onClose} label="공유하기">
      <SheetTitle title="공유하기" sub="친구에게 바로 보내 보세요" />
      {payload && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-[16px] bg-ui-1">
          {preview?.thumbnail ? <img src={preview.thumbnail} alt="" className="w-14 h-10 rounded-[8px] object-cover flex-none" /> : <span className="w-10 h-10 rounded-[10px] flex-none" style={{ background: preview?.bg || '#7171FF' }} />}
          <span className="flex flex-col min-w-0">
            <span className="font-pretendard font-semibold text-[14px] text-typo-strong truncate">{payload.title}</span>
            {payload.description && <span className="font-pretendard text-[12px] text-typo-alternative truncate">{payload.description}</span>}
          </span>
        </div>
      )}
      <ShareTargets payload={payload} nav={nav} onDone={onClose} />
    </Sheet>
  );
}

/* 링크로 들어와 로그인한 뒤: 수락하면 서로 기록이 보인다 (14) */
export function InviteReceiveSheet({ code, nav, onClose }) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    socialCall('invite-preview', { code }, { auth: false }).then(setPreview).catch(() => setPreview({ status: 'invalid' }));
  }, [code]);

  useEffect(() => {
    if (preview && preview.status !== 'ok') { nav.toast(INVITE_STATUS_MESSAGES[preview.status] || '찾을 수 없는 초대예요'); onClose(); }
  }, [preview]); // eslint-disable-line react-hooks/exhaustive-deps

  async function accept() {
    setBusy(true);
    try {
      await nav.requireProfile(async () => {
        const r = await socialCall('invite-accept', { code });
        if (r.status === 'ok') {
          nav.toast(`${preview.inviter.name}님과 친구가 됐어요`);
          await nav.refreshMe();
          onClose();
          nav.push('profile', { uid: r.uid });
        } else {
          nav.toast(INVITE_STATUS_MESSAGES[r.status] || '찾을 수 없는 초대예요');
          onClose();
          if (r.uid && r.status === 'already') nav.push('profile', { uid: r.uid });
        }
      });
    } catch (e) { nav.toast(socialErrorMessage(e)); }
    setBusy(false);
  }

  const vis = nav.me?.profile?.visibility || { workout: true, diet: false, weight: false };
  return (
    <Sheet open onClose={onClose} label="친구 초대">
      {!preview || preview.status !== 'ok' ? <div className="flex justify-center py-10"><Spinner /></div> : (
        <>
          <div className="flex flex-col items-center gap-4">
            <Avatar profile={preview.inviter} size={56} />
            <SheetTitle center title={`${preview.inviter.name}님이 친구 초대를 보냈어요`} sub={`@${preview.inviter.handle} · 수락하면 서로 아래 기록이 보여요`} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex gap-2">
              {[['workout', '운동 기록'], ['diet', '식단'], ['weight', '체중']].map(([k, label]) => (
                <span key={k} className={`h-[34px] px-3 rounded-full flex items-center gap-1 font-pretendard font-semibold text-[13px] ${vis[k] ? 'bg-brand-light text-brand' : 'bg-ui-2 text-ui-6'}`}>{vis[k] && <IcCheck size={12} />}{label}</span>
              ))}
            </div>
            <span className="font-pretendard text-[12px] text-typo-alternative">식단·체중은 각자 마이 › 공개 범위에서 켤 때만 보여요</span>
          </div>
          <div className="flex flex-col gap-1">
            <Btn onClick={accept} disabled={busy}>수락하기</Btn>
            <Btn kind="text" size="M" onClick={() => { nav.toast('링크를 다시 열면 언제든 수락할 수 있어요 · 7일 안에'); onClose(); }}>다음에</Btn>
          </div>
        </>
      )}
    </Sheet>
  );
}

/* 앱 없이(로그인 전) 링크를 열었을 때 (29) */
export function InvitePreviewPage({ code, onStart }) {
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    socialCall('invite-preview', { code }, { auth: false }).then(setPreview).catch(() => setPreview({ status: 'invalid' }));
  }, [code]);
  const ok = preview?.status === 'ok';
  return (
    <div className="absolute inset-0 bg-white flex flex-col">
      <div className="h-[34px] bg-ui-2 flex items-center justify-center font-pretendard text-[12px] text-typo-alternative">contexthealth.app/i/{code.slice(0, 12)}…</div>
      <div className="flex-1 flex flex-col items-center px-7 pt-12" style={{ paddingBottom: 'calc(28px + env(safe-area-inset-bottom))' }}>
        {!preview ? <Spinner className="mt-24" /> : (
          <>
            <div className="flex flex-col items-center gap-6 w-full">
              <img src="/logo.png" alt="Context Health" className="w-14 h-14 rounded-[16px]" />
              {ok ? (
                <div className="flex flex-col items-center gap-4">
                  <Avatar profile={preview.inviter} size={80} />
                  <div className="flex flex-col items-center gap-1 text-center">
                    <h1 className="font-pretendard font-bold text-[26px] leading-9 tracking-[-0.65px] text-typo-strong">{preview.inviter.name}님이 같이 운동하재요</h1>
                    <p className="font-pretendard text-[14px] text-typo-alternative">@{preview.inviter.handle} · 이번 주 {preview.inviter.weekCount}회 운동</p>
                  </div>
                </div>
              ) : (
                <h1 className="text-center font-pretendard font-bold text-[22px] leading-8 text-typo-strong">{preview.status === 'expired' ? '기간이 지난 초대예요' : '찾을 수 없는 초대예요'}</h1>
              )}
              <div className="w-full rounded-[16px] bg-ui-1 px-4 py-4 flex flex-col gap-2">
                <span className="font-pretendard font-semibold text-[13px] text-typo-strong">Context Health는</span>
                {['운동 메모를 쓰면 AI가 정리해요', '친구가 오늘 어디를 얼마나 했는지 보여요', '유튜브·친구 루틴을 내 무게로 바로 가져와요'].map((t) => (
                  <span key={t} className="flex items-center gap-2 font-pretendard text-[13px] text-typo-normal"><span className="text-brand"><IcCheck size={13} /></span>{t}</span>
                ))}
              </div>
            </div>
            <div className="flex-1" />
            <div className="w-full flex flex-col items-center gap-3">
              <Btn onClick={onStart}>{ok ? '시작하고 친구 되기' : 'Context Health 시작하기'}</Btn>
              {ok && <span className="font-pretendard text-[12px] text-ui-6">가입·온보딩이 끝나면 초대 수락 화면으로 이어져요</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
