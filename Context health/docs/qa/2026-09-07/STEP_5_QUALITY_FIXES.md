# 5단계 품질 수정 (QA-11·13·14·15·16) 및 4단계 잔여 검증

2026-09-09. 4단계에서 남긴 검증 구멍을 먼저 닫고, 5단계 P2 항목 중 데이터 정확성·개인정보에 직접 닿는 것부터 수정했다. 운영 데이터·운영 Firebase 설정·운영 배포는 변경하지 않았다.

## 1. 4단계 잔여 검증 (닫음)

| 항목 | 이전 상태 | 결과 |
|---|---|---|
| 400건 배치 경계 | 미검증 (5건만 시험) | **450건 fixture 전량 삭제 확인** (`deleted.logs === 450`, 잔여 0) |
| 중단 후 재시도 완결성 | 미검증 | **부분 삭제 상태(20건 중 8건 선삭제)에서 재호출 → 잔여 12건까지 삭제 완료** |
| `requires-recent-login` | 미검증 (CODE) | **오래된 `auth_time` 토큰 → 401 `requires-recent-login`, 데이터 보존 확인** |

세 번째 항목을 만들며 실제 동작 하나를 고쳤다. 에뮬레이터에서 오래된 세션은 `checkRevoked`에 먼저 걸려 일반 `unauthorized`로 떨어졌는데, 사용자가 할 일은 재로그인으로 동일하므로 `auth/id-token-expired`·`auth/id-token-revoked`를 `requires-recent-login`으로 구분해 내보내도록 `deleteAccount`를 수정했다.

`npm run test:delete-account` → **9/9 PASS** (기존 6 + 신규 3).

## 2. QA-11 세트 배수 볼륨 오류 (P2, 수정)

체중 70kg 사용자의 `풀업 10회 3세트`가 700으로 계산되던 문제. 볼륨은 성공 뱃지·주간 차트·과부하 메시지의 근거라 오염 범위가 넓어 우선 처리했다.

- `countRepsInLine`을 추가해 `N세트`와 `x N` 표기를 총 횟수에 반영한다. `x3`은 같은 줄에 명시적 `N회`가 있을 때만 세트로 해석해, `x12`(횟수 표기)와 구분한다.
- 맨몸·보조(어시스티드)·가중 경로 모두 세트·좌우 배수를 적용한다.
- `parseVolumeFromBody`(저번대비 칩)도 같은 규칙을 쓰도록 통일했다. 이전에는 칩과 총 볼륨이 서로 다른 규칙이었다.
- AI 정리 표기 `• 세트 1: 60kg 10회`의 "세트 1"을 배수로 오인하지 않는 것을 회귀에 넣었다.

`npm run test:volume` → **20/20 PASS**. 기존 QA-11 프로브도 `actual 700 → 2100`으로 뒤집혔다.

## 3. QA-15 삭제 기록이 AI 코치 context에 포함 (P2, 수정)

`AICoachScreen.fetchRecentLogs`가 유형만 필터해 휴지통 기록까지 프롬프트에 실었다. 홈 화면과 같은 기준(`!deletedAt`)을 적용했다. 기존 프로브가 `diets: [삭제된 기록]` → **`diets: []`** 로 바뀐 것으로 확인했다.

## 4. QA-13 삭제 실패 시 카드 미복구 (P2, 수정)

`handleDeleteConfirm`에 catch/finally가 없어 실패해도 `deletingId`가 남아 카드가 사라진 것처럼 보였다. try/catch/finally로 상태를 복구하고 실패 토스트를 띄운다. 프로브 결과: `deletingId: null`, `failureToastShown: true`, 콜백 밖으로 새던 예외 없음.

## 5. QA-14 AI 코치 요청의 시간 제한·취소 (P2, 수정)

`callGemini`에 45초 `AbortController` 타임아웃을 넣고, 화면 언마운트 시 진행 중 요청을 취소하도록 `screenAbortRef`를 연결했다. 중단은 "응답이 너무 오래 걸려 중단했어요"로 안내한다. 프로브의 `abortSignalProvided`가 **false → true**.

## 6. QA-16 음수·비정상 영양값 (P2, 수정)

- `sanitizeNutritionValue`: 음수·NaN·`Infinity`는 0, 과대값은 항목별 상한(kcal 20,000 / 탄단지 3,000)으로 자른다. `Infinity`를 상한으로 바꾸지 않고 0으로 버리는 이유는, 그럴듯한 큰 수로 둔갑하면 합계가 조용히 오염되기 때문이다.
- 저장 경로 세 곳(`upsertCustomFood`, `handleSaveEdit`, `sanitizeSections`)에 모두 적용해 AI 추정값·기존 저장값도 방어한다.
- 등록 시트의 저장 버튼은 `isValidNutritionInput`으로 비활성화하고, 숫자 입력칸에 `min="0"`을 붙였다.

`npm run test:nutrition-guard` → **16/16 PASS**.

## 7. QA-01 리팩터링에 따른 QA 하네스 정비

`isolated-probes.mjs`의 QA-06·QA-10·QA-14 프로브가 `fetch`를 스텁하고 있어, AI 호출이 `generateContent`로 바뀐 뒤 실행이 깨졌다. 스텁을 `generateContent`/`extractText`로 옮기고 QA-13 프로브에 토스트 관련 스텁을 추가했다. **프로브를 고치는 과정에서 QA-06 결과가 그대로(최종 sections = B) 유지되는 것을 확인해, 4단계 AI 프록시 전환이 3단계 revision 보호를 깨지 않았음을 검증했다.**

`utils.js` 번들을 다시 만들지 않으면 QA-11 프로브가 옛 결과를 보여준다. 실행 순서는 기존 문서대로 esbuild 후 프로브다.

## 실행한 검사

```sh
npm run test:nutrition          # nutrition modifier tests passed
npm run test:user-storage       # PASS
npm run test:volume             # PASS (20/20)   [신규]
npm run test:nutrition-guard    # PASS (16/16)   [신규]
npm run test:ai-proxy           # PASS (10/10)   [에뮬레이터]
npm run test:delete-account     # PASS (9/9)     [에뮬레이터]
npx tsc --noEmit                # exit 0
npm run build                   # exit 0
git diff --check                # exit 0
node_modules/.bin/esbuild src/utils/utils.js --bundle --platform=node --format=esm --outfile=/tmp/context-health-qa-utils.mjs
node docs/qa/2026-09-07/isolated-probes.mjs   # exit 0
```

## 남은 5단계 범위 (미착수)

- **QA-12** 조회 상한: 홈 `limit(200)`, 코치방 `limit(20)`에 페이지네이션이 없어 오래된 기록·21번째 방이 보이지 않는다. 휴지통도 최신 200개 안에서만 찾는다.
- **QA-17** Firestore 규칙의 형식 검증 부재(소유권은 정상). 규칙 강화 시 기존 문서 호환성 확인이 필요하다.
- **QA-18** 비활성 탭·숨긴 토스트가 접근성 트리에 남는 문제.
- **QA-19** 백업·PITR·삭제 보호: 운영 콘솔 작업이라 코드로 닫을 수 없다.
- 실기기 검증 전반(키보드·안전영역·오프라인·PWA 갱신), 실제 소셜 계정 A/B E2E.

## 여전히 사람이 해야 하는 운영 작업

4단계 문서의 목록이 그대로 남아 있다. 특히 **운영 Gemini 키 폐기·교체와 함수 배포 전에는 QA-01이 운영에서 닫히지 않는다.** 이번 단계의 수정도 전부 미배포 상태다.
