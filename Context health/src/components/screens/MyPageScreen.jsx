import React, { useState, useEffect } from 'react';
import { auth, db } from '../../lib/firebase';
import { signOut } from 'firebase/auth';
import { clearIndexedDbPersistence, terminate, collection, query, where, orderBy, getDocs, updateDoc, doc, deleteField, Timestamp } from 'firebase/firestore';
import { clearLegacyPersonalStorage, clearUserStorage } from '../../lib/userStorage';
import Pressable from '../common/Pressable';
import ConfirmModal from '../common/ConfirmModal';
import WeightHistorySection from '../dashboard/WeightHistorySection';
import { disconnectMcp, getMcpStatus } from '../../lib/mcpConnection';

const GOALS = ['체중 감량', '근육 증량', '체형 유지', '건강 증진'];
const ACTIVITY_LEVELS = [
  { id: 'sedentary',  label: '거의 앉아있음', desc: '주로 책상 앞 생활' },
  { id: 'light',      label: '가벼운 활동',   desc: '주 1~2회 운동' },
  { id: 'moderate',   label: '보통 활동',     desc: '주 3~5회 운동' },
  { id: 'active',     label: '활발한 활동',   desc: '주 6~7회 강도 높은 운동' },
];

function FieldRow({ label, field, unit, type = 'number', inputMode, placeholder, wide, editing, form, setForm }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-ui-2">
      <span className="font-pretendard font-medium text-body-s text-typo-normal tracking-[-0.35px]">{label}</span>
      <div className="flex items-center gap-1.5">
        {editing ? (
          <input
            type={type}
            inputMode={inputMode}
            value={form[field]}
            placeholder={placeholder || '입력'}
            onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
            className={`${wide ? 'w-28' : 'w-20'} text-right bg-ui-2 rounded-xl px-2.5 py-1 font-pretendard text-body-s text-typo-strong outline-none tracking-[-0.35px]`}
          />
        ) : (
          <span className="font-pretendard font-semibold text-body-s text-typo-strong tracking-[-0.35px]">
            {form[field] || '—'}
          </span>
        )}
        {unit && <span className="font-pretendard text-caption-l text-ui-6">{unit}</span>}
      </div>
    </div>
  );
}

