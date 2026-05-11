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
- **AI**: Gemini 2.0 Flash (REST API, `VITE_GEMINI_KEY`)
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
├── services/
│   ├── aiService.js         # Gemini API 호출 (운동 요약, 동기부여 코멘트)
│   └── workoutService.js    # Firestore CRUD + 볼륨 계산
└── lib/
    └── firebase.js          # Firebase 초기화
```

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

`aiService.js`에서 Gemini REST API 직접 호출:
- `summarizeWorkout(sections)` — 거친 메모 → 정형화된 JSON
- `generateAIComment(summary, overloadMsg)` — 동기부여 한줄평 생성
- 응답에서 마크다운 코드블록 제거 후 JSON.parse 처리

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

## 개발 명령어

```bash
npm run dev       # 개발 서버 실행
npm run build     # 프로덕션 빌드
npm run deploy    # Firebase Hosting 배포
```

## 환경 변수

```
VITE_GEMINI_KEY=   # Gemini API 키
```
(Firebase 설정은 `src/lib/firebase.js`에 하드코딩 또는 env로 관리)

## 코딩 컨벤션

- **컴포넌트**: 함수형, props drilling (Context 미사용)
- **스타일**: Tailwind utility classes, 커스텀 색상은 인라인 hex
- **AI 응답**: 항상 JSON 파싱 전 마크다운 제거 (`replace(/```json/gi, '')`)
- **1인 개발**: 불필요한 추상화 없이 실용적으로 구현
