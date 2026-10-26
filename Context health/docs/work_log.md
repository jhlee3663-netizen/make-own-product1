# 작업 로그 (Context Health)

> Codex 구현 → Claude Code 리뷰 PASS 시 자동 기록. FAIL은 `docs/fail_log.md` 참고.

---

## 2026-10-26 - 스토어 준비: 아이콘·등록 문구·App Check·앱 푸시
- 결과: 코드 PASS (`npm run build`), 콘솔 설정이 있어야 켜지는 항목은 미완
- 변경 파일: 신규 `docs/store_listing.md`, `store/{app-store-icon-1024,play-icon-512,play-feature-1024x500}.png` / 수정 `src/lib/{firebase,push}.js`, `src/App.jsx`, `android/app/src/main/AndroidManifest.xml`, `ios/App/App/Info.plist`, android mipmap·drawable, iOS AppIcon·Splash, `package.json`, `docs/store_release.md`
- 아이콘·스플래시: 네이티브 아이콘이 예전 3D 아이콘으로 남아 있어 지금 로고(그라데이션 블롭)로 다시 만들었다. 블롭 마스크는 `LOGO/기본 로고.png`의 알파를 쓰고, 그라데이션은 `SplashScreen.jsx`와 같은 `#3aa0ff → #f79fff`로 그려서 앱 스플래시와 네이티브 스플래시가 이어지게 했다. 런처 아이콘은 블롭을 가운데 68%로 두어 둥근 아이콘에서 잘리지 않게 했다.
- 스토어 문구: `docs/store_listing.md`에 Play(앱 이름·간단한 설명·자세한 설명)와 App Store(부제목·프로모션·키워드·심사 메모), 데이터 보안 양식과 개인정보 라벨 답변안, 스크린샷 목록까지 정리했다. 심사 메모에 AI 영양 수치는 추정값이고 의료 조언이 아니라는 점, 신고·차단 위치를 적었다.
- App Check: 웹만 `initializeAppCheck` + reCAPTCHA Enterprise를 넣고 `VITE_RECAPTCHA_SITE_KEY`가 있을 때만 켜지게 했다. 키가 없으면 아무 일도 하지 않는다. 앱(웹뷰)은 reCAPTCHA가 맞지 않아 뺐다.
- 앱 푸시: `@capacitor-firebase/messaging`을 넣고 `push.js`를 웹/앱 두 갈래로 고쳤다. 앱도 FCM 토큰을 받아 같은 `users/{uid}/pushTokens`에 저장하므로 서버(`notify.js`)는 그대로다. 권한 확인을 `Notification.permission` 직접 참조에서 `pushPermission()`으로 바꿨고(앱에는 그 전역이 없다), 알림을 눌러 열었을 때도 알림 목록으로 가게 `onNativePushOpen`을 붙였다. 안드로이드 `POST_NOTIFICATIONS`, iOS `UIBackgroundModes: remote-notification`도 넣었다.
- 미검증: App Check와 푸시 모두 콘솔 키(reCAPTCHA 사이트 키, `google-services.json`/`GoogleService-Info.plist`, APNs .p8)가 있어야 실제로 켜진다. 실기기 확인 전이다.

## 2026-10-26 - 건강정보 별도 동의 화면 · 게시물·댓글 신고 기능
- 결과: PASS (운영 배포 `functions:social` + hosting, 사용자 확인)
- 변경 파일: 신규 `src/components/screens/ConsentScreen.jsx`, `src/components/social/ReportSheet.jsx` / 수정 `src/App.jsx`, `src/components/screens/MyPageScreen.jsx`, `src/components/social/{FeedScreen,DetailScreens}.jsx`, `functions/social/index.js`, `docs/store_release.md`
- 동의 화면: 스토어 심사 전 필수였던 민감정보(건강정보) 별도 동의. 로그인 직후 온보딩 **앞**에 뜨고 전체 동의 + 약관·개인정보·건강정보 3개(모두 필수, 각각 전문 보기)를 받는다. 건강정보 전문(`HEALTH_CONTENT`)에 수집 항목·목적·보유 기간·국외 이전·공개 범위·거부 권리를 적었다. 동의 결과는 `users/{uid}.consent`(항목·`version`·`agreedAt`)에 저장하고, **서버에 `consent.health`가 없으면 기기 캐시가 있어도 다시 받는다**(기존 계정도 한 번 거친다).
- 신고: App Store 1.2 · Play 사용자 생성 콘텐츠 요건. 피드 더보기 → '신고하기', 댓글 길게 누르기 → '신고하기'(남의 댓글도 메뉴가 열리도록 조건 수정). 사유 7가지에 '기타'는 직접 입력. 서버 `report` 액션이 `reports/{reporter}_{key}`에 `status: 'open'`으로 남기고, 신고한 사람 피드에서는 `users/{uid}/prefs/feedHidden`으로 즉시 가린다(`feed()`가 랭킹 전에 걸러낸다). 자기 글은 신고할 수 없다.
- 약관 문구도 이메일 신고 → 앱 내 신고 버튼으로 고쳤다.
- 검증: `npm run build` 통과, 운영 배포 후 동의 화면(표시·전체 동의·재접속 시 미표시)과 게시물 신고(목록에서 제거)를 사용자가 확인했다.
- 남음: 댓글 신고는 다른 계정이 없어 미확인. 신고 접수 확인은 당분간 Firestore 콘솔 `reports` 컬렉션을 직접 본다(알림 없음).

