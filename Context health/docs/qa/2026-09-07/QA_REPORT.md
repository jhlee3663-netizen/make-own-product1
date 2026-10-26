# Context Health 출시 전 QA — 2026-09-07

> **2026-09-29 운영 계정 상태:** Google 전용 계정에서 인증 AI, 운동·식단 저장, 재로그인, 회원 탈퇴를 통과했다. Auth·건강 기록·코치방은 0이었으나 UID 연결 서버 메타데이터 잔존 QA-22(P2)를 추가했다. [실행 기록](STEP_10_PRODUCTION_ACCOUNT_E2E.md)

> **2026-09-11 배포 상태:** 인덱스·규칙·AI/탈퇴 함수·Hosting을 운영 반영했고 이전 공개 Gemini 키를 삭제했다. 새 Chrome PC 렌더링은 정상이다. [실행 기록](STEP_9_PRODUCTION_DEPLOYMENT.md)

**판정: 출시 보류.** 확인된 P1 문제를 해결하고 미검증 핵심 여정을 통과하기 전에는 출시 승인 근거가 부족하다. 2026-09-07 초기 조사에서는 애플리케이션 코드·Firebase 설정 수정과 배포를 수행하지 않았다.

> 2026-09-08 후속 상태: 운영 PC 데이터 표시 깨짐을 QA-20(P1)으로 추가했고 [CSS 전용 핫픽스](DESKTOP_RENDERING_HOTFIX.md)를 배포·재검증했다. 운영 데이터와 QA-02 로컬 변경은 이번 배포에 포함하지 않았다.

이 문서는 실제 앱 관찰, 운영 설정 조회, 현재 소스 검토, 원본 함수를 실행한 격리 실험을 구분한다. **누적 확인 발견 22건: P0 0 / P1 10 / P2 11 / P3 1.** QA-20은 해결·운영 재검증 상태이고 나머지 등급 수는 발견 당시 심각도를 유지한다. P0가 없다는 것은 안전이 보장된다는 뜻이 아니다. 아래 별도 검증 필요 항목은 이 수치에 포함하지 않는다. 운영에서 모든 장애를 직접 발생시킨 것은 아니다.

## 1. 범위·기준·대상 버전

- 제품: https://context-health-3eb84.web.app/ ; 프로젝트 `context-health-3eb84`.
- 점검일: 2026-09-07, Asia/Seoul. 증거 수집 약 16:04–16:22, 이후 문서 정리.
- 로컬: 이 문서에서 `../../../`가 프로젝트 루트. React 18 / Vite / Firebase Web SDK / Gemini REST / Firebase Functions.
- Git HEAD `acad59349c00819aa56649b593b5537caa18aa91`. 기존 수정·미추적 파일 다수이므로 HEAD만으로 QA 버전을 식별하면 안 된다. [파일별 해시](evidence/source-hashes.json) 기준.
- 새로 빌드한 JS와 운영 JS `/assets/index-CKOo1DWA.js`의 SHA-256이 일치: `f7480d83f12b1e5271ea7ca20c49ee3547043f077cb1f6469b322ee2ed8b8c30`. 따라서 프론트엔드 소스 분석과 배포 앱의 연결 근거가 있다. Functions 소스 전체의 배포 일치까지 검증한 것은 아니다.
- 실제 Chrome 로그인 세션에서 조회/미저장 입력만 수행. 운영 기록 쓰기·삭제·탈퇴, 신규 사용자 생성, 외부 AI 호출을 통한 실제 건강정보 전송, 웹훅의 Issue/PR 생성은 수행하지 않았다.
- 격리 실험은 Babel AST로 현재 원본 함수를 추출하고 Firestore·AI를 메모리 대역으로 교체하여 실행했다. 실제 Firebase SDK 전송·기기 동작 시험과 구분한다.

| 등급 | 판단 기준 |
|---|---|
| P0 | 광범위한 사용자 데이터 침해·회복 불가 손실·전체 서비스 중단 등 즉각 대응 대상 |
| P1 | 출시 전에 해결해야 할 인증/계정 핵심 기능 실패, 개인정보 분리 결함, 기록 유실·중복 |
| P2 | 특정 조건의 정확성·복구·오류 처리·운영 준비 결함. 출시 범위에서 우선 해결하거나 명시적으로 제한 |
| P3 | 핵심 기록에는 직접 영향이 작지만 접근성·완성도를 저해하는 결함 |

증거 수준: **LIVE** 실제 배포 앱/UI/API, **CONFIG** 운영 설정, **ISOLATED** 원본 함수 격리 재현, **CODE** 정적 소스 확인. 모든 CODE/ISOLATED 항목이 운영 E2E로 재현됐다고 읽으면 안 된다.

## 2. 수행 범위와 결과

| 사용자 여정/영역 | 수행한 확인 | 결과·한계 |
|---|---|---|
| 최초 접근·로그인 | 로그인 390×844 캡처, 로그인 세션 홈 조회, IdP 관리 설정·Apple 인증 URI 요청 | 첫 화면/기존 세션 조회 정상. Apple 실패 확인. Google 신규 로그인·카카오/네이버 전 여정 미검증 |
| 온보딩·프로필·목표 | 소스 및 프로필 저장 실패 주입 | 원격 저장 실패 은폐. 신규 가입 E2E 미실행 |
| 운동 작성·조회·편집 | 운영 조회·미저장 편집·뒤로가기, 격리 연속 저장·AI 경쟁 | 뒤로가기 유실, 중복 쓰기, 이전 AI 덮어쓰기 확인 |
| 식단 작성·내 음식 | 운영 폼·음수 입력·분석 전 저장 버튼, 격리 저장 payload | 분석 전 원문 누락, 음수 검증 부재 확인. 실제 AI 영양 정확도 미평가 |
| 기록 삭제·복원 | 실제 코드는 검토, 격리 삭제 실패 | 실패 후 UI 복구 누락. 운영 삭제/복원은 미실행 |
| 계정 변경·사용자 분리 | 운영 규칙 평가 10건, 로그아웃 함수 격리 실행 | 소유권 검사 8건 기대대로. 로컬 캐시 잔류 확인. 실제 A/B 계정 전환 미실행 |
| 회원 탈퇴 | Functions 목록, 인증 없는 잘못된 요청 | endpoint 404 및 미배포 확인. 실제 계정 삭제하지 않음 |
| AI 코치 | 빈 응답·429·미완료 fetch 대역, 삭제 기록 context | 오류 분류·시간 제한·삭제기록 제외 결함 |
| 네트워크·저장 | 프로필/삭제 거절, 중복·지연 대역 | 경로별 오류 확인. 실제 기기 비행기모드/재접속 미검증 |
| 모바일 UI | 로그인 시각 확인, 식단 320×568·390×844·667×375 좌표 | 주요 제목/저장 버튼 범위 정상. 실제 키보드·안전영역·가로 밀림은 추가 검증 |
| PWA | 운영 SW·manifest·캐시 헤더, 빌드 산출물 | 앱 셸 캐시 설정 확인. 구버전→신버전 전환·오프라인 재시작 미실행 |
| Firebase 운영 | 배포 규칙·인덱스·IdP·Functions·DB·백업 메타데이터 | 2026-09-11 기준 규칙·인덱스·AI/탈퇴 함수와 백업/PITR/삭제 보호 반영. Apple IdP와 전용 계정 탈퇴 E2E는 남음 |

