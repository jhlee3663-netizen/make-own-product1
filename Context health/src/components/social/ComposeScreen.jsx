import React, { useEffect, useRef, useState } from 'react';
import { socialCall, socialErrorMessage } from '../../lib/socialApi';
import ConfirmModal from '../common/ConfirmModal';
import { Screen, Skeleton, TopBar } from './ui';
import { IxPlay } from './SocialIcons';

/* 피드에 올리기 · 글 고치기. 유튜브에서 정리한 루틴에 내 한마디를 붙여 올린다.
   [영상 카드] 24 [한마디 입력 · 글자 수] */
const MAX = 200;

export default function ComposeScreen({ nav, videoId, postId, caption: initialCaption = '', leaving }) {
  const [video, setVideo] = useState(null);
  const [text, setText] = useState(initialCaption);
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const inputRef = useRef(null);
  const editing = Boolean(postId);

  useEffect(() => {
    socialCall('youtube-get', { videoId }).then((d) => setVideo(d.video)).catch((e) => { nav.toast(socialErrorMessage(e)); nav.pop(); });
    const t = setTimeout(() => inputRef.current?.focus(), 400);
    return () => clearTimeout(t);
  }, [videoId]);

  async function submit() {
    if (saving) return;
    setSaving(true);
    try {
      await nav.requireProfile(async () => {
        if (editing) await socialCall('post-edit', { id: postId, caption: text });
        else await socialCall('youtube-publish', { videoId, caption: text });
        nav.toast(editing ? '글을 고쳤어요' : '피드에 올렸어요');
        nav.pop();
      });
    } catch (e) { nav.toast(socialErrorMessage(e)); }
    setSaving(false);
  }

  const dirty = text.trim() !== initialCaption.trim();
  return (
    <Screen leaving={leaving}>
      <TopBar
        close
        onBack={() => (dirty ? setConfirmLeave(true) : nav.pop())}
        title={editing ? '글 고치기' : '피드에 올리기'}
        right={(
          <button type="button" onClick={submit} disabled={saving || !video || (editing && !dirty)} className={`font-pretendard font-semibold text-[16px] ${saving || !video || (editing && !dirty) ? 'text-ui-5' : 'text-brand'}`}>
            {editing ? '저장' : '올리기'}
          </button>
        )}
      />
      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-8 flex flex-col gap-6">
        {!video ? <Skeleton className="h-[88px] rounded-[16px]" /> : (
          <div className="flex items-center gap-3 p-3 rounded-[16px] bg-ui-1">
            <span className="relative w-[104px] h-16 rounded-[12px] overflow-hidden flex-none bg-ui-3">
              <img src={video.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center"><span className="w-7 h-7 rounded-full bg-black/55 text-white flex items-center justify-center"><IxPlay size={12} /></span></span>
            </span>
            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="font-pretendard font-semibold text-[15px] leading-[22px] text-typo-strong line-clamp-2">{video.routineTitle || video.title}</span>
              <span className="font-pretendard text-[13px] leading-5 text-typo-alternative truncate">유튜브 · {video.channelName} · {video.items.length}종목</span>
            </span>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <textarea
            ref={inputRef}
            value={text}
            maxLength={MAX}
            rows={5}
            onChange={(e) => setText(e.target.value)}
            placeholder={'이 루틴에 대해 한마디 남겨 주세요\n예: 등 넓이 키울 때 이 순서 그대로 해요. 풀업은 실패 직전까지!'}
            className="w-full resize-none bg-transparent font-pretendard text-[16px] leading-6 tracking-[-0.4px] text-typo-strong placeholder:text-ui-6 outline-none"
          />
          <span className="self-end font-pretendard text-[12px] text-ui-6">{text.length}/{MAX}</span>
        </div>
        <p className="font-pretendard text-[12px] leading-[18px] text-ui-6">올린 글은 모두에게 보여요 · 언제든 고치거나 지울 수 있어요</p>
      </div>
      <ConfirmModal isOpen={confirmLeave} title="쓰던 글을 버릴까요?" confirmText="버리기" cancelText="계속 쓰기" confirmVariant="danger" onConfirm={() => { setConfirmLeave(false); nav.pop(); }} onCancel={() => setConfirmLeave(false)} />
    </Screen>
  );
}
