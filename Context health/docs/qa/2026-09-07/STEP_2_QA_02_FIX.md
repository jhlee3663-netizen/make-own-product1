# 2단계 QA-02 계정별 로컬 데이터 분리

2026-09-07. QA-02(P1)의 수정을 로컬 코드에 적용했다. Firebase 설정·운영 데이터는 변경하지 않았고 배포하지 않았다.

## 결과

| 항목 | 상태 | 증거 |
|---|---|---|
| A와 B의 로컬 개인 데이터 분리 | 로컬 회귀 통과 | 동일 `diet_custom_foods`에 서로 다른 값을 저장해 각 UID가 자신의 값만 읽음 |
| A 로그아웃이 B 캐시를 삭제하는지 | 로컬 회귀 통과 | `clearUserStorage('user-A')` 후 B의 식단 캐시 유지 |
| 소유자 불명 레거시 캐시가 B에게 귀속되는지 | 로컬 회귀 통과 | 캐시 UID=A, 실제 Auth UID=B 조건에서 레거시 최근 식단을 B에게 이전하지 않음 |
| 기존 사용자의 레거시 캐시 보존 | 로컬 회귀 통과 | 캐시 UID와 검증된 Auth UID가 같을 때만 UID 저장소로 1회 이전. 이미 있는 scoped 값은 덮어쓰지 않음 |
| 공급자 콜백과 Auth 리스너 순서 역전 | 로컬 수정·정적 회귀 통과 | 공급자 성공 콜백은 `auth_user`/React user를 직접 바꾸지 않고 Firebase `onAuthStateChanged`만 계정 전환을 확정 |
| 동일 브라우저 두 탭의 A/B namespace | 브라우저 fixture 통과 | 첫 탭에서 A 레거시 이전과 B 저장 후 두 번째 탭에서 A/B 값 분리, 소유자 불명 캐시 미이전 확인 |
| Firebase Auth·Firestore 에뮬레이터 A↔B 전환·로그아웃 | 로컬 E2E 통과 | 최초 검사에서 다른 탭이 A 화면을 유지하는 추가 결함 발견. storage 신호 재초기화 적용 후 A→B·B→A 모두 새 계정 이름·체중으로 자동 전환, 한 탭 로그아웃 시 두 탭 모두 로그인 화면으로 이동 |
| 식단·코칭·프로필·목표·코칭방 전역 키 제거 | 정적 검사 통과 | `auth_user`를 제외한 개인 키의 직접 `localStorage` 접근이 `src` 범위에 남지 않음 |
| 프론트엔드 빌드 | 통과 | Vite 2,242 modules transform, PWA 생성 완료. 기존 대용량 chunk 경고는 유지 |

QA-02는 **로컬 코드 수정, Node 회귀, Chrome 두 탭 fixture, Firebase Auth·Firestore 에뮬레이터 A/B 전환 E2E 통과** 상태다. 실제 Google 테스트 계정 A/B와 모바일/PWA를 사용한 E2E 및 운영 반영은 수행하지 않았으므로 `운영 재검증 통과`나 `배포 완료`로 표시하지 않는다. 에뮬레이터 결과: [evidence/firebase-emulator-e2e.json](evidence/firebase-emulator-e2e.json).

## 변경 구조

- [`src/lib/userStorage.js`](../../../src/lib/userStorage.js): `context_health_user:{encoded uid}:{logical key}` 규칙으로 읽기·쓰기·삭제를 집중화했다.
- [`src/App.jsx`](../../../src/App.jsx): 인증을 확인하기 전에 개인 캐시를 React state로 올리지 않는다. UID가 바뀌면 프로필·온보딩·목표·코칭방 state를 새 UID의 scoped 캐시로 전체 교체한다.
- [`DietDetailScreen.jsx`](../../../src/components/screens/DietDetailScreen.jsx): `diet_custom_foods`, `diet_recent_foods`를 `uid`로 분리했다.
- [`HomeScreen.jsx`](../../../src/components/screens/HomeScreen.jsx), [`AICoachScreen.jsx`](../../../src/components/screens/AICoachScreen.jsx): 코칭 insight와 dismissed 시각을 `user.uid`로 분리했다.
- [`MyPageScreen.jsx`](../../../src/components/screens/MyPageScreen.jsx): 로그아웃 시 현재 UID namespace와 잔존 레거시 개인 키를 정리한다.
- [`RoutineSheet.jsx`](../../../src/components/common/RoutineSheet.jsx): 주간 루틴도 UID 저장소를 사용하도록 같은 경계에 포함했다.
- [`firebase.js`](../../../src/lib/firebase.js), [`firebase.json`](../../../firebase.json): `VITE_USE_FIREBASE_EMULATORS=true`인 로컬 실행에서만 Auth·Firestore 에뮬레이터에 연결한다.
- [`fixtures/qa02-browser.html`](fixtures/qa02-browser.html): 같은 origin의 두 Chrome 탭에서 A/B namespace와 소유자 불명 레거시 처리 결과를 재검사한다.
- [`fixtures/firebase-emulator-user.html`](fixtures/firebase-emulator-user.html): demo 에뮬레이터에 합성 A/B 계정과 서로 다른 프로필·개인 캐시를 준비한다. 환경변수가 없으면 실행을 거절한다.