## 3. 확인된 발견 사항

### QA-01 · P1 · 배포된 브라우저 JS에 Gemini API 키 포함

- **2026-09-11 해결 상태:** 새 제한 키를 서버 Secret으로 연결하고 `aiGenerate`와 Hosting을 배포했다. 운영 JS에는 Gemini 직접 URL·이전 변수·키가 없고 이전 키는 삭제 완료다. 새 키의 Gemini 3.6 직접 호출은 성공했다. 전용 계정의 인증 프록시 호출은 검증 필요로 남긴다. [증거](evidence/production-release-deploy-2026-09-11.json)

- **증거:** LIVE+CODE. [HTTP 검사](evidence/http-checks.json)의 `geminiKeyPresent: true`; `AICoachScreen.jsx:205`, `WorkoutMemoScreen.jsx:929`, `nutritionLookup.js:413`의 키 포함 직접 요청. 증거 문서에는 키 원문을 저장하지 않았다.
- **재현:** 로그아웃 상태에서 앱 HTML의 JS 자산 경로 확인 → 해당 JS 다운로드 → 로컬 환경의 Gemini 키와 일치 여부를 출력 없이 비교. 이 비교를 실행해 true 확인.
- **영향/기대:** 방문자가 서비스의 AI 키를 획득 가능. 서버에서 사용자별 인증·사용량 제한을 적용하고 키를 비공개로 관리해야 한다. 공개 Firebase Web 설정용 키와 Gemini 비밀키를 혼동하지 말 것.
- **한계:** 탈취 키의 실제 호출 가능 여부·HTTP referrer/API 제한·비용 피해는 시험하지 않음. 남용이 이미 발생했다는 의미 아님.
- **수용 기준:** 공개 자산에서 비밀키 제거, 기존 키 처리와 권한/제한 확인, 인증된 프록시 및 사용자별 제한에 대한 음성 테스트.

### QA-02 · P1 · 로그아웃 후 음식·코칭 캐시가 남아 다음 계정에서 재사용 가능

- **2026-09-07 수정 상태:** 로컬 코드 수정·격리 회귀 통과. UID namespace, 소유자 일치 시만 레거시 이전, 로그아웃 정리를 적용했다. 실계정 A/B E2E와 운영 배포는 미수행. 증거: [STEP_2_QA_02_FIX.md](STEP_2_QA_02_FIX.md).

- **증거:** ISOLATED+CODE. [격리 결과](evidence/isolated-probes.json) QA-02: 실제 `handleLogout` 실행 뒤 `diet_custom_foods`, `diet_recent_foods`, `coaching_insight_workout` 잔존. `MyPageScreen.jsx:172–188`, `DietDetailScreen.jsx:153–165`, `HomeScreen.jsx:188–198`.
- **재현:** A의 합성 개인 음식·최근 음식·코칭 요약을 공용 localStorage 키에 넣음 → 원본 로그아웃 함수 실행 → 세 키가 남는지 확인. 이후 B의 식단/홈은 같은 키를 읽는다. 실계정으로는 A 등록→로그아웃→B 로그인→내 음식/코칭 요약 확인 순서로 후속 검증한다.
- **영향/기대:** 공용 기기에서 A의 식습관·건강 관련 요약이 B에게 보일 수 있음. 사용자 UID별 키와 계정 전환 시 메모리·캐시 초기화 필요.
- **한계:** Firestore 타 사용자 문서를 읽는 취약점으로 확인된 것은 아님. 정상 로그아웃의 캐시 잔류는 재현했으나 실제 A/B 로그인 E2E는 미실행. 로그아웃 없이 인증 사용자가 교체되는 경우 `App.jsx:213–217,314–330`의 이전 코치 상태 병합도 추가 확인 대상.
- **수용 기준:** A/B 전환·탭 간 로그아웃·탈퇴·재로그인 후 다른 계정 데이터 0건, 캐시 저장 실패도 사용자에게 인지 가능.

### QA-03 · P1 · 운동 저장을 연속 누르면 중복 문서 생성

- **2026-09-08 수정 상태:** 로컬 동기식 저장 잠금과 재시도용 고정 문서 ID를 적용했다. 지연 상태 2회 호출 격리 probe에서 쓰기 1회. 실제 Firebase E2E와 배포는 미수행. [3단계 기록](STEP_3_RECORD_PRESERVATION_FIX.md)

- **증거:** ISOLATED+CODE. QA-03 `writes: 2`. `WorkoutMemoScreen.jsx:1035–1139,1502–1508`에는 저장 중 guard/disabled가 없고 신규 문서마다 `addDoc` 사용.
- **재현:** 신규 운동 payload로 첫 저장의 Firestore 완료를 지연 → 완료 전 같은 저장 함수 다시 호출 → 쓰기 2건 발생. 실제 기기에서는 느린 통신에서 저장 연속 탭으로 확인한다.
- **영향/기대:** 하루 기록·볼륨·AI 호출이 중복될 수 있음. 하나의 저장 의도는 한 문서로 처리되어야 함.
- **수용 기준:** 지연·연타·재시도에서 하나의 논리 작업당 문서 1개. 단순 버튼 애니메이션만으로는 충분하지 않음.

### QA-04 · P1 · 프로필·목표·코치 저장 실패가 숨겨짐

