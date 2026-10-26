# 6단계 — QA-12 조회 상한 · QA-17 규칙 검증 · QA-18 접근성

> **2026-09-11 후속:** 이 단계의 인덱스, 규칙, 앱은 운영에 반영됐다. 인덱스 `READY`, 규칙 release, 새 Chrome PC 렌더링을 확인했다. [9단계 운영 배포](STEP_9_PRODUCTION_DEPLOYMENT.md)

2026-09-09. `docs/fix.md`의 범위만 수정했다. 검증은 `demo-context-health` Auth/Firestore/Functions 에뮬레이터와 로컬 앱에서 수행했다. 운영 프로젝트 `context-health-3eb84`의 데이터·설정·배포는 변경하지 않았다.

## 결과

### QA-12

- **판단: 수정됨(로컬·에뮬레이터).**
- **변경 파일:** `src/components/screens/HomeScreen.jsx`, `src/components/screens/MyPageScreen.jsx`, `src/lib/userStore.js`, `src/components/screens/CoachListScreen.jsx`, `src/App.jsx`, `firestore.indexes.json`, `scripts/test-pagination.mjs`, `package.json`.
- **원인:** 홈 로그는 최근 200건, 휴지통은 작성일 기준 최근 200건, 코치방은 무정렬 20건을 먼저 잘라 이후 데이터를 열 방법이 없었다. 휴지통은 작성일이 오래된 기록을 오늘 삭제해도 조회 대상에서 빠졌다.
- **재현 전 / 후 (실제 실행 결과 값):**
  - 홈: 전에는 `limit(200)` 이후 이동 수단 0개. 후에는 에뮬레이터 205건에서 첫 페이지 200건, 두 번째 페이지 5건. 실제 Chrome에서 버튼 클릭 전 마지막 운동 카드가 199번이었고 클릭 후 201·203·205번 카드가 추가됐다.
  - 차트 안정성: 실제 Chrome의 이번 주 볼륨은 더 보기 전후 모두 `100,000kg`이었다. 실시간 구독과 차트·streak 계산은 첫 페이지에 유지하고, 추가 페이지는 카드 목록에만 합쳤다.
  - 휴지통: 작성 365일 전·삭제 2일 전 기록 1건은 조회됐고, 삭제 31일 전 기록은 제외됐다. 복원 후 같은 휴지통 쿼리 결과는 1건에서 0건이 됐다.
  - 코치방: 105개 fixture를 최근 저장 시각으로 정렬해 최근 100개를 표시했다. 실제 Chrome에서 21번째 이후 방을 열 수 있었고, 상한 도달 안내가 노출됐다. `updatedAt`이 없는 기존 방을 Firestore `orderBy`가 제외하지 않도록 전체 메타데이터를 읽어 클라이언트에서 정렬한다.
- **실행한 검사:** `npm run test:pagination` **7/7**, 실제 Chrome 접근성 트리·화면 확인. 증거: [pagination-tests.json](evidence/pagination-tests.json), [browser-pagination-accessibility.json](evidence/browser-pagination-accessibility.json).
- **미검증 범위:** 운영 데이터 규모에서 전체 코치방 메타데이터 읽기의 비용·지연, 여러 기기에서 동시에 과거 페이지를 읽는 경우, 실기기 네트워크 단절 중 더 보기 재시도는 확인하지 않았다.
- **운영에서 사람이 해야 하는 후속:** **앱 배포보다 `uid ASC + deletedAt DESC` 복합 인덱스 배포가 먼저다.** 인덱스가 준비되기 전에 이 앱 코드를 운영에 배포하면 휴지통 쿼리가 실패한다. 이번 작업에서는 둘 다 배포하지 않았다.

### QA-17

