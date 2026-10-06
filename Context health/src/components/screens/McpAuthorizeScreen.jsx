import React, { useState } from 'react';
import Pressable from '../common/Pressable';
import { approveMcpAuthorize, clearMcpAuthorizeRequest } from '../../lib/mcpConnection';

const SHARED = ['운동 기록 (종목·세트·볼륨)', '식단 기록 (칼로리·탄단지)', '아침 공복 체중 · 인바디', '프로필 (키·목표 등)'];

/* claude.ai 커넥터 연결 동의 화면. 허용하면 서버가 1회용 인가 코드를 발급하고 Claude로 돌아간다. */
export default function McpAuthorizeScreen({ user, request, onClose }) {
  const [status, setStatus] = useState('idle'); // idle | approving | denied | error
  const [errorMessage, setErrorMessage] = useState('');

  async function handleApprove() {
    if (status === 'approving') return;
    setStatus('approving');
    try {
      const { redirectTo } = await approveMcpAuthorize(request);
      clearMcpAuthorizeRequest();
      window.location.assign(redirectTo);
    } catch (error) {
      setErrorMessage(
        error.code === 'access_denied' ? '이 계정은 Claude 연결이 허용되지 않았어요.'
          : error.status === 400 ? '연결 요청이 올바르지 않아요. Claude에서 다시 시도해주세요.'
            : '연결하지 못했어요. 잠시 후 다시 시도해주세요.',
      );
      setStatus('error');
    }
  }

  function handleDeny() {
    clearMcpAuthorizeRequest();
    setStatus('denied');
  }

  if (status === 'denied') {
    return (
      <div className="absolute inset-0 z-[60] bg-white flex flex-col items-center justify-center px-8 gap-3">
        <p className="font-pretendard font-bold text-[17px] text-typo-strong tracking-[-0.4px]">연결하지 않았어요</p>
        <p className="font-pretendard text-body-s text-typo-alternative text-center tracking-[-0.3px]">이 창은 닫아도 됩니다.</p>
        <Pressable pressScale={0.97} onClick={onClose} className="mt-2 px-6 py-3 bg-ui-1 rounded-2xl font-pretendard font-semibold text-body-s text-typo-normal">
          앱으로 가기
        </Pressable>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-[60] bg-white flex flex-col px-6 pt-16 pb-[calc(24px+env(safe-area-inset-bottom))]">
      <div className="flex-1">
        <p className="font-pretendard font-bold text-[22px] text-typo-strong tracking-[-0.5px] leading-snug">
          Claude가 내 기록을<br />조회하도록 허용할까요?
        </p>
        <p className="mt-2 font-pretendard text-body-s text-typo-alternative tracking-[-0.3px]">
          {user?.name}{user?.email ? ` (${user.email})` : ''} 계정
        </p>

        <div className="mt-6 bg-ui-1 rounded-2xl px-4 py-4">
          <p className="font-pretendard font-semibold text-caption-l text-typo-secondary tracking-[-0.3px] mb-2">Claude가 읽을 수 있는 정보</p>
          {SHARED.map(label => (
            <p key={label} className="font-pretendard text-body-s text-typo-normal tracking-[-0.3px] py-1">• {label}</p>
          ))}
        </div>
        <p className="mt-4 font-pretendard text-caption-l text-typo-alternative tracking-[-0.3px] leading-relaxed">
          읽기 전용이에요. Claude는 기록을 수정하거나 삭제할 수 없어요. 마이페이지에서 언제든 연결을 해제할 수 있어요.
        </p>
        {status === 'error' && (
          <p role="alert" className="mt-4 font-pretendard text-caption-l text-[#e03e52] tracking-[-0.3px]">{errorMessage}</p>
        )}
      </div>

      <div className="flex gap-3">
        <Pressable
          pressScale={0.97}
          onClick={handleDeny}
          disabled={status === 'approving'}
          className="flex-1 h-[52px] bg-ui-1 rounded-2xl font-pretendard font-bold text-body-s text-typo-normal tracking-[-0.375px] disabled:opacity-40"
        >
          거절
        </Pressable>
        <Pressable
          pressScale={0.97}
          onClick={handleApprove}
          disabled={status === 'approving'}
          className="flex-1 h-[52px] bg-brand rounded-2xl font-pretendard font-bold text-body-s text-white tracking-[-0.375px] disabled:opacity-40"
        >
          {status === 'approving' ? '연결 중...' : '허용'}
        </Pressable>
      </div>
    </div>
  );
}