- **2026-09-08 수정 상태:** 프로필 오류 전파·편집 유지·인라인 안내와 공용 동기화 실패 토스트를 로컬 적용했다. `permission-denied` 격리 probe 통과. 실제 offline/timeout E2E와 배포는 미수행. [3단계 기록](STEP_3_RECORD_PRESERVATION_FIX.md)

- **증거:** ISOLATED+CODE. QA-04: `permission-denied` 거절 후 로컬·UI 프로필은 77로 바뀌고 실패가 전파되지 않음. `App.jsx:339–347,374–375,400,426–439`의 `.catch(() => {})`; `MyPageScreen.jsx:167–170`은 바로 편집 종료.
- **재현:** 프로필 저장의 `saveUserData`를 거절하도록 대역 설정 → 변경 저장 → UI 변경·원격 실패 은폐 확인. 이후 새 기기/브라우저에서 서버의 이전 프로필을 로드하면 불일치가 드러남.
- **영향/기대:** 저장됐다고 생각한 설정·목표·대화가 다른 기기에서 사라지거나 이전 값으로 돌아옴. 서버 저장 상태/실패/재시도와 보류 데이터가 구분되어야 함.
- **한계:** 프로필 실패만 함수 실행으로 재현. 목표·코치의 같은 오류 은폐는 코드 확인. 새 기기 E2E 미실행.
- **수용 기준:** 거절·용량 초과·오프라인에서 성공처럼 닫히지 않거나 명확한 미동기화 표시. 재접속·재시작 후 복구 검증.

### QA-05 · P1 · 브라우저 뒤로가기가 미저장 운동 보호를 우회

- **2026-09-08 수정 상태:** 운동·식단 dirty guard를 브라우저 popstate에 연결했다. 격리 probe에서 화면 전환 0회와 history 복원을 확인했다. 실제 모바일 back/swipe E2E와 배포는 미수행. [3단계 기록](STEP_3_RECORD_PRESERVATION_FIX.md)

- **증거:** LIVE+CODE. [B02](evidence/browser-observations.md): QA 문구 입력 후 back 결과 `exitDialog: 0, editorCount: 0`. `App.jsx:257–278` popstate는 화면 직접 교체, 화면 내 `handleBackClick`의 dirty 확인을 호출하지 않음.
- **재현:** 홈에서 운동 편집 열기 → 입력을 `QA_UNSAVED_20260907 60kg 10회`로 변경 → 앱 화살표 대신 브라우저 뒤로가기 → 확인 없이 홈으로 이동.
- **영향/기대:** 작성 중 내용 소실. 브라우저 버튼·모바일 뒤로가기·스와이프를 포함한 이탈 경로에서 확인 또는 초안 복구 필요.
- **한계:** Chrome browser back 직접 확인. 모바일 OS 제스처·새로고침은 별도 검증.
- **수용 기준:** 각 이탈 경로에서 초안을 유지하거나 명시적 폐기 선택을 요구.

### QA-06 · P1 · 이전 AI 결과가 이후 운동 수정 내용을 덮어씀

- **2026-09-08 수정 상태:** 저장마다 AI revision을 발급하고 Firestore transaction에서 현재 revision일 때만 AI 결과를 반영하도록 로컬 수정했다. 역순 완료 probe에서 최신 B 유지. 실제 두 탭·종료 E2E와 배포는 미수행. [3단계 기록](STEP_3_RECORD_PRESERVATION_FIX.md)

- **증거:** ISOLATED+CODE. QA-06: B로 `80kg 10회` 저장한 상태가 A 작업 종료 후 `60kg 10회`로 복귀. `WorkoutMemoScreen.jsx:918–924`는 같은 docId의 새 AI 작업을 건너뛰고 `985`에서 이전 결과를 무조건 update.
- **재현:** A(60kg) AI 응답 지연 → 동일 문서 B(80kg) 수정 저장 → B의 AI 호출은 active Set 때문에 skip → A 응답 완료 → 최종 sections는 A.
- **영향/기대:** 사용자가 저장한 최신 기록이 오래된 결과로 바뀜. AI 작업에 revision/작업 ID를 부여해 현재 문서 버전과 일치할 때만 반영해야 함.
- **수용 기준:** A/B 응답 순서를 뒤집어도 B 유지. 두 탭과 네트워크 재시도도 포함.

### QA-07 · P1 · 식단 원문은 분석 전에 저장하면 누락됨

- **2026-09-08 수정 상태:** 미분석 입력을 `unparsedInputs`로 저장하고 재진입 시 복원하도록 로컬 수정했다. 격리 저장 payload에서 원문 보존 확인. 실제 분석 중/실패 E2E와 배포는 미수행. [3단계 기록](STEP_3_RECORD_PRESERVATION_FIX.md)

- **증거:** LIVE+ISOLATED+CODE. B05 저장 버튼 enabled. QA-07: 입력 `QA 바나나 하나`인데 저장 payload는 빈 items, 0 kcal, 원문 필드 없음. `DietDetailScreen.jsx:594–612`는 sections만 저장. `632–635`의 ‘저장하고 나가기’도 같은 함수 사용.
- **재현:** 새 식단 아침에 식사 문구 입력 → AI 분석 버튼을 누르지 않고 저장. 격리 원본 함수 실행에서 실제 생성 payload 확인.
- **영향/기대:** 저장 완료로 처리되지만 입력했던 식사 내용이 남지 않음. 분석되지 않은 원문 보존 또는 분석 완료 전 저장 제한/명확한 확인 필요.
- **한계:** 실제 운영 저장은 하지 않음. AI 처리 중 저장의 유사 유실은 추가 지연 시험 필요.
- **수용 기준:** 원문만 입력·분석 중·분석 실패 상태에서 저장 및 저장하고 나가기 모두 내용 보존.

### QA-21 · P2 · 운동 AI 처리 중 탭을 닫으면 완료되지 않는 로딩이 계속됨

