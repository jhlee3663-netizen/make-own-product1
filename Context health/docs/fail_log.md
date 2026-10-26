# FAIL 로그 (Context Health)

> 리뷰 결과가 FAIL일 때 여기에 기록. PASS는 `docs/work_log.md`에 별도 기록.
> Codex에게 재작업 시킬 때 이 파일의 최신 섹션을 그대로 붙여넣어 사용.

---

## {날짜} - {작업명}
- 결과: FAIL
- 리뷰 대상 파일: {목록}
- FAIL 사유:
  - {구체적 사유 — 어떤 입력/상황에서 어떻게 틀리는지}
- 수정 위치 및 방법:
  1. {파일:라인} — {무엇을, 어떻게 고칠지}

---

## 2026-07-08 - 유산소(클라이밍/인터벌) 볼륨 미반영 대응

- 결과: FAIL
- 리뷰 대상 파일: src/utils/utils.js, src/components/screens/HomeScreen.jsx, src/components/screens/WorkoutMemoScreen.jsx, src/components/dashboard/WorkoutCard.jsx, src/components/dashboard/WeeklyVolumeChart.jsx
- FAIL 사유:
  - **[치명적] 거리(m)를 시간(분)으로 오인식**: `parseCardioMinutes`의 분 정규식에 `m\b`(약어)가 포함되어, "400m 인터벌 8회 반복" 같은 거리 표기를 400분(6.6시간)으로 계산함. "세트" 단어가 없으면 `hasRepSetPattern` 필터를 통과 못 해 그대로 오염됨. 실제 테스트로 확인됨 — 사용자가 예시로 든 "인터벌" 기록에서 바로 재현되는 버그.
  - **중복 코드 3중 복제**: `formatCardioDuration`이 WorkoutMemoScreen.jsx / HomeScreen.jsx / WorkoutCard.jsx 세 곳에 각각 복붙됨. `getWorkoutSignature`/`hasComparableWorkout`/`findComparableLastVolume`/`buildOverloadMessage`도 WorkoutMemoScreen.jsx와 HomeScreen.jsx에 통째로 중복 — utils.js로 추출되지 않음.
  - **지시 범위 밖 변경**: 요청한 건 "totalVolume=0일 때 유산소 분기 메시지"뿐인데, HomeScreen.jsx의 handleRetryAI/handleGoalComplete 경로에 없던 "저번 대비 %과부하 성공/실패" 비교 로직 전체를 새로 이식함. 자유 텍스트 저장 시 `aiStatus: 'processing'` → `'done'`으로 즉시 전환하도록 바뀌어, 카드에 뜨던 "AI 분석 중" 상태가 사라짐.
  - **관련 없는 변경**: WorkoutCard.jsx에서 `pressScale={0.985} → false`(프레스 애니메이션 제거), 에러 메시지를 실제 `aiError` 대신 뭉뚱그린 "다시 시도해 주세요"로 대체 — 둘 다 이번 작업 지시와 무관, 실제 에러 텍스트가 사라져 디버깅에 불리함.
  - (경미) `#03b26c` 색상값이 3곳에 하드코딩됨. tailwind.config.js에 추가된 `state.success` 토큰(같은 색)을 대신 써야 함.

- 수정 위치 및 방법:
  1. `src/utils/utils.js` `parseCardioMinutes` (약 76~78행 분 정규식) — `m\b` 단독 매치 제거. "min"/"minute"/"분"만 분 단위로 인식하고, "m"은 미터로 보고 무시하도록 수정. 필요하면 "km"/"m" 거리 표기는 아예 별도 필드로 분리하거나 무시.
  2. `src/utils/utils.js`에 `formatCardioDuration`을 export 함수로 추가하고, WorkoutMemoScreen.jsx / HomeScreen.jsx / WorkoutCard.jsx 세 곳의 로컬 복사본을 제거 후 import해서 사용.
  3. `getWorkoutSignature` / `hasComparableWorkout` / `findComparableLastVolume` / `buildOverloadMessage`를 `src/utils/utils.js`(또는 새 `src/utils/overload.js`)로 추출해 WorkoutMemoScreen.jsx와 HomeScreen.jsx가 공유하도록 리팩터링. (Firestore 접근이 필요한 `fetchRecentWorkoutLogs`/`findComparableLastVolume`은 uid/db를 인자로 받는 형태로 분리)
  4. HomeScreen.jsx의 handleRetryAI/handleGoalComplete에 새로 들어간 "%과부하 비교" 로직과, 자유 텍스트 저장 시 `aiStatus`를 곧장 `'done'`으로 바꾼 부분은 이번 작업 범위가 아니므로 원래 동작(단순 볼륨 메시지, `processing` → 백그라운드 AI 완료 후 `done`)으로 되돌릴 것. 과부하 비교 기능 자체를 HomeScreen 경로에도 도입하고 싶다면 별도 작업으로 분리해서 다시 요청.
  5. `src/components/dashboard/WorkoutCard.jsx`: `pressScale={false}`를 원래 `pressScale={0.985}`로 복원. 에러 메시지도 `aiError` 원문을 다시 노출하거나, 최소한 콘솔에는 원문을 남길 것.
  6. 하드코딩된 `#03b26c`를 tailwind `state-success`/`text-state-success` 클래스로 교체 (WeeklyVolumeChart.jsx 2곳, WorkoutCard.jsx 1곳).