## 2026-10-07 - Cloud Functions Node 22 전환
- 결과: PASS (운영 배포, 커밋 `df0c418`)
- 변경 파일: `functions/package.json` (`engines.node` 20 → 22)
- 요약: Node 20 런타임이 2026-10-30에 종료되어 미리 올렸다. `firebase-functions ^6`, `firebase-admin ^13`은 Node 22를 지원해 코드 변경은 없다. 함수 5개(`aiGenerate`, `socialAuth`, `deleteAccount`, `mcp`, `sentryWebhook`)를 `npx firebase deploy --only functions`로 배포했다.
- 검증: 운영 앱에서 카카오·네이버 로그인, 식단·운동 AI 분석 정상(사용자 확인). 로컬은 mcp-parse 59/59만 실행했다.
- 미검증: 에뮬레이터가 필요한 ai-proxy·mcp-server·delete-account 검사는 에뮬레이터를 띄우지 않아 돌리지 못했다. Claude 연결(`mcp`)은 배포 후 실제 연결 확인 전이다.

## 2026-10-07 - 식품 검색 오류 수정 · 홈 화면 개편 · 자동 배포 보완
- 결과: PASS (운영 배포, 커밋 `8c1e1bd`)
- 변경 파일: `src/lib/aiClient.js`, `src/utils/nutritionLookup.js`, `functions/index.js`, `src/lib/homeSummary.js`, 신규 `src/components/home/{DietDay,HomeHeader,WeightInputRow,WorkoutSummary}.jsx`, `HomeScreen.jsx`, `DietDetailScreen.jsx`, `WorkoutMemoScreen.jsx`, `DietCard.jsx`, `WorkoutCard.jsx`, `App.jsx`, `index.css`, `CLAUDE.md`, `.github/workflows/firebase-hosting-{merge,pull-request}.yml`
- 식품 검색 오류: AI 답이 코드블록에 싸여 오거나 객체가 여러 개 이어져 오면 "JSON 파싱 실패"로 끝났다. `nutritionLookup.js`가 코드블록 표시를 먼저 지우고, 객체가 여러 개면 첫 객체만 쓰도록 고쳤다.
- AI 응답 공통 처리: `aiClient.js`에 `parseAiJson`(앞뒤에 다른 말이 붙어도 JSON만 꺼냄)과 `aiErrorMessage`(로그인 만료·요청 과다·길이 초과·지연·네트워크·읽기 실패를 한글 문구로 안내)를 추가했다. 영어 오류 원문은 화면에 내보내지 않는다.
- 서버: `sentryWebhook`이 서명(`sentry-hook-signature`, HMAC-SHA256)을 확인한다. `SENTRY_CLIENT_SECRET`이 없으면 모든 요청을 거절한다. 허용 출처에 안드로이드 앱(`https://localhost`)을 추가했다.
- 홈 화면: 헤더·체중 입력·운동 요약·식단 하루 묶음을 `src/components/home/`으로 나누고 요약 계산을 `homeSummary.js`로 옮겼다. 모션·UI 값은 `docs/motion_and_ui_notes.md` 참고.
- 자동 배포: 워크플로의 작업 폴더를 `Context health`로 맞추고 빌드에 카카오·네이버·Sentry 키를 넘기도록 했다. 개인 저장소에 secret 3개를 추가했다. 상세는 `docs/deploy_notes.md`.
- 검증: 푸시 뒤 Firebase Hosting 자동 배포 성공, 운영 주소 200 응답.
- 남음: 푸시마다 실패하는 "Sync to Org" 워크플로 처리(삭제 또는 `ORG_TOKEN` 재발급).