- **2026-09-09 수정 상태:** 각 AI 작업에 `aiStartedAt`을 저장하고 2분 이상 멈춘 기록을 `AI 정리가 중단됐어요`와 `재시도`로 표시하도록 로컬 수정했다. 실제 PC 화면에서 재시도 후 완료 토스트와 한줄평으로 전환됨을 확인했다. [3단계 기록](STEP_3_RECORD_PRESERVATION_FIX.md)
- **증거:** EMULATOR+LIVE. 모의 AI를 10초 지연하고 저장 120ms 후 탭을 종료했다. 11초 후 Firestore 문서는 `aiStatus: processing`이었고 `originalText: 99kg 10회`, fallback sections·요약은 남아 있었다. [E2E 원본](evidence/record-preservation-emulator-e2e.json)
- **재현:** 운동 기록 저장 → AI 요약 응답 전 탭/앱 종료 → 재접속 → 카드의 AI 정리 상태 확인.
- **영향/기대:** 원문 손실은 없지만 완료되지 않는 spinner로 상태를 알 수 없음. 중단을 명시하고 사용자가 재시도할 수 있어야 함.
- **한계:** 실제 안드로이드·iOS 앱 강제 종료는 미검증. 2분 임계값은 현재 클라이언트 AI 최대 timeout 범위를 기준으로 설정함.

### QA-08 · P1 · 회원 탈퇴 endpoint가 운영에 없음

- **2026-09-29 해결 상태:** 삭제 가능한 Google 운영 테스트 계정으로 탈퇴를 실행했다. 함수는 `logs 2`, `coachRooms 1`, `user 1`, `auth true`를 반환했고, 직접 대조에서 Auth·`users/{uid}`·`logs`·`coachRooms`가 모두 0이었다. 핵심 탈퇴 경로는 통과했다. 서버 메타데이터 잔존은 별도 QA-22로 분리했다. [실행 기록](STEP_10_PRODUCTION_ACCOUNT_E2E.md)

- **증거:** LIVE+CONFIG. [HTTP 검사](evidence/http-checks.json): `/api/delete-account` POST 404 HTML. [Functions 목록](evidence/functions-summary.json)에 `sentryWebhook`, `socialAuth`만 존재. `firebase.json`의 rewrite와 `MyPageScreen.jsx:196`은 `deleteAccount`를 호출.
- **재현:** 인증 없는 빈 POST로 endpoint 존재 확인 → 애플리케이션의 401 JSON 대신 플랫폼 404 → 배포 함수 목록 교차 확인. 실사용자 탈퇴는 누르지 않음.
- **영향/기대:** UI가 제공하는 회원 탈퇴를 완료할 수 없음. 요청은 실제 배포된 인증·삭제 처리 경로로 연결되어야 함.
- **수용 기준:** 무인증 401, 본인 테스트 계정 삭제 성공, 타인 UID 선택 불가, 데이터·Auth 삭제 검증, 중간 실패/재시도 정책 검증.

### QA-22 · P2 · 회원 탈퇴 후 UID 연결 서버 메타데이터가 남음

- **증거:** LIVE+FIREBASE. 2026-09-29 전용 운영 계정 탈퇴 완료 뒤 Auth·사용자 문서·건강 기록·코치방은 0이었지만 `aiUsage/{uid}`와 `accountDeletions/{uid}`가 각각 남았다. 테스트 잔여 문서는 승인된 계정 삭제 범위에서 관리자 API로 정리했고 이후 두 문서 모두 404를 확인했다. [실행 기록](STEP_10_PRODUCTION_ACCOUNT_E2E.md), [구조화 증거](evidence/production-account-e2e-2026-09-29.json)
- **재현:** 삭제 가능한 운영 계정으로 AI를 1회 이상 사용 → 회원 탈퇴 완료 → Admin SDK 또는 관리자 REST로 같은 UID의 Auth, `users`, `logs`, `coachRooms`, `aiUsage`, `accountDeletions` 존재 여부를 각각 조회.
- **실제/기대:** 계정과 사용자 콘텐츠는 삭제되지만 사용량·탈퇴 처리 메타데이터가 UID에 연결된 채 남는다. 화면의 “모든 기록과 계정 정보가 영구 삭제” 안내에 맞게 삭제하거나, 필요한 감사 정보라면 UID 제거·보존 목적·기간·TTL을 명확히 해야 한다.
- **영향:** 다른 사용자에게 노출되거나 건강 기록이 남은 정황은 없다. 다만 탈퇴한 사람을 식별 가능한 UID와 연결된 서버 정보가 계속 보존되어 삭제 안내와 실제 범위가 다르다.
- **수용 기준:** 탈퇴 성공 뒤 `aiUsage/{uid}`는 0. `accountDeletions`는 완료 즉시 삭제하거나 개인 식별자를 제거한 제한 기간 감사 레코드로 전환하고 TTL·개인정보 안내를 대조. 새 전용 계정으로 재검증.
- **현재 상태:** 테스트 계정 잔여물만 수동 정리했다. 제품 삭제 로직은 아직 수정하지 않았다.

### QA-09 · P1 · Apple 로그인 버튼은 있지만 공급자 설정이 없음

- **증거:** LIVE+CONFIG. [로그인 캡처](evidence/live-login-390.png)에 Apple 버튼. [IdP 설정](evidence/auth-config.json)은 Google만 등록. Apple `accounts:createAuthUri` 400 `OPERATION_NOT_ALLOWED : The identity provider configuration is not found.`
- **재현:** 현재 프로젝트의 Apple 인증 URI 생성 요청 → 위 오류. `LoginScreen.jsx:224–250`은 Apple popup/redirect를 사용.
- **영향/기대:** Apple을 선택하는 가입자 로그인 불가. 정상 구성하거나 출시 화면에서 지원하지 않는 옵션을 명확히 제외해야 함.
- **수용 기준:** 실제 Apple 계정의 최초/재로그인·취소·popup/redirect·iOS PWA 확인.

### QA-10 · P2 · AI 오류 종류가 잘못 표시됨

- **증거:** ISOLATED+CODE. QA-10: 빈 candidates는 안내문을 정상 응답처럼 반환, 빈 parts는 TypeError, 429는 `quota exceeded`. `AICoachScreen.jsx:213–229,513–514`는 모두 네트워크 오류로 표시하거나 정상 모델 메시지로 저장.
- **재현:** AI 응답을 각각 `{candidates:[]}`, `{candidates:[{content:{parts:[]}}]}`, `{error:{message:'quota exceeded'}}`로 대체하여 원본 `callGemini` 실행.
- **영향/기대:** 사용자가 안전 차단·요금 한도·비정상 응답을 인터넷 문제로 오인. 실패 응답도 대화·요약에 섞임. 원인별 메시지·재시도 가능 여부와 응답 schema 검증 필요.
- **수용 기준:** 401/403/429/500, 비JSON, empty parts, safety block, 잘못된 suggestion을 분리하고 유효한 데이터만 저장.

