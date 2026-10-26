import React, { useState } from 'react';
import { Avatar } from './ui';
import { IxBookmark, IxHeart, IxMessage, IxMoreCircle, IxPlay, IxSend } from './SocialIcons';
import { timeAgo } from '../../lib/socialApi';

/* 피드 글 하나 (Figma 07-13 Feed/Post): 작성자 줄 → 화면 폭 그림 → 아이콘 줄 → 설명 2줄 이하.
   게시물 사이 32는 글 아래 여백으로 준다. */

/* 영상 길이: AI가 준 초(durationSec)를 쓰고, 예전 기록(durationMin)은 쓰지 않는다(쇼츠도 60분으로 잘못 적힌 적이 있다) */
export function videoLength(v) {
  const sec = Number(v?.durationSec || 0);
  if (!sec) return '';
  if (sec < 60) return `0:${String(sec).padStart(2, '0')}`;
  if (sec < 3600) return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  return `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

/* 앱 안에서 바로 재생 (유튜브 nocookie 임베드) */
export function YoutubePlayer({ videoId, className = '' }) {
  return (
    <iframe
      title="유튜브 영상"
      src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1`}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      className={`absolute inset-0 w-full h-full border-0 ${className}`}
    />
  );
}

/* 앱이 직접 고른 글의 작성자 (서버 functions/social/curator.js의 큐레이션 계정과 같은 이름·사진) */
export const CURATOR = { uid: 'curation', name: '루틴 소믈리에', color: '#7171FF', handle: '', photoUrl: '/brand/curator.png' };

const GRADIENT = {
  routine: 'linear-gradient(135deg, #7171FF 0%, #F79FFF 100%)',
  diet: 'linear-gradient(135deg, #3AA0FF 0%, #F79FFF 100%)',
  workout: 'linear-gradient(135deg, #5B4BFF 0%, #8F7BFF 100%)',
};

/* 글 종류별로 그림·작성자 줄·설명에 들어갈 내용을 고른다 */
export function describePost(post) {
  const c = post.curation;
  switch (post.kind) {
    case 'cur-routine':
    case 'cur-diet':
      return {
        author: CURATOR,
        sub: `${c.kind === 'diet' ? '식단' : '루틴'} · ${timeAgo(c.publishedAt) === '방금' ? '오늘' : '이번 주'}`,
        media: { type: 'poster', tag: c.tag, title: c.title, summary: c.summary, bg: GRADIENT[c.kind === 'diet' ? 'diet' : 'routine'] },
        caption: c.caption,
        captionName: '루틴 소믈리에',
        save: { kind: c.kind === 'diet' ? 'diet' : 'routine', title: c.title.replace(/\n/g, ' '), sub: `큐레이션 · ${c.kind === 'diet' ? `${c.totals.kcal.toLocaleString()}kcal` : `${c.items.length}종목`}`, tag: c.tag },
        importable: true,
      };
    case 'friend-log': {
      const w = post.workout;
      const best = w.exercises.find((e) => e.best1rm);
      return {
        author: post.author,
        sub: `운동 기록 · ${timeAgo(w.at)}`,
        media: {
          type: 'poster',
          tag: timeAgo(w.at).includes('분') || timeAgo(w.at).includes('시간') || timeAgo(w.at) === '방금' ? '오늘 운동' : '운동 기록',
          title: w.title.replace(/,\s*/g, ' · '),
          summary: [`${w.exerciseCount}종목`, best ? `${best.name} 1RM ${best.best1rm}kg` : null].filter(Boolean).join(' · '),
          bg: GRADIENT.workout,
        },
        caption: w.comment,
        captionName: post.author.name,
        save: null,
        importable: true,
      };
    }
    case 'friend-routine': {
      const r = post.routine;
      return {
        author: post.author,
        sub: `루틴 · ${timeAgo(r.at)}`,
        media: { type: 'poster', tag: '루틴', title: r.title, summary: [r.parts.join(' · '), `${r.items.length}종목`].filter(Boolean).join(' · '), bg: GRADIENT.routine },
        caption: r.memo,
        captionName: post.author.name,
        save: { kind: 'routine', title: r.title, sub: `${post.author.name} · ${r.items.length}종목`, tag: '루틴' },
        importable: true,
      };
    }
    case 'youtube': {
      const v = post.video;
      return {
        author: post.author,
        sub: `유튜브 · ${v.channelName}에서 가져옴`,
        media: { type: 'video', videoId: v.videoId, thumbnail: v.thumbnail, duration: videoLength(v) },
        caption: post.caption || v.routineTitle,
        captionName: post.author.name,
        save: v.kind === 'diet'
          ? { kind: 'diet', title: v.routineTitle || v.title, sub: `유튜브 · ${v.channelName} · ${v.totals?.kcal?.toLocaleString() || ''}kcal`, thumbnail: v.thumbnail, tag: '식단' }
          : { kind: 'youtube', title: v.routineTitle || v.title, sub: `유튜브 · ${v.channelName} · ${v.items.length}종목`, thumbnail: v.thumbnail },
        importable: true,
      };
    }
    default:
      return null;
  }
}

function Count({ n }) {
  return n > 0 ? <span className="font-pretendard font-semibold text-[14px] leading-5 text-typo-strong">{n.toLocaleString()}</span> : null;
}

