# Opus 5 — Context Health QA 인계

> **2026-09-29 최신 상태:** 삭제 가능한 Google 운영 테스트 계정으로 인증 AI, 운동·식단 저장, 새로고침, 로그아웃·재로그인, 회원 탈퇴를 완료했다. Auth·프로필·건강 기록·코치방은 모두 삭제됐지만 `aiUsage/{uid}`와 `accountDeletions/{uid}`가 남아 QA-22(P2)를 추가했다. 테스트 잔여물은 정리했다. 다음 작업은 QA-22 수정·재검증, Kakao·Naver 실계정, iOS/Android 설치형 PWA다. [10단계](STEP_10_PRODUCTION_ACCOUNT_E2E.md)

> **2026-09-11 당시 상태:** 운영 인덱스·규칙·`aiGenerate`·`deleteAccount`·Hosting을 배포했고 이전 공개 Gemini 키를 삭제했다. Gemini 3.6 실제 키 호출, API rewrite 401, 새 Chrome PC 렌더링을 확인했다. 당시 남은 전용 운영 계정 검증 결과는 위 2026-09-29 상태로 갱신됐다. [9단계](STEP_9_PRODUCTION_DEPLOYMENT.md)

> 2026-09-10 상태 변경: QA-19는 14일 보존 일일 백업, PITR 7일, 삭제 보호를 운영 `(default)`에 활성화하고 첫 `READY` 백업을 새 DB `qa-restore-20260910`에 약 10분 13초 만에 복원했다. `users` 5, `logs` 98, `coachRooms` 8과 해시 UID별 소유권, 인덱스·TTL이 정확히 일치해 **QA-19 통과**다. 식단 오프라인 실패→종료→복원→온라인 재시도도 중복 없이 1건 저장과 초안 삭제까지 Chrome/에뮬레이터에서 통과했다. 2026-09-11 사용자 승인 뒤 검증 DB만 삭제했고 운영 보호 설정은 유지됐다. [상세](STEP_8_QA19_BACKUP_EXECUTION_PLAN.md)

> 2026-09-08 상태 변경: QA-20(P1)의 1차 수정은 불충분했고 격리 배포에서 로고를 누락했다. V2에서 PC 시스템 한글 글꼴 우회와 `logo.png` 복구를 적용한 뒤 쇠질·식단·AI 코치·마이페이지를 운영 재검증했다. [상세 기록](DESKTOP_RENDERING_HOTFIX.md). 누적 발견은 P0 0/P1 10/P2 9/P3 1이며 QA-02 로컬 코드는 여전히 미배포다.

이 파일은 사용자가 지칭한 ‘Opus 5’에게 전달할 독립 인계 문서다. 해당 모델을 실행하거나 검토를 받았다는 의미가 아니다.

## 현재 요청과 상태

사용자는 **출시 전 전면 QA**, 실제 앱·코드·Firebase 대조, 모든 발견에 재현/증거/P0~P3, 불확실한 사항의 분리, 비개발자 우선순위 표를 요청했다. 초기 QA는 문서만 작성했고, 이후 사용자 지시로 수정·배포·전용 테스트 계정의 AI·탈퇴 검증까지 수행했다. 실사용자 계정과 기존 사용자 데이터는 사용하지 않았다.

현재 결론은 **출시 보류**. [QA_REPORT.md](QA_REPORT.md)가 기준 문서이며 누적 P0 0/P1 10/P2 11/P3 1과 별도 V 항목을 포함한다. 최신 해결 상태는 2026-09-29 주석과 [10단계](STEP_10_PRODUCTION_ACCOUNT_E2E.md)를 따른다. 등급이나 상태를 바꿀 때 반드시 새 증거를 추가한다.

Opus 리뷰 후속 1단계는 [STEP_1_AUTH_VERIFICATION.md](STEP_1_AUTH_VERIFICATION.md)에 기록했다. 운영 기본 테넌트의 익명/providerless 계정은 0명이고 익명 로그인은 비활성이지만, 배포 `socialAuth`의 `migrateAnonymousData`는 로컬과 일치해 휴면 레거시 경로로 남아 있다. 실제 link 충돌은 비운영 Firebase 환경이 없어 확정 버그로 올리지 않았다.

QA-02의 후속 수정은 [STEP_2_QA_02_FIX.md](STEP_2_QA_02_FIX.md)에 정리했다. 공급자 콜백의 캐시 소유자 판정 순서 위험을 추가 수정했고 Node 회귀, Chrome namespace fixture, Firebase 에뮬레이터 A→B·B→A 두 탭 전환을 통과했다. 첫 에뮬레이터 검사에서 이전 탭이 A를 유지한 결함을 추가 발견해 storage 신호 재초기화로 수정했다. 실제 소셜 공급자·모바일/PWA·sync 실패 E2E와 운영 배포는 수행하지 않았다.

QA-03·04·05·06·07의 후속 수정은 [STEP_3_RECORD_PRESERVATION_FIX.md](STEP_3_RECORD_PRESERVATION_FIX.md)에 정리했다. 원본 함수 격리 probe는 통과했지만 실제 Firebase 연타·두 탭·앱 종료·모바일 back E2E와 운영 배포는 수행하지 않았다.

## 제품과 검토 기준