## 2026-10-02 - Claude 커넥터(MCP) 조회 서버 v1
- 결과: 로컬 PASS (`demo-context-health` 에뮬레이터, 운영 미배포·claude.ai 실제 연결 미검증·신규 화면 3곳 육안 미확인)
- 변경 파일: 신규 `functions/mcp/{index,tools,parse,oauth,readonly}.js`, `functions/scripts/seed-inbody.js`, `src/lib/{bodyLogs,mcpConnection}.js`, `MorningWeightRow.jsx`, `McpAuthorizeScreen.jsx`, `scripts/test-mcp-{parse,server}.mjs` / 수정 `functions/index.js`, `firebase.json`, `firestore.rules`, `vite.config.js`, `App.jsx`, `HomeScreen.jsx`, `MyPageScreen.jsx`, `WorkoutMemoScreen.jsx`, `scripts/test-firestore-rules.mjs`
- 요약: claude.ai 커스텀 커넥터가 `/mcp`로 본인 기록을 조회한다. 도구는 조회 6개뿐(`list_exercises`, `get_workouts`, `get_diet`, `get_morning_weight`, `get_body_composition`, `get_profile`)이고 도구 코드에는 get만 되는 Firestore 창구를 넘긴다. 세트는 원문과 파싱값을 함께 주며 종목명은 통합하지 않는다. OAuth는 PKCE 필수, uid 허용 목록(`MCP_ALLOWED_UIDS` secret)을 인가·교환·사용 시점마다 확인, 액세스 1시간·리프레시 30일 회전, 토큰은 해시 저장, 마이페이지에서 연결 해제. 앱에는 아침 공복 체중 입력 한 줄(`users/{uid}/bodyLogs/mw_날짜`)과 운동 전 식사 칩(`logs.preWorkoutMeal`)을 추가했다. 인바디는 시드 스크립트로만 넣는다. 탈퇴 시 `bodyLogs`·MCP 토큰도 삭제한다.
- 검증: mcp-parse 59/59, mcp-server 67/67, firestore-rules 36/36, delete-account 9/9, volume 20/20, `npm run build`.
- 남음: `MCP_ALLOWED_UIDS` 설정 후 규칙·함수·Hosting 배포, claude.ai 등록과 실제 기록으로 파싱 검증, 인바디 5건 시드.

## 2026-09-29 - 운영 계정 전체 여정 · 회원 탈퇴 검증
- 결과: PARTIAL PASS (핵심 사용자 여정·탈퇴 PASS, QA-22 신규 P2)
- 운영 검증: 삭제 가능한 Google 테스트 계정으로 로그인, 인증 AI 응답과 대화 유지, 운동 1건·식단 1건 저장, 새로고침, 로그아웃·재로그인 후 서버 데이터 재로드를 확인했다.
- 탈퇴 검증: 함수 결과는 `logs 2`, `coachRooms 1`, `user 1`, `auth true`였고 직접 대조에서 Auth·프로필·건강 기록·코치방이 모두 0이었다.
- 신규 발견: `aiUsage/{uid}`와 `accountDeletions/{uid}`가 남아 QA-22(P2)로 기록했다. 테스트 계정의 잔여 문서는 관리자 API로 정리하고 404를 재확인했다. 다른 사용자 데이터와 제품 코드는 수정하지 않았다.
- 남음: QA-22 제품 수정·새 계정 재검증, Kakao·Naver 실계정, iPhone/Android 설치형 PWA·오프라인·키보드.
- 상세: `docs/qa/2026-09-07/STEP_10_PRODUCTION_ACCOUNT_E2E.md`

## 2026-09-11 - 운영 배포 · Gemini 키 교체
- 결과: PARTIAL PASS (배포·키 교체·PC 렌더링 PASS, 전용 운영 계정/실기기 검증 대기)
- 운영 적용: `uid + deletedAt` 인덱스 READY 후 Firestore 규칙, `aiGenerate`·`deleteAccount`, Hosting 순으로 배포했다. `/api/ai-generate`와 `/api/delete-account` 무인증 요청은 401을 반환한다.
- 키 처리: 새 프로젝트 제한 키를 `GEMINI_KEY` Secret version 1로 연결했고, 이전 공개 키를 삭제한 뒤 로컬 `VITE_GEMINI_KEY`도 제거했다. 신규 키에서 2.5 모델이 404여서 실제 호출 가능한 `gemini-3.6-flash`와 `thinkingLevel: minimal`로 수정·재검증했다.
- 운영 확인: 새 JS/CSS와 no-store 셸, 새 Chrome PC의 로고·한글·숫자·단위·차트 정상 표시를 확인했다. 실제 사용자 기록은 변경하지 않았다.
- 남음: 전용 운영 계정의 인증 AI·탈퇴, 실제 소셜 로그인, iOS/Android 설치형 PWA. Functions Node.js 20은 2026-10-30 종료 경고에 따라 런타임 업그레이드가 필요하다.
- 상세: `docs/qa/2026-09-07/STEP_9_PRODUCTION_DEPLOYMENT.md`

