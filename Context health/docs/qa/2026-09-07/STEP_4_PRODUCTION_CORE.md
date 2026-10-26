# 4단계 운영 핵심 기능 (QA-01·08·09)

> **2026-09-29 후속:** 전용 Google 운영 테스트 계정에서 인증 AI와 회원 탈퇴를 실제로 통과했다. Auth·프로필·건강 기록·코치방 삭제는 확인됐고, UID 연결 `aiUsage`·`accountDeletions` 잔존을 QA-22(P2)로 분리했다. [10단계](STEP_10_PRODUCTION_ACCOUNT_E2E.md)

> **2026-09-11 후속:** 이 문서의 당시 미배포 항목은 [9단계 운영 배포](STEP_9_PRODUCTION_DEPLOYMENT.md)에서 반영됐다. Gemini 모델은 실제 신규 키 호환성 검사 후 `gemini-3.6-flash`로 변경했다. 아래 내용은 2026-09-09 로컬 구현 당시 기록이다.

2026-09-09. `NEXT_STEPS.md` 4단계의 **코드 측 작업과 로컬 검증만** 수행했다. 운영 데이터·운영 Firebase 설정·운영 배포는 변경하지 않았다. 검증은 전부 Firebase 에뮬레이터(demo 프로젝트)와 로컬 모의 upstream에서 실행했고 실제 Gemini API를 호출하지 않았다.

**이 단계는 출시 승인도, QA-01 종결도 아니다.** 운영 키 교체와 함수 배포가 남아 있고 그건 사용자 결정·운영 작업이다.

## 결과

| 항목 | 상태 | 증거 |
|---|---|---|
| QA-01 브라우저 번들에서 Gemini 키 제거 | 로컬 통과 | 수정 전 `dist` 번들에 키 4회·`generativelanguage` 7회 → 수정 후 **키 0회, 직접 URL 0회, `/api/ai-generate` 1회** |
| QA-01 인증 프록시·사용자별 한도 | 에뮬레이터 E2E 통과 (10/10) | `npm run test:ai-proxy` |
| QA-08 탈퇴 함수 강화 | 에뮬레이터 E2E 통과 (6/6) | `npm run test:delete-account` |
| QA-08 부분 삭제·재로그인 요구의 사용자 안내 | 코드 수정 (CODE) | `MyPageScreen.jsx` 오류 분기. 부분 실패 주입 E2E는 미실행 |
| QA-09 미설정 Apple 버튼 노출 제거 | 로컬 통과 | 번들에서 `Apple로 계속하기` 문자열 0회. 플래그로만 재노출 |
| 기존 회귀 | 통과 | `test:nutrition`, `test:user-storage`, `tsc --noEmit`, `build`, `git diff --check` 모두 종료 0 |

### QA-01 프록시 검증 항목 (10건)

무인증 401 / 위조 토큰 401 / 정상 200과 Gemini 응답 형태 유지 / 허용 외 model 400 / `contents` 누락 400 / 과대 prompt 413 / 업스트림 429 전달 / **A 한도 소진 시 429 + Retry-After 600s** / **같은 시점 B는 정상 200 (사용자별 격리)** / 업스트림에 서버 키가 붙고 허용 모델 경로만 도달.

### QA-08 탈퇴 검증 항목 (6건)

무인증 401 / 위조 토큰 401 / 본인 logs·coachRooms·users 문서와 Auth 계정 전량 삭제 / **같은 시점 타 사용자 데이터 보존** / 삭제 후 잔여 기록 0건 / 삭제된 계정 토큰 재사용 401.

## 주요 변경

