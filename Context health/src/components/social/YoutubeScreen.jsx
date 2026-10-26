import React, { useEffect, useMemo, useRef, useState } from 'react';
import { socialCall, socialErrorMessage } from '../../lib/socialApi';
import { toggleSaved } from '../../lib/socialLocal';
import { Btn, Screen, Skeleton, TopBar } from './ui';
import { importSource, modeOptions } from './ImportFlow';
import { Segmented, useWeightPlan, WeightRowList } from './WeightRows';
import { IcAlert, IcCheck, IcLink, IcX, IxPlay } from './SocialIcons';

/* 유튜브에서 가져오기 (Figma 06-2: 04 링크 붙여넣기 · 05 정리 중 · 06 정리 결과 · 07 가져올 수 없음) */

const REASONS = [
  ['유튜브 링크가 아님', '유튜브 링크만 가져올 수 있어요'],
  ['볼 수 없는 영상', '비공개 · 삭제 · 연령 제한'],
  ['60분 넘는 영상', '60분 이하만 가져올 수 있어요'],
  ['루틴이 없는 영상', '브이로그 · 식단 영상 등'],
  ['AI 사용량 한도', '잠시 뒤에 다시 시도'],
];

function looksLikeYoutube(text) {
  return /(youtube\.com\/(watch|shorts|live)|youtu\.be\/)/i.test(String(text || ''));
}