### QA-11 · P2 · 맨몸 운동 세트 배수가 볼륨 계산에서 빠짐

- **증거:** ISOLATED+CODE. QA-11: 체중 70kg, 풀업 `10회 3세트`의 실제 `parseVolume` 결과 700, 기대 2,100. `utils.js:11–15,64–66`은 횟수만 합산. 보조/가중 분기도 세트 수를 곱하지 않는 경로 존재.
- **재현:** 해당 입력을 `parseVolume([{items:[{title:'풀업',body:'10회 3세트'}]}],70)`에 전달.
- **영향/기대:** 운동량·성공 뱃지·과부하 비교가 틀림. AI가 세트별로 풀어쓰면 달라질 수 있으나 저장 직후·AI fallback 계산 자체의 오류는 확인됨.
- **수용 기준:** 맨몸/보조/가중 및 `10회 3세트`, `10회 ×3`, 개별 세트 표현의 결과 일치.

### QA-12 · P2 · 오래된 기록·삭제 기록·21번째 대화방을 모두 조회할 경로가 없음

- **증거:** CODE. `HomeScreen.jsx:159` 전체 logs `limit(200)` 뒤 유형/삭제 필터. `MyPageScreen.jsx:141–151`도 최신 원기록 200개를 먼저 선택한 뒤 deletedAt 필터. `userStore.js:19` 코치방 `limit(20)`, 페이지 커서/추가 로드 없음.
- **재현:** 격리 테스트 계정에 201개 이상의 logs 구성 → 201번째 과거 기록 찾기. 오래된 원기록을 오늘 삭제 → 최신 원기록 200개 밖이면 휴지통 조회에서 누락. 별도 브라우저에서 21개 이상 coachRooms 로드.
- **영향/기대:** 데이터가 서버에는 있어도 사용자에게 사라진 것처럼 보이고 일부 복원 불가. 명시적인 범위 안내 또는 페이지 조회/삭제일 기준 복구 목록 필요.
- **한계:** 201개 운영 데이터를 새로 생성하지 않았다. 정적 query·렌더 경로로 확인한 조회 상한 결함이며 실제 DB 영구 삭제로 단정하지 않음.
- **수용 기준:** 상한 초과 fixture와 30일 내 삭제된 오래된 기록의 조회·복원 확인.

### QA-13 · P2 · 기록 삭제 실패 후 카드 숨김 상태가 풀리지 않음

- **증거:** ISOLATED+CODE. QA-13: `permission-denied`를 주입하면 `deletingId: 'qa'`가 남고 async callback 밖으로 오류 발생. `HomeScreen.jsx:333–342`에 catch/finally 없음. WorkoutCard의 삭제 애니메이션은 높이를 0으로 줄임.
- **재현:** 삭제 확인 → updateDoc 실패 주입 → deletingId 미해제 확인. 서버는 그대로인데 화면에서는 삭제된 것처럼 남을 수 있음.
- **영향/기대:** 사용자가 삭제 성공 여부를 알기 어렵고 실패한 기록이 감춰짐. 오류 안내 및 UI 원복·재시도 필요.
- **한계:** 날짜 변경·휴지통 조회/복원에도 오류 처리 부족이 보이나 이들의 UI 전체 결과는 별도 재현 필요.
- **수용 기준:** 삭제 거절·네트워크 중단에서 카드 복구, 실패 피드백, 재시도 성공.

### QA-14 · P2 · AI 코치 요청에 시간 제한·취소가 없음

- **증거:** CODE+ISOLATED. `AICoachScreen.jsx:205–212` fetch에 signal/타이머 없음. QA-14: 미완료 fetch 대역에 abort signal 미제공. `loading`은 요청이 끝나야 해제되고 전송 버튼은 그동안 disabled.
- **재현:** AI 연결은 성립시키되 응답을 계속 지연 → 코치 요청 시작 → 로딩/전송 제한 지속. 격리 probe는 50ms만 관측했으며 실네트워크 장시간 대기 측정으로 해석하면 안 됨.
- **영향/기대:** 불안정한 모바일 네트워크에서 대화가 장시간 묶임. 명시적 타임아웃·취소·안전한 재시도 필요. 식단(25초)/운동(45초)의 부분 타이머와 구분.
- **수용 기준:** 정한 제한 시간 내 복구 안내, 화면 이탈 시 취소/결과 처리 규칙, 중복 전송 방지.

### QA-15 · P2 · 휴지통으로 보낸 기록이 AI 코치 context에 포함됨

- **증거:** ISOLATED+CODE. QA-15: `deletedAt`가 있는 합성 diet가 `fetchRecentLogs` 결과 diets에 포함. `AICoachScreen.jsx:96–108`은 유형만 필터. 홈은 deletedAt 제외.
- **재현:** deletedAt가 설정된 최근 기록을 getDocs 대역으로 전달 → 반환 context에 기록 포함 확인 → 실제로는 기록 삭제 후 새 코치방 열기/대화가 재현 절차.
- **영향/기대:** 사용자가 제거한 잘못된 식단/운동이 조언에 다시 사용됨. 휴지통 항목은 활성 context에서 제외해야 함.
- **한계:** 실제 사용자 데이터를 AI에 새로 전송하는 시험은 하지 않음.
- **수용 기준:** 삭제 기록 0건 포함, 복원 후 정책대로 포함, 로그 변경 이후 context 갱신 확인.

### QA-16 · P2 · 내 음식에 음수 탄단지를 입력해 저장 가능

- **증거:** LIVE+CODE. B04: 이름·100kcal·탄수화물 -10 입력 시 저장 enabled. `DietDetailScreen.jsx:349–365,529–538,1194–1196`은 숫자 변환만 수행하고 영양값 음수를 차단하지 않음.
- **재현:** 식단 → 내 음식 등록 → 임의 이름, kcal 100, 탄수화물 -10 → 저장 활성화. 실제 저장은 누르지 않음.
- **영향/기대:** 음수 영양값이 개인 기준으로 누적되어 집계가 틀릴 수 있음. 유한수·0 이상·합리적 상한 검증 필요.
- **수용 기준:** 음수/NaN/Infinity/과도한 숫자 입력 거부·설명; 기존 잘못된 데이터 로드에도 오류 방어.

### QA-17 · P2 · Firestore 소유권은 검사하지만 데이터 형식은 거의 검사하지 않음