- `functions/index.js`: `aiGenerate` 추가. Firebase ID 토큰 검증 → 모델 allowlist(`gemini-2.5-flash`, `gemini-2.0-flash`) → payload 100KB·prompt 60,000자 상한 → Firestore 트랜잭션 기반 사용자별 한도(10분 30회 / 24시간 200회) → `GEMINI_KEY` secret으로 업스트림 호출 → 30초 타임아웃. 오류를 401·400·413·429·502·504로 구분해 돌려준다.
- `functions/index.js`: `deleteAccount`를 `verifyIdToken(token, true)` + `auth_time` 10분 이내 요구로 바꾸고, 남은 문서를 매번 다시 조회하는 배치 루프로 재시도 시 이어서 끝나게 했다. 진행 상태는 `accountDeletions/{uid}`에 기록하고 실패 응답에 `partial`과 삭제 건수를 담는다. `timeoutSeconds`를 300으로 올렸다.
- `src/lib/aiClient.js` (신규): 모든 AI 호출의 단일 통로. ID 토큰 부착, `AiRequestError`로 실패 종류 구분(`unauthenticated`/`rate-limited`/`too-large`/`timeout`/`upstream`/`network`).
- `StatusSheet.jsx`, `nutritionLookup.js`, `AICoachScreen.jsx`, `HomeScreen.jsx`, `WorkoutMemoScreen.jsx`: 직접 Gemini 호출 8곳을 프록시로 교체. `VITE_GEMINI_KEY` 참조가 `src`에서 사라졌다.
- `AICoachScreen.jsx`: 실패를 전부 "네트워크 오류"로 표시하던 문구를 한도 초과·세션 만료·응답 지연 등으로 분리했다(QA-10 일부).
- `LoginScreen.jsx`: Apple 버튼을 `VITE_ENABLE_APPLE_LOGIN=true`일 때만 노출. redirect 공통 오류 문구가 Apple 실패도 "Google"로 표기하던 문제를 "소셜"로 수정(STEP_1의 잠재 P3).
- `firestore.rules`: `aiUsage/{uid}`, `accountDeletions/{uid}`를 클라이언트 접근 불가로 명시.
- `firebase.json`: `/api/ai-generate` rewrite, functions 에뮬레이터 포트 추가.
- `vite.config.js`: dev server에서 `/api/*`를 Functions 에뮬레이터로 프록시(운영 빌드 무영향).
- `scripts/qa-upstream-mock.mjs`, `scripts/test-ai-proxy.mjs`, `scripts/test-delete-account.mjs` (신규).

## 재현 절차

```sh
node scripts/qa-upstream-mock.mjs &
GEMINI_KEY=qa-dummy-server-key GEMINI_API_BASE=http://127.0.0.1:5179 \
  npx -y firebase-tools@latest emulators:start --only functions,auth,firestore --project demo-context-health &
npm run test:ai-proxy
npm run test:delete-account
```

`demo-` 프로젝트 ID와 모의 upstream을 함께 써서 운영 Firebase·실제 Gemini에 접근하지 않는다.

## 운영에서 사람이 해야 하는 일 (이번 단계에서 하지 않음)

1. **기존 Gemini 키 폐기·교체.** 현재 운영 번들에 노출된 키는 프록시를 배포해도 그대로 유효하다. 새 키를 발급해 `GEMINI_KEY` secret으로 넣고 옛 키를 폐기해야 실제로 닫힌다. `firebase functions:secrets:set GEMINI_KEY`.
2. **함수 배포.** `aiGenerate`와 갱신된 `deleteAccount`는 아직 배포되지 않았다. 배포 전까지 운영 앱은 여전히 이전 번들로 동작한다.
3. **배포 순서.** 함수 → Firestore 규칙 → Hosting 순서로 올려야 새 번들이 없는 endpoint를 부르지 않는다. 순서가 뒤집히면 AI 기능 전체가 401/404가 된다.
4. **한도값 결정.** 10분 30회 / 하루 200회는 초기 제안값이다. 실제 사용 패턴과 비용 허용치로 확정해야 한다.
5. **Apple 지원 여부 결정.** 지금은 버튼을 숨긴 상태다. 지원하려면 Firebase 콘솔에서 Apple 공급자를 설정한 뒤 `VITE_ENABLE_APPLE_LOGIN=true`로 빌드하고 실제 Apple 계정으로 재검증해야 한다.
6. **키 사용량 점검.** V-KEY대로 기존 키의 referrer/쿼터/청구 이상 여부를 콘솔에서 확인한다.

## 남은 검증 (이 단계에서 통과 처리하지 않음)

- 부분 삭제 실패 주입: 배치 중간 실패 → `partial` 응답 → 재시도로 완결되는 경로를 강제 실패로 확인하지 않았다. 현재는 정상 경로와 코드 리뷰 수준이다.
- `requires-recent-login` 401: 에뮬레이터 토큰은 항상 방금 발급되어 `auth_time`이 오래된 조건을 만들지 못했다. 코드 수준 변경(CODE)이며 E2E 미검증이다.
- 프록시 429가 화면에서 어떻게 보이는지에 대한 실제 UI E2E(AI 코치·운동 요약·식단 분석 각각).
- 실제 Gemini 응답 형태와 프록시 통과 후 파서 호환성은 모의 upstream으로만 확인했다. 배포 전 스테이징에서 실제 모델 1회 호출로 확인이 필요하다.
- 실기기·PWA에서 상대경로 `/api/ai-generate` 호출과 Hosting rewrite 동작.

## 다음 단계

당시 다음 단계였던 운영 작업 1~3은 2026-09-11 완료되어 QA-01의 공개 키 문제를 해결 상태로 바꿨다. 전용 계정의 인증 호출과 실기기 PWA 검증은 [9단계](STEP_9_PRODUCTION_DEPLOYMENT.md)의 검증 필요 항목으로 이어진다.
