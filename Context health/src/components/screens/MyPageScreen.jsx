import React, { useState, useEffect } from 'react';
import { auth, db } from '../../lib/firebase';
import { signOut } from 'firebase/auth';
import { clearIndexedDbPersistence, terminate, collection, query, where, orderBy, limit, getDocs, updateDoc, doc, deleteField } from 'firebase/firestore';
import Pressable from '../common/Pressable';

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

const TERMS_CONTENT = `제1조 (목적)
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

const PRIVACY_CONTENT = `Context Health(이하 "서비스")는 이용자의 개인정보 보호를 중요하게 생각하며, 「개인정보 보호법」을 준수합니다.

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

function LegalModal({ title, content, onClose }) {
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

  useEffect(() => {
    if (!trashOpen || !user?.uid) return;
    setTrashLoading(true);
    const q = query(collection(db, 'logs'), where('uid', '==', user.uid), orderBy('timestamp', 'desc'), limit(200));
    getDocs(q).then(snap => {
      const now = Date.now();
      const cutoff = now - 30 * 86400000;
      const items = snap.docs
        .map(d => ({ ...d.data(), docId: d.id }))
        .filter(d => d.deletedAt)
        .filter(d => {
          const ms = d.deletedAt.seconds ? d.deletedAt.seconds * 1000 : 0;
          return ms > cutoff;
        })
        .sort((a, b) => (b.deletedAt?.seconds || 0) - (a.deletedAt?.seconds || 0));
      setTrashedLogs(items);
    }).finally(() => setTrashLoading(false));
  }, [trashOpen, user?.uid]);

  async function handleRestore(docId) {
    setRestoringId(docId);
    try {
      await updateDoc(doc(db, 'logs', docId), { deletedAt: deleteField() });
      setTrashedLogs(prev => prev.filter(l => l.docId !== docId));
    } finally {
      setRestoringId(null);
    }
  }

  function handleSave() {
    onProfileSave(form);
    setEditing(false);
  }

  async function handleLogout() {
    localStorage.removeItem('auth_user');
    localStorage.removeItem('user_profile');
    localStorage.removeItem('onboarding_completed');
    localStorage.removeItem('ai_goals');
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('coach_msgs_') || k?.startsWith('coach_room_meta_')) keysToRemove.push(k);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    if (user?.provider === 'google') {
      try { await signOut(auth); } catch {}
      try {
        await terminate(db);
        await clearIndexedDbPersistence(db);
      } catch {}
    }
    window.location.reload();
  }

  const fp = { editing, form, setForm };

  return (
    <div className="flex flex-col h-full bg-ui-1 relative">
      {activeModal === 'terms' && <LegalModal title="이용약관" content={TERMS_CONTENT} onClose={() => setActiveModal(null)} />}
      {activeModal === 'privacy' && <LegalModal title="개인정보처리방침" content={PRIVACY_CONTENT} onClose={() => setActiveModal(null)} />}
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
            onClick={() => setEditing(!editing)}
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
                        <path d="M20 6L9 17L4 12" stroke="#3476EE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
            <Pressable
              pressScale={0.97}
              onClick={handleSave}
              className="w-full h-[52px] bg-brand rounded-2xl font-pretendard font-bold text-body-s text-white tracking-[-0.375px]"
            >
              저장하기
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
          <button
            onClick={handleLogout}
            className="flex items-center justify-between w-full py-4"
          >
            <span className="font-pretendard font-semibold text-body-s text-[#e03e52] tracking-[-0.35px]">로그아웃</span>
          </button>
        </div>

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
