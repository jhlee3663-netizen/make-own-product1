# 7단계 오프라인 저장·PWA 전환·복구 준비

2026-09-09. 운영 데이터와 Firebase 운영 설정·배포를 변경하지 않고, 로컬 코드와 `demo-context-health` 에뮬레이터 및 Chrome에서 검증했다. 실행 원본은 [offline-pwa-tests.json](evidence/offline-pwa-tests.json)에 남겼다.

### V-OFFLINE

- 판단: **로컬 Chrome·에뮬레이터 통과, 실기기 검증 남음**
- 원인: 운동·식단 저장은 서버 응답을 제한 없이 기다렸고, 성공 확인 전 브라우저가 종료되면 작성 중인 새 기록을 복원할 별도 초안이 없었다.
- 변경: 운동·식단 초안을 UID와 기록 종류·편집 대상별로 로컬 저장한다. 새 기록은 Firestore 문서 ID도 함께 보관해 재시도 시 같은 문서를 사용한다. 성공 확인 뒤에만 초안을 지우며, 사용자가 확인창에서 명시적으로 버릴 때도 지운다. 초안은 30일 뒤 폐기한다.
- 실패 처리: 8초 안에 서버 확인이 없으면 로딩을 풀고 "작성 내용은 이 기기에 보관했습니다"와 재시도 안내를 표시한다. Firestore의 진행 중 promise를 취소할 수는 없지만, 고정 문서 ID를 사용하므로 이후 같은 화면의 재시도가 새 문서를 추가하지 않는다.
- 실제 재현 전: Firestore가 응답하지 않으면 저장 화면이 계속 잠기며, 탭 종료 뒤 입력 복원 수단이 없었다.
- 실제 운동 재현: `오프라인 등` 입력 → 탭 종료 → 새 탭 → 운동 기록 재진입에서 같은 입력이 복원됐다. Firestore 에뮬레이터 중단 뒤 저장은 8초에 오류를 표시했고 입력과 활성화된 저장 버튼이 남았다.
- 실제 식단 재현: 아침 메모 입력 → 탭 종료·재진입에서 정확한 문구 복원 → Firestore 중단 상태에서 저장 → 8초 실패 안내와 입력·활성 저장 버튼 유지 → Auth·Firestore export/import 재시작 → 같은 UID로 재진입해 초안 복원 → 온라인 재저장을 수행했다. Admin SDK 조회에서 식단 문서는 정확히 1건이었고, 성공 저장 뒤 새 식단 화면의 초안은 빈 값이었다. 증거는 [qa19-backup-activation-and-diet-offline-2026-09-10.json](evidence/qa19-backup-activation-and-diet-offline-2026-09-10.json)에 기록했다.
- 남은 검증: 실기기 네트워크 전환과 실제 멀티탭 충돌은 아직 실행하지 않았다. 따라서 출시 전체 통과로 표시하지 않는다.

### V-PWA

- 판단: **로컬 Chrome 부분 통과**
- warm launch: A 빌드를 한 번 설치한 뒤 서버를 끄고 탭도 닫았다. 같은 주소를 새 탭에서 열었을 때 로그인 화면·로고·버튼이 모두 렌더링됐다.
- cold launch: 설치 이력이 없는 별도 주소는 서버 중단 상태에서 `ERR_CONNECTION_REFUSED`였다. 이는 예상 동작이며 제품 버그로 분류하지 않는다.
- A→B 업데이트: 저장소를 건드리지 않은 `/tmp` 복사본에서 제목과 로그인 문구 및 JS 청크가 다른 B를 빌드했다. 같은 주소에 B를 제공하고 한 번 연 뒤 닫고 재실행하자 `Context Health B`와 변경 문구가 완전히 표시됐다.
- 증거: A 청크 `assets/index-CTMGY3Uk.js`, B 청크 `assets/index-gnS3SYtj.js`. 현재 `sw.js`에는 `skipWaiting`, `clientsClaim`, 이전 캐시 정리와 `index.html` navigation fallback이 포함된다.
- 남은 검증: DevTools 네트워크 로그를 통한 old chunk 404의 직접 부재 증거, 로그인된 상태의 초안 작성 중 업데이트, 실제 설치형 iOS/Android PWA와 소셜 redirect 복귀는 미실행이다.

### QA-19 복구 준비

- 판단: **통과**
- 현재 증거: 운영 `(default)` DB에 14일 보존 일일 백업, PITR 7일, 삭제 보호를 활성화했다. 첫 관리형 백업을 같은 프로젝트의 `qa-restore-20260910` DB로 약 10분 13초 만에 복원했다.
- 출시 전 의사결정안: 허용 데이터 손실을 24시간 이내(RPO 24h), 장애 뒤 읽기 서비스 복구 목표를 4시간 이내(RTO 4h)로 우선 제안한다. 비용과 업무 요구에 따라 담당자가 확정해야 한다.
- 복원 대조: 백업 시점 원본과 복원본의 `users` 5건, `logs` 98건, `coachRooms` 8건과 해시 처리한 5개 UID별 분포가 전부 일치했다. UID가 없거나 존재하지 않는 사용자에게 연결된 로그·대화방은 양쪽 모두 0건이었다. 복합 인덱스 2개와 TTL field override 0개도 일치했다.
- 완료 조건: 실제 백업 ID, 복원 대상 DB, 시작·종료 시각, 문서 수와 사용자별 소유권 대조를 모두 증거로 남겨 충족했다. 2026-09-11 사용자 승인 뒤 검증용 DB를 삭제하고 운영 보호 설정이 유지되는 것도 재확인했다.

## 변경 파일

- `src/lib/recordDrafts.js`
- `src/components/screens/WorkoutMemoScreen.jsx`
- `src/components/screens/DietDetailScreen.jsx`
- `scripts/test-record-drafts.mjs`
- `package.json`

## 실행한 검사

- `npm run test:record-drafts` 통과
- `npm run test:user-storage`, `test:nutrition`, `test:volume` 20/20, `test:nutrition-guard` 16/16 통과
- `npm run test:firestore-rules` 18/18, `npm run test:pagination` 7/7 통과
- `node docs/qa/2026-09-07/isolated-probes.mjs` 통과. QA-06 최종 body는 `80kg 10회` 유지
- `npx tsc --noEmit`, `npm run build`, `git diff --check` 통과

운영 앱 배포와 운영 원본 데이터 쓰기는 하지 않았다. 2026-09-10 사용자 승인에 따라 운영 Firestore의 백업 일정·PITR·삭제 보호를 활성화하고 새 검증용 DB 복원을 시작했다.