- 운영: https://context-health-3eb84.web.app/ ; Firebase `context-health-3eb84`, `(default)` Standard DB, 서울 리전. Functions는 us-central1.
- 프로젝트 루트: 이 파일에서 `../../../`.
- React 18/Vite/Firebase Web SDK. 화면은 `src/App.jsx` state/history로 전환. 서버 기능은 `functions/index.js`.
- 기존 작업 트리에 수정이 많다. checkout/reset/clean으로 정리하지 말 것. Git HEAD만으로 버전을 판단하지 말고 [source-hashes](evidence/source-hashes.json)를 비교한다.
- 운영 JS와 새 로컬 빌드가 SHA-256 기준 일치했다. Functions 전체 소스 배포 일치는 미검증.
- `docs/project_context.md`가 없으므로 존재한다고 가정하지 말 것. `CLAUDE.md`의 과거 파일 구조보다 실제 파일을 우선한다.

## 먼저 읽을 자료

1. [QA 보고서](QA_REPORT.md): 확정 항목과 잠재 항목, 재현 순서, 수용 기준.
2. [원본 함수 실험](evidence/isolated-probes.json) 및 [실행 스크립트](isolated-probes.mjs).
3. [운영 HTTP](evidence/http-checks.json), [배포 규칙](evidence/deployed-rules.json), [Rules 테스트](evidence/rules-tests.json).
4. [브라우저 관찰](evidence/browser-observations.md), [소스 줄번호](evidence/source-excerpts.md).

## 독립 리뷰에서 우선 확인할 내용

| 우선 | 검토 | 이미 확보한 증거 | 남은 일 |
|---|---|---|---|
| 1 | QA-02 사용자 분리 | 로그아웃 후 음식/insight 키 잔류 | 실제 A/B 계정, 두 탭·sync 실패에서 화면 노출 범위 |
| 2 | QA-06 최신 기록 보존 | A AI가 B 수정 덮어쓰는 원본 함수 재현 | 수정안이 생기면 revision guard, 탭 간 경쟁, 실패 fallback 검증 |
| 3 | QA-04·05·07 저장 신뢰성 | 거절 은폐, 브라우저 back, 원문 누락 | 정상 저장·재실행·오프라인·분석 중 저장 E2E |
| 4 | QA-08·09·22 인증/탈퇴 | 운영 Google 계정의 핵심 삭제 통과, UID 메타데이터 잔존 | QA-22 수정 뒤 새 전용 계정 재검증. Apple 출시 시에만 IdP 검증 |
| 5 | QA-01 키 경계 | 공개 JS에 실제 Gemini 키 포함 | 관리 화면의 제한·청구·교체 정책 확인. 키 출력 금지 |

## 과대 해석을 막기 위한 반증

- Rules 테스트 10건 중 앞 8개는 소유권 기대 통과. 마지막 2개 SUCCESS는 ‘잘못된 schema를 ALLOW한다’는 기대가 재현됐다는 뜻이다. 보안 10/10 PASS로 쓰지 말 것.
- Sentry webhook은 소스에 서명 검사가 없고 로컬 mock에서는 부수효과가 발생하지만 **운영 무인증 요청은 403**. 인터넷 공개 취약점으로 확정하지 말 것.
- 한 번의 모바일 가로 이동은 reload 후 사라졌고 도구 캡처 배율 문제도 있었다. 확정 UI bug로 승격하려면 자동화 영향 없이 다시 재현해야 한다.
- 오프라인 영속 캐시가 설정되지 않은 사실만으로 모든 저장이 유실된다고 단정하지 말 것. 실제 ACK·종료 시점을 시험한다.
- 타입체크는 성공했지만 src JSX를 포함하지 않는다. 전체 프론트엔드 타입 검사 통과라고 말하지 말 것.
- 운영 배포와 키 교체, 실제 Gemini 키 호환성 호출은 수행했다. 기존 사용자 기록 저장·삭제·탈퇴는 수행하지 않았다. fixture 실험을 운영 계정 E2E 증거로 바꾸어 말하지 말 것.

## 안전한 재현

프로젝트 루트에서:

```sh
node_modules/.bin/esbuild src/utils/utils.js --bundle --platform=node --format=esm --outfile=/tmp/context-health-qa-utils.mjs
node docs/qa/2026-09-07/isolated-probes.mjs
```

위 실행은 소스 수정 없이 함수를 추출하여 메모리 대역으로 실행한다. 결과 JSON은 덮어쓰므로 재검토일의 새 폴더로 보존한 뒤 실행하거나 스크립트를 복사해 출력 경로를 바꾼다. 기존 증거를 설명 없이 바꾸지 않는다.

## 다음 모델의 기록 형식

각 QA/V ID에 대해 아래를 새 날짜의 리뷰 문서에 기록한다.

```md
### QA-xx / V-xx
- 판단: 동의 / 반박 / 검증 필요
- 환경·버전·계정: 합성 식별자만
- 수행한 재현:
- 기대 / 실제:
- 신규 증거 링크:
- 등급 변경 이유:
- 미검증 범위:
```

수정 요청을 별도로 받으면 필요한 파일과 수용 기준을 먼저 식별한다. 보고서 작성 자체가 코드 수정·배포 승인은 아니다. 이 문서에 적힌 우선순위를 근거로 운영 계정 탈퇴나 실사용자 데이터 파괴 실험을 하지 않는다.