/* 아이콘 줄: 박수 · 댓글(상세로) · 공유 | 저장. 가져오기는 상세 화면의 큰 버튼에서만 한다. */
export function ActionBar({ counts = {}, saved, onClap, onComment, onShare, onSave, canSave = true }) {
  const [pop, setPop] = useState(0);
  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-2">
      <div className="flex items-center gap-5">
        <button type="button" aria-pressed={Boolean(counts.clapped)} aria-label="박수" onClick={() => { setPop((p) => p + 1); onClap?.(); }} className="flex items-center gap-1">
          <span key={pop} className={`${pop ? 'clap-pop' : ''} ${counts.clapped ? 'text-[#FF5A6E]' : 'text-typo-strong'}`}><IxHeart size={24} filled={counts.clapped} /></span>
          <Count n={counts.claps} />
        </button>
        {onComment && (
          <button type="button" aria-label="댓글" onClick={onComment} className="flex items-center gap-1 text-typo-strong">
            <IxMessage size={24} />
            <Count n={counts.comments} />
          </button>
        )}
        {onShare && (
          <button type="button" aria-label="공유" onClick={onShare} className="flex items-center text-typo-strong">
            <IxSend size={24} />
          </button>
        )}
      </div>
      {canSave && (
        <button type="button" aria-label={saved ? '저장 취소' : '저장'} aria-pressed={saved} onClick={onSave} className={saved ? 'text-brand' : 'text-typo-strong'}>
          <IxBookmark size={24} filled={saved} />
        </button>
      )}
    </div>
  );
}

export function PostMedia({ media, onClick }) {
  const [playing, setPlaying] = useState(false);
  if (media.type === 'video') {
    /* 재생 버튼은 그 자리에서 영상을 틀고, 나머지 자리를 누르면 상세로 간다 */
    return (
      <div className="relative w-full aspect-[16/9] bg-[#171A1D] overflow-hidden">
        {playing ? <YoutubePlayer videoId={media.videoId} /> : (
          <>
            <button type="button" onClick={onClick} className="absolute inset-0 text-left" aria-label="자세히 보기">
              {media.thumbnail && <img src={media.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" draggable="false" />}
              <span className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/40" />
              <span className="absolute left-4 top-4 h-[26px] px-2.5 rounded-full bg-white/20 backdrop-blur-sm flex items-center font-pretendard font-semibold text-[12px] text-white">YouTube</span>
              {media.duration && <span className="absolute right-4 bottom-4 h-[22px] px-1.5 rounded bg-black/80 flex items-center font-pretendard font-semibold text-[12px] text-white">{media.duration}</span>}
            </button>
            <button type="button" onClick={() => setPlaying(true)} aria-label="영상 재생" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm text-white flex items-center justify-center active:scale-95 transition-transform"><IxPlay size={24} /></button>
          </>
        )}
      </div>
    );
  }
  return (
    <button type="button" onClick={onClick} className="relative w-full aspect-square overflow-hidden text-left flex flex-col justify-end px-6 pt-6 pb-8" style={{ background: media.bg }}>
      <span className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[rgba(15,3,25,0.18)]" />
      <span className="relative flex flex-col items-start gap-3">
        <span className="h-[26px] px-2.5 rounded-full bg-white/20 flex items-center font-pretendard font-semibold text-[12px] text-white">{media.tag}</span>
        <span className="font-pretendard font-bold text-[32px] leading-[42px] tracking-[-0.8px] text-white whitespace-pre-line">{media.title}</span>
        {media.summary && <span className="font-pretendard font-medium text-[14px] leading-5 text-white/70">{media.summary}</span>}
      </span>
    </button>
  );
}

export default function FeedPost({ post, counts, saved, onOpen, onAuthor, onClap, onComment, onShare, onSave, onMore }) {
  const d = describePost(post);
  if (!d) return null;
  const commentCount = counts?.comments || 0;
  return (
    <article className="bg-white pb-8">
      <div className="flex items-center gap-2 px-4 py-3">
        <Avatar profile={d.author} size={32} onClick={d.author.uid !== 'curation' && !d.author.official ? onAuthor : undefined} />
        <button type="button" onClick={d.author.uid !== 'curation' && !d.author.official ? onAuthor : onOpen} className="flex-1 min-w-0 flex flex-col text-left">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="font-pretendard font-semibold text-[14px] leading-5 text-typo-strong truncate">{d.author.name}</span>
            {(d.author.official || d.author.uid === 'curation') && <span className="flex-none h-[18px] px-1.5 rounded-full bg-brand-light flex items-center font-pretendard font-semibold text-[10px] text-brand">큐레이터</span>}
          </span>
          <span className="font-pretendard text-[13px] leading-5 text-typo-alternative truncate">{d.sub}</span>
        </button>
        <button type="button" onClick={onMore} aria-label="더보기" className="text-typo-alternative"><IxMoreCircle size={24} /></button>
      </div>
      <PostMedia media={d.media} onClick={onOpen} />
      <ActionBar
        counts={counts}
        saved={saved}
        canSave={Boolean(d.save)}
        onClap={onClap}
        onComment={onComment}
        onShare={onShare}
        onSave={onSave}
      />
      <div className="px-4 flex flex-col gap-2">
        {d.caption && (
          <p className="font-pretendard text-[14px] leading-5 tracking-[-0.35px] text-typo-normal whitespace-pre-line line-clamp-4">
            <span className="font-semibold text-typo-strong">{d.captionName}</span>{'  '}{d.caption}
          </p>
        )}
        {commentCount > 0 && (
          <button type="button" onClick={onComment} className="self-start font-pretendard text-[14px] leading-5 text-typo-alternative">댓글 {commentCount}개 모두 보기</button>
        )}
      </div>
    </article>
  );
}