- **증거:** CONFIG+격리 규칙 평가. [규칙 테스트](evidence/rules-tests.json) 마지막 두 케이스: 잘못된 type, 문자열 timestamp, 음수 kcal create가 ALLOW; owner가 uid만 남기는 update도 ALLOW. 이는 기대 ALLOW로 작성한 취약 조건 재현이며 품질 검사 PASS라는 뜻이 아님.
- **재현:** 배포 규칙 원문을 Rules test API에 전달하고 가상 A 사용자/가상 문서로 위 두 요청 평가. 실 Firestore 문서 변경 없음.
- **영향/기대:** 잘못된 클라이언트·이전 버전·조작 요청이 자신의 기록을 깨뜨릴 수 있음. required fields·자료형·수치 범위·크기·update 스키마 유지 검사 필요.
- **한계:** 다른 사용자 데이터 접근은 별개이며 아래 소유권 검사는 기대대로 거절. `isAdmin` 필드를 쓰는 것만으로 권한 상승한다고 추정하지 말 것.
- **수용 기준:** 정상 CRUD/실제 query 유지, malformed create/update 거절, 타인 get/list/create/update/delete 거절.

### QA-18 · P3 · 화면 밖 탭과 숨겨진 저장 토스트가 접근성 트리에 남음

- **증거:** LIVE+CODE. B06: 홈/상세 상태에서도 코치·마이페이지·`저장되었습니다`가 AX/DOM snapshot에 존재. `App.jsx:451–463`은 transform/pointerEvents만 제어, `Toast.jsx:3–13`은 opacity로 숨김.
- **재현:** 홈 화면 접근성 트리 확인 → 비활성 탭 콘텐츠와 show=false 토스트 검색. 로그인 신규 화면에서도 토스트 텍스트는 DOM에 존재하지만 캡처상 보이지 않음.
- **영향/기대:** 보조기술이 현재 화면과 무관한 정보/성공 안내를 읽을 수 있음. 비활성 패널의 접근성 제외·포커스 관리, 실제 토스트의 status/live 처리 필요.
- **한계:** 실제 VoiceOver/TalkBack 낭독은 미실행. 일반 화면에 저장 토스트가 계속 보인다고 주장하지 않음.
- **수용 기준:** 비활성 탭이 포커스/낭독 순서에서 제외, 실제 저장 결과만 안내.

### QA-19 · P2 · 운영 DB의 복구 준비가 부족 — 해결·복원 재검증 통과

- **증거:** CONFIG. [DB 설정](evidence/firebase-databases.txt): PITR_DISABLED, DELETE_PROTECTION_DISABLED, versionRetentionPeriod 3600s. [백업 조회](evidence/backups.json): backupSchedules와 서울 리전 backups 응답에 항목 없음.
- **재현:** 프로젝트의 `(default)` DB 메타데이터 및 backupSchedules, `asia-northeast3/backups` 읽기 전용 조회.
- **영향/기대:** 잘못된 대량 수정/삭제 뒤 복구할 여지가 제한됨. 서비스 목표에 맞는 백업·복구시간·허용손실량과 복원 리허설 필요.
- **한계:** 별도 수동 export/외부 백업이 없다는 뜻은 아님. 현재 데이터 손실 사고가 발생했다는 의미도 아님. 1시간 버전 보존을 자동 백업이나 검증된 복구 체계로 간주하면 안 됨.
- **수용 기준:** 복구 정책 문서, 실제 백업 존재, 별도 환경 복원 성공 증거, 삭제 보호 정책 결정.
- **2026-09-10 재검증:** 사용자 승인으로 14일 보존 일일 백업, PITR 7일, 삭제 보호를 활성화했다. 첫 `READY` 백업을 같은 프로젝트의 새 DB `qa-restore-20260910`에 약 10분 13초 만에 복원했다. 백업 시점 원본과 복원본의 `users` 5, `logs` 98, `coachRooms` 8, 해시 UID별 소유권 분포, 인덱스 2개와 TTL override 0개가 전부 일치했다. [실행 문서](STEP_8_QA19_BACKUP_EXECUTION_PLAN.md), [구조화 증거](evidence/qa19-backup-activation-and-diet-offline-2026-09-10.json).

### QA-20 · P1 · PC에서 데이터 텍스트와 수치가 겹치거나 깨져 표시됨 — 해결·운영 재검증

- **증거:** LIVE+CODE. 수정 전 PC 1920px에서 운동·식단 카드의 한글과 수치가 겹치거나 뒤틀렸고 DOM 텍스트 값은 정상이었다. 카드 48개가 완료된 `cardUp` transform을 유지하고 상위 탭이 `will-change: transform` 상태였다. [전후 증거](evidence/desktop-render-hotfix.json)
- **재현:** PC Chrome에서 홈 쇠질·식단 탭의 주간 그래프와 여러 카드를 확인한다. 수정 전 데이터 글자가 겹쳐 읽기 어려웠다. 모바일에서는 재현되지 않았다.
- **영향/기대:** PC의 핵심 기록 조회가 사실상 불가능해질 수 있다. 모든 텍스트·차트 값은 정상 위치와 형태로 읽혀야 한다.
- **수정/검증:** 1차 합성 계층 해제만으로 일부 깨짐이 남아 정상 판정을 철회했다. V2에서 PC의 Pretendard 렌더링을 시스템 한글 글꼴로 우회하고, 1차 격리 배포에서 누락한 `logo.png`도 복구했다. 라이브 JS와 기본 CSS 해시는 유지했다. PC 1920px의 쇠질·식단·AI 코치·마이페이지, 50개 카드/SVG fixture, 모바일 390px media query를 재검증했다. [상세 기록](DESKTOP_RENDERING_HOTFIX.md)
- **남은 범위:** Windows/Edge·Safari와 장시간 사용 재발은 실기기 검증 필요. Pretendard 또는 GPU 중 어느 내부 구현이 직접 원인인지는 추정으로 남긴다.

## 4. 검증 필요 — 아직 버그로 단정하지 않은 항목

