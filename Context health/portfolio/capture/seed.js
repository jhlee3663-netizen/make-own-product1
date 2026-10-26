// 캡처용 시드 데이터 (데모 유저 '민준', 기준일 2026-09-27)
const UID = 'demo-user';
const day = (offset, h = 19, m = 30) => {
  const d = new Date(); d.setDate(d.getDate() - offset); d.setHours(h, m, 0, 0); return d;
};
const sets = rows => rows.map((r, i) => `• 세트 ${i + 1}: ${r}`).join('\n');
const vol = secs => secs.flatMap(s => s.items).reduce((sum, it) =>
  sum + [...it.body.matchAll(/(\d+(?:\.\d+)?)kg\s*(\d+)회/g)].reduce((a, m) => a + m[1] * m[2], 0), 0);

function workout(Ts, offset, title, sections, overloadMsg) {
  return {
    type: 'workout', uid: UID, timestamp: Ts.fromDate(day(offset)), title,
    exercises: sections.flatMap(s => s.items.map(i => ({ name: i.title }))),
    originalText: '', sections, totalVolume: vol(sections), cardioMinutes: 0,
    overloadMsg, aiStatus: 'done', aiRevision: 1,
  };
}

const food = (id, name, kcal, carb, protein, fat) => ({ id, name, kcal, carb, protein, fat, source: 'ai' });
function diet(Ts, offset, meals, aiComment) {
  const names = { breakfast: '아침', am_snack: '오전간식', lunch: '점심', pm_snack: '오후간식', dinner: '저녁' };
  const sections = Object.entries(names).map(([id, name]) => ({ id, name, items: meals[id] || [] }));
  const all = sections.flatMap(s => s.items);
  const sum = k => Math.round(all.reduce((a, i) => a + i[k], 0));
  return {
    type: 'diet', uid: UID, timestamp: Ts.fromDate(day(offset, 21, 0)), goal: 2200,
    kcal: sum('kcal'), carb: sum('carb'), protein: sum('protein'), fat: sum('fat'),
    sections, unparsedInputs: {}, aiComment,
  };
}

