# 이종혁 님의 작업 레포 🚀

> 🤖 **AI Builder 2기** · BF.D AI 챌린지

이 곳은 **이종혁 님 전용 작업 공간**입니다. 챌린지 기간 동안 작성하신 모든 코드와 결과물이 여기에 쌓입니다.

---

## ⚡ 빠른 시작

작업 시작 전, **4단계 셋업**을 한 번만 진행해주세요 (총 약 15분, 평생 1번).

| 단계 | 할 일 | 소요 시간 | 대상 |
|---|---|---|---|
| 1️⃣ | Claude Code 보안 설정 | 2분 | **모두 필수** ⚠️ |
| 2️⃣ | Vercel 가입 + 토큰 발급 | 5분 | Vercel 쓸 사람만 |
| 3️⃣ | Vercel 빈 프로젝트 만들기 | 3분 | Vercel 쓸 사람만 |
| 4️⃣ | 이 레포에 시크릿 3개 등록 | 5분 | Vercel 쓸 사람만 |

> 📌 **Vercel 배포가 필요한 분** (작업물을 웹에서 바로 보여주고 싶은 경우): 2️⃣~4️⃣ 필수
> 📌 **Vercel 안 쓰는 분** (단순 코드 작성/실험만): 1️⃣만 하시고 2️⃣~4️⃣ 건너뛰세요

---

## 📂 이 레포에 이미 들어있는 것들

운영진이 미리 셋업해둔 파일들이에요. **이 폴더 구조는 건드리지 마시고**, 본인 작업물은 자유롭게 추가하시면 됩니다.

```
2nd-ai-builder-lee-jonghyuk/
├── .github/workflows/    ← Vercel 자동 배포 설정 (운영진 셋업)
├── .gitignore            ← 민감 파일(.env 등) 자동 제외 (운영진 셋업)
├── README.md             ← 이 파일
└── (여기부터 본인 작업물)
```

---

## 🔐 자동 적용된 보안 (`.gitignore`)

아래 파일들은 **자동으로 git 추적에서 제외**됩니다. 실수로 커밋해도 GitHub에 올라가지 않아요:

- `.env`, `.env.local`, `.env.production` (환경 변수, API 키)
- `*.key`, `*.pem`, `*.cert` (인증 키)
- `credentials.json`, `service-account*.json` (인증 정보)
- `node_modules/`, `.next/`, `dist/`, `build/` (대용량 빌드 파일)

> 💡 자동 보호되긴 하지만, **민감 정보는 절대 코드에 직접 적지 마세요**. 항상 `process.env.토큰이름` 형식으로 참조하세요.

---

## 1️⃣ Claude Code 보안 설정 (가장 먼저!)

실수로 API 키나 비밀번호 같은 민감 정보에 접근하지 못하도록 Claude Code 자체에 차단 룰을 적용합니다.

**Claude Code를 열고, 아래 메시지를 그대로 복사해서 보내주세요:**

```
내 Claude Code에 최소 보안 설정을 적용해줘.

~/.claude/settings.json 파일을 읽어서, 기존 설정을 모두 유지하면서
permissions.deny 배열에 아래 패턴들을 추가해줘.
파일이 없으면 새로 만들고, 이미 있는 패턴은 중복 추가하지 마.

### 민감 파일 접근 차단
- Read(.env)
- Read(.env.*)
- Read(*.pem)
- Read(*.key)
- Read(*.cert)
- Read(credentials.json)
- Read(service-account*.json)

### 환경 변수 노출 차단
- Bash(env)
- Bash(printenv)
- Bash(*SECRET*)
- Bash(*PASSWORD*)
- Bash(*TOKEN*)
- Bash(*CREDENTIAL*)

### 파괴적 명령 차단
- Bash(rm -rf /*)
- Bash(git push --force*)
- Bash(git reset --hard*)
```

> 💡 Claude Code가 알아서 `~/.claude/settings.json` 파일을 만들거나 수정해서 보안 설정을 적용해줍니다.

---

## 2️⃣ Vercel 가입 + 토큰 발급

> 🟡 **여기서부터 4️⃣까지는 Vercel 배포가 필요한 분만 진행**하세요.
> 작업물을 웹 페이지로 띄워서 다른 사람에게 공유하려면 필요하지만, 단순 코드 작성/실험만 한다면 안 하셔도 됩니다.

1. https://vercel.com 접속 → **Continue with GitHub** 으로 가입/로그인
2. 가입 후, **토큰 발급 페이지로 이동** — 아래 두 가지 방법 중 편한 거 선택:
   - 🚀 **빠른 방법 (추천)**: 이 링크 바로 클릭 → https://vercel.com/account/settings/tokens
   - 🐢 메뉴로 찾아가기: **좌측 사이드바 하단의 본인 프로필 사진** → **Settings** → 왼쪽 메뉴 **Tokens**
