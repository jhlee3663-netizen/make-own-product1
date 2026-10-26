# 3단계 기록 보존 수정

2026-09-09. QA-03·04·05·06·07의 로컬 수정과 Firebase 에뮬레이터·실제 PC 화면 E2E를 실행했다. Firebase 설정, 운영 데이터, 운영 배포는 변경하지 않았다.

## 결과

| 항목 | 결과 | 증거 |
|---|---|---|
| QA-03 운동 중복 저장 | 실제 화면 E2E 통과 | PC에서 저장 버튼을 더블클릭한 뒤 Firestore `logs` 문서가 1개만 생성됨 |
| QA-04 저장 실패 은폐 | 실제 화면 E2E 통과 | Firestore 중단 후 프로필 저장이 8초 뒤 재활성화되고 실패 안내 표시. 편집 상태와 체중 `63` 입력 유지 |
| QA-05 브라우저 뒤로가기 | 실제 PC E2E 통과 | `QA 가슴` 입력 후 브라우저 back 시 확인창 표시. 계속 작성 후 입력 유지 |
| QA-06 오래된 AI 덮어쓰기 | Firebase+모의 AI E2E 통과 | 60kg 요약을 1.5초 지연한 사이 80kg로 재저장. 최종 `originalText`와 `sections`에 80kg 유지 |
| QA-07 미분석 식단 원문 | 실제 화면 E2E 통과 | 아침 입력이 `unparsedInputs.breakfast`에 저장되고 재진입 시 그대로 복원 |
| QA-07 분석 중·실패 식단 | 실제 화면 E2E 통과 | 지연된 분석 중 저장과 AI 강제 실패 후 저장 모두 Firestore 원문과 재진입 입력 복원 |
| QA-21 탭 종료 후 AI 무한 대기 | 실제 화면 E2E 통과 | 저장 120ms 후 탭을 닫으면 `processing`이 남는 현상 재현. 원문은 유지됨. 2분 이상 중단 작업을 감지해 안내·재시도 표시 후 완료 확인 |
| 빌드 산출물 로고 | 통과 | `public/logo.png`와 `dist/logo.png` SHA-256 일치, Workbox precache에 `logo.png` 포함 |

격리 검증 원본은 [evidence/isolated-probes.json](evidence/isolated-probes.json), 실제 화면 E2E 원본은 [evidence/record-preservation-emulator-e2e.json](evidence/record-preservation-emulator-e2e.json)이다.

## 주요 변경

- `WorkoutMemoScreen.jsx`: 저장 잠금, 고정 문서 ID, AI revision과 Firestore transaction 조건부 반영, `aiStartedAt` 기록. 운영은 기본 Gemini URL 유지. 로컬 QA에서만 모의 URL 주입 가능.
- `WorkoutCard.jsx`: AI 처리가 2분 넘게 멈춘 기록을 무한 spinner 대신 중단 안내와 재시도로 표시.
- `DietDetailScreen.jsx`: 저장 잠금, 고정 문서 ID, 미분석 입력 저장·복구, 뒤로가기 guard.
- `App.jsx`: 상세 화면 뒤로가기 guard, 동기화 실패 토스트, 프로필 저장 오류 전파와 8초 timeout.
- `MyPageScreen.jsx`: 프로필 저장 실패 시 편집 상태 유지, 인라인 오류 표시, 재시도 가능.
- `vite.config.js`: `logo.png` PWA precache 대상 명시.
- `nutritionLookup.js`: 운영 Gemini URL은 유지하고 로컬 QA에서만 모의 URL 주입 가능.
- `scripts/qa-gemini-mock.mjs`: 운동 응답 순서·탭 종료·식단 분석 지연·실패를 통제하는 로컬 전용 모의 서버.

## 실행한 검사

```sh
npm run test:user-storage
npm run test:nutrition
npx tsc --noEmit
npm run build
node docs/qa/2026-09-07/isolated-probes.mjs
git diff --check
```

모두 종료 코드 0. 프로덕션 번들에 로컬 모의 URL이 포함되지 않았고 로고 파일과 PWA precache도 다시 확인했다.

## 남은 검증

이 단계는 **운영 배포 가능 판정이 아니다.** 남은 범위는 Android hardware back, iOS swipe back, 실제 폰 네트워크의 재시도·중복 저장 충돌이다.
