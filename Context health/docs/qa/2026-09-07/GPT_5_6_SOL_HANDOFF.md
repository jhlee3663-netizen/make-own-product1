# 5.6 Sol — Context Health QA 인계

> **2026-09-29 최신 상태:** 삭제 가능한 Google 운영 테스트 계정으로 인증 AI, 운동·식단 저장, 새로고침, 로그아웃·재로그인, 회원 탈퇴를 완료했다. Auth·프로필·건강 기록·코치방은 모두 삭제됐지만 `aiUsage/{uid}`와 `accountDeletions/{uid}`가 남아 QA-22(P2)를 추가했다. 테스트 잔여물은 정리했다. 다음 작업은 QA-22 수정·재검증, Kakao·Naver 실계정, iOS/Android 설치형 PWA다. [10단계](STEP_10_PRODUCTION_ACCOUNT_E2E.md)

> **2026-09-11 당시 상태:** 운영 인덱스·규칙·`aiGenerate`·`deleteAccount`·Hosting을 배포했고 이전 공개 Gemini 키를 삭제했다. Gemini 3.6 실제 키 호출, API rewrite 401, 새 Chrome PC 렌더링을 확인했다. 당시 남은 전용 운영 계정 검증 결과는 위 2026-09-29 상태로 갱신됐다. [9단계](STEP_9_PRODUCTION_DEPLOYMENT.md)

> 2026-09-10 상태 변경: QA-19는 14일 보존 일일 백업, PITR 7일, 삭제 보호를 운영 `(default)`에 활성화하고 첫 `READY` 백업을 새 DB `qa-restore-20260910`에 약 10분 13초 만에 복원했다. `users` 5, `logs` 98, `coachRooms` 8과 해시 UID별 소유권, 인덱스·TTL이 정확히 일치해 **QA-19 통과**다. 식단 오프라인 실패→종료→복원→온라인 재시도도 중복 없이 1건 저장과 초안 삭제까지 Chrome/에뮬레이터에서 통과했다. [상세](STEP_8_QA19_BACKUP_EXECUTION_PLAN.md)

> 2026-09-08 상태 변경: QA-20(P1)의 1차 수정은 불충분했고 격리 배포에서 로고를 누락했다. V2에서 PC 시스템 한글 글꼴 우회와 `logo.png` 복구를 적용한 뒤 쇠질·식단·AI 코치·마이페이지를 운영 재검증했다. [상세 기록](DESKTOP_RENDERING_HOTFIX.md). 누적 발견은 P0 0/P1 10/P2 9/P3 1이며 QA-02 로컬 코드는 여전히 미배포다.

사용자가 지칭한 ‘5.6 Sol’이 기존 대화 없이 QA를 이해하고 후속 검증할 수 있도록 작성했다. 실제 해당 모델을 호출한 결과가 아니다.

## 작업 계약

초기 요청은 QA와 문서화였고, 이후 사용자 지시로 수정·검증·운영 배포까지 수행했다. 기준은 [QA_REPORT.md](QA_REPORT.md). 결론은 출시 보류다. 누적 심각도 집계는 P0 0 / P1 10 / P2 11 / P3 1이며 각 항목의 최신 해결 상태는 2026-09-29 주석과 STEP 문서를 따른다.

Opus 후속 제안을 반영한 1단계 읽기 전용 검증은 [STEP_1_AUTH_VERIFICATION.md](STEP_1_AUTH_VERIFICATION.md)에 있다. 운영 기본 테넌트에 익명/providerless 계정이 없고 익명 로그인은 비활성이며, 배포 `socialAuth`에는 레거시 이전 코드가 남아 있다. link 충돌과 Apple redirect 문구는 실계정 E2E 전까지 검증 필요로 유지한다.

QA-02 코드 수정과 로컬 회귀 결과는 [STEP_2_QA_02_FIX.md](STEP_2_QA_02_FIX.md)에 있다. UID별 namespace와 계정 전환 시 state 교체를 적용했고, 공급자 성공 콜백이 캐시 소유자 기준을 먼저 덮지 않도록 인증 확정 경로를 하나로 제한했다. Firebase 에뮬레이터 첫 두 탭 검사에서 이전 탭이 A를 계속 표시하는 추가 결함을 발견해 storage 신호 재초기화를 적용했으며 A→B·B→A 회귀는 통과했다. 실제 소셜 공급자·모바일/PWA E2E와 배포는 남아 있다.

QA-03·04·05·06·07은 [STEP_3_RECORD_PRESERVATION_FIX.md](STEP_3_RECORD_PRESERVATION_FIX.md)에 로컬 수정·격리 회귀 결과를 기록했다. 중복 저장, 저장 실패 표시, 브라우저 back, AI revision, 미분석 식단 원문을 다뤘다. 실제 Firebase/모바일 E2E와 운영 배포는 남아 있다.

- 제품: https://context-health-3eb84.web.app/
- Firebase: `context-health-3eb84`, `(default)` DB, STANDARD/FIRESTORE_NATIVE, asia-northeast3.
- 프로젝트 루트: `../../../`. 소스는 JSX. `App.jsx`가 state/history 기반 화면 전환·계정 동기화를 관리.
- 기존 미커밋 변경을 보존. [해시](evidence/source-hashes.json)가 이 QA 소스의 식별 기준.
- 배포 JS와 로컬 새 빌드 일치. 기존 dist는 유지하고 빌드는 `/tmp/context-health-qa-build`에 생성했다.
- `docs/project_context.md`는 현재 없다. 문서의 추정 디렉터리를 신뢰하지 말고 실제 파일을 확인한다.

## 파일별 문제 지도