## 2026-09-10 - QA-19 운영 복구 보호 · 식단 오프라인 E2E
- 결과: PASS (운영 Firestore 보호 설정·새 DB 복원, 로컬 Chrome·에뮬레이터)
- 운영 적용: `(default)`에 일일 백업 14일, PITR 7일, 삭제 보호를 활성화했다. 첫 백업을 `qa-restore-20260910`으로 약 10분 13초 만에 복원했고, 백업 시점 원본과 복원본의 `users` 5·`logs` 98·`coachRooms` 8, 해시 UID별 기록 분포, 인덱스 2·TTL override 0이 정확히 일치했다. 원본 문서와 앱 코드는 수정하지 않았다.
- 식단 검증: 오프라인 저장 timeout 뒤 탭 종료, Auth·Firestore export/import 재시작, 같은 UID의 초안 복원, 온라인 재시도에서 정확히 1건 저장, 성공 뒤 초안 삭제까지 통과했다.
- 상세: `docs/qa/2026-09-07/STEP_7_OFFLINE_PWA_RECOVERY.md`, `STEP_8_QA19_BACKUP_EXECUTION_PLAN.md`. 2026-09-11 사용자 승인 뒤 검증용 복원 DB만 삭제했고, 운영 `(default)`의 PITR·삭제 보호·일일 백업 일정이 유지되는 것을 재확인했다.

## 2026-09-09 - QA-12 조회 상한 · QA-17 Firestore 형식 검증 · QA-18 접근성
- 결과: PASS (로컬·`demo-context-health` 에뮬레이터·Chrome, 운영 미배포)
- 변경 파일: `HomeScreen.jsx`, `MyPageScreen.jsx`, `userStore.js`, `CoachListScreen.jsx`, `App.jsx`, `Toast.jsx`, `firestore.rules`, `firestore.indexes.json`, `package.json`, 신규 pagination/rules 검사와 QA 증거 문서
- 요약: 홈 200건 cursor 더 보기, `deletedAt` 기준 30일 휴지통과 복원, 코치방 최근 100개 및 상한 안내를 구현했다. logs 규칙은 신규 문서 형식/범위/크기를 검증하면서 레거시 문서의 미변경 과거 값은 허용한다. 비활성 탭을 `inert`/`aria-hidden`으로 제외하고 숨은 토스트를 DOM에서 제거했다. pagination 7/7, rules 18/18, AI proxy 10/10, delete-account 9/9 및 기존 전체 회귀·빌드·실제 Chrome 검증 통과. 상세: `docs/qa/2026-09-07/STEP_6_PAGINATION_RULES_ACCESSIBILITY.md`. 운영 인덱스·규칙·앱·함수 배포 및 운영 데이터 변경은 수행하지 않음.

## 2026-09-03 - 식단 화면: 내 음식 등록 기능 + 상단 여백 버그
- 결과: PASS
- 변경 파일: src/components/screens/DietDetailScreen.jsx
- 요약: 헤더 ⋮ 왼쪽에 + 버튼과 "내 음식 등록" 바텀시트 추가, 기존 `upsertCustomFood()` 재사용(신규 저장 로직 없음, `sections` 미변경), 음식명 없음/kcal≤0 시 저장 비활성화 확인. sticky 축약바를 `marginBottom: -52`로 자기 공간을 스스로 접도록 바꿔 이중 여백(52px negative-margin + paddingTop 52 두 겹치기) 버그 제거 — `docs/fix.md` 지시대로 원인(이중 상쇄 트릭)까지 고쳤음. `npm run build`/`npm run test:nutrition` 로컬 재확인, 배포된 Firebase Hosting JS 해시가 로컬 빌드와 완전히 동일함을 curl+md5로 직접 대조해 실서비스 반영 확인.

## 2026-07-08 - 유산소(클라이밍/인터벌) 볼륨 미반영 대응 (재작업)
- 결과: PASS
- 변경 파일: src/utils/utils.js, src/components/screens/HomeScreen.jsx, src/components/screens/WorkoutMemoScreen.jsx, src/components/dashboard/WorkoutCard.jsx, src/components/dashboard/WeeklyVolumeChart.jsx
- 요약: kg 볼륨이 없는 유산소 기록(클라이밍/인터벌 등)을 시간(cardioMinutes) 기준으로 별도 파싱·표시하도록 구현. 1차 시도에서 거리(m)를 분으로 오인식하는 버그와 헬퍼 함수 3중 복제, 범위 밖 변경(HomeScreen 과부하 비교 이식, aiStatus 흐름 변경, pressScale/에러 메시지 변경)이 있어 FAIL 처리했고, 재작업에서 전부 수정·utils.js로 공통 추출 확인 후 PASS.
