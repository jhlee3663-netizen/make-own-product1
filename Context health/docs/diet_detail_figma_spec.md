# 식단 기록 화면 개편 — 피그마 수치와 작업 메모

피그마: `Ue0MhccBAXCW3mjsKijk7r`, node `1176-7168` (화면 9개). 아래 수치는 이미 뽑아 둔 것이라 **피그마를 다시 불러올 필요 없다.**
작업 전에 `docs/motion_and_ui_notes.md`를 먼저 읽는다.

> **2026-10-08 구현함.** 화면은 `DietDetailScreen.jsx` 뒤쪽, 조각은 `src/components/diet/DietParts.jsx`, 미리보기는 `preview/diet.html`.
> 아래 "코드 위치"의 줄 번호는 구현 전 기준이라 지금은 맞지 않는다.

## 작업할 때 지킬 것 (지난 세션에서 문제가 된 것)

- 피그마 전체 보드 스크린샷, 파일 통째 읽기 금지. `DietDetailScreen.jsx`는 필요한 구간만 읽는다.
- grep은 범위를 좁혀서, glob은 따옴표로 감싼다 (`--include='*.jsx'`).
- 화면 한두 개씩 끊어서 구현하고 확인한다.
- 커밋하지 않은 사용자 변경을 되돌리지 않는다: `BottomNav.jsx`, `LogoMotion.jsx`, `PressCard.jsx`, `Toast.jsx`, `HomeHeader.jsx`, `HomeScreen.jsx`, `src/index.css`, `vite.config.js`.

## 공통

- 서체 Pretendard, 자간 −2.5%. 포인트 `#7171ff`.
- 피그마 색 변수 주의: `mono/inverse`는 흰색, `cool/ui_2` `#f1f3f5`, `cool/ui_3` `#e9ecef`, `background/primary-cool` `#f8f9fa`, 진한 글자 `#171a1d`, 보조 글자 `#868e96` / `#adb5bd`.
- 홈 식단 탭(`src/components/home/DietDay.jsx`)은 이미 피그마와 같다. 고칠 대상은 식단 상세 화면이다.

## 코드 위치

- `src/components/screens/DietDetailScreen.jsx` (1702줄): 1~922줄은 로직(유지), 923~1702줄이 화면(다시 그림). 1460~1702줄(더보기 시트, 내 음식 목록, 등록 모달, 수정 모달)은 아직 읽지 않았다.
  - 시그니처: `DietDetailScreen({ onBack, onSave, initialData, uid, profile, registerBackGuard })`
  - `export`된 `sanitizeNutritionValue`, `isValidNutritionInput`은 그대로 둔다.
  - 끼니 id: `breakfast / am_snack / lunch / pm_snack / dinner / night_snack`
  - 입력·AI: `aiInputs`, `handleAIAnalyze(secId)`, `analyzingIds`
  - 식품 검색: `handleOpenSearchModal(secId, input)`, `handleFoodSearch`, `handleAddSearchItem(normalizeSearchItem(food))`, `handleAddSearchResult`, `handleUseAiEstimate`, `handleCloseSearchModal`
  - 최근·패턴: `handleAddRecentFood(secId, food)`, `getRecentMatches`, `getMealPatternFoods(secId, allDietLogs)`
  - 직접 입력: `handleOpenManualMacro(secId, item?)`, `handleParseManualMacroPaste`, `handleSaveManualMacro`, `handleDeleteManualMacro`, `handleCloseManualMacro`, `manualMacroForm`, `manualMacroCanSave`, `manualMacroCalculatedKcal`
  - 고치기: `handleOpenEdit(secId, item)`, `handleSaveEdit`, `handleSwitchPortionMode(secId, itemId)`, `handleAdjustPortion(secId, itemId, dir)`, `handleSetPortionAmount(secId, itemId, amount)`, `handleRemoveItem`
  - 저장·나가기: `handleSaveClick`, `handleBackClick`, `discardAndLeave`, `showExitModal`, `saving`
  - 더보기: `moreSheetOpen`, `editingGoal`, `goalInput`, `handleGoalSave`, `handleMoreCopy`, `handleMoreReset`
  - 내 음식: `foodListOpen`, `customFoods`, `addFoodOpen`, `addForm`, `handleSaveCustomFood`, `foodSuggestions`
  - 기타: `totals`, `getItemsTotal`, `formatNutritionSource`, `formatPortionNumber`, `FoodPortionControl`, 알림 `foodSavedToast` / `manualMacroSavedToast`