| ID / 잠재 등급 | 관찰 근거 | 추가 재현·판정 절차 |
|---|---|---|
| V-WEBHOOK / 잠재 P1 | `functions/index.js:263` 이후 webhook에 Sentry 서명·이벤트 중복 검사 없음. 합성 `created` 이벤트는 격리 실행에서 Anthropic/GitHub 대역 호출. **운영 무인증 POST는 403**. [증거](evidence/webhook-probe.json) | 실제 Sentry 전달 방식·Cloud Run IAM 확인. 서명 오류·중복 이벤트를 별도 테스트 배포에서 전달. 운영 공개 호출 가능이라고 단정 금지. 운영에 created payload 전송 금지 |
| V-KEY / 잠재 P1 | QA-01 키 노출 확인, 호출 제한은 미조회 | 키별 API/referrer 제한·쿼터·청구 알림·사용량을 관리 화면에서 확인. 키를 출력하거나 외부 검증 서비스에 제출하지 않기 |
| V-OFFLINE / 잠재 P1 | 초기 조사 뒤 UID별 운동·식단 초안과 8초 저장 timeout을 추가함 | 로컬 Chrome·에뮬레이터에서 운동·식단의 종료 복원과 식단 offline 실패→export/import 재시작→online 재시도 1건 저장·초안 삭제 통과. 실기기 네트워크 전환·멀티탭은 계속 검증 필요 |
| V-PWA / 잠재 P1~P2 | 운영 SW precache, skipWaiting/clientsClaim, cleanup 확인. cache header는 no-store. 동적 Firestore/Gemini 응답을 캐시하는 route는 보이지 않음 | A 버전 설치→초안 작성→B 배포→재접속/재실행, old chunk 404, offline cold/warm launch, auth redirect 복귀. 서비스워커가 새로고침/데이터 유실을 실제 유발하는지 확인. HTML no-store만으로 SW cache 안전성 통과 처리 금지 |
| V-MULTIUSER / 잠재 P1 | QA-02 외 `App` 이전 state 병합, startup sync catch 은폐 | A/B 두 테스트 계정·두 탭에서 로그아웃, 계정 교체, profile 없는 신규 B, sync permission-denied. 온보딩·목표·코치 state에 A 데이터가 남는지 확인 |
| V-AUTH / 잠재 P1 | Google IdP enabled. 카카오/네이버 서버 토큰 검증 코드 존재. Naver state 검증 존재 | Google/Kakao/Naver 최초·재로그인·취소·만료·popup 차단·iOS standalone·in-app browser를 각각 테스트. 익명 계정→기존 소셜 계정 이동 시 로그 보존과 충돌 확인 |
| V-DELETE / 잠재 P1 | 탈퇴 endpoint 미배포(QA-08); 로컬 구현은 400건 batch 반복 후 Auth 삭제 | 테스트 환경에서 401개 이상 자료, 두 번째 batch 실패, 재시도, 동시 쓰기, 최근 재인증·토큰 폐기 처리 확인. 살아 있는 계정으로 대체 시험 금지 |
| V-MOBILE / 잠재 P2 | 주요 식단 좌표는 정상. 리사이즈/AX 조작 후 한 번 scrollLeft=149.5 관찰, reload 후 미재현. 일부 CUA 캡처 배율도 비정상 | 실제 iPhone/Android 320/360/390/430, 가로모드, 키보드 open/close, 큰 글자, 입력칸·시트·바텀바, 뒤로가기·당겨 새로고침. 먼저 자동화 영향 배제 |
| V-XSS / 잠재 P1 | `WorkoutMemoScreen.jsx:232`에 저장된 freeHtml을 innerHTML로 주입, 명시적 sanitizer 없음 | 합성 계정의 격리 브라우저에서 붙여넣기 HTML과 이벤트 속성이 저장·복원되는지 무해한 DOM marker로 확인. 실제 사용자 세션에서 공격 payload 실행 금지. 서버 사용자 경계 침해라고 단정 금지 |
| V-HEALTH-AI / 잠재 P1~P2 | 입력 원문→Gemini, output schema 부분 검증. 의료적 정확성 평가 없음 | 영양 정답 fixture·용량/단위·모순 문장·위험한 과훈련·극단 식단·부상 질문·prompt injection·과대 수치 케이스를 전문가 기준으로 평가. 이 보고서는 건강 조언의 안전성 인증이 아님 |
| V-PRIVACY / 잠재 P2 | `sentry.js` sendDefaultPii=false지만 setUser에 id/email/name 명시 전달, Replay mask 설정 존재 | 실제 Sentry envelope의 개인정보/URL 키 제거, 보관·동의 정책, AI 전송 고지 확인. 개인정보 법 위반으로 단정하지 않기 |
| V-STORAGE / 잠재 P2 | 일부 localStorage 저장은 catch 없음, 일부는 실패를 무시; custom food는 서버 동기화 경로 없음 | quota 초과/저장 차단/브라우저 정리/새 기기에서 ‘내 음식 저장’ 기대와 실제 비교. local-only 제품 정책 여부 확인 |
| V-CONCURRENCY / 잠재 P1~P2 | coachRoom 전체 messages 배열 setDoc merge, profile/goals도 전체 필드 값 교체 | 두 기기에서 같은 방/목표 동시에 변경 후 순서 역전. 최종 배열 누락·자동 재시도 중복 검증 |

위 항목은 ‘미확인 없음’으로 끝내지 않기 위한 후속 검사 목록이다. 잠재 등급은 현재 확정 심각도가 아니다.

## 5. 정상 확인 및 운영 설정 대조

- 운영 Firestore 규칙 원문이 로컬 `firestore.rules`와 일치. Rules 평가에서 A 본인 logs/user 읽기 허용, B의 A logs/user/room 읽기·무인증 읽기·B가 A uid로 생성·A가 소유권 B로 변경 모두 기대대로 처리. **8개 케이스, 허용 2/거절 6**. 임의 list·실 SDK A/B 세션·모든 CRUD 조합을 검증한 것은 아니다.
- uid+timestamp, uid+type+timestamp 복합 인덱스가 운영에 존재. 실제 로그인된 홈 기록 조회 성공. [인덱스](evidence/deployed-indexes.json)
- socialAuth의 무인증 invalid provider 요청은 400 `invalid-request`. 잘못된 입력 거절은 확인했으나 실제 provider 토큰 검증 전 여정 통과와 동일하지 않다.
- DB `(default)`: STANDARD, FIRESTORE_NATIVE, asia-northeast3. Functions는 us-central1. 리전 차이를 장애로 분류하지 않았다.
- `/`, `/sw.js`, manifest 모두 200, `Cache-Control: no-cache, no-store, must-revalidate`. 운영 SW에서 Firestore/Gemini runtime cache 설정 미발견. 로그아웃 이후 개인정보 잔류(QA-02)는 Workbox 캐시 결함이 아니라 localStorage 문제다.
- `npm run test:nutrition` 통과. `npx vite build --outDir /tmp/context-health-qa-build` 통과. 기존 dist를 덮어쓰지 않음. 1.41MB JS에 chunk-size 경고 있음. 이는 실기기 성능 불합격 판정과 다름.
- `npx tsc --noEmit` 종료 0. **tsconfig include가 루트 `*.tsx`, `*.ts`만 대상이어서 src/**/*.jsx의 타입 안전성 검증 근거로 사용할 수 없음.**
- 프로젝트 지침이 참조하는 `docs/project_context.md`는 없음. `CLAUDE.md`의 일부 스택/구조 설명도 현재 코드와 다름. QA 문제를 수정한 뒤 이 파일을 별도 승인 없이 자동 생성·변경하지 않았다.