3. **Create Token** 버튼 클릭
   - Token Name: `BF-D-challenge`
   - Scope: **Full Account**
   - Expiration: **No Expiration** (만료 없음)
4. **CREATE TOKEN** 클릭 후 나타나는 토큰을 **즉시 복사**

> 📋 **메모장에 임시로 붙여놓으세요.** 이 화면을 떠나면 토큰을 다시 볼 수 없어요!

---

## 3️⃣ Vercel 빈 프로젝트 만들기 + ID 두 개 얻기

### ① 프로젝트 생성

1. https://vercel.com/dashboard 로 이동
2. 우측 상단 **Add New...** → **Project** 클릭
3. **Import Git Repository** 화면에서:
   - 본인 GitHub 옆 "**Adjust GitHub App Permissions**" 클릭
   - **BF-D-challenge** 조직에 권한 허용
4. 목록에서 이 레포 (`2nd-ai-builder-lee-jonghyuk`) 옆 **Import** 클릭
5. 화면 그대로 두고 **Deploy** 클릭 (지금은 실패해도 OK — 토큰 등록 전이니까!)

### ② ID 두 개 얻기 (📌 두 ID는 서로 다른 곳에 있어요!)

**🅰️ Project ID** — 방금 만든 프로젝트 설정에서:

1. 방금 만든 프로젝트 페이지 상단 **Settings** 탭 클릭
2. **General** 메뉴에서 **Project ID** (예: `prj_xxxxxxxxx`) 값을 메모장에 복사

**🅱️ Account ID (= ORG_ID)** — 본인 계정 설정에서 (프로젝트 설정 X):

> ⚠️ Project 설정에는 Project ID만 있고, Account ID는 **계정 설정**에 따로 있어요.

1. **좌측 사이드바 하단의 본인 프로필 사진** → **Settings** 클릭 (= 계정 설정 페이지로 이동)
2. **General** 탭에서 **Your ID** 값을 메모장에 복사
   - 개인 (Hobby) 계정의 **Your ID 가 곧 Account ID (= ORG_ID)** 입니다
   - 만약 Team 계정이라면 Team ID를 대신 사용하세요

---

## 4️⃣ 이 레포에 시크릿 3개 등록

1. 이 GitHub 레포 페이지 상단 **Settings** 탭 클릭
2. 왼쪽 메뉴 **Secrets and variables** → **Actions**
3. **New repository secret** 버튼 클릭해서 아래 **3개 모두** 등록:

| Name (이름) | Value (값) |
|---|---|
| `VERCEL_TOKEN` | 2️⃣번에서 복사한 토큰 |
| `VERCEL_ORG_ID` | 3️⃣-🅱️번에서 복사한 Account ID (Your ID 또는 Team ID) |
| `VERCEL_PROJECT_ID` | 3️⃣-🅰️번에서 복사한 Project ID |

---

## ✅ 셋업 완료 확인

1. 이 레포에 아무 파일이나 변경 후 push (또는 GitHub 웹에서 README를 살짝 수정 후 commit)
2. 상단 **Actions** 탭 클릭
3. 최신 워크플로우 실행이 ✅ 녹색 체크면 성공!
4. Vercel 대시보드 → 본인 프로젝트 → 최신 배포 URL 확인 🎉

---

## 💻 매일 작업 흐름

```
1. 코드 작성 (Claude Code 또는 본인 도구)
2. git add . && git commit + git push
3. GitHub Actions가 자동으로 Vercel 배포 ✨
4. 배포 URL 공유!
```

> 🔄 **미러링이나 PAT 같은 거 필요 없어요.** 이 레포에 바로 작업하시면 됩니다.

---

## 🆘 안 될 때

- ❌ Actions 워크플로우 실패 → 상단 **Actions** 탭에서 빨간 ❌ 클릭해서 로그 확인
- ❌ "Vercel 시크릿이 아직 등록되지 않았어요" 경고 → 4️⃣번 시크릿 등록 다시 확인
- ❌ Vercel 배포 실패 → Vercel 대시보드 → Deployments → 로그 확인
- 그래도 안 되면 → **운영자에게 문의** 🙋

---

## 🔐 챌린지 보안 약속

❌ **금지**:
- 코드에 비밀번호, API 키, 토큰을 **직접 적기**
- `.env` 같은 민감 파일을 **수동으로 커밋** (자동 무시되긴 하지만 강제 추가 X)

✅ **권장**:
- 토큰 / 키 / 비밀번호는 모두:
  - **GitHub Secrets** (이 레포 → Settings → Secrets and variables → Actions)
  - 또는 **Vercel Environment Variables** (Vercel 프로젝트 → Settings → Environment Variables)
  - 에 등록하세요
- 코드에서는 `process.env.토큰이름` 형식으로만 참조