- `src/utils/dietPortions.js`: `ensureFoodPortion(item)` → `.portion {mode, grams, baseGrams, unit, gramsKnown}`, `getPortionDisplayName`, `getFoodPortionAmount`
- `src/components/home/DietDay.jsx`: `IntakeCard`, `MealList({ meals, editable, onOpen })` — 줄을 눌러도 끼니 id를 넘기지 않는다.
- `src/components/screens/HomeScreen.jsx` 598~602줄 `openDayDiet`, `src/App.jsx` 518~527줄 `handleDietCardClick(data)`, 725~736줄 상세 화면 래퍼.
  - 래퍼에 `slideInFromRight … both`로 transform이 남는다 → 화면 안의 시트·딤은 `fixed` 대신 `absolute`로 깐다.
- 공용: `src/lib/useDismiss.js` `useDismiss(open, onClose, insideRef)`, `src/components/icons/Icons.jsx`(`IcBack`, `IcPlus`, `IcMore`, `IcSpark`, `IcPencil`), `Pressable`, `AutoTextarea`(named export, `onFocus` 있음), `Toast({show, message})`, `ConfirmModal`
- `src/index.css`: `bottomSheetUp`, `dropdownEnter`, `.stagger-in`, `.chart-grow-x`, 움직임 줄이기 블록(367줄 근처)
- 시트 모서리 조각: `src/components/home/HomeHeader.jsx` 215줄 `SheetCorners` — 24×24 조각, `radial-gradient(circle at 100% 100% | 0 100%, transparent 23.5px, #7171FF 24px)`

## 화면별 수치

### 섭취 칼로리 카드
- 흰색, 모서리 20, 그림자 `0 2px 12px rgba(3,27,38,0.05)`, 여백 좌우 20 / 위아래 18
- "섭취 칼로리" SemiBold 13 `#868e96`
- 값 Bold 26 `#171a1d` + "/ 2,100kcal" Regular 14 `#868e96`, 막대까지 간격 32
- 막대: 영역 높이 14. 바탕 `#f1f3f5` 높이 8 모서리 4. 적정 구간 `rgba(113,113,255,0.2)` 높이 14 모서리 4. 채움 `linear-gradient(to right, rgba(113,113,255,0.3), #7171ff)`
- 눈금 줄 11px: "0", "적정 1,900~2,300"(SemiBold `#7171ff`), "3,000"
- 탄단지 줄 13px: 라벨 `#868e96` + 값 Bold `#7171ff`
- 넣기 전 미리보기: "+760" Bold 12 `#ff9137`, 보라 뒤에 이어지는 주황 구간 `linear-gradient(to right, rgba(255,176,87,0.3), #ffb057)`, 탄단지마다 "+82"

### ① 끼니 화면 · 비어 있음
- 배경 `#7171ff`
- 헤더 `pt-52 pb-14 px-12`: 흰 뒤로 화살표 / 가운데 끼니 이름 SemiBold 18 흰색 + 작은 화살표(끼니 바꾸기) / 오른쪽 "•••" Bold 14 `rgba(255,255,255,0.85)` 40×28
- 시트 `#f8f9fa`, 위 모서리 22, `pt-16 px-16`, 간격 16
- 카드 2개 (흰색, 모서리 18, `px-16 py-12`, 간격 12)
  - "어제 점심 그대로" SemiBold 11 `#adb5bd` / "540kcal" Bold 15 / 음식 이름 Regular 12 `#868e96` / 알약 버튼 "넣기" 배경 `rgba(113,113,255,0.1)` `px-14 py-8` 모서리 99 Bold 13 `#7171ff`
  - "내 음식에서 고르기" + 이름을 " · "로 이은 글 Regular 13 `#adb5bd` + 화살표 16
- 안내 "또는 아래에 편하게 적어주세요" Regular 12 `#adb5bd`
- 아래 입력 영역: 흰색, 위 모서리 20, 그림자 `0 -4px 16px rgba(0,0,0,0.06)`, `pt-12 pb-16 px-16`
  - 입력창 모서리 16, `pl-14 pr-7 py-7`, 배경 `#f1f3f5`, 안내 글 "예: 제육덮밥이랑 콜라" Regular 14
  - 보내기 30×30, AI 반짝 아이콘

### ② 적는 중
- 추천 칩 줄 간격 6. 칩 `px-12 py-8` 모서리 12 `#f1f3f5` Medium 13
- 입력 줄 간격 8: 40×40 둥근 "+" / 포커스된 입력창 흰색, 테두리 1px `#f79fff`, 모서리 16 / 그라데이션 AI 보내기 아이콘

### ③ 음식이 쌓임
- 시트 간격 10
- 목록 카드 흰색, 모서리 18, `px-16 py-4`
- 줄 `py-12`, 간격 16, 구분선 있음
  - 이름 SemiBold 16 / 칼로리 Medium 14 `#7171ff`
  - 분량 글 Regular 12 `#868e96` (예: "1캔 · 250ml · AI 추정값")
  - 수량 조절: 배경 `#f1f3f5`, `p-4`, 모서리 8, 간격 12 (24×24 −, 수량 SemiBold 14, 24×24 +)
