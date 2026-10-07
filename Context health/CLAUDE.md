# 응답 규칙 (Claude Code 전역)

- 응답은 항상 **최대한 짧고 간결하게** — 불필요한 설명, 요약, 재확인 금지
- 코드 변경 시 변경된 부분만 설명, 전체 재설명 금지
- 질문에는 핵심만 1-2줄로 답변
- 작업 완료 후 "완료했습니다" 같은 마무리 멘트 금지

---

# context-health

> AI로 기록의 번거로움을 없앤 미니멀 헬스 케어 앱

## 프로젝트 개요

자연어 처리 AI를 핵심 경험(Core Experience)으로 삼은 1인 개발 헬스케어 앱.
"닭가슴살 샐러드랑 아메리카노 한 잔" 같은 텍스트를 Gemini AI가 즉시 영양 데이터로 변환한다.

## 기술 스택

- **Frontend**: React 18 + Vite
- **Styling**: Tailwind CSS (TDS 기반 — 화이트 톤, Pretendard 서체)
- **Backend**: Firebase Firestore
- **AI**: Gemini 3.6 Flash — 서버(Cloud Functions `aiGenerate`)를 거쳐서만 호출, 키는 서버에만 있음
- **Hosting**: Firebase Hosting
- **아이콘**: lucide-react

## 프로젝트 구조

```
src/
├── App.jsx                  # 라우팅 없이 screen state로 화면 전환
├── components/
│   ├── common/              # 재사용 UI 컴포넌트
│   │   ├── AutoTextarea.jsx
│   │   ├── BottomNav.jsx
│   │   ├── Button.jsx
│   │   ├── Chip.jsx / MainChip.jsx / MainTab.jsx
│   │   ├── Toast.jsx
│   │   ├── TopNav.jsx
│   │   └── WorkoutTaskItem.jsx
│   ├── dashboard/           # 홈 화면 카드 컴포넌트
│   │   ├── DietCard.jsx
│   │   ├── DonutChart.jsx   # 실시간 영양 비중 도넛 차트
│   │   └── WorkoutCard.jsx
│   └── screens/             # 화면 단위 컴포넌트
│       ├── HomeScreen.jsx
│       ├── WorkoutMemoScreen.jsx
│       └── DietDetailScreen.jsx
├── utils/                   # 영양 조회(nutritionLookup), 식단 분량, 운동 메모 등
└── lib/
    ├── aiClient.js          # AI 호출 공통 (generateContent, parseAiJson, aiErrorMessage)
    └── firebase.js          # Firebase 초기화
functions/                   # Cloud Functions: aiGenerate, socialAuth, deleteAccount, mcp, sentryWebhook
```
(위 목록은 일부만 적은 것 — 화면은 `src/components/screens/` 참고)

## 화면 구조 (Screen Navigation)

React Router 없이 `App.jsx`의 `screen` state로 전환:
- `"home"` → `HomeScreen`
- `"memo"` → `WorkoutMemoScreen` (운동 기록 입력/수정)
- `"diet-detail"` → `DietDetailScreen` (식단 기록 입력/수정)

## Firebase Firestore 스키마

**Collection: `logs`**
```js
{
  type: "workout" | "diet",
  timestamp: serverTimestamp(),
  // workout 전용
  title: "가슴, 어깨",
  sections: [{ part: "가슴", items: [{ title: "벤치프레스", body: "• 세트 1: 60kg 10회" }] }],
  exercises: [{ name: "벤치프레스" }],
  totalVolume: 12000,
  overloadMsg: "오늘 볼륨 12,000kg, 저번보다 5% 과부하 성공!",
  // diet 전용 (추후 확인 필요)
}
```

## AI 연동 패턴

`src/lib/aiClient.js`로 서버 `/api/ai-generate`를 호출 (브라우저에서 Gemini 직접 호출 금지):
- `generateContent(...)` → `extractText(json)` → `parseAiJson(text)` 순서로 사용
- 실패 알림은 `aiErrorMessage(e)`로 한글 문구만 표시

## 주요 기능

1. **운동 기록**: 자연어 입력 → AI 정리 → Firestore 저장, 볼륨 과부하 계산
2. **식단 기록**: [아침/오전간식/점심/오후간식/저녁] 5단 슬롯
3. **도넛 차트**: 실시간 탄단지 비중 시각화
4. **TDS UI**: 삼성 헬스의 기능성 + 토스의 심미성

## 향후 개발 계획

- [ ] 데이터 시각화 — 주간/월간 운동 볼륨, 영양 추이 그래프
- [ ] 목표 설정 — 맞춤형 목표 칼로리 및 탄단지 비율(Macros)
- [ ] AI 수정 모드 — AI 분석 결과 미세 조정 편집 기능
- [ ] 소셜 피드 — 오운완 기록 공유, 앱 내 피드
- [ ] AI 커넥터 공개 — 내 기록을 평소 쓰는 AI(Claude 등)에 연결하는 기능을 일반 사용자에게 열기
  - 허용 계정 제한(`MCP_ALLOWED_UIDS`) 풀기 + 보안 점검, 개인정보처리방침에 제3자 AI 제공 문구 추가
  - 마이페이지 "AI 연결" 메뉴 (주소 복사 + 연결 순서 안내)
  - ChatGPT·Gemini에서 같은 서버로 연결되는지 확인
  - 커넥터 디렉터리 등록 (심사 필요, 나중)

## 개발 명령어

```bash
npm run dev       # 개발 서버 실행
npm run build     # 프로덕션 빌드
npm run deploy    # Firebase Hosting 배포
```

## 환경 변수

```
VITE_FIREBASE_*=            # Firebase 설정 6개
VITE_KAKAO_REST_API_KEY=    # 카카오 로그인
VITE_NAVER_CLIENT_ID=       # 네이버 로그인
VITE_SENTRY_DSN=            # 오류 수집
```
(Firebase 설정은 `src/lib/firebase.js`에 하드코딩 또는 env로 관리)

## 코딩 컨벤션

- **컴포넌트**: 함수형, props drilling (Context 미사용)
- **스타일**: Tailwind utility classes, 커스텀 색상은 인라인 hex
- **AI 응답**: JSON은 항상 `parseAiJson`으로 읽기 (직접 `JSON.parse` 금지)
- **1인 개발**: 불필요한 추상화 없이 실용적으로 구현
