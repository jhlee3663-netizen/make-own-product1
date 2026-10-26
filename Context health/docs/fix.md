# 작업 지시서 (Context Health)

> Claude Code가 정리한 작업 지시를 Codex에게 그대로 전달하는 용도. 매 작업마다 이 파일 내용을 덮어쓴다.
> 결과가 PASS면 `docs/work_log.md`, FAIL이면 `docs/fail_log.md`에 기록한다.

---

## 2026-09-09 - 5단계 잔여: QA-12 조회 상한 · QA-17 규칙 형식 검증 · QA-18 접근성

### 0. 시작 전에 반드시 읽을 것

- [`docs/qa/2026-09-07/NEXT_STEPS.md`](qa/2026-09-07/NEXT_STEPS.md) — 전체 단계와 현재 위치
- [`docs/qa/2026-09-07/QA_REPORT.md`](qa/2026-09-07/QA_REPORT.md) — QA-12·17·18 원문(증거·수용 기준)
- [`docs/qa/2026-09-07/STEP_4_PRODUCTION_CORE.md`](qa/2026-09-07/STEP_4_PRODUCTION_CORE.md), [`STEP_5_QUALITY_FIXES.md`](qa/2026-09-07/STEP_5_QUALITY_FIXES.md) — 이미 끝난 수정. **다시 건드리지 말 것**

이미 처리된 항목(재작업 금지): QA-01 AI 프록시, QA-02 UID별 저장, QA-03~07 기록 보존, QA-08 탈퇴 강화, QA-09 Apple 버튼, QA-11 세트 배수 볼륨, QA-13 삭제 실패 복구, QA-14 코치 타임아웃, QA-15 삭제 기록 제외, QA-16 영양값 검증.

### 1. 절대 하면 안 되는 것

- **운영 배포 금지.** `firebase deploy`, `npm run deploy`를 실행하지 않는다. 함수·규칙·인덱스·Hosting 전부 해당된다.
- **운영 Firebase 데이터·설정 변경 금지.** 운영 프로젝트(`context-health-3eb84`)에 문서를 쓰거나 지우지 않는다. 검증은 `demo-context-health` 에뮬레이터에서만 한다.
- **Gemini 키 교체·폐기 금지.** 사용자가 직접 할 운영 작업이다.
- 기존 미커밋 변경이 많다. `git checkout/reset/clean`으로 정리하지 않는다.
- 지시 범위 밖 리팩터링을 하지 않는다. 특히 AI 호출부(`src/lib/aiClient.js` 경유)는 방금 정리했으므로 구조를 바꾸지 않는다.

### 2. 작업 A — QA-12 조회 상한 (P2)

세 곳 모두 상한만 있고 페이지 이동이 없어, 서버에 데이터가 있어도 사용자에게는 사라진 것처럼 보인다.

#### A-1. 휴지통이 오래된 삭제 기록을 놓치는 문제 (가장 심각)

`src/components/screens/MyPageScreen.jsx` 140~157행:

```js
const q = query(collection(db, 'logs'), where('uid', '==', user.uid), orderBy('timestamp', 'desc'), limit(200));
getDocs(q).then(snap => {
  const items = snap.docs.map(...).filter(d => d.deletedAt).filter(30일 이내)...
```

`timestamp`(기록 작성일) 기준 최신 200개를 먼저 자른 뒤 `deletedAt`으로 거른다. 그래서 **작성일이 오래된 기록을 오늘 삭제하면 휴지통에 아예 뜨지 않고, 30일 안에 복원할 방법이 없다.** 이건 단순 조회 누락이 아니라 복구 불가로 이어진다.

- `deletedAt` 기준으로 조회하도록 바꾼다: `where('uid','==',uid)`, `where('deletedAt','>=', 30일 전 Timestamp)`, `orderBy('deletedAt','desc')`.
- `firestore.indexes.json`에 `uid ASC + deletedAt DESC` 복합 인덱스를 추가한다. **파일에만 추가하고 배포하지 않는다.** 배포 전에는 이 쿼리가 운영에서 실패하므로, STEP 문서에 "인덱스 배포가 선행되어야 함"을 반드시 남긴다.
- 에뮬레이터는 인덱스 없이도 동작하므로, 인덱스 정의가 쿼리와 맞는지는 `firestore.indexes.json`을 눈으로 대조해 기록한다.

#### A-2. 홈 화면 200개 상한

`src/components/screens/HomeScreen.jsx` 161행 `limit(200)`.

- 201번째 이후 과거 기록에 접근할 수단을 만든다. 무한 스크롤까지 갈 필요는 없고, 목록 끝에 "이전 기록 더 보기" 버튼으로 `startAfter` 커서 페이지네이션이면 충분하다.
- `onSnapshot` 실시간 구독은 첫 페이지에만 유지하고, 추가 페이지는 `getDocs`로 덧붙이는 방식을 권장한다. 실시간 구독 범위를 무제한으로 늘리지 말 것.
- 주간 차트·연속 기록(streak) 계산이 첫 페이지 데이터만 쓰는지 확인하고, 더 불러온 데이터 때문에 값이 흔들리지 않게 한다.

#### A-3. 코치방 20개 상한

`src/lib/userStore.js` 19행 `limit(20)`.

- 21번째 방부터 조회되지 않는다. 정렬 기준(최근 사용 순 등)을 명시하고 페이지네이션 또는 상한 상향을 적용한다.
- 방 개수가 상한에 걸렸을 때 사용자가 알 수 있는 표시를 넣는다.

