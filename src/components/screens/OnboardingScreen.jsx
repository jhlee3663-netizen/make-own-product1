import React, { useState } from 'react';

const GOALS = ['체중 감량', '근육 증량', '체형 유지', '건강 증진'];
const STEPS = ['목표', '체형 정보', '활동 수준'];

export default function OnboardingScreen({ user, onComplete }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    goal: GOALS[0],
    age: '',
    gender: 'male',
    height: '',
    weight: '',
    goalWeight: '',
    activityLevel: 'moderate',
  });

  function next() {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else onComplete(form);
  }

  const canNext =
    step === 0 ? !!form.goal :
    step === 1 ? form.height && form.weight :
    true;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 상단 */}
      <div className="px-5 pt-14 pb-6">
        {/* 진행 바 */}
        <div className="flex gap-1.5 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-all duration-300"
              style={{ background: i <= step ? '#0054d1' : '#e9ecef' }}
            />
          ))}
        </div>

        <p className="font-pretendard text-[13px] text-[#0054d1] font-semibold tracking-[-0.325px] mb-2">
          {step + 1} / {STEPS.length}
        </p>
        <h2 className="font-pretendard font-bold text-[26px] tracking-[-0.65px] text-[#171a1d] leading-[1.3]">
          {step === 0 && <>운동의 목표가<br />무엇인가요?</>}
          {step === 1 && <>체형 정보를<br />알려주세요</>}
          {step === 2 && <>평소 활동 수준이<br />어느 정도인가요?</>}
        </h2>
        <p className="font-pretendard text-[14px] text-[#868e96] tracking-[-0.35px] mt-2">
          {step === 0 && 'AI 코치가 목표에 맞는 방향으로 도와드려요.'}
          {step === 1 && '더 정확한 칼로리 계산을 위해 필요해요.'}
          {step === 2 && '일일 권장 칼로리 계산에 활용됩니다.'}
        </p>
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-y-auto px-5">
        {/* Step 0: 목표 */}
        {step === 0 && (
          <div className="flex flex-col gap-3">
            {GOALS.map((g) => (
              <button
                key={g}
                onClick={() => setForm((f) => ({ ...f, goal: g }))}
                className="flex items-center justify-between px-5 py-4 rounded-[16px] transition-all text-left"
                style={form.goal === g
                  ? { background: '#eef4ff', border: '2px solid #0054d1' }
                  : { background: '#f8f9fa', border: '2px solid transparent' }
                }
              >
                <span
                  className="font-pretendard font-semibold text-[16px] tracking-[-0.4px]"
                  style={{ color: form.goal === g ? '#0054d1' : '#171a1d' }}
                >
                  {g}
                </span>
                {form.goal === g && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" fill="#0054d1"/>
                    <path d="M8 12l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Step 1: 체형 정보 */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            {/* 성별 */}
            <div>
              <p className="font-pretendard font-semibold text-[13px] text-[#868e96] mb-2 tracking-[-0.325px]">성별</p>
              <div className="flex gap-2">
                {[{ id: 'male', label: '남성' }, { id: 'female', label: '여성' }].map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setForm((f) => ({ ...f, gender: id }))}
                    className="flex-1 py-3 rounded-[12px] font-pretendard font-semibold text-[15px] tracking-[-0.375px] transition-all"
                    style={form.gender === id
                      ? { background: '#0054d1', color: '#fff' }
                      : { background: '#f1f3f5', color: '#495057' }
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {[
              { field: 'age', label: '나이', unit: '세', placeholder: '25' },
              { field: 'height', label: '키', unit: 'cm', placeholder: '170' },
              { field: 'weight', label: '현재 체중', unit: 'kg', placeholder: '70' },
              { field: 'goalWeight', label: '목표 체중', unit: 'kg', placeholder: '65' },
            ].map(({ field, label, unit, placeholder }) => (
              <div key={field}>
                <p className="font-pretendard font-semibold text-[13px] text-[#868e96] mb-2 tracking-[-0.325px]">{label}</p>
                <div className="flex items-center bg-[#f1f3f5] rounded-[12px] px-4 h-[52px]">
                  <input
                    type="number"
                    value={form[field]}
                    placeholder={placeholder}
                    onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                    className="flex-1 bg-transparent outline-none font-pretendard font-semibold text-[16px] text-[#171a1d] tracking-[-0.4px]"
                  />
                  <span className="font-pretendard text-[14px] text-[#adb5bd] tracking-[-0.35px]">{unit}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Step 2: 활동 수준 */}
        {step === 2 && (
          <div className="flex flex-col gap-3">
            {[
              { id: 'sedentary',  label: '거의 앉아있음', desc: '주로 책상 앞 생활 (사무직, 학생)', emoji: '🪑' },
              { id: 'light',      label: '가벼운 활동',   desc: '주 1~2회 가벼운 운동',             emoji: '🚶' },
              { id: 'moderate',   label: '보통 활동',     desc: '주 3~5회 운동',                    emoji: '🏃' },
              { id: 'active',     label: '활발한 활동',   desc: '주 6~7회 강도 높은 운동',          emoji: '💪' },
            ].map(({ id, label, desc, emoji }) => (
              <button
                key={id}
                onClick={() => setForm((f) => ({ ...f, activityLevel: id }))}
                className="flex items-center gap-4 px-5 py-4 rounded-[16px] transition-all text-left"
                style={form.activityLevel === id
                  ? { background: '#eef4ff', border: '2px solid #0054d1' }
                  : { background: '#f8f9fa', border: '2px solid transparent' }
                }
              >
                <span className="text-[28px]">{emoji}</span>
                <div className="flex-1">
                  <p
                    className="font-pretendard font-semibold text-[15px] tracking-[-0.375px]"
                    style={{ color: form.activityLevel === id ? '#0054d1' : '#171a1d' }}
                  >
                    {label}
                  </p>
                  <p className="font-pretendard text-[12px] text-[#868e96] tracking-[-0.3px] mt-0.5">{desc}</p>
                </div>
                {form.activityLevel === id && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" fill="#0054d1"/>
                    <path d="M8 12l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="h-8" />
      </div>

      {/* 하단 버튼 */}
      <div className="flex-none px-5 pb-10 pt-4">
        <button
          onClick={next}
          disabled={!canNext}
          className="w-full h-[56px] bg-[#0054d1] rounded-[16px] font-pretendard font-bold text-[16px] text-white tracking-[-0.4px] disabled:opacity-40 active:scale-[0.98] transition-all"
        >
          {step === STEPS.length - 1 ? '시작하기 🚀' : '다음'}
        </button>
        {step > 0 && (
          <button
            onClick={() => setStep((s) => s - 1)}
            className="w-full py-3 mt-2 font-pretendard text-[14px] text-[#adb5bd] tracking-[-0.35px]"
          >
            이전
          </button>
        )}
      </div>
    </div>
  );
}
