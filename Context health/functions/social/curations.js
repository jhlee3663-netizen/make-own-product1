/* Context Health 큐레이션. 운영에서 직접 고르는 콘텐츠라 코드에 둔다.
   publishedAt이 미래면 아직 피드에 나오지 않는다. */

const CURATIONS = [
  {
    id: 'back-pullup-width',
    kind: 'routine',
    publishedAt: Date.parse('2026-10-20T09:00:00+09:00'),
    tag: '루틴',
    title: '등 넓이 키우는\n풀업 중심 루틴',
    summary: '등 · 6종목 · 약 70분 · 중급',
    parts: ['등'],
    level: '중급',
    minutes: 70,
    description: '풀업으로 광배를 먼저 지치게 한 뒤, 머신으로 넓이를 마무리하는 구성이에요.',
    caption: '등 넓이는 결국 풀업 볼륨에서 나오더라고요.\n첫 세트만 실패 직전까지 가고, 나머지는 같은 개수로 버텨 보세요.\n머신은 광배가 이미 지친 상태라 무게를 욕심내지 않는 게 포인트예요.',
    source: '공개된 자료를 정리했어요',
    gradient: ['#7171FF', '#F5A8FF'],
    items: [
      { name: '풀업', sets: 5, reps: '실패 직전까지', restSec: 120 },
      { name: '랫풀다운 와이드', sets: 4, reps: '10–12', restSec: 90 },
      { name: '시티드 로우', sets: 4, reps: '10', restSec: 90 },
      { name: '원암 덤벨 로우', sets: 3, reps: '12', restSec: 60 },
      { name: '스트레이트 암 풀다운', sets: 3, reps: '15', restSec: 60 },
      { name: '페이스 풀', sets: 3, reps: '15', restSec: 60 },
    ],
  },
  {
    id: 'cvs-protein-150',
    kind: 'diet',
    publishedAt: Date.parse('2026-10-19T09:00:00+09:00'),
    tag: '식단',
    title: '편의점으로\n단백질 150g 채우는 하루',
    summary: '1,850kcal · 탄 180 단 152 지 48',
    description: '편의점에서 살 수 있는 것만으로 하루 단백질 150g을 채우는 조합이에요.',
    caption: '편의점만 다녀도 단백질 150g은 채워져요.\n훈제란이랑 단백질 우유가 생각보다 큰 몫을 해요.',
    gradient: ['#FF9A8B', '#FFD36E'],
    totals: { kcal: 1850, carb: 180, protein: 152, fat: 48 },
    meals: [
      { id: 'breakfast', name: '아침', foods: [
        { name: '그릭요거트 200g', kcal: 180, carb: 12, protein: 20, fat: 5 },
        { name: '바나나 1개', kcal: 90, carb: 23, protein: 1, fat: 0 },
        { name: '아몬드 10알', kcal: 50, carb: 2, protein: 2, fat: 4 },
      ] },
      { id: 'lunch', name: '점심', foods: [
        { name: '닭가슴살 도시락', kcal: 480, carb: 55, protein: 38, fat: 11 },
        { name: '단백질 우유 1팩', kcal: 160, carb: 12, protein: 24, fat: 2 },
      ] },
      { id: 'pm_snack', name: '오후간식', foods: [
        { name: '단백질 바 1개', kcal: 210, carb: 22, protein: 15, fat: 8 },
        { name: '스트링 치즈 2개', kcal: 140, carb: 2, protein: 12, fat: 10 },
      ] },
      { id: 'dinner', name: '저녁', foods: [
        { name: '훈제란 3개', kcal: 210, carb: 2, protein: 18, fat: 14 },
        { name: '닭가슴살 샐러드', kcal: 190, carb: 10, protein: 22, fat: 4 },
        { name: '군고구마 1개', kcal: 120, carb: 28, protein: 2, fat: 0 },
      ] },
    ],
  },
  {
    id: 'legs-squat-base',
    kind: 'routine',
    publishedAt: Date.parse('2026-10-17T09:00:00+09:00'),
    tag: '루틴',
    title: '스쿼트로 시작하는\n하체 기본 루틴',
    summary: '하체 · 5종목 · 약 60분 · 초급',
    parts: ['하체'],
    level: '초급',
    minutes: 60,
    description: '무거운 스쿼트 하나에 집중하고, 나머지는 머신으로 안전하게 볼륨을 채워요.',
    caption: '하체 날은 스쿼트 다섯 세트에 힘을 다 쓰는 날이에요.',
    source: '공개된 자료를 정리했어요',
    gradient: ['#5BB8FF', '#9B8AFB'],
    items: [
      { name: '스쿼트', sets: 5, reps: '5', restSec: 150 },
      { name: '레그프레스', sets: 4, reps: '10', restSec: 90 },
      { name: '루마니안 데드리프트', sets: 3, reps: '10', restSec: 90 },
      { name: '레그 익스텐션', sets: 3, reps: '15', restSec: 60 },
      { name: '시티드 카프 레이즈', sets: 4, reps: '15', restSec: 45 },
    ],
  },
];

function publishedCurations(now = Date.now()) {
  return CURATIONS.filter((c) => c.publishedAt <= now).sort((a, b) => b.publishedAt - a.publishedAt);
}

function findCuration(id) {
  return CURATIONS.find((c) => c.id === id) || null;
}

module.exports = { CURATIONS, findCuration, publishedCurations };
