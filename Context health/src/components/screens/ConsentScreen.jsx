import React, { useState } from 'react';
import Pressable from '../common/Pressable';
import { LegalModal, TERMS_CONTENT, PRIVACY_CONTENT } from './MyPageScreen';

export const CONSENT_VERSION = '2026-11-01';

export const HEALTH_CONTENT = `Context Health는 아래 건강 정보를 「개인정보 보호법」 제23조의 민감정보로 보고, 일반 개인정보와 별도로 동의를 받습니다.

1. 수집 항목
- 나이, 성별, 키, 체중, 목표 체중, 활동 수준
- 운동 기록(종목, 세트, 무게, 횟수, 메모)
- 식단 기록(먹은 음식, 칼로리, 탄수화물·단백질·지방)
- 아침 공복 체중, 체성분(인바디) 기록

2. 이용 목적
- 기록의 저장·조회와 통계 제공
- AI(Google Gemini)를 통한 자연어 기록 정리와 영양 추정
- 목표 칼로리 계산과 AI 코치 답변

3. 보유 기간
탈퇴 시까지 보유하며, 탈퇴하면 지체 없이 파기합니다. 삭제한 기록은 휴지통에서 30일간 보관된 뒤 영구 삭제됩니다.

4. 국외 이전
저장과 AI 분석을 위해 Google Firebase·Google Gemini API(미국)로 전송됩니다.

5. 공개 범위
직접 '공개'로 올린 게시물 외에는 다른 이용자에게 공개되지 않습니다.

6. 거부할 권리
동의를 거부할 수 있습니다. 다만 건강 기록은 서비스의 핵심 기능이므로, 거부하면 서비스를 이용할 수 없습니다. 동의 후에도 마이페이지에서 탈퇴해 언제든 철회할 수 있습니다.`;

const ITEMS = [
  { id: 'terms',   label: '[필수] 이용약관',                 modal: 'terms' },
  { id: 'privacy', label: '[필수] 개인정보 수집·이용 동의',   modal: 'privacy' },
  { id: 'health',  label: '[필수] 건강정보(민감정보) 수집·이용 동의', modal: 'health' },
];

function Check({ on, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="11" fill={on ? '#7171FF' : '#e9ecef'} />
      <path d="M7.5 12.2l3 3 6-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ConsentScreen({ onAgree }) {
  const [agreed, setAgreed] = useState({ terms: false, privacy: false, health: false });
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const all = ITEMS.every(({ id }) => agreed[id]);

  function toggleAll() {
    const next = !all;
    setAgreed({ terms: next, privacy: next, health: next });
  }

  async function submit() {
    if (!all || saving) return;
    setSaving(true);
    setError('');
    try {
      await onAgree({
        terms: true,
        privacy: true,
        health: true,
        version: CONSENT_VERSION,
        agreedAt: new Date().toISOString(),
      });
    } catch {
      setError('저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-5 pt-14 pb-6">
        <h2 className="font-pretendard font-bold text-[26px] tracking-[-0.65px] text-[#171a1d] leading-[1.3]">
          시작하기 전에<br />동의가 필요해요
        </h2>
        <p className="font-pretendard text-[14px] text-[#868e96] tracking-[-0.35px] mt-2">
          운동·식단 기록은 민감한 건강 정보라 따로 동의를 받습니다.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5">
        {/* 전체 동의 */}
        <Pressable
          as="div"
          pressScale={0.985}
          onClick={toggleAll}
          className="flex items-center gap-3 px-5 py-4 rounded-[16px] text-left"
          style={all
            ? { background: '#eef4ff', border: '2px solid rgba(113, 113, 255, 0.3)' }
            : { background: '#f8f9fa', border: '2px solid transparent' }}
        >
          <Check on={all} size={24} />
          <span
            className="font-pretendard font-bold text-[16px] tracking-[-0.4px]"
            style={{ color: all ? '#7171FF' : '#171a1d' }}
          >
            전체 동의하기
          </span>
        </Pressable>

        <div className="mt-6 flex flex-col gap-2">
          {ITEMS.map(({ id, label, modal: target }) => (
            <div key={id} className="flex items-center gap-3 py-1">
              <Pressable
                as="div"
                pressScale={0.9}
                onClick={() => setAgreed((a) => ({ ...a, [id]: !a[id] }))}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <Check on={agreed[id]} />
                <span className="font-pretendard font-medium text-[14px] tracking-[-0.35px] text-[#343a40] truncate">
                  {label}
                </span>
              </Pressable>
              <button
                onClick={() => setModal(target)}
                className="flex-none font-pretendard text-[13px] text-[#adb5bd] tracking-[-0.325px] underline underline-offset-2 transition-all duration-100 active:opacity-40"
              >
                보기
              </button>
            </div>
          ))}
        </div>

        <p className="font-pretendard text-[12px] text-[#adb5bd] tracking-[-0.3px] leading-[1.6] mt-6">
          만 14세 미만은 가입할 수 없습니다. 동의를 거부할 수 있으나, 건강 기록이 핵심 기능이라 거부하면 서비스를 이용할 수 없습니다.
        </p>

        <div className="h-8" />
      </div>

      <div className="flex-none px-5 pb-10 pt-4">
        {error && (
          <p className="font-pretendard text-[13px] text-[#ff5247] tracking-[-0.325px] mb-2 text-center">{error}</p>
        )}
        <Pressable
          pressScale={0.97}
          onClick={submit}
          disabled={!all || saving}
          className="w-full h-[56px] bg-[#7171FF] rounded-[16px] font-pretendard font-bold text-[16px] text-white tracking-[-0.4px] disabled:opacity-40"
        >
          {saving ? '저장 중…' : '동의하고 시작하기'}
        </Pressable>
      </div>

      {modal === 'terms'   && <LegalModal title="이용약관" content={TERMS_CONTENT} onClose={() => setModal(null)} />}
      {modal === 'privacy' && <LegalModal title="개인정보처리방침" content={PRIVACY_CONTENT} onClose={() => setModal(null)} />}
      {modal === 'health'  && <LegalModal title="건강정보 수집·이용 동의" content={HEALTH_CONTENT} onClose={() => setModal(null)} />}
    </div>
  );
}
