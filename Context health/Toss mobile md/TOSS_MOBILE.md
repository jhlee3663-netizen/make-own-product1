# TOSS DESIGN SYSTEM (TDS Mobile) — Full Reference

> Toss Design System Mobile (TDS) — 토스의 모바일 디자인 언어.
> Source: https://tossmini-docs.toss.im/tds-mobile/
> 이 문서는 공식 TDS Mobile 문서에서 실제 추출한 토큰·컴포넌트 API 레퍼런스예요.
>
> **데이터 정확도 표기**
> - ✅ VERIFIED — 공식 문서에서 직접 추출한 정확한 props/토큰
> - 📝 SUMMARY — 용도·역할만 요약 (세부 props는 공식 문서 참고)

---

## Brand Overview

- **Brand**: Toss (토스) by Viva Republica
- **Platform**: Mobile-first (iOS / Android / 앱 내 WebView)
- **Design Language**: 클린·미니멀 핀테크 UI. 여백 중심, 명확한 계층, 절제된 색상.
- **Primary**: Blue `#3182f6` — 모든 주요 액션
- **Danger**: Red `#f04452` / **Success**: Green `#03b26c` / **Warning**: Yellow `#ffc342`
- **Background**: White `#FFFFFF`, 보조 `#f2f4f6` (grey100)
- **Spacing 기본 단위**: 4px (구조 레이아웃은 8px 배수)
- **접근성 철학**: 모든 컴포넌트가 기본 ARIA 지원. 아이콘 전용 요소는 `aria-label` 필수.

---

## Foundation — Colors ✅

패키지: `@toss/tds-colors`

```js
import { colors } from '@toss/tds-colors';
<div style={{ backgroundColor: colors.blue500 }} />
```

### Grey

| Token | Hex | 용도 |
|---|---|---|
| grey50 | #f9fafb | 가장 연한 배경 |
| grey100 | #f2f4f6 | 보조 배경/카드 |
| grey200 | #e5e8eb | 구분선/비활성 배경 |
| grey300 | #d1d6db | 비활성 border |
| grey400 | #b0b8c1 | placeholder/비활성 아이콘 |
| grey500 | #8b95a1 | 보조 텍스트 |
| grey600 | #6b7684 | 서브 텍스트 |
| grey700 | #4e5968 | 중간 강조 텍스트 |
| grey800 | #333d4b | 보조 제목 |
| grey900 | #191f28 | 주요 텍스트/제목 |

### Blue (Primary)

| Token | Hex | | Token | Hex |
|---|---|---|---|---|
| blue50 | #e8f3ff | | blue500 | **#3182f6** ← Primary |
| blue100 | #c9e2ff | | blue600 | #2272eb |
| blue200 | #90c2ff | | blue700 | #1b64da |
| blue300 | #64a8ff | | blue800 | #1957c2 |
| blue400 | #4593fc | | blue900 | #194aa6 |

### Red (Danger)

| Token | Hex | | Token | Hex |
|---|---|---|---|---|
| red50 | #ffeeee | | red500 | **#f04452** ← Danger |
| red100 | #ffd4d6 | | red600 | #e42939 |
| red200 | #feafb4 | | red700 | #d22030 |
| red300 | #fb8890 | | red800 | #bc1b2a |
| red400 | #f66570 | | red900 | #a51926 |

### Green (Success)

| Token | Hex | | Token | Hex |
|---|---|---|---|---|
| green50 | #f0faf6 | | green500 | **#03b26c** ← Success |
| green100 | #aeefd5 | | green600 | #02a262 |
| green200 | #76e4b8 | | green700 | #029359 |
| green300 | #3fd599 | | green800 | #028450 |
| green400 | #15c47e | | green900 | #027648 |

### Yellow (Warning)

| Token | Hex | | Token | Hex |
|---|---|---|---|---|
| yellow50 | #fff9e7 | | yellow500 | **#ffc342** ← Warning |
| yellow100 | #ffefbf | | yellow600 | #ffb331 |
| yellow200 | #ffe69b | | yellow700 | #faa131 |
| yellow300 | #ffdd78 | | yellow800 | #ee8f11 |
| yellow400 | #ffd158 | | yellow900 | #dd7d02 |

### Orange