function formatTimestamp(ts) {
  if (!ts) return '';
  const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  return `${d.getFullYear().toString().slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function daysLeft(deletedAt) {
  if (!deletedAt) return 30;
  const ms = deletedAt.seconds ? deletedAt.seconds * 1000 : Number(deletedAt);
  return Math.max(0, 30 - Math.floor((Date.now() - ms) / 86400000));
}

export const TERMS_CONTENT = `제1조 (목적)
본 약관은 Context Health(이하 "서비스")를 이용함에 있어 이용자의 권리, 의무 및 책임 사항을 규정함을 목적으로 합니다.

제2조 (서비스 이용)
서비스는 운동 기록 및 식단 관리 기능을 제공합니다. 이용자는 본인의 건강 목표를 위해 서비스를 이용할 수 있습니다.

제3조 (이용자 의무)
① 이용자는 타인의 계정을 사용하거나 서비스를 부당하게 이용해서는 안 됩니다.
② 이용자는 서비스 내에 허위 정보를 입력해서는 안 됩니다.

제4조 (서비스 제공의 중단)
천재지변, 시스템 점검 등 불가피한 사유로 서비스가 일시 중단될 수 있습니다.

제5조 (면책 조항)
본 서비스는 의료 서비스가 아닙니다. AI가 제공하는 정보는 참고용이며, 의학적 판단의 대체재가 될 수 없습니다. 건강 이상 시 반드시 전문 의료인과 상담하시기 바랍니다.

제6조 (준거법)
본 약관은 대한민국 법률에 따라 해석됩니다.

부칙
본 약관은 2025년 1월 1일부터 적용됩니다.`;

export const PRIVACY_CONTENT = `Context Health(이하 "서비스")는 이용자의 개인정보 보호를 중요하게 생각하며, 「개인정보 보호법」을 준수합니다.

1. 수집하는 개인정보 항목
- 계정 정보: 이름, 이메일 주소
- 건강 정보: 신체 정보(키, 체중, 나이), 운동 기록, 식단 기록
- 서비스 이용 기록

2. 개인정보 수집 및 이용 목적
- 서비스 제공 및 개인화된 AI 코칭
- 운동·식단 기록 관리
- 서비스 개선 및 통계 분석

3. 개인정보 보유 및 이용 기간
회원 탈퇴 시 또는 수집·이용 목적 달성 후 즉시 파기합니다. 단, 관련 법령에 따라 일정 기간 보존이 필요한 경우 해당 기간 동안 보관합니다.

4. 제3자 제공
이용자의 개인정보는 원칙적으로 제3자에게 제공하지 않습니다. 다만, AI 분석을 위해 Google Gemini API로 데이터가 전송될 수 있으며, 이 과정에서 Google의 개인정보 처리방침이 적용됩니다.

5. 이용자 권리
이용자는 언제든지 자신의 개인정보를 조회, 수정, 삭제할 수 있습니다. 문의: jhlee3663@gmail.com

6. 개인정보 보호책임자
담당: Context Health 운영팀
연락처: jhlee3663@gmail.com`;

export function LegalModal({ title, content, onClose }) {
  return (
    <div className="absolute inset-0 z-[100] flex flex-col bg-white">
      <div className="flex items-center gap-3 px-5 pt-12 pb-4 border-b border-ui-2 flex-none">
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-typo-alternative">
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none">
            <path d="M9 1L1 8l8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <p className="font-pretendard font-bold text-body-m text-typo-strong tracking-[-0.4px]">{title}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <p className="font-pretendard text-body-s text-typo-normal leading-relaxed tracking-[-0.3px] whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}

export default function MyPageScreen({ user, profile, onProfileSave, onNavChange }) {
  const [editing, setEditing]   = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const [form, setForm]         = useState({
    height:        profile?.height       || '',
    weight:        profile?.weight       || '',
    goalWeight:    profile?.goalWeight   || '',
    age:           profile?.age          || '',
    gender:        profile?.gender       || 'male',
    goal:          profile?.goal         || GOALS[0],
    activityLevel: profile?.activityLevel || 'moderate',
    targetKcal:    profile?.targetKcal   || '',
  });
  const [trashOpen, setTrashOpen]     = useState(false);
  const [trashedLogs, setTrashedLogs] = useState([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [restoringId, setRestoringId] = useState(null);
  const [deleteOpen, setDeleteOpen]   = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState('');

  useEffect(() => {
    if (!trashOpen || !user?.uid) return;
    setTrashLoading(true);
    const cutoff = Date.now() - 30 * 86400000;
    const q = query(
      collection(db, 'logs'),
      where('uid', '==', user.uid),
      where('deletedAt', '>=', Timestamp.fromMillis(cutoff)),
      orderBy('deletedAt', 'desc'),
    );
    getDocs(q).then(snap => {
      const items = snap.docs
        .map(d => ({ ...d.data(), docId: d.id }))
        .filter(d => d.deletedAt);
      setTrashedLogs(items);
    }).finally(() => setTrashLoading(false));
  }, [trashOpen, user?.uid]);

  /* Claude 커넥터 연결 상태. 연결된 적이 없으면 항목 자체를 숨긴다. */
  const [mcpConnected, setMcpConnected] = useState(false);
  const [mcpDisconnecting, setMcpDisconnecting] = useState(false);
  const [mcpAllowed, setMcpAllowed] = useState(false);       // 이 계정이 Claude 연결을 쓸 수 있는지
  const [mcpGuideOpen, setMcpGuideOpen] = useState(false);
  const [mcpConfirmOpen, setMcpConfirmOpen] = useState(false);
  useEffect(() => {
    if (!user?.uid) return undefined;
    let cancelled = false;
    getMcpStatus()
      .then(({ connected, allowed }) => {
        if (cancelled) return;
        setMcpConnected(Boolean(connected));
        setMcpAllowed(Boolean(allowed));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.uid]);

  async function handleMcpDisconnect() {
    if (mcpDisconnecting) return;
    setMcpConfirmOpen(false);
    setMcpDisconnecting(true);
    try {
      await disconnectMcp();
      setMcpConnected(false);
    } catch {
      alert('연결을 해제하지 못했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setMcpDisconnecting(false);
    }
  }

  async function handleRestore(docId) {
    setRestoringId(docId);
    try {
      await updateDoc(doc(db, 'logs', docId), { deletedAt: deleteField() });
      setTrashedLogs(prev => prev.filter(l => l.docId !== docId));
    } finally {
      setRestoringId(null);
    }
  }

  async function handleSave() {
    if (profileSaving) return;
    setProfileSaving(true);
    setProfileSaveError('');
    try {
      await onProfileSave(form);
      setEditing(false);
    } catch {
      setProfileSaveError('서버에 저장되지 않았어요. 연결을 확인하고 다시 시도해주세요.');
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleLogout() {
    try { await signOut(auth); } catch {}
    localStorage.removeItem('auth_user');
    clearUserStorage(user?.uid);
    clearLegacyPersonalStorage();
    try {
      await terminate(db);
      await clearIndexedDbPersistence(db);
    } catch {}
    window.location.reload();
  }

  /* QA-08: 실패 원인(재로그인 필요 / 부분 삭제 / 일반 오류)을 구분해서 알린다. */
  async function handleDeleteAccount() {
    if (deleting) return;
    setDeleting(true);
    try {
      const token = await auth.currentUser.getIdToken(true);
      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await res.json().catch(() => null);

      if (res.ok) {
        await handleLogout();
        return;
      }

      setDeleting(false);
      setDeleteOpen(false);
      if (res.status === 401 && payload?.error === 'requires-recent-login') {
        alert('보안을 위해 최근 로그인 기록이 필요합니다. 로그아웃 후 다시 로그인한 뒤 탈퇴를 진행해주세요.');
        return;
      }
      if (payload?.partial) {
        const d = payload.deleted || {};
        alert(`일부 데이터만 삭제된 상태에서 중단됐습니다 (기록 ${d.logs || 0}건, 코치방 ${d.coachRooms || 0}개 삭제됨).\n계정은 아직 남아 있습니다. 다시 탈퇴를 눌러 남은 데이터까지 마저 삭제해주세요.`);
        return;
      }
      alert('탈퇴 처리 중 오류가 발생했습니다. 데이터는 삭제되지 않았습니다. 다시 시도해주세요.');
    } catch {
      setDeleting(false);
      setDeleteOpen(false);
      alert('탈퇴 요청을 보내지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.');
    }
  }

  const fp = { editing, form, setForm };

  return (
    <div className="flex flex-col h-full bg-ui-1 relative">
      {mcpGuideOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          <div onClick={() => setMcpGuideOpen(false)} className="absolute inset-0 bg-[#171719]/50" />
          <div className="relative w-full max-w-[430px] mx-auto bg-white rounded-t-[24px] px-5 pt-3 pb-[calc(32px+env(safe-area-inset-bottom))] shadow-lg">
            <div className="w-10 h-1 mx-auto mb-4 rounded-full bg-ui-3" />
            <h2 className="font-pretendard font-bold text-body-l text-typo-strong tracking-[-0.45px]">Claude 다시 연결하기</h2>
            <p className="mt-1 font-pretendard text-body-s text-typo-secondary tracking-[-0.35px]">연결은 Claude 쪽에서 시작해야 해요. 아래 순서대로 하면 돼요.</p>
            <ol className="mt-4 flex flex-col gap-3">
              {[
                'claude.ai에서 설정 → 커넥터로 들어가요.',
                '목록의 Context Health에서 "연결"을 눌러요.',
                '이 앱 화면이 열리면 "허용"을 눌러요.',
              ].map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="flex-none w-6 h-6 rounded-full bg-brand-light text-brand font-pretendard font-bold text-caption-l flex items-center justify-center">{index + 1}</span>
                  <span className="font-pretendard text-body-s text-typo-normal tracking-[-0.35px] leading-6">{step}</span>
                </li>
              ))}
            </ol>
            <a
              href="https://claude.ai/settings/connectors"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMcpGuideOpen(false)}
              className="mt-5 flex items-center justify-center h-12 rounded-xl bg-brand font-pretendard font-bold text-body-s text-white tracking-[-0.35px]"
            >
              Claude 커넥터 설정 열기
            </a>
          </div>
        </div>
      )}
      {activeModal === 'terms' && <LegalModal title="이용약관" content={TERMS_CONTENT} onClose={() => setActiveModal(null)} />}
      {activeModal === 'privacy' && <LegalModal title="개인정보처리방침" content={PRIVACY_CONTENT} onClose={() => setActiveModal(null)} />}
      <ConfirmModal
        isOpen={deleteOpen}
        title="회원 탈퇴"
        subtitle={"탈퇴 시 모든 기록과 계정 정보가 영구적으로 삭제되며 복구할 수 없습니다.\n정말 탈퇴하시겠습니까?"}
        confirmText={deleting ? '처리 중...' : '탈퇴'}
        cancelText="취소"
        confirmVariant="danger"
        onConfirm={handleDeleteAccount}
        onCancel={() => setDeleteOpen(false)}
      />
      <ConfirmModal
        isOpen={mcpConfirmOpen}
        title="Claude 연결 해제"
        subtitle={"연결을 정말 해제하시겠습니까?\n다시 쓰려면 Claude에서 새로 연결해야 해요."}
        confirmText="해제"
        cancelText="취소"
        confirmVariant="danger"
        onConfirm={handleMcpDisconnect}
        onCancel={() => setMcpConfirmOpen(false)}
      />
      {/* 헤더 프로필 카드 */}
      <div className="bg-white px-5 pt-14 pb-6">
        <div className="flex items-center gap-4">
          <div className="w-[60px] h-[60px] rounded-full bg-gradient-to-br from-[#228bed] to-brand flex items-center justify-center overflow-hidden flex-shrink-0">
            {user?.photo
              ? <img src={user.photo} alt="profile" className="w-full h-full object-cover" />
              : <span className="text-white font-bold text-[22px]">{(user?.name || 'U')[0]}</span>
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-pretendard font-bold text-body-l text-typo-strong tracking-[-0.45px] truncate">{user?.name || '사용자'}</p>
            <p className="font-pretendard text-caption-l text-typo-alternative tracking-[-0.325px] truncate">{user?.email || ''}</p>
          </div>
          <Pressable
            pressScale={0.93}
            onClick={() => { setEditing(!editing); setProfileSaveError(''); }}
            className={`px-3.5 py-1.5 rounded-full font-pretendard font-semibold text-caption-l tracking-[-0.325px] ${
              editing ? 'bg-brand text-white' : 'bg-ui-2 text-typo-normal'
            }`}
          >
            {editing ? '취소' : '수정'}
          </Pressable>
        </div>
      </div>

      {/* 스크롤 콘텐츠 */}
      <div className="flex-1 overflow-y-auto pb-[88px]">
        {/* 목표 설정 섹션 */}
        <div className="bg-white mt-3 px-5">
          <p className="font-pretendard font-semibold text-caption-m text-typo-alternative tracking-[-0.3px] pt-5 pb-2">목표 설정</p>

          {/* 목표 타입 */}
          {editing ? (
            <div className="py-3.5 border-b border-ui-2">
              <p className="font-pretendard font-medium text-body-s text-typo-normal tracking-[-0.35px] mb-2.5">목표</p>
              <div className="flex flex-wrap gap-2">
                {GOALS.map((g) => (
                  <Pressable
                    key={g}
                    pressScale={0.93}
                    onClick={() => setForm((f) => ({ ...f, goal: g }))}
                    className={`px-3.5 py-1.5 rounded-full font-pretendard text-caption-l font-semibold tracking-[-0.325px] ${
                      form.goal === g ? 'bg-brand text-white' : 'bg-ui-2 text-typo-normal'
                    }`}
                  >
                    {g}
                  </Pressable>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between py-3.5 border-b border-ui-2">
              <span className="font-pretendard font-medium text-body-s text-typo-normal tracking-[-0.35px]">목표</span>
              <span className="font-pretendard font-semibold text-body-s text-brand tracking-[-0.35px]">{form.goal || '—'}</span>
            </div>
          )}

          <FieldRow {...fp} label="나이" field="age" unit="세" placeholder="25" />
          <FieldRow {...fp} label="키" field="height" unit="cm" placeholder="170" />
          <FieldRow {...fp} label="현재 체중" field="weight" unit="kg" placeholder="70" />
          <FieldRow {...fp} label="목표 체중" field="goalWeight" unit="kg" placeholder="65" />
          <FieldRow {...fp} label="일일 목표 칼로리" field="targetKcal" unit="kcal" placeholder="2000" type="text" inputMode="numeric" wide />

          {/* 성별 */}
          {editing && (
            <div className="py-3.5 border-b border-ui-2">
              <p className="font-pretendard font-medium text-body-s text-typo-normal tracking-[-0.35px] mb-2.5">성별</p>
              <div className="flex gap-2">
                {[{ id: 'male', label: '남성' }, { id: 'female', label: '여성' }].map(({ id, label }) => (
                  <Pressable
                    key={id}
                    pressScale={0.93}
                    onClick={() => setForm((f) => ({ ...f, gender: id }))}
                    className={`px-4 py-1.5 rounded-full font-pretendard text-caption-l font-semibold tracking-[-0.325px] ${
                      form.gender === id ? 'bg-brand text-white' : 'bg-ui-2 text-typo-normal'
                    }`}
                  >
                    {label}
                  </Pressable>
                ))}
              </div>
            </div>
          )}

          {/* 활동 수준 */}
          <div className="py-3.5">
            <div className={`flex items-center justify-between ${editing ? 'mb-3' : ''}`}>
              <p className="font-pretendard font-medium text-body-s text-typo-normal tracking-[-0.35px]">활동 수준</p>
              {!editing && (
                <span className="font-pretendard font-semibold text-body-s text-typo-strong tracking-[-0.35px]">
                  {ACTIVITY_LEVELS.find(a => a.id === form.activityLevel)?.label || '—'}
                </span>
              )}
            </div>
            {editing && (
              <div className="flex flex-col gap-2">
                {ACTIVITY_LEVELS.map(({ id, label, desc }) => (
                  <Pressable
                    key={id}
                    pressScale={0.985}
                    as="div"
                    onClick={() => setForm((f) => ({ ...f, activityLevel: id }))}
                    className={`flex items-center justify-between px-4 py-3 rounded-2xl text-left ${
                      form.activityLevel === id
                        ? 'bg-brand-light border-[1.5px] border-brand'
                        : 'bg-ui-1 border-[1.5px] border-transparent'
                    }`}
                  >
                    <div>
                      <p className={`font-pretendard font-semibold text-body-s tracking-[-0.35px] ${form.activityLevel === id ? 'text-brand' : 'text-typo-strong'}`}>{label}</p>
                      <p className="font-pretendard text-caption-m text-typo-alternative tracking-[-0.3px]">{desc}</p>
                    </div>
                    {form.activityLevel === id && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M20 6L9 17L4 12" stroke="#7171FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </Pressable>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 저장 버튼 */}
        {editing && (
          <div className="px-5 mt-3">
            {profileSaveError && (
              <p className="mb-2 text-center font-pretendard text-caption-l text-[#e03e52]">
                {profileSaveError}
              </p>
            )}
            <Pressable
              pressScale={0.97}
              onClick={handleSave}
              disabled={profileSaving}
              className="w-full h-[52px] bg-brand rounded-2xl font-pretendard font-bold text-body-s text-white tracking-[-0.375px] disabled:opacity-40"
            >
              {profileSaving ? '저장 중...' : '저장하기'}
            </Pressable>
          </div>
        )}

        {/* 앱 정보 / 계정 섹션 */}
        <div className="bg-white mt-3 px-5">
          <p className="font-pretendard font-semibold text-caption-m text-typo-alternative tracking-[-0.3px] pt-5 pb-2">계정</p>
          {[
            { label: '이용약관', action: () => setActiveModal('terms') },
            { label: '개인정보처리방침', action: () => setActiveModal('privacy') },
          ].map(({ label, action }) => (
            <button
              key={label}
              onClick={action}
              className="flex items-center justify-between w-full py-3.5 border-b border-ui-2"
            >
              <span className="font-pretendard font-medium text-body-s text-typo-normal tracking-[-0.35px]">{label}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 18l6-6-6-6" stroke="#adb5bd" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ))}
          {mcpConnected && (
            <button
              onClick={() => setMcpConfirmOpen(true)}
              disabled={mcpDisconnecting}
              className="flex items-center justify-between w-full py-3.5 border-b border-ui-2 disabled:opacity-40"
            >
              <span className="font-pretendard font-medium text-body-s text-typo-normal tracking-[-0.35px]">Claude 연결됨 (기록 조회)</span>
              <span className="font-pretendard font-semibold text-caption-l text-[#e03e52] tracking-[-0.3px]">{mcpDisconnecting ? '해제 중...' : '연결 해제'}</span>
            </button>
          )}
          {/* 연결을 해제한 뒤에도 다시 연결하는 방법을 찾을 수 있게 한다. 연결은 claude.ai 쪽에서 시작해야 한다. */}
          {!mcpConnected && mcpAllowed && (
            <button
              onClick={() => setMcpGuideOpen(true)}
              className="flex items-center justify-between w-full py-3.5 border-b border-ui-2"
            >
              <span className="font-pretendard font-medium text-body-s text-typo-normal tracking-[-0.35px]">Claude 연결하기 (기록 조회)</span>
              <span className="font-pretendard font-semibold text-caption-l text-brand tracking-[-0.3px]">방법 보기</span>
            </button>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center justify-between w-full py-4 border-b border-ui-2"
          >
            <span className="font-pretendard font-semibold text-body-s text-[#e03e52] tracking-[-0.35px]">로그아웃</span>
          </button>
          <button
            onClick={() => setDeleteOpen(true)}
            className="flex items-center justify-between w-full py-4"
          >
            <span className="font-pretendard font-medium text-body-s text-typo-alternative tracking-[-0.35px]">회원 탈퇴</span>
          </button>
        </div>

        <WeightHistorySection uid={user?.uid} />

        {/* 휴지통 섹션 */}
        <div className="bg-white mt-3 px-5 mb-3">
          <button
            onClick={() => setTrashOpen(o => !o)}
            className="flex items-center justify-between w-full py-4"
          >
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="#868e96" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="font-pretendard font-medium text-body-s text-typo-normal tracking-[-0.35px]">최근 삭제된 항목</span>
              {trashOpen && trashedLogs.length > 0 && (
                <span className="px-1.5 py-0.5 bg-ui-2 rounded-full font-pretendard text-caption-m text-typo-alternative">{trashedLogs.length}</span>
              )}
            </div>
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              style={{ transform: trashOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}
            >
              <path d="M9 18l6-6-6-6" stroke="#adb5bd" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {trashOpen && (
            <div className="pb-4">
              {trashLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-ui-3 border-t-brand rounded-full animate-spin" />
                </div>
              ) : trashedLogs.length === 0 ? (
                <p className="text-center font-pretendard text-caption-l text-typo-alternative py-8 tracking-[-0.325px]">휴지통이 비어있습니다</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {trashedLogs.map(log => {
                    const isDiet = log.type === 'diet';
                    const remaining = daysLeft(log.deletedAt);
                    const isRestoring = restoringId === log.docId;
                    return (
                      <div key={log.docId} className="flex items-center gap-3 py-3 border-t border-ui-2">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-[15px] ${isDiet ? 'bg-[#e8f8ef]' : 'bg-ui-2'}`}>
                          {isDiet ? '🥗' : '🏋️'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-pretendard font-semibold text-body-s text-typo-strong tracking-[-0.35px] truncate">
                            {isDiet ? '식단 기록' : (log.title || '운동 기록')}
                          </p>
                          <p className="font-pretendard text-caption-m text-typo-alternative tracking-[-0.3px]">
                            {formatTimestamp(log.timestamp)} · {remaining}일 후 영구 삭제
                          </p>
                        </div>
                        <Pressable
                          pressScale={0.93}
                          onClick={() => handleRestore(log.docId)}
                          className={`px-3 py-1.5 rounded-full font-pretendard font-semibold text-caption-l tracking-[-0.325px] flex-shrink-0 ${isRestoring ? 'bg-ui-2 text-typo-alternative' : 'bg-brand-light text-brand'}`}
                        >
                          {isRestoring ? '복원 중' : '복원'}
                        </Pressable>
                      </div>
                    );
                  })}
                  <p className="font-pretendard text-caption-m text-typo-alternative tracking-[-0.3px] text-center pt-1">
                    삭제 후 30일이 지난 항목은 자동으로 사라집니다
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
