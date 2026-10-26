# 1단계 인증·익명 이전 추가 검증

2026-09-07. `NEXT_STEPS.md` 1단계를 운영 데이터와 앱 코드를 수정하지 않고 수행했다. Firebase는 설정·사용자 집계·배포 함수 소스를 읽기 전용으로 확인했고, 계정 연결 오류는 현재 소스를 추출한 격리 probe로 확인했다. 개별 UID, 이메일, 토큰, 프로필, 기록 본문은 문서와 증거 파일에 저장하지 않았다.

## 결론

| 항목 | 상태 | 우선순위 | 판단 |
|---|---|---:|---|
| 현재 익명 이전 경로 | 검증 필요 | 잠재 P1 | 배포 함수에 이전 코드는 있지만, 기본 테넌트의 익명/providerless 계정은 0명이고 익명 로그인도 꺼져 있다. 현재 정상 여정에서는 휴면 경로로 판단한다. |
| 기존 소셜 계정과의 link 충돌 | 검증 필요 | 잠재 P2 | 잔존 익명 세션이 있다면 Google/Apple 연결 충돌를 복구하는 분기가 없고 일반 실패 문구만 노출된다. 현재 운영에서 조건을 만족하는 계정은 확인되지 않았다. |
| `55510a3` 로컬 데이터 격리 보호 범위 | 기존 버그 재확인 | P1 | 당시 키는 지우지만 이후 추가된 식단·코칭 전역 키가 계정 전환 보호에 포함되지 않는다. 기존 QA-02의 재발 근거다. |
| Apple redirect 오류 공급자 표시 | 검증 필요 | 잠재 P3 | redirect 공통 catch가 Apple 오류도 `Google` 문구로 표시한다. Apple 공급자가 현재 비활성이라 운영 재현은 하지 않았다. |

이번 단계에서 새로 확정한 P0나 P1 버그는 없다. `55510a3` 보호 범위 미포함은 이미 확정된 QA-02(P1)의 원인을 더 구체화한 결과다. 나머지는 현재 운영 도달성이 확인되지 않아 버그로 단정하지 않는다.

## 1. 운영 Auth와 배포 함수 읽기 확인

### 재현 절차

1. Firebase CLI의 현재 프로젝트를 `context-health-3eb84`로 한정한다.
2. Auth `listUsers` API를 페이지네이션하고, 메모리에서 전체 수·provider 계정 수·`isAnonymous` 후보 수만 집계한다.
3. Identity Toolkit 프로젝트 설정에서 anonymous, Google, Apple 활성 여부만 읽는다.
4. Cloud Functions v2의 `socialAuth` 배포 소스 zip을 임시 디렉터리에 다운로드하고 함수명 존재 여부만 검사한다. 임시 파일은 작업 트리에 복사하지 않는다.
5. Auth 테넌트 목록은 프로젝트 ID와 번호 모두 `INVALID_PROJECT_ID` 400을 반환하는지 기록한다.

### 증거

- 운영 기본 테넌트 Auth 계정: 6명.
- provider 계정: Google 6명, Kakao/Naver custom UID 0명.
- 익명 또는 providerless 후보: 0명.
- 익명 로그인: 비활성. Google: 활성. Apple: 설정 없음.
- 현재 소스에 `signInAnonymously` 호출이 없다. `App.jsx` 및 `LoginScreen.jsx`의 `isAnonymous` 분기는 레거시 세션을 처리하기 위해 남아 있다.
- 운영 `socialAuth` 배포본: `migrateAnonymousData` 있음, `signInAnonymously` 없음, `deleteAccount` 없음.
- 로컬과 운영 배포본 모두 `functions/index.js` 92~139행과 동일한 익명 이전 함수를 포함한다. 새 소셜 타깃 문서가 없을 때 익명 `users/{uid}`, `coachRooms`, `logs` 전체를 타깃 UID로 복사·이전한다.
- `.firebaserc`에는 운영 프로젝트 하나만 있어 실제 소셜 계정으로 link E2E를 시험할 비운영 Firebase 환경이 없다. 운영에 테스트 계정을 생성하지 않았다.

다중 테넌트 조회 실패는 다중 테넌트가 있다는 증거가 아니다. 이 보고서의 0명 판단은 기본 테넌트에만 해당한다.

## 2. 익명 → Google/Apple 연결 행렬

