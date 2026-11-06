import React, { useEffect, useRef, useState } from 'react';
import { socialCall, socialErrorMessage } from '../../lib/socialApi';
import ConfirmModal from '../common/ConfirmModal';
import { Avatar, Btn, FadeLine, Screen, Spinner, TopBar, Toggle } from './ui';
import { IcCheck, IcPlusSmall } from './SocialIcons';
import { pushPermission, pushSupported } from '../../lib/push';

/* 처음 설정(17 아이디·사진 → 31 공개 범위) · 프로필 편집(25) · 공개 범위(18) · 알림 설정 */

const COLORS = ['#FF8A9B', '#3ECF8E', '#FFB547', '#5BB8FF', '#9B8AFB', '#7171FF'];

const VIS_ITEMS = [
  { id: 'workout', title: '운동 기록', sub: '부위 · 종목 · 무게 · 볼륨 · 메모 한 줄' },
  { id: 'best', title: '최고 기록', sub: '종목별 최고 무게' },
  { id: 'diet', title: '식단', sub: '하루 칼로리·탄단지만 · 음식 이름은 안 보여요' },
  { id: 'weight', title: '체중', sub: '변화량만 (예: −1.2kg)' },
];

/* 사진을 160px JPEG로 줄인다 (서버는 60KB 이하만 받는다) */
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 160;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function Field({ label, counter, children, help, helpTone = 'gray' }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between font-pretendard text-[13px] font-medium">
        <span className="text-typo-normal">{label}</span>
        {counter && <span className="text-ui-6">{counter}</span>}
      </div>
      {children}
      {help && <span className={`font-pretendard text-[12px] leading-[18px] ${helpTone === 'green' ? 'text-state-success' : helpTone === 'red' ? 'text-red-orange' : 'text-ui-6'}`}>{help}</span>}
    </div>
  );
}

const inputClass = (state) => `h-12 px-4 rounded-[12px] bg-ui-1 border font-pretendard text-[15px] text-typo-strong outline-none transition-colors ${state === 'ok' ? 'border-state-success' : state === 'bad' ? 'border-red-orange' : 'border-ui-3 focus:border-brand'}`;

/* 아이디 입력: 쓰는 동안 사용 가능 여부를 바로 알려준다 */
function useHandleCheck(handle, original) {
  const [state, setState] = useState({ status: 'idle' });
  useEffect(() => {
    const h = handle.trim().toLowerCase();
    if (!h || h === original) { setState({ status: h ? 'same' : 'idle' }); return undefined; }
    if (!/^[a-z0-9._]{3,20}$/.test(h)) { setState({ status: 'format' }); return undefined; }
    setState({ status: 'checking' });
    const t = setTimeout(async () => {
      try {
        const r = await socialCall('handle-check', { handle: h });
        setState(r.available ? { status: 'ok' } : { status: r.reason === 'taken' ? 'taken' : 'format', suggestions: r.suggestions });
      } catch { setState({ status: 'idle' }); }
    }, 350);
    return () => clearTimeout(t);
  }, [handle, original]);
  return state;
}

function handleHelp(check, cooldownUntil) {
  if (cooldownUntil) return { text: `${new Date(cooldownUntil).getMonth() + 1}월 ${new Date(cooldownUntil).getDate()}일부터 다시 바꿀 수 있어요`, tone: 'gray' };
  switch (check.status) {
    case 'ok': return { text: '사용할 수 있어요 · 영문 소문자·숫자·_.  3~20자', tone: 'green' };
    case 'taken': return { text: `이미 있는 아이디예요${check.suggestions?.length ? ` · ${check.suggestions.join(', ')} 어때요?` : ''}`, tone: 'red' };
    case 'format': return { text: '영문 소문자·숫자·밑줄·점으로 3~20자', tone: 'red' };
    case 'checking': return { text: '확인하는 중…', tone: 'gray' };
    default: return { text: '바꾸면 30일 동안 다시 못 바꿔요', tone: 'gray' };
  }
}

function PhotoPicker({ profile, onPhoto, onColor, compact }) {
  const fileRef = useRef(null);
  return (
    <div className="flex flex-col items-center gap-3">
      <button type="button" onClick={() => fileRef.current?.click()} className="relative">
        <Avatar profile={profile} size={80} />
        {!compact && <span className="absolute -right-0.5 -bottom-0.5 w-7 h-7 rounded-full bg-white shadow flex items-center justify-center text-typo-normal"><IcPlusSmall size={14} /></span>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) onPhoto(await shrinkImage(f)); e.target.value = ''; }} />
      <div className="flex items-center gap-4 font-pretendard font-medium text-[13px]">
        <button type="button" onClick={() => fileRef.current?.click()} className="text-brand">앨범에서 고르기</button>
        <button type="button" onClick={() => { onPhoto(''); onColor(COLORS[(COLORS.indexOf(profile.color) + 1) % COLORS.length]); }} className="text-brand">기본 아바타</button>
        {profile.photoUrl && <button type="button" onClick={() => onPhoto('')} className="text-ui-6">삭제</button>}
      </div>
    </div>
  );
}

