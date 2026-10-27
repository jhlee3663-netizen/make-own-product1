# Context Health 배포 노트

2026년 10월 초에 배포 경로를 정리하면서 확인한 것들을 모았다.
배포 방식이나 키가 바뀌면 이 문서도 같이 고친다.

---

## 1. 저장소 구조

- git 루트는 상위 폴더 `AI 작업물`이고, 앱은 그 안의 `Context health/`에 있다. 워크플로는 루트의 `.github/workflows/`에 있다.
- 자동 배포가 도는 저장소는 개인 저장소 `jhlee3663-netizen/make-own-product1`이다.

| 리모트 | 저장소 | 용도 |
|---|---|---|
| `personal` | `jhlee3663-netizen/make-own-product1` | 자동 배포가 도는 곳 |
| `origin` | `BF-D-challenge/2nd-ai-builder-lee-jonghyuk` | `main`의 기본 업스트림 |
| `org`, `team` | `BF-D-challenge/make-own-product1` | 조직 쪽 사본 |

- `personal`은 SSH 주소로 등록돼 있는데 이 맥에서는 SSH 접속이 실패한다. HTTPS 주소로 직접 푸시한다.

```bash
cd "/Users/jonghyeoklee/Documents/AI 작업물"
git push https://github.com/jhlee3663-netizen/make-own-product1.git main
```

- 프로젝트가 iCloud(`~/Documents`) 안에 있어 git이 느리다. 푸시가 "Counting objects"에서 몇 분 멈춘 것처럼 보여도 기다리면 끝난다.

---

## 2. 무엇이 자동이고 무엇이 수동인가

> **2026-10-27: 자동 배포를 없앴다. 이제 전부 수동이다.**
> 조직 저장소(`origin`)에 푸시하면 워크플로가 거기서도 도는데, 그쪽에는 시크릿이
> `VITE_KAKAO_REST_API_KEY`·`VITE_NAVER_CLIENT_ID` 둘뿐이라 `firebaseServiceAccount`가
> 없어 배포 단계에서 실패했다. 더 나쁜 건 **빌드 단계는 시크릿이 없어도 통과**한다는 점이다.
> 서비스 계정 키만 넣어 고치면 Firebase 설정이 빈 깨진 빌드가 올라간다.
> 1인 개발이고 배포 빈도도 낮아 `firebase-hosting-{merge,pull-request}.yml`을 지우고
> 수동 배포만 쓴다. 다시 켜려면 조직 저장소에 시크릿 9개(VITE_FIREBASE_* 6개,
> VITE_GEMINI_KEY, VITE_SENTRY_DSN, VITE_RECAPTCHA_SITE_KEY는 공개값이라 워크플로에 직접)와
> 서비스 계정 비공개 키를 넣어야 한다.

| 대상 | 방법 |
|---|---|
| 화면(Hosting) | 수동 (`npm run build && npx firebase-tools deploy --only hosting`) |
| 서버(Cloud Functions) | 수동. 푸시해도 배포되지 않는다 |
| Firestore 규칙·인덱스 | 수동 |

```bash
cd "/Users/jonghyeoklee/Documents/AI 작업물/Context health"
npx firebase deploy --only functions      # 서버
npm run deploy                            # 화면을 손으로 배포할 때
```

`functions/` 아래를 고쳤으면 푸시와 별개로 함수 배포를 꼭 한다.

---

## 3. 워크플로 4개

| 파일 | 이름 | 하는 일 | 상태 |
|---|---|---|---|
| `firebase-hosting-merge.yml` | Deploy to Firebase Hosting on merge | `main` 푸시 시 운영 배포 | 정상 |
| `firebase-hosting-pull-request.yml` | Deploy to Firebase Hosting on PR | PR마다 미리보기 배포 | 정상 |
| `deploy.yml` | Deploy to Vercel | `main` 푸시 시 Vercel 배포 | — |
| `main.yml` | Sync to Org | 조직 저장소로 강제 푸시 | 2026-10-07 푸시에서 실패 |

- Firebase 워크플로 2개는 작업 폴더와 `entryPoint`가 `Context health`여야 한다. 루트 기준으로 두면 빌드가 실패한다.
- "Sync to Org" 실패는 앱 배포와 무관하다. `ORG_TOKEN` 만료로 추정하지만 로그를 확인하지는 못했다. 워크플로를 지우거나 토큰을 재발급하면 된다.
- 실행 결과는 저장소의 Actions 탭에서 본다.

---

## 4. GitHub secret (개인 저장소)

값은 `Context health/.env`와 같다. 값 자체는 문서나 대화에 적지 않는다.

| 이름 | 쓰는 곳 |
|---|---|
| `VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID` | Firebase 설정 |
| `VITE_KAKAO_REST_API_KEY` | 카카오 로그인 (2026-10-07 추가) |
| `VITE_NAVER_CLIENT_ID` | 네이버 로그인 (2026-10-07 추가) |
| `VITE_SENTRY_DSN` | 오류 수집 (2026-10-07 추가) |
| `FIREBASE_SERVICE_ACCOUNT_CONTEXT_HEALTH_3EB84` | Hosting 배포 권한 |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Vercel 배포 |
| `ORG_TOKEN` | Sync to Org |

- 카카오·네이버·Sentry 키가 빠져 있으면 자동 배포된 화면에서 소셜 로그인과 오류 수집이 동작하지 않는다. 빌드할 때 화면 코드에 값이 들어가기 때문이다.
- 워크플로에 `VITE_GEMINI_KEY` 참조가 남아 있다. Gemini 키는 2026-09-11부터 서버에만 두므로 지워도 되는 흔적이다.

---

## 5. 서버 쪽 값

- 런타임: Node 22 (`functions/package.json`의 `engines.node`). Node 20은 2026-10-30 종료.
- 함수: `aiGenerate`, `socialAuth`, `deleteAccount`, `mcp`, `sentryWebhook` (모두 `us-central1`, 2세대).
- 서버 전용 값: `GEMINI_KEY`, `MCP_ALLOWED_UIDS`, `SENTRY_CLIENT_SECRET`. `SENTRY_CLIENT_SECRET`이 없으면 `sentryWebhook`은 모든 요청을 거절한다.

---

## 6. 배포 뒤 확인

1. 운영 주소 https://context-health-3eb84.web.app 가 열리는지
2. 카카오·네이버 로그인
3. 식단 화면에서 "닭가슴살 샐러드랑 아메리카노 한 잔" 입력 → 칼로리·탄단지가 나오는지
4. 운동 메모 한 줄 → AI가 정리하는지
5. 마이페이지의 Claude 연결 (함수를 배포했을 때)

로컬 검사 중 `test:ai-proxy`, `test:delete-account`, `test-mcp-server`, `test-pagination`은 Firebase 에뮬레이터가 떠 있어야 돈다. 꺼져 있으면 `ECONNREFUSED 127.0.0.1:9099`로 실패하는데, 코드 문제가 아니다. 띄우는 방법은 `docs/fix.md` 참고.