#### A-4. 수용 기준

- 201개 이상 fixture에서 201번째 이후 기록에 UI로 접근 가능
- 작성일이 오래된 기록을 오늘 삭제 → 휴지통에 보이고 복원 성공
- 코치방 21개 이상에서 21번째 방 접근 가능
- 검증은 에뮬레이터 fixture로 한다. 신규 테스트는 `scripts/test-pagination.mjs`로 만들고 `package.json`에 `test:pagination`으로 등록한다.

### 3. 작업 B — QA-17 Firestore 규칙 형식 검증 (P2)

현재 `firestore.rules`는 소유권은 막지만 형식을 거의 보지 않는다. 잘못된 클라이언트·조작 요청이 자기 기록을 깨뜨릴 수 있다.

- `logs` create/update에 필수 필드, 자료형, 수치 범위, 크기 제한을 추가한다. 최소한: `uid`는 string이고 변경 불가, `type`은 `'workout'|'diet'`, `timestamp`는 timestamp 타입, `kcal`/`totalVolume` 등 수치는 음수 불가.
- **기존 문서와의 호환이 최우선이다.** 지금 운영에 있는 문서가 새 규칙에서 update 거부되면 안 된다. 필드가 없을 수 있는 경우를 모두 optional 처리하고, 그 판단 근거를 문서에 남긴다.
- `aiUsage`, `accountDeletions`가 클라이언트 접근 불가인 상태를 유지한다(이미 적용됨).
- 검증: `docs/qa/2026-09-07/evidence/rules-tests.json`과 같은 형식으로 케이스를 만들되, **에뮬레이터 Rules 테스트로 실행**한다. 정상 CRUD 통과 + malformed create/update 거절 + 타 사용자 접근 거절을 모두 포함하고 결과를 새 evidence 파일로 남긴다.
- 규칙 파일만 수정하고 배포하지 않는다.

### 4. 작업 C — QA-18 접근성 (P3)

- `src/App.jsx` 523행: 비활성 탭 패널을 `transform`과 `pointerEvents`로만 숨겨 스크린리더가 화면 밖 콘텐츠를 읽는다. 비활성 패널에 `inert`(또는 `aria-hidden`+포커스 제외)를 적용한다. **키보드 포커스가 비활성 패널로 넘어가지 않는지 반드시 확인한다.**
- `src/components/common/Toast.jsx`: `show=false`일 때도 DOM과 접근성 트리에 남는다. 실제 알림일 때만 노출되게 하고, 보일 때는 `role="status"`, `aria-live="polite"`로 읽히게 한다.
- 탭 전환 애니메이션이 깨지지 않는지 확인한다. `display:none`으로 바꾸면 전환 효과가 사라질 수 있으니 애니메이션과 접근성을 함께 만족시키는 방법을 택한다.

### 5. 공통 요구사항

- 기존 검사 전부 통과해야 한다:
  ```sh
  npm run test:nutrition
  npm run test:user-storage
  npm run test:volume
  npm run test:nutrition-guard
  npx tsc --noEmit
  npm run build
  git diff --check
  node_modules/.bin/esbuild src/utils/utils.js --bundle --platform=node --format=esm --outfile=/tmp/context-health-qa-utils.mjs
  node docs/qa/2026-09-07/isolated-probes.mjs
  ```
- 에뮬레이터가 필요한 검사도 함께 통과해야 한다. 실행법은 [`STEP_4_PRODUCTION_CORE.md`](qa/2026-09-07/STEP_4_PRODUCTION_CORE.md)의 재현 절차 그대로:
  ```sh
  node scripts/qa-upstream-mock.mjs &
  GEMINI_KEY=qa-dummy-server-key GEMINI_API_BASE=http://127.0.0.1:5179 \
    npx -y firebase-tools@latest emulators:start --only functions,auth,firestore --project demo-context-health &
  npm run test:ai-proxy        # 10/10 유지
  npm run test:delete-account  # 9/9 유지
  ```
- `isolated-probes.mjs`를 수정했다면 기존 프로브 결과가 그대로 유지되는지 확인한다. 특히 **QA-06의 최종 sections가 B(80kg)로 남아야 한다.** 값이 바뀌면 회귀다.
- 결과를 `docs/qa/2026-09-07/STEP_6_*.md`로 새로 쓰고, `NEXT_STEPS.md` 5단계 행을 갱신한다. 통과/미통과를 **실행 증거와 함께** 적고, 실행하지 않은 범위를 반드시 명시한다. 빌드 성공만으로 통과 처리하지 않는다.

### 6. 보고 형식

각 항목에 대해 다음을 남긴다.

```md
### QA-xx
- 판단: 수정됨 / 부분 수정 / 보류
- 변경 파일:
- 원인:
- 재현 전 / 후 (실제 실행 결과 값):
- 실행한 검사:
- 미검증 범위:
- 운영에서 사람이 해야 하는 후속(있다면):
```

### 7. 참고 — 지금 운영에 남아 있는 위험

QA-01은 **코드에서만 닫혔고 운영에서는 열려 있다.** 운영 번들의 옛 Gemini 키가 여전히 유효하며, 키 교체와 함수 배포는 사용자가 직접 한다. 이번 작업에서 이 상태를 바꾸려 하지 말고, 문서에 그대로 남겨 둔다.
