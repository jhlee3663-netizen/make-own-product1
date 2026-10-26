# 피그마 전체 화면 작업 계획 (이어서 할 일)

> 파일 `BOGKtfbYT9XPHFctnTpRhE` › Page 35. 2026-10-16 시작. 다음 세션은 이 문서부터 읽고 이어간다.

## 규칙 (사용자 지시)
- **사용자 섹션 `07 · UI 컴포넌트`(3995:10565)가 최우선.** 내 컴포넌트와 겹치면 내 것을 지우고 사용자 것을 쓴다.
- 컴포넌트로 만들 수 있는 건 모두 만들고, **화면 속 요소를 인스턴스로 교체까지** 한다.
- **토큰·스타일은 지정하지 않는다** (이 파일은 임시 계정 파일, 사용자가 원래 파일로 옮김). 보라는 #7171FF 그대로.
- 토큰이 없는 그라데이션 등은 지금처럼 직접 값.
- 겹치는 낡은 이전 버전 디자인은 지운다 (피그마 버전 기록으로 복구 가능).
- 화면은 섹션을 만들어 정리한다. 간격·여백은 8배수, 안 되면 4배수.

## 한 일
- 사용자 컴포넌트 이름·속성 재정의 (역할이 보이게):
  Brand/Logo · Nav/BottomBar(Tab 홈/코치/분석/마이/**피드 추가**) · Nav/TopBar Home · Nav/BottomBar Item Home/Analysis/My · Nav/MemoMenu(Open) · Nav/MemoMenu Option(Type) · Home/MainTabs(Tab) · Home/DateCircle(Day) · Home/ExerciseChip · Home/ResultBadge(Result) · Home/WorkoutCard (구버전) · Home/DietCard (구버전) · Memo/PartRow · Memo/ExerciseRow · Memo/SetRow(State) · AI/QuoteMark · AI/SummaryIcon Small/Large(Active) · AI/OneLineFeedback
- 내 컴포넌트 섹션 이름 `07-2 · 컴포넌트 | 피드·친구`, 이름 정리: Common/Button · Common/Tag · Common/FadeLine · Common/Tabs · Common/Control · Common/BottomSheet · Common/SheetHandle · Nav/TopBar Sub · Social/Avatar · Social/ListRow · Feed/ActionRow · Feed/Card
- 내 BottomNav 삭제 → 소셜 화면 7곳을 사용자 Nav/BottomBar로 교체. `피드` 변형은 `코치` 변형을 복제해 글자만 바꿈 (아이콘은 코치 것 그대로 — 사용자가 피드 아이콘으로 바꿔야 함).

## 남은 일 (현재 서비스 화면 전부)
코드 기준 화면 목록 (`src/components/screens/`):
1. 스플래시 · 로그인 · 온보딩(단계별)
2. 홈: 운동 탭 / 식단 탭, 오늘·지난 날짜·미래 막힘 토스트·빈 상태·당겨서 새로고침, 오늘 식단 합친 카드, 운동 카드(오늘/날짜, AI 정리 중/실패), 기록 버튼 메뉴 열림
3. 운동 메모 (입력·칩·드랍 카드·AI 정리) 
4. 식단 상세 (끼니 화면·음식 추가·검색·직접 입력·내 음식·수량)
5. 분석 4탭 (요약·체중·식단·운동, 빈 상태)
6. 마이 (목표·계정·AI 연결 안내/해제 확인·휴지통·탈퇴)
7. Claude 연결 승인 화면
8. (코치 화면 2개는 피드로 대체 예정 → 그리지 않음)

순서: ① 사용자 섹션 01–05의 기존 시안 중 현재 앱과 같은 건 재사용, 다른 건 현재 앱(코드·preview/)에 맞춰 새로 그림 ② 반복 요소 컴포넌트화(홈 카드 새 버전은 `Home/WorkoutCard`, `Home/DietCard` 새로 만들고 구버전은 지움) ③ 교체 ④ 섹션 정리. 참고 화면: `preview/home.html`, `preview/analysis.html`, `preview/diet.html`, Figma 1163:12392(홈), 1204:6858(오늘 식단 카드).

## 2026-10-16 추가로 한 일
- 컴포넌트 섹션을 사용자 `07 · UI 컴포넌트` 하나로 합침 (내 섹션 삭제, 아래쪽 "피드·친구", "추가 컴포넌트" 묶음).
- 컴포넌트 안 간격 106곳 8배수(안 되면 4배수)로 정리. 자동 레이아웃이 아닌 프레임 15개(주로 아이콘)는 손대지 않음.
- 새 컴포넌트 + 교체: Feed/YoutubeImportRow(2) · Feed/VideoThumbnail(6) · Common/SegmentedControl(2) · AI/StatusBadge(3) · Social/StoryItem Ring New/Seen(3) · Common/SettingRow Subtitle×New(8) · Common/Toast(1)
- Nav/BottomBar 모든 변형의 "코치" 글자를 "피드"로 (코치 변형과 피드 변형이 이제 같음 — 하나 정리 필요).
- 아직 컴포넌트화 안 한 반복 요소: 알림 한 줄 · 댓글 한 줄 · 옵션 카드(라디오) · 입력 칸(라벨+칸+안내) · 검색창 · 출처 줄(배지+이름) · 프로필 머리(아바타+숫자) · 운동 한 줄(이름/무게) · 무게 맞추기 한 줄 · 섹션 제목.

## 2026-10-16 컴포넌트 2차
구조가 같은 것끼리 변형으로 묶어 만들고 교체 (섹션 `07 · UI 컴포넌트` › "추가 컴포넌트 2"):
| 컴포넌트 | 변형 | 교체 수 |
|---|---|---|
| Workout/ExerciseLine | Large / Small | 29 |
| Feed/SourceLine | Badge Text / Icon | 5 (Feed/Card 안 포함) |
| Common/SearchBar | 지운 버튼 있음 / 빈 칸 | 2 |
| Social/CommentItem | – | 3 |
| Social/ListRow | Tag / More / Button / Two buttons | 13 (예전 ListRow는 쓰는 곳이 없어 삭제 후 새로 만듦) |
| Social/NotificationItem | Plain / Clap / Accept·Decline | 8 |
| Common/OptionCard | Selected / Default | 2 |
| Common/InputField | 상태·안내·글자 수 조합 | 6 |
| Import/WeightRow | With timestamp / Plain | 9 |
| Social/ProfileHeader | Story ring / Plain | 4 |
- 고친 것: SearchBar 높이가 1px로 접힌 문제(42로), 11번 "요청 보냄" 버튼 색.
- 인스턴스는 글자·글자색·아바타색·배경을 원래 값으로 덮어써 화면이 바뀌지 않게 했다.

## 2026-10-16 현재 앱 화면 — 홈 · 식단
**새 컴포넌트** (`07 · UI 컴포넌트` › "현재 앱 — 홈 / 식단")
- 홈: Home/DateHeader(사용자 Home/DateCircle 7개 사용) · Home/MainTabs(Tab 운동/식단, 흰 탭) · Home/WeightInputRow · Home/WeeklySummary · Home/WorkoutCard(Day Past/Today — 사용자 Home/ResultBadge·Home/ExerciseChip 사용) · Home/MealRow(Filled/Empty) · Home/TodayDietCard · Home/PastDietCard
- 식단: Diet/TopBar · Diet/IntakeSummary(Filled/Empty) · Diet/Stepper(Count/Gram) · Diet/FoodItem(Count/Gram) · Diet/InputBar(Default/MenuOpen) · Diet/AddMenu · Diet/QuickPickRow · Diet/AIComment · Diet/FoodPickRow(Selected)
- 사용자 Home/ExerciseChip을 글자 폭에 맞춰 늘어나게 수정(고정 96 → 자동).
- **지운 구버전**: Home/WorkoutCard(구버전, 도넛) · Home/DietCard(구버전) · 예전 Home/MainTabs(밑줄 탭). 섹션 02–04 안의 예전 인스턴스는 메인이 없어져도 모양은 남아 있음.

**섹션 `09 · 현재 앱 | 홈`** H1 운동 탭(오늘 기록 없음) · H2 운동 탭(오늘 기록, 그라데이션 테두리) · H3 기록 하나도 없음 · H4 식단 탭 · H5 기록 버튼 메뉴 열림(사용자 Nav/MemoMenu) · H6 미래 날짜 토스트
**섹션 `10 · 현재 앱 | 식단`** D1 빈 상태 · D2 음식 있음 · D3 + 메뉴 · D4 내 음식 · D5 식품 검색 · D6 음식 편집 시트 · D7 더보기 시트

## 2026-10-16 현재 앱 화면 — 분석 · 시작 · 마이
**새 컴포넌트**
- 분석: Analysis/Tabs(Selected 요약/체중/식단/운동) · Analysis/ReportCard · Analysis/StatTile(Chart Line/Progress/Bars/Badge) · Analysis/Headline · Analysis/ChartCard(Line/Area/Bars) · Analysis/InfoList · Analysis/MiniStat · Analysis/RecordRow
- 시작·마이: Brand/LogoMark(흰 원 — 사용자 `Main logo` 컴포넌트가 파일에서 사라져 임시로 만듦) · Auth/SocialLoginButton(Kakao/Naver) · Onboarding/Progress(Step 1–3)
- 재사용: Common/OptionCard · Common/InputField · Common/SettingRow · Common/Button · Nav/TopBar Sub · Nav/BottomBar(사용자)

**섹션 `11 · 현재 앱 | 분석`** A1 요약 · A2 체중 · A3 식단 · A4 운동 · A5 기록 없음
**섹션 `12 · 현재 앱 | 시작 · 마이`** S1 스플래시 · S2 로그인 · S3–S5 온보딩(목표/체형/활동) · M1 마이 · M2 목표 설정 시트 · M3 Claude 연결 방법 · M4 연결 해제 확인 · M5 Claude 연결 승인

## 겹침 — 사용자 결정 필요
- 식단: 사용자 섹션 `05 · 식단 | 끼니 기록·음식 추가`(9장) ↔ 내 `10 · 현재 앱 | 식단`(7장)
- 분석: 사용자 `03 · 운동 메모·분석`의 분석 5장 ↔ 내 `11 · 현재 앱 | 분석`(5장)
- 운동 메모는 사용자 섹션 03(Memo/* 컴포넌트 사용)을 기준으로 보고 새로 그리지 않음.
- 남길 쪽이 정해지면 다른 쪽을 지우고, 남는 쪽의 반복 요소를 위 컴포넌트로 교체.

## 알려둘 것
- Analysis/ChartCard 안 기간 선택은 3칸짜리 Common/SegmentedControl을 2칸처럼 씀(셋째 칸 "—") → 2칸 변형이 필요.
- 차트 선·면적은 SVG 벡터(실데이터 아님).

## 2026-10-16 정리 3차 (사용자 결정 반영)
**기준**: 지금 서비스에서 돌아가는 최신 화면만 남긴다. 운동 메모는 사용자 디자인이 기준(앱이 다르면 앱을 고친다).
- 지움: 섹션 `05 · 식단 | 끼니 기록·음식 추가` · `02 · 홈 | 메인·메모 진입 시안`(도넛 카드 구버전) · `04 · 홈 | 날짜·식단 상태 비교`(앱보다 예전 문구) · 섹션 03의 분석 5장 + hover(구버전 홈) · `01 · 시작하기 | 로그인 시안`의 흰 배경 시안 · 내 S1/S2 · Brand/LogoMark(임시 흰 원)
- 섹션 01의 스플래시·로그인(실제 로고)은 `12 · 현재 앱 | 시작 · 마이`의 S1·S2 자리로 옮김.
- 04를 지우며 빠지는 상태를 09에 추가: H7 지난 날짜 식단 · H8 목표 칼로리 없음.
- **운동 메모**: 섹션 03의 메모 27장 + 그룹 제목 8개를 `13 · 현재 앱 | 운동 메모`로 옮김(배치 그대로). 같은 이름 2쌍은 뒤에 " (B)".
  - **Memo/Toolbar** (AI=Off ×22 / AI=On ×3): 키보드·AI(왼쪽)와 되돌리기·다시하기(오른쪽). 아이콘 24×24, 묶음 안 간격 16, 바 여백 12/24, 양쪽 끝 정렬. 원래 오른쪽 묶음이 폭 64인데 둘째 아이콘이 x=64에 있어 밖으로 삐져나와 있던 것을 바로잡음.
  - **Memo/TopBar**: 상태 표시줄 + "‹ 쇠질 메모 / 식단 메모 ⋮" 바. 화면마다 외부 라이브러리 `Top Navigation (Android)` 위에 같은 모양의 `Container`가 겹쳐 있어, 보이는 `Container`를 컴포넌트로 만들어 27곳 교체하고 아래 깔린 외부 인스턴스 26개 삭제.
  - 앱 반영 필요(코드): 메모 상단 바·도구 바의 아이콘 크기 24 / 간격 16 / 여백 12·24를 `WorkoutMemoScreen` 쪽에 맞출 것.
- **Brand/Logo** (Style Gradient / Default / Solid background / Gradient background): 섹션 08의 로고 4개를 80×80으로 줄여 컴포넌트화. M5 Claude 연결 승인 화면에 Solid background 사용.

## 현재 페이지 구성
07 UI 컴포넌트 · 08 브랜드 로고 시안 · 06 소셜(피드·유튜브·친구, 예정 기능) · 09 홈 · 10 식단 · 11 분석 · 12 시작·마이 · 13 운동 메모

## 2026-10-16 마무리 (빠진 화면·컴포넌트·앱 반영)
**컴포넌트**
- Brand/Logo에 `Style=White` 추가(스플래시·로그인용 흰 로고) → S1·S2 로고 교체.
- Common/ConfirmModal (Tone Default/Danger) 새로 만듦 → M4·H11·M7에 사용.
- Common/SegmentedControl → `Options=3 / 2` 세트로. Analysis/ChartCard 3개 안의 기간 선택을 2칸으로 교체.
- Analysis/Tabs를 Common/Tabs로 합침: `Count=3 / 4` × `Selected=1–4`. (빈 Analysis/Tabs 세트는 자동 삭제)
- Home/WorkoutCard 속성 이름 Day → **State** (Past / Today / AI processing / AI failed).

**추가 화면**
- 09 홈: H9 AI 정리 중·실패 · H10 기록 카드 길게 누름(날짜 변경·기록 복사·AI로 다시 정리·삭제) · H11 삭제 확인 · H12 당겨서 새로고침 · H13 스크롤로 상단 접힘
- 10 식단: D8 영양정보 직접 입력 · D9 적는 중 자동완성 칩
- 11 분석: A6 요약 리포트 펼침
- 12 시작·마이: M6 휴지통 · M7 회원 탈퇴 확인

**앱 코드 반영 (WorkoutMemoScreen, 배포 완료)**
- 상단 바: 뒤로·더보기 버튼을 자리 24(누르는 영역 40, `-m-2`)로, 아이콘–제목 간격 16 → Figma Memo/TopBar와 같은 위치(제목 x=56, 더보기 오른쪽 16).
- 도구 바: 오른쪽 묶음 높이 40 → 24, 과부하/디로딩 알약 32 → 24. 바 높이 64 → 48.
- 남은 차이: 앱에는 도구 바 오른쪽에 **과부하/디로딩 알약**이 있는데 Figma Memo/Toolbar에는 없음. 앱 제목은 "운동 메모", Figma는 "쇠질 메모".

## 2026-10-16 사용자 결정 반영
- Memo/Toolbar에 과부하/디로딩 알약 추가: 속성 `Mode=Overload / Deload` (AI Off/On × Mode = 4변형). 오른쪽 묶음 맨 앞, 높이 24, 좌우 여백 12, 보라 #7171FF / 주황 #f07800 10% 배경.
- 페이지 전체 "쇠질" → "운동": 글자 1곳(Memo/TopBar 메인 → 메모 화면 27장에 반영), 레이어·컴포넌트 이름 6곳. 앱 코드에는 "쇠질"이 없음.

## 2026-10-16 메모 — 앱에만 있던 상태 추가
- 새 컴포넌트: Memo/MealTimingChips(운동 전: 공복 / 탄수 후 1시간 이내 / 1~2시간 / 2시간+) · Memo/RichToolbar(자유 입력 서식: B I U S · 글자색 · 형광펜 · 크기 3단, 옆으로 넘김) · Memo/ColorPalette(글자색 6개)
- 섹션 13 아래 "메모_ 앱에만 있던 상태" 6장 (사용자 화면 `메모_ 세부 기록_AI 루틴_1`을 복제해 같은 스타일): 운동 전 식사 칩 · 디로딩 모드(Memo/Toolbar Mode=Deload) · 자유 입력(키보드 모드, AI 버튼 숨김) · 자유 입력 글자 색 · 더보기 시트(클립보드 복사·새로 시작) · 나가기 확인(Common/ConfirmModal)
- 의도적으로 안 그린 것: 코치 화면 2개(피드로 대체 예정), 홈 "AI 기록 정리 완료" 토스트(Common/Toast로 바로 표현 가능)

## 2026-10-16 최종 정리
- 섹션 색 통일: 큰 섹션은 모두 흰색, 안쪽 하위 섹션은 #f8f9fa (06도 같은 규칙으로 맞춤).
- `07 · UI 컴포넌트`를 분류별 하위 섹션 14개로 재정리(이름순): 07-1 브랜드 · 07-2 내비게이션 · 07-3 공통 · 07-4 홈 · 07-5 운동 · 07-6 운동 메모 · 07-7 식단 · 07-8 분석 · 07-9 AI · 07-10 로그인 · 07-11 온보딩 · 07-12 소셜(예정) · 07-13 피드(예정) · 07-14 가져오기(예정). 예전 글자 라벨은 하위 섹션 이름으로 대체.
- 페이지 배치: 왼쪽에 07 컴포넌트, 오른쪽에 06 → 08 → 09–13 번호순으로 위아래 정렬(간격 400). 섹션 안 레이어 순서도 위→아래, 왼쪽→오른쪽으로 정렬.
- 숨김 텍스트 `_helpers`(화면 그릴 때 쓰는 공통 코드)는 캔버스 밖(x −8000)에 숨겨 둠. 지워도 화면에는 영향 없음.

## 2026-10-16 📚 스터디로 이전 후 — 실제 앱 캡처로 다시 만들기
- 사용자 지적: 09–12 섹션 일부(D8, D9 등)는 앱이 아니라 내가 추측해서 그린 화면. 05(사용자가 다듬은 식단 화면)를 지운 것도 문제.
- 새 방식: figma-personal `generate_figma_design`으로 preview/ 페이지를 그대로 캡처(레이어·오토레이아웃 유지, 라이브러리 색 변수 자동 연결). preview/*.html에 capture.js 스크립트 추가함.
- 완료: `10 · 현재 앱 | 식단 (앱 캡처)` 9장 · `09 · … 홈 (앱 캡처)` 4장(+3장 처리 중: 당겨서 새로고침/지난 날짜/목표 없음) · `11 · … 분석 (앱 캡처)` 6장
- 남은 캡처: 마이·온보딩·스플래시·로그인·Claude 연결 승인(미리보기 페이지가 없어 새로 만들어야 함), 운동 메모는 사용자 디자인(섹션 13) 기준 유지.
- 그다음: 내가 그린 09–12 섹션 삭제 → 캡처 화면의 반복 요소를 컴포넌트로 바꾸기.
- 색: 라이브러리 변수/brandcolor 스타일 연결 완료(투명도 있는 색은 제외), `Sub brandcolor 10` 스타일 추가.
- 타이포: 라이브러리 스타일 구조 = Title(EB/B/SB × Hero/Main/l/m/s) · Body(SB/M/R × xl/l/m/s) · Caption(M/R × l/m/s), 변수 Desktop/Mobile. Mobile 기준 Body m=15, l=16, xl=18 → 15는 이미 있음. 없는 것: Body·Caption의 Bold 굵기, 17. 라이브러리에 Caption/M/l이 두 개(13, 12) — 12쪽 이름이 잘못된 것으로 보임.

## 2026-10-16 캡처 정리 · 컴포넌트화 · 타이포 연결
- 섹션 번호 재정리(📚 스터디 GUI 페이지): 01 홈 · 02 운동 메모 · 03 식단 · 04 분석 · 05 시작·마이 (모두 실제 앱 캡처, 02는 사용자 디자인) / 06 소셜 · 07 UI 컴포넌트 · 08 브랜드 / 09 UX 연구 · 10 레퍼런스 · 11 포트폴리오. 내가 추측해서 그린 옛 09–12 "현재 앱" 섹션은 삭제. 세 줄로 배치, 겹침 없음.
- 추가 캡처: H7 지난 날짜 · H8 목표 칼로리 없음 · H9 당겨서 새로고침 · A6 리포트 펼침(preview/analysis.jsx `?open` 선택자 수정: PressCard는 button이 아니라 `[aria-expanded]`로 찾음) · 마이/온보딩/로그인/스플래시/Claude 승인 10장. S5(온보딩 3)는 S4와 같아서 삭제(다음 버튼 비활성이라 3단계로 못 넘어감).
- 못 찍은 것: 마이 "최근 삭제된 항목" 펼침 — 열면 Firestore를 직접 읽는데 미리보기의 가짜 로그인으로는 Firebase Auth가 깨짐.
- 하단 내비: 캡처된 내비를 지우고 사용자 컴포넌트 `Nav/BottomBar`(탭=홈/분석/마이) 인스턴스로 교체·추가. 두 번째 탭 글자는 현재 앱대로 "코치"로 덮어씀(컴포넌트 기본은 "피드").
- 캡처에서 바로 만든 컴포넌트(원본 레이어 그대로, 화면 속 원본은 인스턴스로 교체): Home/Tabs(탭×스크롤) · Home/DateRow · Home/WorkoutCard · Home/WorkoutSummary · Home/IntakeCard · Home/MealList · Diet/ViewHeader · Diet/IntakeSummary · Diet/PortionStepper · Diet/InputBar · Diet/FoodPickRow · Diet/BottomBar · Analysis/Header(탭=요약/체중/식단/운동) · Analysis/AiReport · Analysis/StatTile · Analysis/Headline · Analysis/PairTiles · Analysis/Segmented · Analysis/ExerciseRow · Analysis/Tooltip · Common/FieldRow · Common/WeightHistory · Common/Dialog · Onboarding/NumberInput. 스플래시·로그인 로고는 사용자 `Brand/Logo` Style=White로 교체.
- 지운 추측 컴포넌트(쓰는 곳 0, 캡처본으로 대체): Home/DateHeader · MainTabs · PastDietCard · TodayDietCard · WeeklySummary · 옛 WorkoutCard · Diet/TopBar · 옛 FoodPickRow · InputBar · IntakeSummary · Analysis/Headline · StatTile · ReportCard. 남겨 둔 것(쓰는 곳 있음 또는 대체본 없음): Home/DateCircle·ExerciseChip·MealRow·ResultBadge·WeightInputRow, Diet/AIComment·AddMenu·FoodItem·QuickPickRow·Stepper, Analysis/ChartCard·InfoList·MiniStat·RecordRow 등.
- 캡처의 색 변수 모드 함정: 캡처 도구가 노드마다 Semantic 모드(DT/LT)를 따로 걸어 둠. 컴포넌트로 옮기면 지정이 빠지거나 바뀌어 색이 뒤집힘(마이 내비 검정, Segmented 선택칸 검정, FieldRow 글자 흐림). 고친 방법: 내비 인스턴스는 LT, Segmented 선택칸은 LT(글자는 DT), FieldRow는 LT.
- 타이포: 캡처 글자는 브라우저 대체 글꼴(SF Pro)로 들어옴 → 크기·굵기 기준으로 라이브러리 텍스트 스타일 연결(화면 389개 + 컴포넌트 152개), 섹션 01–05·07에 Typograghy=Mobile 모드 지정.
  - 아직 못 붙인 것: Bold(Body/Caption)·Caption SB — 라이브러리에 추가만 하고 **Publish 전**이라 불러올 수 없음. Publish 후 같은 스크립트로 다시 돌리면 됨.
  - 12 Regular는 일부러 안 붙임: 라이브러리 `Caption/R/m`의 Mobile 값이 10으로 되어 있음(Desktop 12). 라이브러리 오류로 보임.
  - 9·10·17 크기와 Condensed는 맞는 스타일이 없어 그대로 둠.
- (추가) 다크 모드는 쓰지 않으므로 GUI 페이지의 DT 지정을 모두 LT로 바꿈(남은 DT 0개). 바꾸기 전 보이던 색을 기록해 두고, 색이 달라진 곳은 LT에서 같은 색이 나오는 라이브러리 변수로 다시 연결(07: 110곳 · 01: 2,616 · 03: 158 · 04: 84 · 05: 78, 맞는 변수가 없는 색 0). 한 글자 안에 색이 섞인 분석 제목·Segmented 선택 글자·통계 숫자 12곳은 흰색으로 바뀌어 `Typo_cool/Strong`으로 직접 다시 연결.

## 2026-10-16 캡처를 버리고 코드 기준으로 다시 만들기
- 이유: 캡처는 웹의 '내용만큼 늘어나는' 레이아웃을 고정 크기·절대 위치로 가져와서, 컴포넌트화·스타일 연결 뒤 잘림·높이 불일치·패딩/r 차이가 생김(사용자 지적 5건).
- 방법: 앱 코드(Tailwind 값)를 읽고, 미리보기 페이지를 브라우저에서 열어 모든 요소의 위치·크기·글자·색을 뽑아(scratchpad/svgs/*.json) 숫자로 대조. 그래프는 앱이 그린 SVG를 그대로 가져와 넣음.
  - 주의: 미리보기 탭이 백그라운드면 CSS 전환·등장 애니메이션이 멈춰, 측정값에 20px 어긋남(stagger-in)·너비 0(전환 중)이 섞임 → 코드 값 기준으로 판단.
- 공용 그리기 도구: GUI 페이지 숨김 텍스트 `_helpers`(색=라이브러리 변수/brandcolor 스타일, 글자=DS 텍스트 스타일 + 앱 줄간격 덮어쓰기, 그림자=card 효과 스타일).
- 줄간격: DS 스타일을 연결하되 앱과 다른 곳은 앱 값으로 덮어씀(예: 배지 12/14, 카드 제목 18/22). 앱을 DS 줄간격으로 맞출지는 사용자 결정 필요.
- 색: 앱의 #03b26c·#dd7d02·#e03e52·#F04452 등은 라이브러리 Color/Green·Orange·Red로 바꿈(사용자 규칙). 차트 그라데이션·#ff9137 막대 등 변수 없는 색은 그대로.
- 결과(섹션 01/03/04/05 전부 새 화면, 캡처 삭제):
  - 01 홈 7장: H1·H3·H4·H7·H8·H9·H13 — 시트 위 모서리 r24, 폴더 탭(r 24 24 0 0, 당김 시 r24 알약).
  - 03 식단 9장: D0–D8. 04 분석 8장: A1–A8(더보기·계산 기준 시트 추가). 05 시작·마이 12장: S1·S2·S3–S5(온보딩 3단계 모두)·M1·M2(정보 수정)·M3·M4·M5·M5-2(허용 안 함 화면)·M6.
  - 컴포넌트: 07-4 홈 · 07-7 식단 · 07-8 분석 · 07-10 시작·마이(Onboarding/*, Auth/SocialButton, My/*) · 07-3 Common/ConfirmModal(코드 값으로 교체, 운동 메모 '나가기 확인'도 교체).
  - 하단 내비·로고는 사용자 컴포넌트(Nav/BottomBar, Brand/Logo) 사용.
- 남은 것: 마이 '최근 삭제된 항목' 펼침·체중 기록 펼침 화면, 식단 '어제 점심 그대로' 카드, 분석 기록 부족(Ghost) 카드는 아직 안 그림. 12 Regular는 라이브러리 Caption/R/m(Mobile 10px) 오류 때문에 스타일 없이 둠.
