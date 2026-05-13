import React, { useState } from 'react';
import { auth } from '../../lib/firebase';
import { signOut } from 'firebase/auth';
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

export default function MyPageScreen({ user, profile, onProfileSave, onNavChange }) {
  const [editing, setEditing]   = useState(false);
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

  function handleSave() {
    onProfileSave(form);
    setEditing(false);
  }

  async function handleLogout() {
    localStorage.removeItem('auth_user');
    try { await signOut(auth); } catch {}
    window.location.reload();
  }

  const fp = { editing, form, setForm };

  return (
    <div className="flex flex-col h-full bg-ui-1">
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
            { label: '이용약관', action: () => {} },
            { label: '개인정보처리방침', action: () => {} },
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
      </div>

    </div>
  );
}