| Token | Hex | | Token | Hex |
|---|---|---|---|---|
| orange50 | #fff3e0 | | orange500 | #fe9800 |
| orange100 | #ffe0b0 | | orange600 | #fb8800 |
| orange200 | #ffcd80 | | orange700 | #f57800 |
| orange300 | #ffbd51 | | orange800 | #ed6700 |
| orange400 | #ffa927 | | orange900 | #e45600 |

### Teal

| Token | Hex | | Token | Hex |
|---|---|---|---|---|
| teal50 | #edf8f8 | | teal500 | #18a5a5 |
| teal100 | #bce9e9 | | teal600 | #109595 |
| teal200 | #89d8d8 | | teal700 | #0c8585 |
| teal300 | #58c7c7 | | teal800 | #097575 |
| teal400 | #30b6b6 | | teal900 | #076565 |

### Purple

| Token | Hex | | Token | Hex |
|---|---|---|---|---|
| purple50 | #f9f0fc | | purple500 | #a234c7 |
| purple100 | #edccf8 | | purple600 | #9128b4 |
| purple200 | #da9bef | | purple700 | #8222a2 |
| purple300 | #c770e4 | | purple800 | #73228e |
| purple400 | #b44bd7 | | purple900 | #65237b |

### Grey Opacity (반투명 오버레이)

| Token | Value | | Token | Value |
|---|---|---|---|---|
| greyOpacity50 | #001733 / 0.02 | | greyOpacity500 | #031832 / 0.46 |
| greyOpacity100 | #022047 / 0.05 | | greyOpacity600 | #00132b / 0.58 |
| greyOpacity200 | #001b37 / 0.10 | | greyOpacity700 | #031228 / 0.70 |
| greyOpacity300 | #001d3a / 0.18 | | greyOpacity800 | #000c1e / 0.80 |
| greyOpacity400 | #001936 / 0.31 | | greyOpacity900 | #020913 / 0.91 |

### Background

