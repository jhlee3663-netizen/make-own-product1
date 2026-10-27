# 스토어 출시 체크리스트 (Play Store · App Store)

2026-10-25 작성. ✅ = 코드에서 끝냄, ☐ = 직접 해야 함(콘솔·계정·기기).

## 1. 코드에서 끝낸 것

- ✅ 앱에서 서버 호출: `src/lib/native.js`의 `apiUrl()` — 앱에서는 `https://context-health-3eb84.web.app`을 앞에 붙인다. 서버 CORS에 `capacitor://localhost`(iOS) 추가·배포.
- ✅ 앱 로그인
  - Google/Apple: `@capacitor-firebase/authentication`으로 기기 로그인 창 → 토큰으로 Firebase 웹 SDK 로그인 (`LoginScreen.signInNative`).
  - 카카오/네이버: 시스템 브라우저(`@capacitor/browser`)로 열고, 기존 웹 콜백 주소로 돌아온다. `state`가 `n`으로 시작하면 웹 페이지(`main.jsx`)가 `com.contexthealth.app://oauth/...`로 앱을 다시 연다. 카카오·네이버 콘솔의 Redirect URI는 **바꿀 필요 없음**.
  - 앱에서는 `initializeAuth(indexedDBLocalPersistence)` (`src/lib/firebase.js`). 웹은 그대로 `getAuth`.
- ✅ 공유 링크(피드·초대)가 앱에서도 웹 주소로 나가게 수정.
- ✅ iOS: `PrivacyInfo.xcprivacy` 추가, URL scheme 등록, 세로 고정, 아이폰 전용(아이패드 스크린샷 불필요), 수출 규정 암호화 `false`.
- ✅ Android: 딥링크 intent-filter, 세로 고정, `allowBackup=false`(건강정보가 클라우드 백업으로 새지 않게).
- ✅ 휴지통 30일 자동 삭제 함수 `purgeTrash` (매일 04:00 KST) — 앱 안내 문구는 있었는데 실제로 지우는 코드가 없었다.
- ✅ 개인정보처리방침 보완(민감정보, 국외 이전, 소셜, 14세 미만), 이용약관 개정(시행 2026-11-01), 계정 삭제 안내 페이지 `/account-deletion.html`.

## 2. 직접 해야 할 것 — 순서대로

### A. 지금 바로 (기간이 걸리는 것)
- ☐ **Google Play 개발자 계정** ($25, 본인 인증 며칠). 개인 계정은 **테스터 12명 × 14일 비공개 테스트**를 해야 정식 출시가 열린다 → 가장 먼저.
- ☐ **Apple Developer Program** ($99/년).
- ☐ 테스터 12명 모으기 (Gmail 주소 필요).

### B. 개발 도구 설치 (이 맥에는 없음)
- ☐ Xcode (App Store) — 설치 후 `sudo xcode-select -s /Applications/Xcode.app`
- ☐ Android Studio (JDK 포함)

### C. Firebase 콘솔
- ✅ 프로젝트 설정 → 앱 추가 (2026-10-27): Android·iOS 모두 `com.contexthealth.app`으로 등록, `google-services.json`→`android/app/`, `GoogleService-Info.plist`→`ios/App/App/`, Info.plist의 `REVERSED_CLIENT_ID`까지 채웠다.
  - ☐ Xcode에서 `GoogleService-Info.plist`를 **App 타깃에 추가**(파일만 폴더에 있으면 번들에 안 들어간다)
- ☐ Android SHA-1·SHA-256 등록: 디버그 키 + 업로드 키 + **Play 앱 서명 키**(Play Console → 앱 무결성에서 복사). 없으면 Google 로그인이 `10` 오류로 실패.
- ☐ Authentication → 로그인 방법 → **Apple 사용 설정** (Apple Developer에서 Services ID·Key 생성해 입력)
- ☐ 웹 Apple 로그인 켜기: `.env`에 `VITE_ENABLE_APPLE_LOGIN=true` (Apple 설정 끝난 뒤)
- ☐ Firestore 백업: 콘솔 → Firestore → 재해 복구 → PITR 또는 매일 백업 예약
- ☐ GCP 결제 → 예산 알림 (예: 월 3만 원에서 50/90/100%)

### D. Apple Developer
- ☐ Identifiers: `com.contexthealth.app`에 **Sign in with Apple**, (푸시 쓸 거면) Push Notifications 체크
- ☐ Xcode → Signing & Capabilities: Team 선택, `+ Sign in with Apple` 추가
- ☐ Xcode에서 Swift Package 받기가 끝나면 빌드 확인 (`npx cap open ios`)

### E. 빌드와 확인
```bash
npm run build && npx cap sync
npx cap open android   # Android Studio에서 실행
npx cap open ios       # Xcode에서 실행
```
- ☐ Android 업로드 키 만들기(Android Studio → Build → Generate Signed Bundle). **키스토어 파일·비밀번호를 두 곳 이상 백업** — 잃으면 업데이트를 못 한다.
- ☐ 버전: Android `versionCode`/`versionName`(`android/app/build.gradle`), iOS `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION`. 올릴 때마다 숫자 증가.
- ☐ 실기기에서: 4가지 로그인 → 기록 작성(AI) → 수정 → 삭제 → 휴지통 복원 → 공유 링크 → 탈퇴. 로그인 창을 그냥 닫았을 때 버튼이 다시 눌리는지도.