export function seedDocs(Ts) {
  const docs = {};
  docs['users/demo-user'] = {
    profile: { name: '민준', gender: 'male', age: 29, height: 176, weight: 72, goalWeight: 75, goal: 'bulk', activityLevel: 'high', targetKcal: 2200 },
    onboardingDone: true, goals: [],
  };

  const w = (id, ...a) => { docs[`logs/${id}`] = workout(Ts, ...a); };
  w('w02', 2, '등, 이두', [
    { part: '등', items: [
      { title: '랫풀다운', body: sets(['55kg 12회', '60kg 10회', '65kg 8회']), note: '그립 넓게, 스트랩 사용' },
      { title: '바벨 로우', body: sets(['60kg 10회', '70kg 8회', '70kg 8회']) },
      { title: '시티드 케이블 로우', body: sets(['50kg 12회', '50kg 12회']) },
    ] },
    { part: '이두', items: [{ title: '바벨 컬', body: sets(['30kg 10회', '30kg 9회', '25kg 12회']) }] },
  ], '오늘 볼륨 6,975kg, 저번보다 3% 과부하 성공!');
  w('w03', 4, '하체', [
    { part: '하체', items: [
      { title: '스쿼트', body: sets(['80kg 10회', '100kg 8회', '110kg 6회', '110kg 5회']), note: '5세트째 무릎 컨디션 안 좋아서 중단' },
      { title: '레그프레스', body: sets(['180kg 12회', '200kg 10회', '200kg 10회']) },
      { title: '레그 익스텐션', body: sets(['50kg 15회', '50kg 12회', '40kg 15회']) },
    ] },
  ], '오늘 볼륨 12,440kg, 저번보다 4% 과부하 성공!');
  w('w04', 5, '어깨', [
    { part: '어깨', items: [
      { title: '오버헤드 프레스', body: sets(['40kg 10회', '45kg 8회', '45kg 7회']) },
      { title: '사이드 레터럴 레이즈', body: sets(['10kg 15회', '10kg 15회', '8kg 20회']), note: '승모 개입 줄이려고 반동 X' },
    ] },
  ], '오늘 볼륨 2,665kg');
  w('w05', 8, '가슴, 삼두', [
    { part: '가슴', items: [
      { title: '벤치프레스', body: sets(['60kg 12회', '70kg 10회', '75kg 8회', '75kg 8회']) },
      { title: '인클라인 덤벨프레스', body: sets(['24kg 10회', '24kg 10회', '24kg 10회']) },
      { title: '펙덱 플라이', body: sets(['40kg 12회', '40kg 12회', '35kg 12회']) },
    ] },
    { part: '삼두', items: [{ title: '케이블 푸시다운', body: sets(['30kg 12회', '25kg 12회', '25kg 12회']) }] },
  ], '오늘 볼륨 8,690kg');
  w('w06', 9, '등, 이두', [
    { part: '등', items: [
      { title: '랫풀다운', body: sets(['55kg 12회', '60kg 10회', '60kg 10회']) },
      { title: '바벨 로우', body: sets(['60kg 10회', '65kg 8회', '70kg 8회']) },
    ] },
  ], '오늘 볼륨 4,180kg');
  w('w07', 11, '하체', [
    { part: '하체', items: [
      { title: '스쿼트', body: sets(['80kg 10회', '100kg 8회', '105kg 6회', '105kg 6회']) },
      { title: '레그프레스', body: sets(['180kg 12회', '190kg 10회', '190kg 10회']) },
    ] },
  ], '오늘 볼륨 9,090kg');

  docs['logs/d00'] = diet(Ts, 0, {
    breakfast: [food('f1', '그릭요거트 + 그래놀라', 320, 38, 18, 10), food('f2', '아메리카노', 10, 1, 0, 0)],
    lunch: [food('f3', '닭가슴살 샐러드', 380, 18, 42, 14), food('f4', '현미밥 반 공기', 150, 33, 3, 1)],
    pm_snack: [food('f5', '프로틴 쉐이크', 180, 6, 30, 3), food('f6', '바나나', 105, 27, 1, 0)],
    dinner: [food('f7', '소고기 우둔 200g', 330, 0, 50, 12), food('f8', '고구마 1개', 190, 45, 3, 0), food('f9', '김치', 20, 3, 1, 0)],
  }, '단백질 148g으로 목표의 99%! 저녁 탄수만 조금 더 챙기면 완벽해요.');
  docs['logs/d01'] = diet(Ts, 1, {
    breakfast: [food('g1', '오트밀 + 우유', 350, 55, 15, 8)],
    lunch: [food('g2', '제육덮밥', 780, 95, 32, 28)],
    dinner: [food('g3', '연어 포케', 560, 60, 34, 18)],
  }, '');
  docs['logs/d02'] = diet(Ts, 2, {
    breakfast: [food('h1', '삶은 계란 3개', 210, 2, 18, 15)],
    lunch: [food('h2', '돈까스 정식', 950, 110, 35, 40)],
    dinner: [food('h3', '닭가슴살 도시락', 520, 55, 45, 12)],
  }, '');

  const now = new Date();
  const t = m => new Date(now.getTime() - m * 60000).toISOString();
  docs['users/demo-user/coachRooms/powerbuilding'] = {
    meta: { createdAt: now.getTime() - 3600000, updatedAt: now.getTime() - 600000 },
    updatedAt: Ts.fromDate(new Date(now.getTime() - 600000)),
    messages: [
      { role: 'user', text: '벤치 80kg에서 3주째 정체예요. 마지막 세트는 보조 받아야 겨우 7개 나와요.', timestamp: t(14) },
      { role: 'model', text: '최근 3주 기록을 보면 80kg 세트가 8→7→7회로 머물러 있고, 매번 마지막 세트에 보조가 들어갔어요.\n\n메모에 "왼쪽 어깨 걸림"이 두 번 적혀 있는 것도 신호예요. 다음 2주는 이렇게 가보세요.\n\n1. 탑세트 77.5kg × 6회 3세트로 볼륨 유지\n2. 인클라인은 30도 유지, 덤벨 24kg로 가동범위 우선\n3. 3주차에 82.5kg 싱글로 재측정', timestamp: t(13) },
      { role: 'user', text: '디로딩 느낌으로 가라는 거죠?', timestamp: t(11) },
      { role: 'model', text: '네, 강도는 살짝 낮추고 총 볼륨은 지키는 "볼륨 디로드"예요. 저번 주 가슴 볼륨 9,215kg 대비 90% 선만 맞추면 충분해요 💪', timestamp: t(10) },
    ],
  };
  return docs;
}