## 6. 재현 자료와 다음 검토 절차

- [실제 앱 관찰 기록](evidence/browser-observations.md), [로그인 캡처](evidence/live-login-390.png), [HTTP 원본](evidence/http-checks.json)
- [코드 줄번호 스냅샷](evidence/source-excerpts.md), [격리 실행 결과](evidence/isolated-probes.json), [격리 실행 스크립트](isolated-probes.mjs)
- [규칙 평가 입력·결과](evidence/rules-tests.json), [배포 규칙](evidence/deployed-rules.json), [IdP](evidence/auth-config.json), [Functions](evidence/functions-summary.json), [DB](evidence/firebase-databases.txt), [백업](evidence/backups.json)
- [빌드 로그](evidence/build.txt), [영양 테스트](evidence/nutrition-tests.txt), [타입체크 로그](evidence/typecheck.txt). 마지막 파일이 빈 것은 출력 없는 성공이며 검증 범위 제한은 위 설명 참조.
- [Opus 5 인계](OPUS_5_HANDOFF.md), [5.6 Sol 인계](GPT_5_6_SOL_HANDOFF.md). 두 모델을 실제 실행시켜 상호 리뷰한 것은 아니다.

격리 probe 재실행은 프로젝트 루트에서 아래처럼 한다. 프로덕션 Firebase/AI로 연결되지 않는다. 원본 코드가 바뀌면 결과와 줄번호가 달라질 수 있다.

```sh
node_modules/.bin/esbuild src/utils/utils.js --bundle --platform=node --format=esm --outfile=/tmp/context-health-qa-utils.mjs
node docs/qa/2026-09-07/isolated-probes.mjs
```

다음 단계: QA-22 수정·새 전용 계정 재검증 → 실제 Kakao·Naver 계정 → iOS/Android 설치형 PWA·오프라인 복원 → 출시 재판정. 자동 추적 시스템은 설치하지 않았고 이 폴더의 ID와 증거를 기준으로 수동 갱신한다.

공식 문서 대조: [Gemini 키 보안](https://ai.google.dev/gemini-api/docs/api-key), [Firestore 웹 오프라인 저장](https://firebase.google.com/docs/firestore/manage-data/enable-offline), [Rules 테스트 API](https://firebase.google.com/docs/reference/rules/rest/v1/projects/test). 이 자료는 플랫폼 동작의 근거이며 제품 자체의 실행 증거는 위 파일들이다.

## 7. 비개발자를 위한 우선순위 표

| 순서 | 등급 | 사용자에게 생기는 일 | 관련 항목 | 출시 전 조치 |
|---|---|---|---|---|
| 긴급 완료 | P1 해결 | PC에서 기록 글자와 수치가 겹쳐 읽을 수 없었음 | QA-20 | CSS 전용 운영 핫픽스 완료. Windows/Edge·Safari 장시간 재발 확인 |
| 1 | P1 | 다른 사람이 같은 기기로 로그인하면 이전 사람의 음식·코칭 내용이 남을 수 있음 | QA-02 | 계정별로 저장 공간 분리, 두 계정으로 재검사 |
| 2 | P1 | 저장한 내용이 빠지거나 예전 내용으로 되돌아가고, 실패를 모를 수 있음 | QA-04·05·06·07 | 저장/복구/이탈 보호를 먼저 고치기 |
| 3 | P1 | 저장을 여러 번 누르면 기록이 여러 개 생김 | QA-03 | 중복 저장 차단 후 느린 인터넷에서 확인 |
| 완료 | P1 해결 | 탈퇴 기능이 운영 계정의 Auth·프로필·건강 기록·AI 대화를 실제로 삭제함. Apple은 출시 화면에서 숨김 | QA-08·09 | 핵심 경로 통과. Apple을 출시할 때만 실제 계정으로 별도 검증 |
| 완료 | P1 해결 | 앱에 들어간 AI 비밀키를 방문자가 가져갈 수 있었음 | QA-01 | 서버 Secret 이전·이전 키 삭제 완료. 인증 호출과 비용 알림 확인은 별도 게이트 |
| 6 | P2 | AI가 삭제한 기록을 참고하거나 오류·탭 종료 때 멈춤/엉뚱한 안내 | QA-10·14·15·21 | QA-21 로컬 수정 완료. 나머지 실패·지연·삭제 데이터 처리 개선 |
| 7 | P2 | 회원 탈퇴 뒤 건강 기록은 사라지지만 UID에 연결된 사용량·처리 기록이 서버에 남음 | QA-22 | 삭제 또는 비식별화·보존 기간을 정하고 새 전용 계정으로 재검증 |
| 8 | P2 | 운동량·영양값이 틀리고 오래된 기록/복원이 누락될 수 있음 | QA-11·12·13·16·17 | 계산·조회 범위·잘못된 입력·실패 복구 검사 |
| 완료 | P2 해결 | 운영 실수로 자료가 손상됐을 때 복구 근거가 부족했음 | QA-19 | 일일 백업·PITR·삭제 보호와 실제 복원 대조 완료 |
| 9 | P3 | 화면 읽기 기능이 숨겨진 화면/저장 안내까지 읽을 수 있음 | QA-18 | 접근성 노출·안내 처리 개선 |
| 별도 필수 확인 | 미확정 | 실제 휴대폰·오프라인·PWA 업데이트·계정 전환의 남은 위험 | V 항목 | 버그로 단정하지 말고 전용 계정/실기기로 검증 |