Firebase의 공식 연결 절차에서 다른 계정에 이미 연결된 credential은 link 오류를 반환하므로, 앱이 credential을 회수해 기존 계정으로 로그인하고 데이터 병합 정책을 적용해야 한다. 현재 handler는 해당 오류 코드를 분기하지 않는다. 참고: [Firebase 계정 연결 공식 문서](https://firebase.google.com/docs/auth/web/account-linking).

| 공급자 | 방식 | credential | 현재 코드 경로 | 결과 | 상태 |
|---|---|---|---|---|---|
| Google | popup | 신규 | `linkWithPopup` | UID 유지 성공이 기대되지만 실계정 E2E 미실행 | 검증 필요 |
| Google | popup | 기존 계정에 연결됨 | `linkWithPopup` 오류를 일반 catch로 처리 | `Google 로그인에 실패...`; 병합·기존 계정 전환 없음 | 검증 필요, 잠재 P2 |
| Google | redirect | 기존 계정에 연결됨 | `linkWithRedirect` 후 mount의 `getRedirectResult` | 공통 catch의 일반 Google 실패 문구; 복구 없음 | 검증 필요, 잠재 P2 |
| Apple | popup | 신규/기존 | Google과 같은 link 구조 | Apple 공급자 비활성으로 실행 불가 | 검증 필요 |
| Apple | redirect | 신규/기존 | 공통 `getRedirectResult` | 오류를 `Google` 문구로 표시하는 코드 | 검증 필요, 잠재 P3 |

### 격리 probe 재현 절차와 결과

1. `LoginScreen.jsx`에서 `authErrorMessage` 함수를 추출해 Node `vm` 격리 컨텍스트에서 실행한다.
2. Google와 Apple에 `auth/credential-already-in-use`, `auth/account-exists-with-different-credential`, `auth/provider-already-linked`를 주입한다.
3. 두 공급자 모두 `{공급자} 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.`를 반환했다.
4. handler 범위에서 위 세 오류 코드의 명시적 처리, credential 회수, 기존 계정 로그인, 데이터 병합 호출을 찾았으나 없었다.

이 probe는 오류 분기와 사용자 문구를 실행한 코드 단위 증거다. 실제 Google/Apple credential과 Firebase Auth를 연결한 E2E 증거가 아니므로 확정 버그로 올리지 않았다. 위의 생 결과는 [`evidence/phase1-auth-verification.json`](evidence/phase1-auth-verification.json)에 정리했다.

## 3. 과거 인증 수정 회귀 체크리스트

| 수정 | 보호 목적 | 현재 정적/배포 확인 | 출시 전 실행 회귀 |
|---|---|---|---|
| `9478446` | 캐시된 `auth_user`가 실제 Auth 세션 검증을 우회하지 않게 함 | `onAuthStateChanged` 구독과 비인증 시 `auth_user` 삭제 존재 | 토큰 폐기·계정 비활성·로그아웃 후 새로고침에서 보호 화면 노출이 없는지 확인 |
| `9478446` | 공용 브라우저에서 Firestore IndexedDB 잔존 데이터 차단 | logout의 `terminate` → `clearIndexedDbPersistence` 존재 | A 로그아웃 → 오프라인 → B 로그인 순서에서 A의 로그·프로필·코칭방이 노출되지 않는지 확인 |
| `9478446` | Firestore UID 소유권 강제 | 운영 규칙이 `logs`, `users/{uid}`, `coachRooms`에서 UID를 검증함 | A 토큰으로 B UID 문서 read/create/update/delete가 모두 거부되는지 Rules Emulator와 테스트 프로젝트에서 확인 |
| `55510a3` | logout 및 계정 전환 시 프로필·목표·코칭 캐시 격리 | 기존 `user_profile`, `onboarding_completed`, `ai_goals`, `coach_msgs_*`, `coach_room_meta_*` 삭제는 존재. `diet_custom_foods`, `diet_recent_foods`, `coaching_insight_*`는 미포함 | A에서 각 키에 식별 값 저장 → logout/direct account switch → B 화면·AI prompt에 A 값이 표시·전송되지 않는지 확인 |
| `55510a3` | Firestore에 프로필이 없는 새 계정에 이전 프로필 재사용 방지 | `userData.profile` 없음 분기에서 localStorage와 React state 삭제 존재 | A 프로필 저장 → 프로필 없는 B 로그인 → 기본값만 표시되는지 확인 |
| `41c5d92` | Kakao/Naver도 Firestore 인증 UID를 사용 | 현재는 익명 Auth 생성 대신 `socialAuth` custom token을 사용. 배포본에도 해당 함수 존재 | Kakao/Naver 처음·재로그인의 UID 안정성, Firestore CRUD, 토큰 검증 실패, 동일 계정 재시도를 비운영 프로젝트에서 확인 |
| `41c5d92` 후속 이전 | 레거시 익명 자료 보존 | 타깃 user가 없으면 익명 user/room/log 전체 이전. 현재 잔존 익명 계정은 확인되지 않음 | 동일 기기에서 인물 A의 익명 자료가 남은 상태에서 인물 B가 신규 Kakao/Naver로 로그인해도 자동 귀속되지 않는 정책·UI가 있는지 확인 |

## 비개발자용 우선순위 표

| 순서 | 무엇을 해야 하나 | 왜 먼저인가 | 현재 결정 |
|---:|---|---|---|
| 1 | 기존 QA-02의 계정별 로컬 데이터 분리 수정 | 공용 기기에서 다른 사용자의 식단·코칭 정보가 보이거나 AI에 전송될 수 있는 확정 P1이다. | 2단계 첫 수정 묶음으로 진행 |
| 2 | 별도 테스트 Firebase 프로젝트로 익명·소셜 연결 E2E 수행 | 운영 정상 여정은 휴면이지만 레거시 세션이 남았다면 계정 접근 실패나 오귀속 위험이 있다. | 운영에서 재현하지 말고 스테이징 준비 후 확정 |
| 3 | 익명 이전 코드의 유지·제거·사용자 확인 정책 결정 | 현재는 사용 중인 정상 경로가 아니지만 배포 서버에 전체 자료 이전 로직이 남아 있다. | E2E 결과를 보고 제품 정책 결정 |
| 4 | Apple 지원 여부를 결정한 뒤 redirect 오류 문구 확인 | 현재 Apple 로그인은 설정되지 않아 출시 범위 결정이 먼저다. | Apple을 출시할 때 P3 항목으로 확인 |

## 제한과 다음 조건

- 비운영 Firebase 프로젝트·테스트 소셜 계정이 없어 popup/redirect의 실제 연결 성공·충돌은 실행하지 않았다.
- 운영의 익명 사용자를 새로 만들거나 소셜 계정에 연결하지 않았고, Firestore 문서를 읽거나 쓰지 않았다.
- 1단계의 읽기 전용 범위는 완료했다. 실계정 E2E는 별도 비운영 프로젝트가 준비되면 이 문서의 행렬을 그대로 실행해 판정한다.