| 코드 | QA ID | 핵심 확인 |
|---|---|---|
| `src/App.jsx` | 02·04·05 | UID별 캐시/메모리 분리, 조용한 저장 실패, popstate 초안 보호 |
| `src/components/screens/WorkoutMemoScreen.jsx` | 03·06 | 저장 중복 guard, AI revision, 수정 후 stale AI 적용 금지 |
| `src/components/screens/DietDetailScreen.jsx` | 02·07·16 | 공용 내 음식 키, 미분석 원문 누락, 음수 영양값 |
| `src/components/screens/MyPageScreen.jsx` | 02·08·12 | logout 캐시 범위, 실제 없는 탈퇴 endpoint, 휴지통 조회 상한 |
| `src/components/screens/AICoachScreen.jsx` | 01·10·14·15 | 브라우저 키, 빈 응답/429, timeout, deletedAt 필터 |
| `src/components/screens/HomeScreen.jsx` | 12·13 | 200개 조회 제한, 삭제 실패 후 UI 원복 |
| `src/utils/utils.js` | 11 | 맨몸·보조·가중 운동 세트 수 계산 |
| `src/lib/userStore.js` | 04·12 | 전체 배열 덮어쓰기, coachRooms 20개 상한 |
| `firestore.rules` | 17 | 소유권은 제한함, create/update 필드 형식 검증 부족 |
| `src/components/common/Toast.jsx`, `App.jsx` | 18 | 비활성 콘텐츠 접근성 제외 |
| Firebase 운영 설정 | 08·09·19·22 | 탈퇴 핵심 삭제·백업/PITR/삭제 보호는 반영 완료. 탈퇴 뒤 UID 메타데이터 잔존. Apple IdP는 없고 버튼 숨김 |

각 항목의 상세 재현·근거·수용 기준은 보고서에 있다. 여기의 짧은 지도만 보고 수정하지 말 것.

## 검사와 근거의 한계

- `npm run test:nutrition` 통과. 범위는 영양 modifier 테스트이며 전면 QA 통과가 아님.
- `npx vite build --outDir /tmp/context-health-qa-build` 통과, 큰 JS chunk 경고. 번들 크기만으로 실기기 성능 장애를 확정하지 않음.
- `npx tsc --noEmit` 성공. tsconfig의 root TS/TSX만 포함하여 src JSX는 검사하지 않음.
- [isolated-probes.mjs](isolated-probes.mjs)는 원본 함수를 AST로 추출해 DB/AI를 mock으로 실행. 앱 소스를 수정하지 않는다. 재현 결과는 [JSON](evidence/isolated-probes.json).
- 2026-09-29 전용 운영 테스트 계정으로 기록 작성·재로그인·탈퇴까지 수행했다. 다른 사용자 데이터는 읽거나 수정하지 않았다. 상세 범위는 [10단계](STEP_10_PRODUCTION_ACCOUNT_E2E.md)를 따른다.
- 계정 소유권 Rules 평가는 허용 2·거절 6이 기대대로 통과. schema 결함 2건도 별도 재현. 실제 두 계정 SDK 교차 요청 시험과 동일하지 않다.

## 후속 검증 권장 순서

1. 현재 소스/배포 해시와 Firebase 설정을 다시 읽어 드리프트 확인.
2. 전용 테스트 계정 두 개와 실패 주입 가능한 비운영 환경 확보. 정상 온보딩→운동/식단 저장→새로고침→새 기기 조회부터 확인.
3. QA-03·04·06·07의 저장 계약을 기준으로 연타·거절·지연·재시작·AI 역순 완료를 재현.
4. A→logout→B, 탭 간 logout, sync 실패 후 캐시/메모리 누출 검사.
5. iOS/Android 키보드·안전영역, 320/360/390/430 및 가로모드, 실제 PWA 버전 교체/오프라인 재시작.
6. 변경된 항목만 적절한 회귀 검사를 수행한 뒤 전체 출시 게이트 재판정.

## 오해 금지

- `V-WEBHOOK`: 운영 무인증 403. 로컬에 서명 검증이 없는 것을 바로 운영 공개 취약점으로 쓰지 않는다.
- `V-MOBILE`: 한 번의 가로 이동은 재현 불안정. 정상 좌표를 확인한 조건과 실제 기기 미검증을 함께 기록한다.
- `QA-12`: 서버 영구 유실이 아니라 클라이언트 조회 범위 누락.
- `QA-19`: 2026-09-10 보호 설정과 실제 복원·집계 대조를 완료해 통과했다. 2026-09-11 사용자 승인 뒤 검증용 복원 DB만 삭제했고 운영 `(default)`과 보호 설정은 유지됐다.
- `QA-01`: Firebase 공개 config apiKey와 Gemini API 비밀키를 구분. 키/토큰을 문서·로그·PR에 붙이지 않는다.
- `QA-18`: opacity=0 토스트가 DOM에 남음. 화면에 성공 토스트가 항상 보인다는 뜻 아님.

## 수정 지시를 받은 이후의 완료 조건

코드 수정 권한이 새로 주어졌을 때만 착수한다. 항목별로 변경 파일, 원인, 재현 전후, 실제 수행한 검사와 미검증 내용을 기록한다. 승인 없이 데이터 스키마·배포·계정 데이터 삭제까지 범위를 확장하지 않는다. 기존 코드를 보호하되 범위 내 필요한 수정은 끝까지 완성한다.

별도 리뷰 파일에 `QA/V ID | 상태(미해결/재현됨/반박/수정됨/재검증통과) | 코드 버전 | 증거 | 남은 검증`을 관리한다. 단순 빌드 성공으로 ‘재검증통과’ 표시하지 않는다.
