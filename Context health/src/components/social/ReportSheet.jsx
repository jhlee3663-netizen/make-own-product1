import React, { useState } from 'react';
import { socialCall, socialErrorMessage } from '../../lib/socialApi';
import { Btn, Sheet, SheetTitle } from './ui';

/* 신고 (App Store 1.2 · Play 사용자 생성 콘텐츠).
   target: { key, commentId?, what: '글' | '댓글' } */

const REASONS = [
  { id: 'spam',      label: '스팸·광고' },
  { id: 'sexual',    label: '선정적인 내용' },
  { id: 'violence',  label: '폭력·위협' },
  { id: 'hate',      label: '혐오·괴롭힘' },
  { id: 'falseInfo', label: '잘못된 건강 정보' },
  { id: 'privacy',   label: '개인정보 노출' },
  { id: 'other',     label: '기타' },
];

export default function ReportSheet({ target, onClose, onDone, toast }) {
  const [reason, setReason] = useState(null);
  const [detail, setDetail] = useState('');
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!reason || sending) return;
    setSending(true);
    try {
      await socialCall('report', {
        key: target.key,
        commentId: target.commentId || '',
        reason,
        detail: detail.trim(),
      });
      onClose();
      onDone?.();
      toast?.('신고했어요. 24시간 안에 확인할게요');
    } catch (e) {
      toast?.(socialErrorMessage(e));
    }
    setSending(false);
  }

  return (
    <Sheet open={Boolean(target)} onClose={onClose} label="신고">
      <SheetTitle
        title={`이 ${target?.what || '글'}을 신고할까요?`}
        sub="운영자가 24시간 안에 확인하고, 위반이면 숨기거나 지웁니다."
      />

      <div className="flex flex-col gap-2">
        {REASONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setReason(id)}
            className="flex items-center justify-between h-12 px-4 rounded-[12px] text-left transition-colors"
            style={reason === id ? { background: '#eef4ff' } : { background: '#f8f9fa' }}
          >
            <span
              className="font-pretendard font-medium text-[15px] tracking-[-0.375px]"
              style={{ color: reason === id ? '#7171FF' : '#343a40' }}
            >
              {label}
            </span>
            {reason === id && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M5 12.5l4.5 4.5L19 7" stroke="#7171FF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        ))}
        {reason === 'other' && (
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value.slice(0, 500))}
            rows={3}
            placeholder="어떤 점이 문제인지 적어 주세요"
            className="mt-1 w-full rounded-[12px] bg-ui-1 px-4 py-3 font-pretendard text-[14px] text-typo-normal outline-none resize-none"
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Btn onClick={submit} disabled={!reason || sending}>{sending ? '보내는 중…' : '신고하기'}</Btn>
        <Btn kind="secondary" onClick={onClose}>닫기</Btn>
      </div>
    </Sheet>
  );
}