- **판단: 수정됨(로컬 규칙·에뮬레이터).**
- **변경 파일:** `firestore.rules`, `scripts/test-firestore-rules.mjs`, `package.json`.
- **원인:** 기존 규칙은 소유권만 확인해 본인 문서라면 잘못된 `type`, 문자열 `timestamp`, 음수 영양값·볼륨, 과대 텍스트를 저장할 수 있었다.
- **재현 전 / 후 (실제 실행 결과 값):** 전에는 malformed create/update가 허용되는 Rules API 증거가 있었다. 후에는 정상 create/read/update/delete가 통과하고, 필수 필드 누락·잘못된 type·문자열 timestamp·음수 kcal·음수 totalVolume·301자 title·required field 제거·uid 변경이 모두 `permission-denied`였다. 타 사용자 get/list/create/update/delete와 `aiUsage`·`accountDeletions` 쓰기도 모두 거절됐다.
- **레거시 호환 근거:** create에는 `uid/type/timestamp`를 요구한다. update는 기존 문서에 이미 존재하던 `type/timestamp`를 제거하지 못하게 하되, 과거 문서에 없던 필드는 계속 optional로 둔다. 수치·문자열·목록 제한은 update에서 **변경된 필드에만** 적용한다. 에뮬레이터 관리자 fixture로 `type/timestamp`가 없고 기존 `kcal=-1`인 문서를 만든 뒤 title·deletedAt만 수정해 성공함을 확인했다.
- **실행한 검사:** `npm run test:firestore-rules` **18/18**. 증거: [firestore-rules-tests.json](evidence/firestore-rules-tests.json).
- **미검증 범위:** 운영의 모든 기존 문서 형태를 읽어 대조하지 않았고, 규칙 배포 후 운영 클라이언트 E2E도 수행하지 않았다.
- **운영에서 사람이 해야 하는 후속:** 인덱스 준비 및 운영 기존 문서 샘플 호환 검토 후 규칙을 별도로 배포하고 정상 기록 작성·수정·삭제·복원을 점검해야 한다. 이번 작업에서는 규칙을 배포하지 않았다.

### QA-18

- **판단: 수정됨(로컬 브라우저).**
- **변경 파일:** `src/App.jsx`, `src/components/common/Toast.jsx`.
- **원인:** 비활성 탭은 transform/pointer-events만 적용돼 포커스와 접근성 트리에 남았고, 숨긴 토스트도 opacity만 0이라 DOM/접근성 트리에 남았다.
- **재현 전 / 후 (실제 실행 결과 값):** 전에는 홈에서 코치·마이 콘텐츠와 `저장되었습니다`가 접근성 snapshot에 함께 있었다. 후에는 현재 탭 외 패널에 `inert`와 `aria-hidden`이 적용돼 홈→코치→마이 전환마다 비활성 콘텐츠가 트리에서 빠졌다. 코치 탭에서 Tab을 12회 눌러도 포커스는 활성 코치방 `QA 대화 34`에 머물렀다. `show=false` 토스트 텍스트는 트리에 없었다. 보이는 토스트는 DOM에 있을 때만 렌더되고 `role=status`, `aria-live=polite`를 갖는다.
- **실행한 검사:** 실제 Chrome 접근성 트리·키보드 포커스·탭 전환, PC 화면 캡처. 탭 슬라이드 CSS를 유지했고 PC에서 차트·한글·수치 겹침이 재발하지 않았다. 증거: [browser-pagination-accessibility.json](evidence/browser-pagination-accessibility.json).
- **미검증 범위:** VoiceOver/TalkBack 실제 낭독, Windows/Edge, Safari, 큰 글자 모드는 확인하지 않았다.
- **운영에서 사람이 해야 하는 후속:** 운영 배포 뒤 실제 iPhone/Android의 VoiceOver/TalkBack으로 탭 이동과 저장 안내를 확인해야 한다.

## 전체 회귀 검사

| 검사 | 결과 |
|---|---:|
| `npm run test:nutrition` | PASS |
| `npm run test:user-storage` | PASS |
| `npm run test:volume` | 20/20 PASS |
| `npm run test:nutrition-guard` | 16/16 PASS |
| `npm run test:pagination` | 7/7 PASS |
| `npm run test:firestore-rules` | 18/18 PASS |
| `npm run test:ai-proxy` | 10/10 PASS |
| `npm run test:delete-account` | 9/9 PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |
| utils esbuild + `isolated-probes.mjs` | PASS; QA-06 최종 B `80kg 10회` 유지 |
| 실제 Chrome | 205건 더 보기, 105개 코치방 상한 안내, 비활성 탭 AX 제외, PC 렌더링 PASS |

빌드에는 기존의 대형 chunk 및 정적/동적 import 혼용 경고가 남지만 실패는 아니다. `src/lib/aiClient.js`는 수정하지 않았다.

## 출시 상태

- 이 단계의 QA-12·17·18은 로컬 코드와 에뮬레이터 기준으로 닫았다.
- QA-19 백업·복원, 실기기·실계정·오프라인·PWA 전환 검증은 남아 있다.
- QA-01은 코드에서만 닫혔다. 운영 번들의 기존 Gemini 키 폐기·교체, 함수 배포, 사용량 확인은 사용자가 직접 해야 하며 이번 작업에서 수행하지 않았다.
- **배포하지 않음:** Hosting, Functions, Firestore Rules, Firestore Indexes 모두 운영 반영 0건.