function Thumb({ src, className = '', play = 24 }) {
  return (
    <span className={`relative block overflow-hidden bg-gradient-to-br from-[#3a3d44] to-[#8a9099] ${className}`}>
      {src && <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" draggable="false" />}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="rounded-full bg-black/55 text-white flex items-center justify-center" style={{ width: play * 1.6, height: play * 1.6 }}><IxPlay size={play} /></span>
      </span>
    </span>
  );
}

function Paste({ url, setUrl, onSubmit, clip }) {
  const valid = looksLikeYoutube(url);
  return (
    <div className="flex-1 flex flex-col px-5 pt-2" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="font-pretendard font-bold text-[26px] leading-[34px] tracking-[-0.65px] text-typo-strong">유튜브 영상 링크를<br />붙여넣어 주세요</h2>
          <p className="font-pretendard text-[14px] leading-5 text-typo-alternative">영상 속 종목·세트·순서를 AI가 정리해서 내 운동 메모로 옮겨요</p>
        </div>
        <div className="flex flex-col gap-2">
          <label className={`h-14 px-4 rounded-[14px] border flex items-center gap-2 transition-colors ${url ? 'border-brand' : 'border-ui-4'}`}>
            <span className="text-brand flex-none"><IcLink size={18} /></span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && valid && onSubmit()}
              placeholder="https://youtu.be/..."
              inputMode="url"
              className="flex-1 min-w-0 bg-transparent font-pretendard text-[16px] text-typo-strong placeholder:text-ui-6 outline-none"
            />
            {url && <button type="button" onClick={() => setUrl('')} aria-label="지우기" className="text-ui-6"><IcX size={18} /></button>}
          </label>
          {clip && clip.url !== url && (
            <button type="button" onClick={() => setUrl(clip.url)} className="flex items-center gap-3 p-3 rounded-[14px] bg-[rgba(113,113,255,0.08)] text-left">
              <Thumb src={clip.thumbnail} className="w-[72px] h-[44px] rounded-[8px] flex-none" play={12} />
              <span className="flex flex-col min-w-0">
                <span className="font-pretendard font-medium text-[12px] leading-[18px] text-brand">복사한 링크를 찾았어요</span>
                <span className="font-pretendard font-semibold text-[14px] leading-5 text-typo-strong truncate">{clip.url}</span>
              </span>
            </button>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <span className="font-pretendard font-semibold text-[14px] leading-5 text-typo-strong">이런 영상이 잘 정리돼요</span>
          <div className="flex flex-col gap-2">
            {['운동 순서대로 종목이 나오는 루틴 영상', '60분 이하 영상', '공개된 영상 (비공개·연령 제한 영상은 안 돼요)'].map((t) => (
              <span key={t} className="flex items-center gap-2 font-pretendard text-[14px] leading-5 text-typo-alternative"><span className="text-state-success"><IcCheck size={14} /></span>{t}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-6" />
      <Btn onClick={onSubmit} disabled={!valid}>가져오기</Btn>
    </div>
  );
}

/* 정리 중 (05): 단계는 하나 끝날 때마다 아래에 하나씩 톡 나타난다. 진행 중인 단계는 글자가 숨 쉬듯 깜빡이고,
   AI 문구의 그라데이션은 계속 흐른다. */
const LOADING_STEPS = [
  { label: '영상 정보 확인', doneAt: 2500 },
  { label: '종목·세트 찾는 중', doneLabel: '종목·세트 찾기', doneAt: 16000 },
  { label: '내 무게로 맞추는 중', doneLabel: '내 무게로 맞추기', doneAt: Infinity },
];

function Loading({ preview }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - started), 250);
    return () => clearInterval(t);
  }, []);
  const doneCount = LOADING_STEPS.filter((s) => elapsed >= s.doneAt).length;
  const visible = LOADING_STEPS.slice(0, Math.min(LOADING_STEPS.length, doneCount + 1));
  const headline = doneCount === 0 ? '영상을 확인하고 있어요' : doneCount === 1 ? '영상 속 운동을 찾고 있어요' : '거의 다 됐어요';
  return (
    <div className="flex-1 flex flex-col px-5 pt-2" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Thumb src={preview?.thumbnail} className="w-full aspect-video rounded-[16px]" play={22} />
          <h2 key={headline} className="diet-view-in font-pretendard font-bold text-[18px] leading-7 text-typo-strong">
            {headline}<span className="thinking-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>
          </h2>
        </div>
        <div className="rounded-[16px] bg-ui-1 px-4 py-4 flex flex-col gap-3">
          <span className="font-pretendard font-semibold text-[13px] leading-5 ai-text-flow">AI가 영상을 보고 있어요 · 약 20초</span>
          <div className="flex flex-col gap-2">
            {visible.map((s, i) => {
              const done = i < doneCount;
              return (
                <span key={s.label} className="step-pop flex items-center gap-2 font-pretendard text-[14px] leading-5">
                  <span className={`w-4 h-4 rounded-full flex-none flex items-center justify-center transition-colors duration-300 ${done ? 'bg-state-success text-white' : 'bg-brand thinking-pulse'}`}>{done && <IcCheck size={10} />}</span>
                  <span className={done ? 'text-typo-normal' : 'text-typo-strong thinking-text'}>{done ? (s.doneLabel || s.label) : s.label}</span>
                </span>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => <div key={i} className="flex gap-3"><Skeleton className="w-12 h-6" /><div className="flex-1 flex flex-col gap-2"><Skeleton className="w-40 h-3" /><Skeleton className="w-24 h-3" /></div></div>)}
        </div>
      </div>
      <div className="flex-1" />
      <p className="text-center font-pretendard text-[13px] leading-5 text-typo-alternative">다른 화면으로 나가도 괜찮아요. 정리가 끝나면 알려드릴게요.</p>
    </div>
  );
}

/* 식단 영상 정리 결과: 끼니·음식·영양(추정) → 내 식단으로 가져오기 */
function DietResult({ nav, video }) {
  const key = `yt:${video.videoId}`;
  async function later() {
    try {
      await toggleSaved(nav.uid, key, { kind: 'diet', title: video.routineTitle || video.title, sub: `유튜브 · ${video.channelName} · ${video.totals.kcal.toLocaleString()}kcal`, thumbnail: video.thumbnail, tag: '식단', note: '나중에 쓰기로 저장' }, true);
      nav.toast('저장했어요 · 마이 › 설정 › 저장한 루틴·식단');
      nav.pop();
    } catch { nav.toast('저장하지 못했어요'); }
  }
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-6 flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Thumb src={video.thumbnail} className="w-[104px] h-16 rounded-[12px] flex-none" play={14} />
            <span className="flex flex-col gap-1 min-w-0">
              <span className="font-pretendard font-bold text-[16px] leading-6 text-typo-strong line-clamp-2">{video.routineTitle || video.title}</span>
              <span className="font-pretendard text-[13px] leading-5 text-typo-alternative truncate">유튜브 · {video.channelName}</span>
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-pretendard font-semibold text-[13px] leading-5 ai-text">AI가 영상에서 식단을 정리했어요</span>
            <button type="button" onClick={() => nav.requireProfile(() => nav.push('compose', { videoId: video.videoId }))} className="flex-none h-8 px-3 rounded-full font-pretendard font-semibold text-[13px] bg-brand-light text-brand">피드에 올리기</button>
          </div>
        </div>
        <div className="rounded-[16px] bg-ui-1 py-4 grid grid-cols-4">
          {[[video.totals.kcal.toLocaleString(), 'kcal'], [`${video.totals.carb}g`, '탄수'], [`${video.totals.protein}g`, '단백질'], [`${video.totals.fat}g`, '지방']].map(([v, l], i) => (
            <div key={l} className="flex flex-col items-center gap-0.5">
              <span className={`font-pretendard font-bold text-[18px] leading-7 ${i === 2 ? 'text-brand' : 'text-typo-strong'}`}>{v}</span>
              <span className="font-pretendard text-[11px] leading-4 text-typo-alternative">{l}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-6">
          {video.meals.map((m) => (
            <div key={m.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between font-pretendard text-[15px]">
                <span className="font-semibold text-typo-strong">{m.name}</span>
                <span className="text-brand">{m.foods.reduce((a, f) => a + f.kcal, 0)}kcal</span>
              </div>
              {m.foods.map((f) => (
                <div key={f.name} className="flex items-center justify-between font-pretendard text-[14px] leading-5">
                  <span className="text-typo-normal">{f.name}</span><span className="text-ui-6">{f.kcal}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="font-pretendard text-[12px] text-ui-6">영양 수치는 영상 기준 추정치예요</p>
      </div>
      <div className="flex-none px-5 pt-4 flex flex-col-reverse min-[360px]:flex-row gap-2" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
        <Btn kind="secondary" onClick={later}>나중에 쓰기</Btn>
        <Btn onClick={() => nav.startImport({ key, detail: { video } })}>내 식단으로 가져오기</Btn>
      </div>
    </div>
  );
}

function Result({ nav, video }) {
  return video.kind === 'diet' ? <DietResult nav={nav} video={video} /> : <WorkoutResult nav={nav} video={video} />;
}

function WorkoutResult({ nav, video }) {
  const detail = useMemo(() => ({ video }), [video]);
  const src = useMemo(() => importSource(detail), [detail]);
  const { rows } = useWeightPlan(nav.uid, src.items, src);
  const [mode, setMode] = useState('mine');
  const [overrides, setOverrides] = useState({});
  const key = `yt:${video.videoId}`;

  async function later() {
    try {
      await toggleSaved(nav.uid, key, { kind: 'youtube', title: video.routineTitle || video.title, sub: `유튜브 · ${video.channelName} · ${video.items.length}종목`, thumbnail: video.thumbnail, note: '나중에 쓰기로 저장' }, true);
      nav.toast('저장했어요 · 마이 › 저장한 루틴·식단');
      nav.pop();
    } catch { nav.toast('저장하지 못했어요'); }
  }

  function publish() {
    nav.requireProfile(() => nav.push('compose', { videoId: video.videoId }));
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto px-5 pt-2 flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <button type="button" onClick={() => window.open(video.url, '_blank', 'noopener')} className="flex items-center gap-3 text-left">
            <Thumb src={video.thumbnail} className="w-[104px] h-16 rounded-[12px] flex-none" play={14} />
            <span className="flex flex-col gap-1 min-w-0">
              <span className="font-pretendard font-bold text-[16px] leading-6 text-typo-strong line-clamp-2">{video.routineTitle || video.title}</span>
              <span className="font-pretendard text-[13px] leading-5 text-typo-alternative truncate">유튜브 · {video.channelName}</span>
            </span>
          </button>
          <div className="flex items-center justify-between gap-2">
            <span className="font-pretendard font-semibold text-[13px] leading-5 ai-text">AI가 영상에서 정리했어요 · {video.items.length}종목</span>
            <button type="button" onClick={publish} className="flex-none h-8 px-3 rounded-full font-pretendard font-semibold text-[13px] bg-brand-light text-brand">
              피드에 올리기
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Segmented options={modeOptions(src)} value={mode} onChange={(m) => { setMode(m); setOverrides({}); }} />
          <WeightRowList rows={rows} mode={mode} overrides={overrides} setOverrides={setOverrides} showGrip />
        </div>
        {video.tips?.length > 0 && (
          <div className="rounded-[14px] bg-ui-1 px-4 py-3 flex flex-col gap-1">
            {video.tips.map((t) => <p key={t} className="font-pretendard text-[13px] leading-5 text-typo-normal">영상 속 팁 · {t}</p>)}
          </div>
        )}
      </div>
      <div className="flex-none px-5 pt-4 flex flex-col-reverse min-[360px]:flex-row gap-2" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
        <Btn kind="secondary" onClick={later}>나중에 쓰기</Btn>
        <Btn disabled={!rows} onClick={() => nav.startImport({ key, detail, preset: { mode, overrides } })}>오늘 메모로 가져오기</Btn>
      </div>
    </div>
  );
}

function Failed({ url, error, onWrite, onRetry }) {
  return (
    <div className="flex-1 flex flex-col px-5 pt-2" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="h-14 px-4 rounded-[14px] border border-red-orange bg-[#FFF6F1] flex items-center gap-2">
            <span className="text-red-orange"><IcLink size={18} /></span>
            <span className="flex-1 min-w-0 truncate font-pretendard text-[16px] text-typo-strong">{url}</span>
          </div>
          <p className="flex items-center gap-2 font-pretendard font-medium text-[13px] leading-5 text-red-orange"><IcAlert size={16} />{socialErrorMessage(error)}</p>
        </div>
        <div className="rounded-[16px] bg-ui-1 px-5 py-5 flex flex-col gap-3">
          <span className="font-pretendard font-medium text-[13px] leading-5 text-typo-alternative">이럴 때 가져올 수 없어요</span>
          <div className="flex flex-col gap-5">
            {REASONS.map(([t, s]) => (
              <div key={t} className="flex flex-col gap-1">
                <span className="font-pretendard font-semibold text-[15px] leading-[22px] text-typo-strong">{t}</span>
                <span className="font-pretendard text-[13px] leading-5 text-typo-alternative">{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-6" />
      <div className="flex flex-col gap-2">
        <Btn onClick={onWrite}>직접 메모 쓰기</Btn>
        <Btn kind="secondary" onClick={onRetry}>다른 링크 넣기</Btn>
      </div>
    </div>
  );
}

export default function YoutubeScreen({ nav, url: initialUrl = '', videoId, leaving }) {
  const [url, setUrl] = useState(initialUrl);
  const [phase, setPhase] = useState(videoId ? 'loading' : 'paste');
  const [video, setVideo] = useState(null);
  const [error, setError] = useState(null);
  const [clip, setClip] = useState(null);
  const [preview, setPreview] = useState(null);
  const abortRef = useRef(null);

  /* 이미 정리된 영상(알림·저장 목록에서 들어옴) */
  useEffect(() => {
    if (!videoId) return;
    socialCall('youtube-get', { videoId }).then((d) => { setVideo(d.video); setPhase('result'); }).catch((e) => { setError(e); setPhase('failed'); });
  }, [videoId]);

  /* 복사해 둔 유튜브 링크 찾기 (권한이 이미 있을 때만 조용히 읽는다) */
  useEffect(() => {
    if (videoId || initialUrl) return;
    (async () => {
      try {
        const perm = await navigator.permissions?.query({ name: 'clipboard-read' });
        if (perm?.state !== 'granted') return;
        const text = (await navigator.clipboard.readText()).trim();
        if (looksLikeYoutube(text)) {
          const id = text.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/)?.[1];
          setClip({ url: text, thumbnail: id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : '' });
        }
      } catch { /* 클립보드를 못 읽으면 붙여넣기만 쓴다 */ }
    })();
  }, []);

  async function submit() {
    const id = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/)?.[1];
    setPreview({ thumbnail: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '' });
    setPhase('loading');
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const d = await socialCall('youtube-import', { url }, { signal: controller.signal });
      setVideo(d.video);
      setPhase('result');
    } catch (e) {
      if (e?.name === 'AbortError') return;
      setError(e);
      setPhase('failed');
    }
  }

  return (
    <Screen leaving={leaving}>
      <TopBar title="유튜브에서 가져오기" onBack={() => nav.pop()} />
      {phase === 'paste' && <Paste url={url} setUrl={setUrl} onSubmit={submit} clip={clip} />}
      {phase === 'loading' && <Loading preview={preview} />}
      {phase === 'result' && video && <Result nav={nav} video={video} />}
      {phase === 'failed' && (
        <Failed
          url={url || videoId}
          error={error}
          onWrite={() => { nav.pop(); nav.openRecord('workout'); }}
          onRetry={() => { setUrl(''); setPhase('paste'); }}
        />
      )}
    </Screen>
  );
}
