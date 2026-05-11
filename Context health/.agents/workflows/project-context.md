---
description: Context Health 프로젝트 컨텍스트 및 토큰 절약 가이드
---

# Context Health 프로젝트 가이드

## 프로젝트 개요
- **종류**: React + Vite PWA (모바일 우선 운동/식단 관리 앱)
- **경로**: `/Users/imbc/Documents/ai스터디/Context health/`
- **배포**: Firebase Hosting → `https://context-health-3eb84.web.app`
- **스타일**: Tailwind CSS + Pretendard 폰트
- **AI**: Gemini API (`VITE_GEMINI_KEY`)
- **DB**: Firebase Firestore (`logs` 컬렉션)
- **인증**: Google / Kakao / Naver 소셜 로그인

## 핵심 파일 구조
```
src/
├── App.jsx                    # 라우팅, 탭 전환, 코치 메시지 저장 로직
├── lib/
│   ├── firebase.js            # Firebase 초기화 (env 변수 사용)
│   └── pdfContext.js          # 파워빌딩 v4 PDF 텍스트 (자동 생성됨)
├── components/
│   ├── common/
│   │   ├── BottomNav.jsx      # 하단 네비게이션 (home/coach/my)
│   │   ├── TopNav.jsx
│   │   └── MainTab.jsx        # 쇠질/식단 탭
│   ├── screens/
│   │   ├── LoginScreen.jsx    # Google/Kakao/Naver 로그인
│   │   ├── OnboardingScreen.jsx
│   │   ├── HomeScreen.jsx     # 메인 홈 (운동/식단 카드 + AI 인사이트)
│   │   ├── WorkoutMemoScreen.jsx  # 운동 기록 작성/수정
│   │   ├── DietDetailScreen.jsx   # 식단 기록
│   │   ├── CoachListScreen.jsx    # AI 코치 목록 (5개 방)
│   │   ├── AICoachScreen.jsx      # AI 채팅 화면 (Gemini 연동)
│   │   └── MyPageScreen.jsx       # 마이페이지
│   ├── dashboard/
│   │   ├── WorkoutCard.jsx
│   │   └── DietCard.jsx
│   └── icons/Icons.jsx
.env                           # Firebase + Kakao + Naver 키
```

## 코치 방 구조 (COACH_ROOMS)
| ID | 이름 | 카테고리 |
|---|---|---|
| `powerbuilding` | 파워빌딩 멘토 | workout (쇠질) |
| `dumbbell` | 덤벨 마스터 | workout |
| `routine` | 루틴 설계사 | workout |
| `mobility` | 스트레칭 코치 | workout |
| `diet` | 식단 관리사 | diet (식단) |

- 방 목록 UI: `CoachListScreen.jsx`
- 채팅 UI: `AICoachScreen.jsx`
- 카테고리 매핑: `ROOM_CATEGORY` (AICoachScreen에서 export)
- 메시지 저장: `localStorage` key = `coach_msgs_{roomId}`

## 환경 변수 (.env)
```
VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID
VITE_GEMINI_KEY
VITE_KAKAO_APP_KEY
VITE_NAVER_CLIENT_ID
```

## 주요 명령어
// turbo-all
1. 로컬 실행: `cd "/Users/imbc/Documents/ai스터디/Context health" && npm run dev`
2. 배포: `cd "/Users/imbc/Documents/ai스터디/Context health" && npm run deploy`

## 코딩 컨벤션
- 컴포넌트: 함수형 React (hooks)
- CSS: Tailwind 유틸리티 클래스 (커스텀 토큰: `text-typo-strong`, `bg-ui-1` 등)
- 상태 관리: `useState` + `localStorage` (Redux 미사용)
- 한국어 UI, 주석도 한국어

## 토큰 절약 팁 (AI 어시스턴트용)
1. **이 파일을 먼저 읽기**: 새 대화 시작 시 이 파일부터 읽으면 프로젝트 구조 파악에 토큰 낭비 없음
2. **파일 전체 읽기 최소화**: 수정할 부분만 line range로 view_file
3. **병렬 tool call 적극 활용**: 독립적인 작업은 한 턴에 병렬 호출
4. **중복 탐색 금지**: 이미 본 파일은 다시 읽지 않기
5. **짧은 응답**: 한국어로 핵심만 전달, 장황한 설명 지양
