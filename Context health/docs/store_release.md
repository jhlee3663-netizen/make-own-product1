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
- ☐ 프로젝트 설정 → 앱 추가: **Android** `com.contexthealth.app`, **iOS** `com.contexthealth.app`
  - `google-services.json` → `android/app/`
  - `GoogleService-Info.plist` → `ios/App/App/` (Xcode에서 App 타깃에 추가)
  - plist의 `REVERSED_CLIENT_ID` 값을 `ios/App/App/Info.plist`의 `REPLACE_WITH_REVERSED_CLIENT_ID` 자리에 넣기
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
- ☐ 스크린샷: iPhone 6.9"(1320×2868) / Android 폰 2장 이상
- ☐ 아이콘 1024×1024 (iOS, 투명 X), 512×512 (Play), Play 그래픽 이미지 1024×500
- ☐ 개인정보처리방침 URL: `https://context-health-3eb84.web.app/privacy-policy.html`
- ☐ 계정 삭제 URL(Play 필수): `https://context-health-3eb84.web.app/account-deletion.html`
- ☐ Play: 데이터 보안 양식, **건강 앱 신고**, 콘텐츠 등급, 타깃 연령(14세 이상)
- ☐ App Store: 개인정보 라벨(건강·피트니스·이메일·이름·사용자 ID·사용자 콘텐츠·충돌 데이터, 모두 "추적 안 함"), 심사용 데모 계정, 심사 메모에 "AI 영양 추정은 참고용"
- ☐ 지원 URL·연락 이메일

## 3. 아직 남은 코드 작업 (UI라 시안 먼저)

- ✅ **건강정보 별도 동의 화면** (2026-10-26) — `src/components/screens/ConsentScreen.jsx`. 로그인 직후 온보딩 앞에서 뜨고, 전체 동의 + 약관·개인정보·건강정보 3개(모두 필수, 각각 전문 보기). 동의 내용은 `users/{uid}.consent`(항목·버전·시각)에 저장하고, 서버에 `consent.health`가 없으면 다시 받는다.
- ✅ **게시물·댓글 신고 기능** (2026-10-26) — 피드 더보기 → 신고하기, 댓글 길게 누르기 → 신고하기. 사유 7가지(기타는 직접 입력). 서버 `report` 액션이 `reports/{reporterUid}_{key}`에 남기고, 신고한 사람 피드에서는 `users/{uid}/prefs/feedHidden`으로 즉시 가린다. 약관 문구도 앱 내 신고로 수정.
  - ☐ 신고 들어온 것을 보는 방법: 지금은 Firestore 콘솔의 `reports` 컬렉션을 직접 봐야 한다(`status: 'open'`). 알림이 필요하면 나중에.
- ☐ App Check (Play Integrity / App Attest / 웹 reCAPTCHA) — 콘솔 키 발급 후 붙이기
- ☐ 앱 푸시 알림 (`@capacitor/push-notifications`, iOS는 APNs 키 업로드) — 지금 웹 푸시는 앱에서 동작하지 않음
- ✅ 마이페이지 "Claude 연결"은 앱에서 숨김 (웹에서만)