function VisibilityList({ value, onChange }) {
  return (
    <div className="rounded-[20px] bg-white px-5 py-1">
      {VIS_ITEMS.map((it, i) => (
        <React.Fragment key={it.id}>
          {i > 0 && <FadeLine />}
          <div className="flex items-center gap-3 py-4">
            <span className="flex-1 flex flex-col gap-1">
              <span className="font-pretendard font-semibold text-[16px] text-typo-strong">{it.title}</span>
              <span className="font-pretendard text-[12px] leading-[18px] text-typo-alternative">{it.sub}</span>
            </span>
            <Toggle on={value[it.id]} onChange={(on) => onChange({ ...value, [it.id]: on })} label={it.title} />
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

/* 처음 친구 기능을 쓸 때 한 번 (IA 4-4). 끝나면 원래 하려던 일로 돌아간다. */
export function ProfileSetupScreen({ nav, leaving }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => ({ name: (nav.authName || '').slice(0, 12), handle: '', photoUrl: '', color: COLORS[Math.floor(Math.random() * COLORS.length)] }));
  const [vis, setVis] = useState({ workout: true, best: true, diet: false, weight: false });
  const [saving, setSaving] = useState(false);
  const check = useHandleCheck(form.handle, '');
  const help = handleHelp(check);

  async function finish() {
    setSaving(true);
    try {
      await socialCall('profile-save', { ...form, handle: form.handle.trim().toLowerCase(), visibility: vis });
      await nav.refreshMe();
      nav.finishSetup();
    } catch (e) {
      nav.toast(socialErrorMessage(e));
      if (e.code === 'handle-taken' || e.code === 'handle-format') setStep(1);
    }
    setSaving(false);
  }

  return (
    <Screen leaving={leaving}>
      <TopBar onBack={() => (step === 2 ? setStep(1) : nav.cancelSetup())} close={step === 1} title="" />
      <div className="flex-1 overflow-y-auto px-6 pt-1 flex flex-col gap-8" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
        {step === 1 ? (
          <>
            <div className="flex flex-col gap-2">
              <h2 className="font-pretendard font-bold text-[26px] leading-9 tracking-[-0.65px] text-typo-strong">친구들이 나를 알아볼 수 있게<br />프로필을 정해 주세요</h2>
              <p className="font-pretendard text-[13px] leading-5 text-typo-alternative">친구 초대·요청, 피드에 올리기를 처음 할 때 한 번만 물어봐요</p>
            </div>
            <PhotoPicker profile={form} onPhoto={(photoUrl) => setForm((f) => ({ ...f, photoUrl }))} onColor={(color) => setForm((f) => ({ ...f, color }))} />
            <div className="flex flex-col gap-6">
              <Field label="표시 이름" counter={`${form.name.length}/12`} help="가입할 때 쓴 이름이에요 · 최대 12자">
                <input value={form.name} maxLength={12} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputClass()} />
              </Field>
              <Field label="아이디" help={help.text} helpTone={help.tone}>
                <span className="relative">
                  <input value={form.handle} maxLength={20} autoCapitalize="none" autoCorrect="off" placeholder="영문으로 정해 주세요" onChange={(e) => setForm((f) => ({ ...f, handle: e.target.value.toLowerCase().replace(/\s/g, '') }))} className={`${inputClass(check.status === 'ok' ? 'ok' : ['taken', 'format'].includes(check.status) ? 'bad' : null)} w-full pl-8`} />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-pretendard text-[15px] text-ui-6">@</span>
                  {check.status === 'ok' && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-state-success"><IcCheck size={16} /></span>}
                  {check.status === 'checking' && <span className="absolute right-4 top-1/2 -translate-y-1/2"><Spinner size={16} /></span>}
                </span>
              </Field>
            </div>
            <div className="flex-1" />
            <Btn disabled={check.status !== 'ok' || !form.name.trim()} onClick={() => setStep(2)}>다음 · 공개 범위 확인</Btn>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <h2 className="font-pretendard font-bold text-[26px] leading-9 tracking-[-0.65px] text-typo-strong">친구에게 무엇을 보여줄까요?</h2>
              <p className="font-pretendard text-[13px] leading-5 text-typo-alternative">나중에 마이 › 공개 범위에서 언제든 바꿀 수 있어요</p>
            </div>
            <div className="-mx-1 bg-ui-1 rounded-[24px] p-1"><VisibilityList value={vis} onChange={setVis} /></div>
            <p className="-mt-6 font-pretendard text-[12px] leading-[18px] text-ui-6">초대 링크로 연결된 친구에게만 보여요. 친구가 아닌 사람은 이름·사진·아이디·소개·공개 루틴만 볼 수 있어요.</p>
            <div className="flex-1" />
            <Btn disabled={saving} onClick={finish}>{saving ? '저장하는 중…' : '완료'}</Btn>
          </>
        )}
      </div>
    </Screen>
  );
}

export function ProfileEditScreen({ nav, leaving }) {
  const me = nav.me?.profile;
  const [form, setForm] = useState(() => ({ name: me?.name || '', handle: me?.handle || '', bio: me?.bio || '', photoUrl: me?.photoUrl || '', color: me?.color || COLORS[0] }));
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const cooldownUntil = me?.handleChangedAt && Date.now() - me.handleChangedAt < 30 * 86400000 ? me.handleChangedAt + 30 * 86400000 : 0;
  const check = useHandleCheck(form.handle, me?.handle || '');
  const help = handleHelp(check, cooldownUntil);
  const dirty = me && (form.name !== me.name || form.handle !== me.handle || form.bio !== (me.bio || '') || form.photoUrl !== (me.photoUrl || '') || form.color !== me.color);
  const handleOk = check.status === 'same' || check.status === 'ok';

  async function save() {
    setSaving(true);
    try {
      const body = { name: form.name, bio: form.bio, photoUrl: form.photoUrl, color: form.color };
      if (form.handle !== me.handle) body.handle = form.handle;
      await socialCall('profile-save', body);
      await nav.refreshMe();
      nav.toast('저장했어요');
      nav.pop();
    } catch (e) { nav.toast(socialErrorMessage(e)); }
    setSaving(false);
  }

  return (
    <Screen leaving={leaving}>
      <TopBar onBack={() => (dirty ? setConfirmLeave(true) : nav.pop())} title="프로필 편집" right={<button type="button" onClick={save} disabled={!dirty || !handleOk || saving} className={`font-pretendard font-semibold text-[15px] ${dirty && handleOk ? 'text-brand' : 'text-ui-5'}`}>저장</button>} />
      <div className="flex-1 overflow-y-auto px-6 pt-2 pb-8 flex flex-col gap-8">
        <PhotoPicker compact profile={form} onPhoto={(photoUrl) => setForm((f) => ({ ...f, photoUrl }))} onColor={(color) => setForm((f) => ({ ...f, color }))} />
        <div className="flex flex-col gap-6">
          <Field label="표시 이름" counter={`${form.name.length}/12`}>
            <input value={form.name} maxLength={12} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputClass()} />
          </Field>
          <Field label="아이디" help={help.text} helpTone={help.tone}>
            <input value={form.handle} maxLength={20} disabled={Boolean(cooldownUntil)} autoCapitalize="none" onChange={(e) => setForm((f) => ({ ...f, handle: e.target.value.toLowerCase().replace(/\s/g, '') }))} className={`${inputClass(check.status === 'ok' ? 'ok' : ['taken', 'format'].includes(check.status) ? 'bad' : null)} disabled:text-ui-6`} />
          </Field>
          <Field label="한 줄 소개" counter={`${form.bio.length}/40`}>
            <input value={form.bio} maxLength={40} placeholder="예: 무분할 · 아침 공복 운동" onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} className={inputClass()} />
          </Field>
        </div>
      </div>
      <ConfirmModal isOpen={confirmLeave} title="수정한 내용을 버릴까요?" confirmText="버리기" cancelText="계속 쓰기" confirmVariant="danger" onConfirm={() => { setConfirmLeave(false); nav.pop(); }} onCancel={() => setConfirmLeave(false)} />
    </Screen>
  );
}

export function VisibilityScreen({ nav, leaving }) {
  const [vis, setVis] = useState(nav.me?.profile?.visibility || { workout: true, best: true, diet: false, weight: false });
  async function change(next) {
    const prev = vis;
    setVis(next);
    try { await socialCall('profile-save', { visibility: next }); nav.refreshMe(); } catch (e) { setVis(prev); nav.toast(socialErrorMessage(e)); }
  }
  return (
    <Screen leaving={leaving} bg="bg-ui-1">
      <div className="bg-white"><TopBar onBack={() => nav.pop()} title="친구에게 보여줄 것" /></div>
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-8 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <VisibilityList value={vis} onChange={change} />
          <p className="px-1 font-pretendard text-[12px] leading-[18px] text-typo-alternative">초대 링크로 연결된 친구에게만 보여요. 친구가 아닌 사람은 이름·사진·아이디·소개·공개 루틴만 볼 수 있어요.</p>
        </div>
        <div className="rounded-[20px] bg-white px-5 py-4 flex flex-col gap-1">
          <span className="font-pretendard font-semibold text-[14px] text-typo-strong">기록 하나만 숨기고 싶다면</span>
          <span className="font-pretendard text-[13px] leading-5 text-typo-alternative">홈에서 기록 카드를 길게 누르고 "친구에게 숨기기"</span>
        </div>
      </div>
    </Screen>
  );
}

const PUSH_ITEMS = [
  ['comment', '댓글·답글·언급'],
  ['friendRequest', '친구 요청'],
  ['friendAccepted', '친구가 됐을 때'],
  ['poke', '콕 찌르기'],
  ['youtubeDone', '유튜브 정리 끝'],
  ['clap', '박수'],
  ['routineImport', '내 루틴을 가져갔을 때'],
  ['friendWorkout', '친구가 운동을 마쳤을 때'],
];

export function NotificationSettingsScreen({ nav, leaving }) {
  const [push, setPush] = useState(nav.me?.profile?.push || {});
  /* 앱에서는 웹의 Notification.permission이 실제 폰 권한과 다르다. push.pushPermission()으로만 본다.
     권한 다이얼로그를 그냥 닫으면 권한은 그대로 'default'이므로 켜기 버튼이 계속 보여야 한다.
     폰 설정에 다녀오는 경우가 있으니 화면으로 돌아올 때마다 다시 확인한다. */
  const [permission, setPermission] = useState('loading');
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!pushSupported()) { if (!cancelled) setPermission('unsupported'); return; }
      try {
        const value = await pushPermission();
        if (!cancelled) setPermission(value);
      } catch { if (!cancelled) setPermission('unsupported'); }
    };
    check();
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);
  async function turnOn() {
    await nav.enablePush();
    try { setPermission(await pushPermission()); } catch { /* 다음 확인에서 */ }
  }
  async function change(key, on) {
    const next = { ...push, [key]: on };
    setPush(next);
    try { await socialCall('profile-save', { push: next }); nav.refreshMe(); } catch (e) { setPush(push); nav.toast(socialErrorMessage(e)); }
  }
  return (
    <Screen leaving={leaving} bg="bg-ui-1">
      <div className="bg-white"><TopBar onBack={() => nav.pop()} title="알림 설정" /></div>
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-8 flex flex-col gap-6">
        {permission !== 'granted' && permission !== 'unsupported' && permission !== 'loading' && (
          <div className="rounded-[20px] bg-white px-5 py-4 flex items-center gap-3">
            <span className="flex-1 flex flex-col gap-1">
              <span className="font-pretendard font-semibold text-[14px] text-typo-strong">폰 알림이 꺼져 있어요</span>
              <span className="font-pretendard text-[12px] text-typo-alternative">{permission === 'denied' ? '폰 설정 > 알림에서 켤 수 있어요' : '켜면 아래 항목을 폰으로 알려드려요'}</span>
            </span>
            {/* 한 번 거부하면 앱에서 다시 물을 수 없다. 폰 설정으로 보내는 말만 남긴다. */}
            {permission !== 'denied' && <Btn size="XS" full={false} onClick={turnOn}>켜기</Btn>}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <span className="px-1 font-pretendard font-medium text-[13px] text-typo-alternative">폰 알림</span>
          <div className="rounded-[20px] bg-white px-5 py-1">
            {PUSH_ITEMS.map(([key, label], i) => (
              <React.Fragment key={key}>
                {i > 0 && <FadeLine />}
                <div className="flex items-center justify-between py-4">
                  <span className="font-pretendard font-medium text-[15px] text-typo-strong">{label}</span>
                  <Toggle on={Boolean(push[key])} onChange={(on) => change(key, on)} label={label} />
                </div>
              </React.Fragment>
            ))}
          </div>
          <p className="px-1 font-pretendard text-[12px] text-ui-6">꺼도 알림 목록에는 남아요</p>
        </div>
      </div>
    </Screen>
  );
}