### F. 스토어 제출 자료
- ☐ 스크린샷: iPhone 6.9"(1320×2868) / Android 폰 2장 이상 — 찍을 화면과 얹을 문구는 `docs/store_listing.md` 맨 아래
  - 원본은 **시뮬레이터나 실기기**에서 찍는다(브라우저 창 캡처는 440px이라 늘리면 글자가 뭉개진다). Xcode 시뮬레이터 iPhone 16 Pro Max가 규격이 그대로 맞는다.
  - 찍은 파일을 `store/raw/`에 `1-home.png`, `2-diet.png` … 식으로 넣고 `python3 scripts/make_store_screenshots.py store/raw` → `store/screenshots/{ios,play}/`에 문구까지 얹혀서 나온다. 문구는 스크립트 맨 위 `CAPTIONS`에서 고친다.
- ✅ 아이콘·그래픽 (2026-10-26) — `store/` 폴더에 있다: `app-store-icon-1024.png`(iOS, 투명 X), `play-icon-512.png`, `play-feature-1024x500.png`. 앱 안의 런처 아이콘(Android mipmap)·iOS 앱 아이콘·스플래시도 지금 로고(그라데이션)로 다시 만들었다. 다시 만들 일이 있으면 `LOGO/기본 로고.png`(블롭 마스크)와 `#3aa0ff → #f79fff` 그라데이션으로 뽑는다.
- ☐ 개인정보처리방침 URL: `https://context-health-3eb84.web.app/privacy-policy.html`
- ☐ 계정 삭제 URL(Play 필수): `https://context-health-3eb84.web.app/account-deletion.html`
- ☐ 등록 문구(앱 이름·설명·키워드·심사 메모): `docs/store_listing.md`에 다 써 뒀다. 콘솔에 붙여 넣기만 하면 된다.
- ☐ Play: 데이터 보안 양식, **건강 앱 신고**, 콘텐츠 등급, 타깃 연령(14세 이상)
- ☐ App Store: 개인정보 라벨(건강·피트니스·이메일·이름·사용자 ID·사용자 콘텐츠·충돌 데이터, 모두 "추적 안 함"), 심사용 데모 계정, 심사 메모에 "AI 영양 추정은 참고용"
- ☐ 지원 URL·연락 이메일

## 3. 아직 남은 코드 작업 (UI라 시안 먼저)

- ✅ **건강정보 별도 동의 화면** (2026-10-26) — `src/components/screens/ConsentScreen.jsx`. 로그인 직후 온보딩 앞에서 뜨고, 전체 동의 + 약관·개인정보·건강정보 3개(모두 필수, 각각 전문 보기). 동의 내용은 `users/{uid}.consent`(항목·버전·시각)에 저장하고, 서버에 `consent.health`가 없으면 다시 받는다.
- ✅ **게시물·댓글 신고 기능** (2026-10-26) — 피드 더보기 → 신고하기, 댓글 길게 누르기 → 신고하기. 사유 7가지(기타는 직접 입력). 서버 `report` 액션이 `reports/{reporterUid}_{key}`에 남기고, 신고한 사람 피드에서는 `users/{uid}/prefs/feedHidden`으로 즉시 가린다. 약관 문구도 앱 내 신고로 수정.
  - ☐ 신고 들어온 것을 보는 방법: 지금은 Firestore 콘솔의 `reports` 컬렉션을 직접 봐야 한다(`status: 'open'`). 알림이 필요하면 나중에.
- ◐ **App Check** (2026-10-27 설정 완료) — reCAPTCHA Enterprise API를 켜고 사이트 키 `context-health-web`(도메인 `context-health-3eb84.web.app`)을 만들어 Firebase App Check 웹 앱에 등록했다. 키는 `.env`의 `VITE_RECAPTCHA_SITE_KEY`에 넣어 뒀다. **아직 배포 전**이라 실제로는 켜지지 않았다 — `npm run build && npx firebase-tools deploy --only hosting` 후 콘솔에서 트래픽을 지켜보고 '강제'로 바꾼다. 자동 배포(GitHub Actions)를 쓰면 저장소 secret에도 같은 값을 넣어야 한다. 과금은 월 10,000건까지 무료. 콘솔에서 처음에는 '모니터링'으로 두고, 정상 트래픽만 들어오는 것을 확인한 뒤 '강제'로 바꾼다. 앱(웹뷰)은 reCAPTCHA가 맞지 않아 빼 두었다 — 네이티브까지 하려면 Play Integrity·App Attest 플러그인이 따로 필요하다.
- ◐ **앱 푸시 알림** (2026-10-26) — `@capacitor-firebase/messaging`으로 코드 완료(`src/lib/push.js`, `src/App.jsx`). 앱에서도 FCM 토큰을 받아 웹과 같은 `users/{uid}/pushTokens`에 저장하므로 서버는 그대로다. 안드로이드 `POST_NOTIFICATIONS` 권한도 넣었다. 남은 것:
  - ☐ `google-services.json` / `GoogleService-Info.plist` 넣기 (없으면 토큰을 못 받는다)
  - ☐ iOS: Apple Developer에서 **APNs 인증 키(.p8)** 만들어 Firebase 콘솔 → 클라우드 메시징에 업로드, Xcode에서 **Push Notifications** + **Background Modes > Remote notifications** 추가
  - ☐ 실기기에서 친구 1명 만든 뒤 알림 권한 → 박수/댓글 알림 수신 확인
- ✅ 마이페이지 "Claude 연결"은 앱에서 숨김 (웹에서만)