- 아래 "기록 완료" `#7171ff`, 높이 48, 모서리 14, Bold 15 흰색

### ④ 고치기 시트
- 딤 `rgba(0,0,0,0.45)`
- 흰 시트, 위 모서리 22, `pt-10 pb-18 px-16`, 간격 24
- 손잡이 36×4 `#dee2e6`, 제목 Bold 17
- "단위 구분" SemiBold 14 `#868e96` + 선택 버튼 묶음(배경 `#f1f3f5`, `p-3`, 모서리 10 / 칸 `px-12 py-5` 모서리 8 SemiBold 12, 선택된 칸 흰색): "개수" / "g"
- "영양성분 · 눌러서 고치기" Regular 11
- 상자 4개, 간격 6, `px-6 py-9`, 모서리 12: 라벨 Medium 11 `#868e96`, 값 Bold 16. 선택된 상자 흰색 + 테두리 1.5px `#7171ff`, 나머지 `#f8f9fa`
- "수정 완료" `#7171ff`, `py-15`, 모서리 14, Bold 15

### ⑤ ＋ 팝업
- "+" 버튼 위(왼쪽 16), 흰색, 모서리 16, `p-6`, 너비 240, 그림자 `0 8px 28px rgba(3,27,38,0.18)`
- 항목 `px-12 py-11`: 제목 SemiBold 14 / 설명 Regular 11 `#868e96`
  - 내 음식 — 저장된 음식에서 고르기
  - 식품 검색 — 식약처 자료에서 정확한 값 찾기
  - 영양정보 직접 입력 — 포장지에 적힌 숫자 그대로

### ⑥ 내 음식 여러 개 고르기
- 제목 "내 음식" Bold 17 흰색
- 검색창 `#f1f3f5`, `px-14 py-11`, 모서리 14, "음식 이름으로 찾기"
- 목록 카드 모서리 18, `px-16 py-2`. 줄 `py-13`, 간격 12
  - 이름 SemiBold 14, 설명 Regular 12 (예: "1접시 · 탄 18 단 38 지 12")
  - 칼로리 SemiBold 13 (선택 `#7171ff` / 미선택 `#868e96`)
  - 체크 원 24×24 (선택: `#7171ff` + 흰 체크 / 미선택: 흰색 + 테두리 1.5px `#dee2e6`)
  - 구분선은 그라데이션
- "새 음식 직접 만들기" SemiBold 13 `#868e96` 밑줄
- 아래 바: 흰색, 위 모서리 20, `pt-12 pb-16 px-14`. 버튼 "2개 넣기" `#7171ff`, `py-15`, 모서리 14, Bold 15

### ⑦ 식품 검색
- 포커스된 검색창 흰색, 테두리 1.5px `#7171ff`, 모서리 14
- "검색 결과" SemiBold 11 `#868e96`
- 줄은 ⑥과 같고 출처 표시가 붙는다: 배경 `#f1f3f5`, `px-6 py-2`, 모서리 6, Regular 11 "식약처". 설명 "100g · 탄 0 단 23 지 1"
- 안내 "넣은 뒤 음식을 눌러 양을 맞춰요" Regular 12 `#adb5bd`
- 아래 버튼 "1개 넣기"

### ⑧ 영양정보 직접 입력
- 흰 블록, 모서리 16, `px-16 py-24`, 간격 32
- "음식 이름" SemiBold 12 `#868e96` + "•" `#7171ff`, 밑줄 입력(1px `#e9ecef`, 값 SemiBold 14)
- "열량" + 단위 "kcal"
- "탄수화물 · 단백질 · 지방" 상자 3개, 간격 8: 흰색, 테두리 1.5px `#e9ecef`, 모서리 12, `px-12 py-11`, 단위 "g" Medium 14 `#868e96`
- 점선 붙여넣기 영역: 테두리 1.5px `#ced4da`, 모서리 12, `p-12`
  - "성분표 글자 붙여넣기" Bold 13 `#7171ff`
  - `"715kcal, 탄수 98g, 단백질 27g…" 처럼 붙이면 칸이 채워져요` Regular 12
- 아래 버튼 "넣기"

## 모션에서 미리 정해 둘 것

- 시트·팝업: `bottomSheetUp`, `dropdownEnter` 재사용. CSS 애니메이션은 `backwards`만.
- 바깥 눌러 닫기는 `useDismiss`.
- 스크롤되는 시트는 네모로 두고 `SheetCorners` 방식으로 모서리를 덮는다.
- 칼로리 막대는 `chart-grow-x`, 음식 목록은 `.stagger-in`(앞 9줄).
- 새 모션은 `src/index.css`의 움직임 줄이기 블록에 추가하고 `docs/motion_and_ui_notes.md`도 고친다.
- 끝나면 피그마에 없어서 직접 정한 것과, 폰에서 확인하지 못한 것을 알린다.
