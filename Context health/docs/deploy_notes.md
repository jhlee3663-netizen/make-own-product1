# Context Health 배포 노트

## 2026-11-24 AI 보안 변경 보관·재배포

사용자 지정 범위는 이번 AI 보안 작업만이다. `aiGenerate` 단독 재배포 완료(revision `aigenerate-00007-rul`), 운영 비로그인 요청 401 및 App Check CORS 헤더 확인. AI 관련 코드·테스트·문서는 `codex/ai-security` 브랜치로 보관한다. 범위 밖 UI 변경이 웹 빌드에 섞여 있어 Hosting은 배포하지 않았다. 클라이언트 AI 변경도 운영 웹에는 아직 반영되지 않았다. 상세 범위와 미검증 사항은 `docs/handoff-ai-security-2026-11-21.md`의 11월 24일 업데이트 및 `docs/qa/ai-security-release-2026-11-24.json` 참고.

## 2026-11-21 AI 범위·비용 보호

- 배포 대상은 `functions:aiGenerate` 하나다. 화면·소셜·인증·MCP·데이터 규칙은 함께 배포하지 않는다.
- 운영 반영 완료: revision `aigenerate-00006-xiz`. 배포된 AI 모듈과 작업 폴더의 내용이 일치하며, 기존 index의 AI 이외 함수 코드가 작업 시작 전과 동일함을 확인했다. 운영의 비로그인 요청은 401, 새 App Check CORS 헤더도 확인했다. 로그인한 운영 요청 전체 검증은 테스트 계정 서명 권한 부족/이메일 가입 비활성화로 완료하지 못했다. 임시 경로의 실제 Firestore 검사도 로컬 CLI 자격 증명의 접근 거부로 완료하지 못했다. IAM·Auth 설정은 바꾸지 않았다. 상세 한계는 `docs/qa/ai-security-production-2026-11-21.json`에 기록했다.
- 전체 소스의 로컬 함수 분석이 의존성 로딩에서 멈춰 `node scripts/prepare-ai-deploy.mjs`로 AI 단독 배포본을 임시 폴더에 생성했다. 그 폴더의 `functions`에서 `npm ci --ignore-scripts --no-audit --no-fund` 후 상위 폴더에서 `npx -y firebase-tools@latest deploy --only functions:aiGenerate --project context-health-3eb84 --non-interactive`로 반영했다. 원본 의존성 및 잠금 파일은 변경하지 않았다.
- `functions/ai/`가 기존 화면/스토어 앱의 요청 템플릿을 인식하고 필요한 데이터만 추출한다. 서버가 코치별 역할, 기존 코칭 참고 자료, 기능별 출력 형식과 생성 설정을 소유한다. 클라이언트의 systemInstruction/생성 설정을 그대로 전달하지 않는다.
- 지원 기능: 운동 메모 정리(홈 재시도 포함), 세트·루틴 추천, 운동 한줄평, 음식 분리·영양 추정, 주간 리포트·상태, 코치 6개 방. 새로운 화면 프롬프트를 만들거나 기존 템플릿의 식별 문구를 바꾸면 `policy.js`의 호환 어댑터와 테스트도 함께 갱신한다.
- JSON 응답은 모델 스키마와 서버 검증을 함께 거친다. 모든 답변은 별도 모델 검사에서 원래 입력과 함께 범위·안전성을 검토한 뒤 반환한다. 검사 실패 시 검증하지 않은 답변을 반환하지 않는다. 코치의 거절은 기존 응답 형식, 기록 변환의 정책 차단은 422다. 확률적 검사이므로 모든 우회를 차단한다는 보장은 없다.
- AI 요청마다 생성 1회 + 검사 1회가 발생한다. 가상 데이터 실제 모델 12건에서 전체 요청은 약 2.5–4.5초였다. 실제 긴 대화/기록의 지연과 비용은 더 클 수 있다. 총 업스트림 제한 시간은 기존과 같은 30초다.
- 사용량은 기존 `aiUsage/{uid}`와 서버 전용 `aiServiceUsage/global`을 트랜잭션으로 예약한다. 사용자 10분 30회/24시간 200회 유지, 동시 6회, 예약 단위 800만/24시간. 전체는 UTC 일자별 5,000회/예약 단위 1억, 동시 100회. 예약 단위는 입력 바이트·최대 출력 토큰을 이용한 보수적 추정이며 실제 청구 토큰/원화 상한이 아니다. 실패한 요청도 예약을 되돌리지 않는다. 동시 실행 슬롯은 종료 시 해제하며 실패 시 70초 후 만료된다.
- 서버 전용 `aiServiceUsage/control` 문서에서 `{ "enabled": false }`로 AI 경로만 긴급 중지할 수 있다. `limits`의 `userWindowRequests`, `userDayRequests`, `userDayTokenUnits`, `userConcurrent`, `globalDayRequests`, `globalDayTokenUnits`, `globalConcurrent`를 양의 정수로 지정하면 기본값보다 낮출 수 있다. 클라이언트 쓰기는 기존 기본 거부 규칙으로 차단된다. 별도 규칙 변경은 없다.
- App Check는 기본 `monitor`다. 기존 네이티브 앱에 attestation 전송이 없으므로 강제하지 않는다. 웹 토큰 첨부/한글 오류 처리는 로컬 변경에 포함돼 있으나 이번 서버 단독 배포에는 포함되지 않는다. 웹·네이티브의 유효 토큰 전송을 검증한 뒤에만 control의 `appCheckMode`를 `enforce`로 설정한다. 그 전까지 정상 로그인 토큰을 이용한 외부 자동 호출 자체는 완전히 차단되지 않는다.
- 검증: `npm run test:ai-security`(모의 27개), 명시적으로 허용한 `QA_LIVE_AI=1 node --test scripts/test-ai-security.mjs`(실제 모델 정상/주제 이탈 12건), 기존 영양·분량·식단분리·입력검증·운동메모·볼륨·근력·임시저장·사용자저장·수동영양 테스트, `npm run build`. 실제 모델 증거는 `docs/qa/ai-security-live-2026-11-21.json`이다. 실사용자 데이터는 테스트하지 않았다. Java 런타임이 없어 Firestore 에뮬레이터 검증은 실행하지 못했고, 트랜잭션 모의 테스트로 경합·한도·해제·날짜 전환을 검사했다.
- 되돌릴 때는 이번 AI 모듈과 index의 AI 연결 부분만 이전 버전으로 복구해 `--only functions:aiGenerate`로 재배포한다. 사용량 문서의 기존 카운터 필드는 이전 서버와 호환된다. 기존 다른 작업의 수정사항을 함께 되돌리지 않는다.

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