추가 검토에서 공급자 로그인 성공 콜백이 `auth_user`를 먼저 새 UID로 덮으면, Firebase 리스너가 구버전 전역 캐시의 소유자를 새 사용자로 오판할 수 있는 순서 위험을 발견했다. `App.jsx`의 콜백은 더 이상 사용자 상태나 캐시 기준을 직접 바꾸지 않는다. 인증 확정, 레거시 소유자 비교, React state 교체는 Firebase 인증 리스너 한 경로에서만 수행한다.

에뮬레이터의 첫 실제 두 탭 시험에서는 첫 탭이 B로 바뀐 뒤에도 두 번째 탭이 A의 이름과 체중을 계속 표시했다. 새로고침하면 B가 표시되어 인증 저장소와 화면 state의 불일치로 확인했다. 다른 탭의 `auth_user` 변경을 감지해 앱을 재초기화하고, 로그아웃 시 sign-out이 끝난 뒤 캐시 신호를 지우도록 순서를 수정했다. 같은 Chrome에서 A→B와 B→A를 반복해 이전 계정 표시가 남지 않음을 확인했다.

수정 후 A 안정 상태에서 B 준비를 시작한 별도 측정에서는 B fixture 완료가 540ms, 두 번째 탭의 B 화면 전환이 770ms에 관찰됐다. 단일 로컬 관찰값이므로 성능 보장으로 해석하지 않는다.

## 레거시 데이터 처리

1. Firebase가 확인한 UID와 기존 `auth_user.uid`가 같으면 기존 전역 개인 캐시를 해당 UID namespace로 이전한다.
2. 같은 logical key의 scoped 값이 이미 있으면 기존 scoped 값을 유지한다.
3. UID가 다르거나 소유자를 확인할 수 없으면 새 사용자에게 이전하지 않고 레거시 키를 정리한다.
4. `theme`처럼 개인 데이터로 분류하지 않은 전역 설정은 정리 대상에서 제외한다.

## 회귀 절차

```sh
npm run test:user-storage
npm run test:nutrition
npx tsc --noEmit
npm run build
```

Firebase 에뮬레이터 E2E는 별도 터미널에서 아래처럼 실행했다. `demo-` 프로젝트 ID와 SDK emulator 연결을 함께 사용해 미에뮬레이트 서비스 접근을 차단했다.

```sh
npx -y firebase-tools@latest emulators:start --only auth,firestore --project demo-context-health
VITE_USE_FIREBASE_EMULATORS=true VITE_FIREBASE_PROJECT_ID=demo-context-health npm run dev -- --host 127.0.0.1 --port 5177
```

실행 결과:

- `user-storage regression: PASS`
- `nutrition modifier tests passed`
- `npx tsc --noEmit`: exit 0
- `npm run build`: exit 0
- `git diff --check`: exit 0
- Chrome 탭 1 `SETUP PASS`, 동일 origin 탭 2 `INSPECT PASS` (6개 브라우저 assertion)
- Firebase demo 프로젝트 Auth·Firestore 에뮬레이터의 A→B·B→A 두 탭 자동 전환과 한 탭 로그아웃 전파 `PASS`

## 남은 재검증

1. 비운영 Firebase에서 A의 내 음식·최근 음식·코칭 insight를 만든다.
2. logout으로 B로 전환하고 B의 식단 추가 시트·홈·AI prompt에 A 내용이 없는지 확인한다.
3. logout 없이 Firebase Auth 계정이 A→B로 바뀌 조건과 Firestore sync `permission-denied`를 주입한 조건을 반복한다.
4. 실제 Google/Kakao/Naver 공급자 세션과 모바일/PWA에서 한 탭 logout 및 계정 전환을 반복한다. 로컬 에뮬레이터 결과만으로 실제 공급자 전환을 통과 처리하지 않는다.