| Token | Value |
|---|---|
| background | #FFFFFF |
| greyBackground | grey100 (#f2f4f6) |
| layeredBackground | #FFFFFF |
| floatedBackground | #FFFFFF |

> **adaptive 색상**: 다크모드 대응이 필요하면 `colors` 대신 `adaptive.grey800` 형태의 adaptive 토큰을 사용해요 (컴포넌트 props 기본값에서 `adaptive.*`로 등장).

---

## Foundation — Typography ✅

패키지: `@toss/tds-typography`

> **중요**: 폰트 크기를 직접 px로 하드코딩하지 마세요. 토큰을 그대로 쓰면 OS "더 큰 텍스트" 접근성 모드에 자동 대응돼요.

### 토큰 스케일

| Token (단축형) | Font Size | Line Height | 용도 |
|---|---|---|---|
| Typography1 (t1) | 30px | 40px | 매우 큰 제목 |
| Typography2 (t2) | 26px | 35px | 큰 제목 |
| Typography3 (t3) | 22px | 31px | 일반 제목 |
| Typography4 (t4) | 20px | 29px | 작은 제목 |
| Typography5 (t5) | 17px | 25.5px | 일반 본문 |
| Typography6 (t6) | 15px | 22.5px | 작은 본문 |
| Typography7 (t7) | 13px | 19.5px | 캡션 |
| subTypography1 (st1) | 29px | 38px | |
| subTypography2 (st2) | 28px | 37px | |
| subTypography5 (st5) | 24px | 33px | |
| subTypography10 (st10) | 16px | 24px | |
| subTypography13 (st13) | 11px | 16.5px | 최소 캡션 |

> 컴포넌트 props에서 `typography` 값은 단축형(`t1`~`t7`, `st1`~`st13`)으로 받아요.

### Font Weight

각 토큰에 weight 변형: `_Light`(300) / `_Regular`(400) / `_Medium`(500) / `_Semibold`(600) / `_Bold`(700)
예: `Typography5_Bold`, `Typography3_Medium`

---

# Components

> 앱인토스 핵심 11개: Badge, Border, BottomCTA, Button, Asset, ListRow, ListHeader, Navigation, Paragraph, Tab, Top
> 전체 컴포넌트 35종을 아래에 정리.

---

## Badge ✅

항목 상태를 빠르게 인식시키는 레이블.

```tsx
<Badge size="medium" color="blue" variant="fill">NEW</Badge>
<Badge size="small" color="red" variant="weak">마감</Badge>
```

| Prop | Default | Values |
|---|---|---|
| variant* | — | `fill` \| `weak` |
| size* | — | `xsmall` \| `small` \| `medium` \| `large` |
| color* | — | `blue` \| `teal` \| `green` \| `red` \| `yellow` \| `elephant` |

- `fill`: 채도 높음, 강조 / `weak`: 채도 낮음, 보조

---

## Button ✅

액션 트리거용 핵심 컴포넌트.

```tsx
<Button color="primary" variant="fill" size="xlarge" display="full">확인</Button>
<Button color="danger" variant="weak">삭제</Button>
<Button loading>처리 중</Button>
<Button as="a" href="https://...">링크</Button>
```

| Prop | Default | Values |
|---|---|---|
| as | `button` | `button` \| `a` (a일 땐 href 필수) |
| color | `primary` | `primary` \| `danger` \| `light` \| `dark` |
| variant | `fill` | `fill` \| `weak` |
| display | `inline` | `inline` \| `block` \| `full` |
| size | `xlarge` | `small` \| `medium` \| `large` \| `xlarge` |
| loading | — | boolean (3-dot 인디케이터, 너비 유지) |
| disabled | — | boolean |
| type | — | `button` \| `submit` \| `reset` |

CSS 변수 커스터마이징:
`--button-color`, `--button-background-color`, `--button-disabled-opacity-color`, `--button-gradient-color`, `--button-loader-color`, `--button-pressed-background-color`, `--button-pressed-opacity` 등

```tsx
<Button style={{ '--button-background-color': '#FF6B6B', '--button-color': 'white' } as CSSProperties}>
  커스텀
</Button>
```

접근성: 아이콘만 있으면 `aria-label` 추가. loading 시 `aria-busy` 자동.

---

## ListRow ✅

리스트 UI 핵심. `left` / `contents` / `right` 3영역.

```tsx
<ListRow
  left={<ListRow.AssetIcon name="bank-toss" />}
  contents={<ListRow.Texts type="2RowTypeA" top="타이틀" bottom="서브텍스트" />}
  right={<Button size="small" variant="weak">버튼</Button>}
  border="indented"
  withArrow
  onClick={() => {}}
/>
```

| Prop | Default | Values |
|---|---|---|
| border | `indented` | `indented` \| `none` |
| verticalPadding | `medium` | `small`(8px) \| `medium`(12px) \| `large`(16px) \| `xlarge`(24px) |
| horizontalPadding | `medium` | `small`(20px) \| `medium`(24px) |
| disabled | `false` | boolean |
| disabledStyle | `type1` | `type1`(연한 배경) \| `type2`(진한 회색 배경) |
| left / contents / right | — | ReactNode |
| leftAlignment / rightAlignment | `center` | `top` \| `center` |
| withArrow | `false` | boolean (우측 화살표) |
| withTouchEffect | `false` | boolean |

`contents`의 `ListRow.Texts` type: `1RowTypeA`, `2RowTypeA` 등 (top/bottom 텍스트 레이아웃)

`ref` 메서드: `.shine(sec)` (반짝임), `.blink(sec)` (깜빡임)

로딩 스켈레톤:
```tsx
<ListRow.Loader type="circle" verticalPadding="extraSmall" />
// type: square | circle | bar
```

---

## TextField ✅

입력 필드. 서브컴포넌트로 Clearable / Password / Button 제공.

```tsx
<TextField variant="box" label="이름" labelOption="sustain" help="안내" placeholder="입력" />
<TextField variant="line" hasError help="에러 메시지" />
<TextField prefix="₩" suffix="원" />
<TextField.Clearable onClear={() => {}} />
<TextField.Password onVisibilityChange={(v) => {}} />
<TextField.Button onClick={() => {}} placeholder="선택" />
```

**TextFieldProps**

| Prop | Default | Values |
|---|---|---|
| variant* | — | `box` \| `line` \| `big` \| `hero` |
| label | — | string |
| labelOption | `appear` | `appear`(값 있을 때만) \| `sustain`(항상) |
| help | — | ReactNode (하단 도움말/에러 메시지) |
| hasError | `false` | boolean |
| disabled | `false` | boolean |
| prefix / suffix | — | string (앞/뒤 고정 텍스트) |
| right | — | ReactNode (우측 컴포넌트) |
| value / defaultValue | — | string |
| onChange / onFocus / onBlur | — | handler |
| format | — | `{ transform, reset }` |

- `TextField.Clearable`: + `onClear`
- `TextField.Password`: + `onVisibilityChange(visible)`
- `TextField.Button`: `<button>` 렌더, + `right`(기본 화살표 아이콘)

> 관련: `SplitTextField`(분할 입력), `TextArea`(여러 줄)

---

## SearchField ✅

검색 입력창. 삭제 버튼 내장.

```tsx
<SearchField placeholder="검색어 입력" fixed takeSpace onDeleteClick={() => {}} />
```

| Prop | Default | Values |
|---|---|---|
| fixed | `false` | boolean (상단 고정) |
| takeSpace | `true` | boolean (fixed 시 공간 유지) |
| onDeleteClick | — | () => void |

---

## Checkbox ✅

다중 선택. `Circle` / `Line` 형태. radio로도 사용 가능.

```tsx
<Checkbox.Circle checked={c} onCheckedChange={setC} aria-label="약관 동의" />
<Checkbox.Line defaultChecked />
<Checkbox.Circle inputType="radio" value="1" checked={v==='1'} onChange={e=>setV(e.target.value)} />
```

| Prop | Default | Values |
|---|---|---|
| inputType | `checkbox` | `checkbox` \| `radio` |
| size | `24` | number |
| checked | — | boolean (외부 제어, onCheckedChange와 함께) |
| onCheckedChange | — | (checked: boolean) => void |
| defaultChecked | — | boolean (내부 제어) |
| disabled | — | boolean (클릭 시 흔들림 애니메이션) |

접근성: `aria-label` 필수 ("체크박스" 단어는 넣지 말 것)

---

## Switch ✅

켜짐/꺼짐 토글.

```tsx
<Switch checked={on} onChange={(e, checked) => setOn(checked)} aria-label="다크 모드" />
```

| Prop | Default | Values |
|---|---|---|
| checked | — | boolean |
| disabled | `false` | boolean |
| name | — | string |
| hasTouchEffect | `true` | boolean |
| onChange | — | (event, checked) => void |
| onClick | — | (event) => void |

접근성: `role="switch"`, `aria-checked` 자동. 별도 레이블이면 `aria-label`.

---

## SegmentedControl ✅

여러 선택지 중 하나 (radio 역할).

```tsx
<SegmentedControl value={v} onChange={setV} size="small" alignment="fixed">
  <SegmentedControl.Item value="1">아이템1</SegmentedControl.Item>
  <SegmentedControl.Item value="2">아이템2</SegmentedControl.Item>
</SegmentedControl>
```

**SegmentedControlProps**

| Prop | Default | Values |
|---|---|---|
| children* | — | SegmentedControl.Item[] |
| size | `small` | `small` \| `large` |
| alignment | `fixed` | `fixed` \| `fluid`(가로 스크롤) |
| value | — | string (외부 제어) |
| defaultValue | — | string (내부 제어) |
| onChange | — | (v: string) => void |

**Item**: `children*`, `value*`, `size`

---

## Tab ✅

콘텐츠 전환 탭.

```tsx
<Tab size="large" fluid onChange={(i) => setSel(i)}>
  <Tab.Item selected={sel===0}>전체</Tab.Item>
  <Tab.Item selected={sel===1} redBean>알림</Tab.Item>
</Tab>
```

**TabProps**

| Prop | Default | Values |
|---|---|---|
| children* | — | Tab.Item[] |
| onChange* | — | (index, key?) => void |
| size | `large` | `large` \| `small` |
| fluid | `false` | boolean (4개 초과 시 가로 스크롤. false면 최대 4개 권장) |
| itemGap | — | number |
| ariaLabel | — | string |

**Item**: `selected*` (boolean), `redBean` (우상단 빨간 점)

---

## Top ✅

페이지 상단(헤더) 컴포넌트. 타이틀/서브타이틀/상하좌우 영역.

```tsx
<Top
  upperGap={24} lowerGap={24}
  title={<Top.TitleParagraph size={28}>제목</Top.TitleParagraph>}
  subtitleTop={<Top.SubtitleParagraph>부제목</Top.SubtitleParagraph>}
  right={<Top.RightButton color="dark" variant="weak">송금</Top.RightButton>}
  lower={<Top.LowerButton>왜 안되나요?</Top.LowerButton>}
/>
```

**TopProps**

| Prop | Default | Values |
|---|---|---|
| title* | — | ReactNode (Top.TitleParagraph/TitleTextButton/TitleSelector) |
| upperGap / lowerGap | `24` | number |
| upper | — | ReactNode (Top.UpperAssetContent) |
| lower | — | ReactNode (Top.LowerButton / LowerCTA / LowerCTAButton) |
| subtitleTop / subtitleBottom | — | ReactNode (Top.Subtitle*) |
| right | — | ReactNode (Top.RightButton / RightAssetContent) |
| rightVerticalAlign | `center` | `center` \| `end` |

**서브컴포넌트**
- `Top.TitleParagraph` — size `22`\|`28`, 기본 t3/bold
- `Top.TitleTextButton` / `Top.TitleSelector` (화살표 셀렉터)
- `Top.SubtitleParagraph` / `SubtitleTextButton` / `SubtitleSelector`
- `Top.SubtitleBadges` — `badges={[{ text, color, variant }]}`
- `Top.LowerButton` (size 기본 small) / `Top.LowerCTA` (type `2-button`, leftButton/rightButton) / `Top.LowerCTAButton`
- `Top.RightButton` (size 기본 medium) / `Top.RightAssetContent`
- `Top.UpperAssetContent`

접근성: `role="heading"`, `aria-level` 자동. 셀렉터는 `aria-haspopup="listbox"`.

---

## BottomCTA ✅

화면 하단 고정 CTA. `Single` / `Double` / `FixedBottomCTA`.

```tsx
<BottomCTA.Single hasSafeAreaPadding background="default">
  <Button display="full">다음</Button>
</BottomCTA.Single>

<BottomCTA.Single
  topAccessory={<div>안내</div>}
  showAfterDelay={{ animation: 'fade', delay: 1 }}
  hideOnScroll
>...</BottomCTA.Single>
```

**Single Props (TypeAProps)**

| Prop | Default | Values |
|---|---|---|
| children* | — | ReactNode |
| showAfterDelay | — | `{ animation: 'slide'\|'fade'\|'scale', delay: number }` |
| show | `false` | boolean |
| hideOnScroll | `false` | boolean |
| hideOnScrollDistanceThreshold | `1` | number (px) |
| hasSafeAreaPadding | `true` | boolean (SafeArea만큼 paddingBottom) |
| hasPaddingBottom | `true` | boolean |
| takeSpace | — | boolean |
| fixed | — | boolean (= FixedBottomCTA) |
| background | `default` | `default` \| `none` (none = gradient/배경 제거) |
| topAccessory / bottomAccessory | — | ReactNode |
| fixedAboveKeyboard | — | boolean (키보드 위 고정, Double 불가) |
| containerStyle | — | CSSProperties (키보드 시 opacity/bottom 변경 지양) |

- `BottomCTA.Double`: 좌우 2버튼
- `FixedBottomCTA`: 화면 최하단 고정 + 공간 차지

SafeArea CSS var: `--toss-safe-area-bottom`

---

## BottomSheet ✅

하단에서 슬라이드되는 패널.

```tsx
<BottomSheet
  open={open} onClose={() => setOpen(false)}
  header={<BottomSheet.Header>제목</BottomSheet.Header>}
  headerDescription={<BottomSheet.HeaderDescription>부제목</BottomSheet.HeaderDescription>}
  cta={<BottomSheet.CTA onClick={...}>확인</BottomSheet.CTA>}
>
  <Post.Paragraph>내용</Post.Paragraph>
</BottomSheet>
```

**주요 Props** (전체 30+ 중 핵심)

| Prop | Default | Values |
|---|---|---|
| open* | — | boolean |
| header / headerDescription | — | ReactNode |
| cta | — | ReactNode (BottomSheet.CTA / DoubleCTA) |
| children | — | ReactNode (메인 콘텐츠) |
| disableDimmer | `false` | boolean |
| hasTextField | `false` | boolean (키보드 위로 올림) |
| expandBottomSheet | `false` | boolean (위로 드래그 시 전체 높이) |
| maxHeight / expandedMaxHeight | — | number (px) |
| onClose / onExited / onEntered | — | () => void |
| onDimmerClick | — | () => void |
| ctaContentGap | `34px` | number |
| portalContainer | `document.body` | HTMLElement |
| UNSAFE_disableFocusLock | — | boolean (포커스 락 해제, 접근성 직접 대응 필요) |
| UNSAFE_ignoreDimmerClick | — | boolean |
| UNSAFE_ignoreBackEvent | — | boolean |

**서브컴포넌트**
- `BottomSheet.Header` (string → h1 + t4)
- `BottomSheet.HeaderDescription` (t6)
- `BottomSheet.CTA` / `BottomSheet.DoubleCTA` (leftButton/rightButton)
- `BottomSheet.Select` — `options={[{name, value}]}`, `onChange`, `value`

---

## Modal ✅

화면 위 오버레이 모달. `Overlay` + `Content`.

```tsx
<Modal open={open} onOpenChange={setOpen} onExited={() => {}}>
  <Modal.Overlay onClick={() => {}} />
  <Modal.Content style={{ padding: '32px 20px 20px' }}>
    <p>내용</p>
    <Button display="block" onClick={() => setOpen(false)}>확인</Button>
  </Modal.Content>
</Modal>
```

**ModalProps**

| Prop | Default | Values |
|---|---|---|
| open | — | boolean |
| onOpenChange | — | (open: boolean) => void |
| onExited | — | () => void |
| portalContainer | `document.body` | HTMLElement |

**Modal.Overlay**: `onClick`
접근성: `aria-hidden`(배경), `tabIndex=0`, `role="button"`(오버레이) 자동.

---

## Dialog (AlertDialog / ConfirmDialog) ✅

중요 정보 전달·확인용 모달.
- **AlertDialog**: 단일 버튼, 알림 확인용
- **ConfirmDialog**: 2버튼(취소/확인), 액션 확인용

```tsx
<AlertDialog
  open={open}
  title={<AlertDialog.Title>{'의견이\n전달되었어요'}</AlertDialog.Title>}
  description={<AlertDialog.Description>설명</AlertDialog.Description>}
  alertButton={<AlertDialog.AlertButton onClick={close}>확인</AlertDialog.AlertButton>}
  onClose={close}
/>
```

**AlertDialogProps**

| Prop | Default | Values |
|---|---|---|
| open | — | boolean |
| title / description / alertButton | — | ReactNode |
| closeOnDimmerClick | `true` | boolean (false면 외부 클릭 시 Wiggle) |
| closeOnBackEvent | `true` | boolean |
| onClose | — | () => void (반드시 전달해야 닫힘) |
| onEntered / onExited | — | () => void |
| portalContainer | `document.body` | HTMLElement |

- `AlertDialog.Title`: as `h3`, color grey800, t4, bold
- `AlertDialog.Description`: color grey600, t6, medium
- `AlertDialog.AlertButton`: size medium, color blue500, bold

> **ConfirmDialog** 📝: 동일 구조 + `ConfirmDialog.CancelButton` / `ConfirmDialog.ConfirmButton` (2버튼)

---

## Toast ✅

일시 알림 메시지. `overlay-extension`의 `useToast` 권장.

```tsx
const { showToast } = useToast();
showToast({ message: '저장되었어요.' });

// 또는 직접:
<Toast position="bottom" open={open} text="메시지"
  leftAddon={<Toast.Icon name="icn-success-color" />}
  button={<Toast.Button onClick={...}>확인</Toast.Button>}
  duration={3000} onClose={close} higherThanCTA />
```

**ToastProps**

| Prop | Default | Values |
|---|---|---|
| open* | — | boolean |
| position* | — | `top` \| `bottom` |
| text* | — | string |
| leftAddon | — | ReactNode (Toast.Icon / Toast.Lottie) |
| button | — | ReactNode (bottom 전용) |
| duration | `3000` | number (ms, 버튼 있으면 5000) |
| onClose / onExited | — | () => void |
| higherThanCTA | `false` | boolean (FixedBottomCTA 위, bottom 전용) |
| aria-live | `polite` | `assertive` \| `polite` |

서브: `Toast.Icon`(name, icon), `Toast.Button`(children, onClick), `Toast.Lottie`(src)

---

## Tooltip ✅

요소 위 보조 정보 말풍선.

```tsx
<Tooltip message="툴팁입니다" placement="bottom" size="medium" openOnHover autoFlip>
  <Button>Hover Me</Button>
</Tooltip>
```

**TooltipProps**

| Prop | Default | Values |
|---|---|---|
| size | `medium` | `small` \| `medium` \| `large` |
| open / defaultOpen | — / `false` | boolean (외부/내부 제어) |
| onOpenChange | — | (open) => void |
| message | — | ReactNode |
| messageAlign | `left` | `left` \| `center` \| `right` |
| placement | `bottom` | `top` \| `bottom` |
| motionVariant | `weak` | `weak` \| `strong` |
| offset | — | number (트리거와의 거리) |
| anchorPositionByRatio | `0.5` | number (0~1, 화살표 위치) |
| openOnHover / openOnFocus | `false` | boolean |
| dismissible | `false` | boolean (외부 클릭/ESC 닫기) |
| autoFlip | `false` | boolean (시야 벗어나면 반대로) |
| strategy | `absolute` | `absolute` \| `fixed` |
| clipToEnd | `none` | `left` \| `right` \| `none` (화살표 자르기) |

---

## Stepper ✅

여러 단계를 순차 표시. `StepperRow` 조합.

```tsx
<Stepper staggerDelay={0.1} play>
  <StepperRow
    left={<StepperRow.NumberIcon number={1} />}
    center={<StepperRow.Texts type="A" title="타이틀" description="설명" />}
    right={<StepperRow.RightArrow />}
  />
  <StepperRow ... hideLine />
</Stepper>
```

**StepperProps**: `play`(true), `delay`(0), `staggerDelay`(0.1)

**StepperRowProps**

| Prop | Default | Values |
|---|---|---|
| left* / center* | — | ReactNode |
| right | — | ReactNode |
| hideLine | `false` | boolean (마지막 단계에 사용) |

**서브컴포넌트**
- `StepperRow.Texts`: type `A`(t5/t6) \| `B`(t4/t6) \| `C`(t5/t7), title*, description
- `StepperRow.NumberIcon`: number 1~9
- `StepperRow.AssetFrame`: shape, content
- `StepperRow.RightArrow` / `StepperRow.RightButton`(size small, color primary)

---

## Skeleton ✅

로딩 중 레이아웃 placeholder.

```tsx
<Skeleton pattern="topListWithIcon" repeatLastItemCount={5} background="grey" />
<Skeleton custom={['title','subtitle','spacer(20)','card']} repeatLastItemCount={1} />
```

| Prop | Default | Values |
|---|---|---|
| height | `auto` | string \| number |
| pattern | `topList` | `topList` \| `topListWithIcon` \| `amountTopList` \| `amountTopListWithIcon` \| `subtitleList` \| `subtitleListWithIcon` \| `listOnly` \| `listWithIconOnly` \| `cardOnly` |
| custom | — | `('list'\|'title'\|'subtitle'\|'card'\|'listWithIcon'\|'spacer(N)')[]` |
| repeatLastItemCount | `3` | number \| `infinite`(최대 30) |
| play | `show` | `show` \| `hide` |
| background | `grey` | `white` \| `grey` \| `greyOpacity100` |

---

## IconButton ✅

아이콘 전용 버튼. `aria-label` 필수.

```tsx
<IconButton src="https://static.toss.im/icons/svg/icon-search-bold-mono.svg"
  variant="clear" color={adaptive.blue500} iconSize={24} aria-label="검색하기" />
```

| Prop | Default | Values |
|---|---|---|
| aria-label* | — | string (필수) |
| variant | `clear` | `fill` \| `clear` \| `border` |
| src | — | string (아이콘 URL, name과 배타) |
| name | — | string (아이콘 이름, src와 배타) |
| color | — | string (`-mono` 아이콘만) |
| bgColor | `adaptive.greyOpacity100` | string |
| iconSize | `24` | number |

---

## TextButton ✅

텍스트 인라인 버튼.

```tsx
<TextButton size="medium" variant="arrow">전체보기</TextButton>
<TextButton size="large" variant="underline">자세히</TextButton>
```

| Prop | Default | Values |
|---|---|---|
| size* | — | `xsmall` \| `small` \| `medium` \| `large` \| `xlarge` \| `xxlarge` |
| variant | `clear` | `arrow` \| `underline` \| `clear` |
| disabled | — | boolean |

(ParagraphText 확장)

---

## GridList ✅

그리드 배치. `GridList.Item`(이미지+텍스트), 터치 시 확대.

```tsx
<GridList column={2}>
  <GridList.Item image={<img src="..." style={{ width: 24, height: 24 }} />}>
    아이템 1
  </GridList.Item>
</GridList>
```

| Prop | Default | Values |
|---|---|---|
| column | `3` | number (1/2/3 열) |

**Item**: `image` (ReactNode), children (라벨)

---

## 나머지 컴포넌트 📝

> 아래는 용도·역할 요약. 정확한 props는 각 공식 문서 페이지 참고.
> Base: `https://tossmini-docs.toss.im/tds-mobile/components/{name}/`

| 컴포넌트 | 용도 |
|---|---|
| **Border** | 섹션 구분선. `<Border />` |
| **Paragraph** | 텍스트 블록. Typography 토큰 기반. `Paragraph.Text` 등 서브컴포넌트. |
| **ListHeader** | 리스트 섹션 헤더 (제목 + 우측 액션). |
| **ListFooter** | 리스트 하단 보조 정보. |
| **Navigation** | 하단 글로벌 탭 네비게이션 바. (앱인토스 핵심) |
| **Asset** | 아이콘/이미지/로티 등 시각 자원 시스템. `Asset.frameShape.*`(CircleMedium, SquareLarge, CleanW24/32/60 등), `Asset.ContentImage`, `Asset.Lottie`. ListRow/Stepper/Top의 left·right에 래핑해 사용. |
| **Loader** | 로딩 인디케이터. `<Loader />` |
| **Menu** | 액션 메뉴 리스트. |
| **NumericSpinner** | 숫자 증감 스피너. |
| **Stepper** (수량) | ⚠️ 위 Stepper는 단계 표시용. 수량 조절은 NumericSpinner 사용. |
| **Slider** | 값 범위 슬라이더 입력. |
| **Rating** | 별점 평가. |
| **ProgressBar** | 진행률 바. |
| **ProgressStepper** | 단계별 진행 표시 (점/바 형태). |
| **TableRow** | 테이블형 행 (라벨-값). |
| **BoardRow** | 게시판형 행 레이아웃. |
| **Bubble** | 말풍선 강조 텍스트. |
| **Highlight** | 텍스트 하이라이트 강조. |
| **Result** | 성공/실패 결과 화면 템플릿. |
| **Post** | 게시물/카드형 콘텐츠 블록. `Post.Paragraph` 등. |
| **BottomInfo** | 화면 하단 부가 정보 영역. |
| **Agreement (V3/V4)** | 약관 동의 컴포넌트. |
| **Chart / Bar Chart** | 데이터 시각화 바 차트. |
| **Keypad** | 커스텀 키패드: `NumberKeypad`, `AlphabetKeypad`, `FullSecureKeypad`(보안 입력). |
| **TextArea / SplitTextField** | 여러 줄 입력 / 분할 입력 필드. |

---

## Overlay Extension (Hooks) 📝

오버레이를 선언적으로 띄우는 훅. (권장 사용법)

```tsx
import { useToast, useDialog, useBottomSheet } from '...';

const { showToast } = useToast();
const { open: openDialog } = useDialog();
const { open: openSheet } = useBottomSheet();
```

- `useToast` — Toast 띄우기
- `useDialog` — AlertDialog/ConfirmDialog 띄우기
- `useBottomSheet` — BottomSheet 띄우기

---

## Design Principles ✅

1. **위계**: 주요 액션 → `fill`, 보조 → `weak`. Primary blue는 화면당 핵심 1개에만.
2. **색상 절제**: blue(기본) 외엔 의미 있을 때만 — red=danger, green=success, yellow=warning.
3. **여백**: 4px 기본 단위. ListRow/Top 등은 전용 padding/gap props로 제어.
4. **타이포 토큰 준수**: px 하드코딩 금지 (더 큰 텍스트 접근성 대응).
5. **접근성 기본 제공**: 컴포넌트가 ARIA 자동 처리. 아이콘 전용(IconButton, 아이콘 Checkbox/Switch/Tab)은 `aria-label` 필수. 레이블에 요소 유형("버튼", "체크박스") 중복 금지.
6. **오버레이는 훅으로**: Toast/Dialog/BottomSheet은 overlay-extension 훅 권장.
7. **SafeArea 대응**: 하단 고정 요소는 `hasSafeAreaPadding` / `--toss-safe-area-bottom`.

---

## Package Reference

```bash
yarn add @toss/tds-colors
yarn add @toss/tds-typography
# 컴포넌트 패키지는 앱인토스 파트너 전용으로 제공
```

라이선스: TDS UI Kit 사용 시 앱인토스 서비스 범위 내 사용만 허용. 지식재산권은 토스에 귀속.

Source: https://tossmini-docs.toss.im/tds-mobile/
앱인토스 가이드: https://developers-apps-in-toss.toss.im/design/components.html
