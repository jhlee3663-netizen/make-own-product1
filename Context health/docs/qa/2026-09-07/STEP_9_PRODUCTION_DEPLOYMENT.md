# 9단계 — 운영 배포와 키 교체

> **2026-09-29 후속:** 전용 Google 운영 계정으로 인증 AI, 운동·식단, 재로그인, 회원 탈퇴를 실행했다. 핵심 삭제는 통과했고 서버 메타데이터 잔존 QA-22(P2)를 추가했다. [10단계](STEP_10_PRODUCTION_ACCOUNT_E2E.md)

2026-09-11. 사용자의 진행 지시에 따라 검증된 인덱스, Firestore 규칙, Functions, Hosting을 운영 `context-health-3eb84`에 순서대로 반영했다. 실제 사용자 기록은 작성·수정·삭제하지 않았다.

## 결과

| 항목 | 결과 | 운영 증거 |
|---|---|---|
| 휴지통 복합 인덱스 | PASS | `uid ASC + deletedAt DESC` 인덱스 `READY` |
| Firestore 규칙 | PASS | ruleset `f389cb3b-e9d0-4563-b81a-7dd456e32039` 배포, 에뮬레이터 18/18 유지 |
| AI 프록시 | 부분 PASS | `aiGenerate` ACTIVE, 무인증 401, 새 키로 Gemini 3.6 실제 응답 성공. 운영 로그인 토큰 종단 호출은 미실행 |
| 회원 탈퇴 함수 | 부분 PASS | `deleteAccount` ACTIVE, 무인증 401, 에뮬레이터 9/9. 일회용 운영 계정 탈퇴는 미실행 |
| Hosting/PWA | PASS | 버전 `75104a651bb4db45`, 새 JS/CSS와 API rewrite 반영, 셸 파일 no-store |
| PC 렌더링 | PASS | 새 Chrome 탭에서 로고·한글·숫자·단위·차트 겹침 없음 |
| 기존 탭 새로고침 | PASS | 이전부터 열려 있던 인증 탭이 새로고침 뒤 AI 코치 화면을 정상 표시 |
| Gemini 키 교체 | PASS | 새 제한 키를 Secret Manager에 저장, 이전 공개 키 삭제, 로컬 `VITE_GEMINI_KEY` 제거 |

상세 기계 판독 증거는 [production-release-deploy-2026-09-11.json](evidence/production-release-deploy-2026-09-11.json), 규칙 잔여 위험은 [rules-security-audit-2026-09-11.json](evidence/rules-security-audit-2026-09-11.json)에 있다.

## 배포 중 발견한 호환성 문제

새 프로젝트 키로 `gemini-2.5-flash`를 호출하면 신규 사용자에게 제공되지 않는다는 404가 반환됐다. 실제 API 호출로 `gemini-3.6-flash`와 `thinkingLevel: minimal`을 확인한 뒤 서버 allowlist와 세 클라이언트 호출부를 3.6으로 맞췄다. 로컬 AI 프록시 10/10, 타입 검사와 빌드를 다시 통과한 뒤 배포했다.

## 키 처리

- 새 키는 현재 Firebase 프로젝트에 만들고 Generative Language API만 허용했다.
- 키 문자열은 문서와 로그에 기록하지 않았다.
- 배포 함수에는 `GEMINI_KEY` Secret version 1이 연결됐다.
- 이전 키는 삭제 완료 상태이며 삭제 시각은 증거 JSON에만 메타데이터로 남겼다.
- 배포된 JS에는 `VITE_GEMINI_KEY`, Gemini 직접 API 주소, 2.5 모델 문자열이 없다.

## 운영에서 실행하지 못한 항목

이메일/비밀번호와 익명 가입이 운영에서 비활성이라 일회용 QA 계정을 만들 수 없었다. 서비스 계정 서명도 현재 사용자 권한에서 거절됐다. 기존 로그인 계정으로 대화를 보내면 실제 코치방과 AI 사용량을 바꾸므로 실행하지 않았다. 따라서 아래는 버그 확정이 아니라 **검증 필요**다.

1. 전용 운영 계정에서 인증된 `/api/ai-generate` 200과 화면 파서 확인.
2. 같은 계정에서 정상 탈퇴 후 Auth, logs, user, coachRooms 잔여 0 확인.
3. Google·Kakao·Naver의 신규 로그인, 취소, 충돌, 재로그인.
4. 실제 iPhone/Android 설치형 PWA의 A→B 업데이트, 오프라인 종료·복원.

## 새 운영 위험

배포 도구가 Cloud Functions의 Node.js 20 런타임을 2026-10-30에 종료 예정이라고 경고했다. 현재 함수는 정상 ACTIVE지만, 종료 전 지원 런타임으로 올리고 에뮬레이터 및 운영 스모크 검사를 다시 해야 한다. 출시 당일 장애는 아니며 일정이 정해진 **P1 운영 후속**으로 관리한다.

## 현재 출시 판단

QA-01의 공개 키 문제와 QA-08의 미배포 endpoint, QA-12 인덱스 선행 조건, QA-17 운영 규칙 미반영은 해결됐다. 2026-09-29 Google 운영 계정의 인증 AI와 탈퇴 핵심 삭제도 통과했다. QA-22, Kakao·Naver, 실기기 설치형 PWA가 남아 최종 출시는 계속 **보류**다.
