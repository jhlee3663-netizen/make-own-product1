import React from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import DietDetailScreen from '../src/components/screens/DietDetailScreen';
import { setUserStorage } from '../src/lib/userStorage';

/* 식단 기록 화면 미리보기 (더미 데이터).
   ?meal=lunch|dinner…  ?empty(기록 없음)
   ?open=menu|more|plus|foods|search|manual|edit|focus  ?pick=2(내 음식에서 앞의 몇 개를 고른 상태)
   서버가 없어 "어제 점심 그대로" 카드와 검색 결과는 나오지 않는다. */
const params = new URLSearchParams(location.search);
const UID = 'preview';
const food = (name, kcal, carb, protein, fat, serving) => ({ key: name, name, kcal, carb, protein, fat, serving, source: 'custom' });
setUserStorage(UID, 'diet_custom_foods', JSON.stringify([
  food('닭가슴살 샐러드', 420, 18, 38, 12, '1접시'),
  food('제육덮밥', 760, 82, 31, 28, '1그릇'),
  food('그릭요거트', 200, 9, 17, 10, '1컵'),
  food('아메리카노', 10, 2, 0, 0, '1잔'),
  food('프로틴 쉐이크', 180, 6, 30, 3, '1스쿱'),
]));
const item = (id, name, kcal, carb, protein, fat, extra = {}) => ({ id, name, kcal, carb, protein, fat, source: 'ai', ...extra });
const initialData = params.has('empty') ? null : {
  docId: 'x',
  timestamp: { seconds: Math.floor(Date.now() / 1000) },
  goal: 2100,
  sections: [
    { id: 'breakfast', name: '아침', items: [item('a', '그릭요거트', 200, 9, 17, 10), item('b', '바나나 1개', 120, 27, 1, 0)] },
    { id: 'lunch', name: '점심', items: [
      item('c', '제육덮밥 1그릇', 760, 82, 31, 28),
      item('d', '콜라 1캔', 110, 27, 0, 0, { serving: '250ml' }),
      item('e', '닭가슴살 150g', 165, 0, 35, 2, { source: 'mfds' }),
      item('f', '회식', 900, 60, 40, 50, { source: 'manual', entryType: 'manualMacros' }),
    ] },
  ],
};

const click = selector => document.querySelector(selector)?.click();
const clickText = text => [...document.querySelectorAll('button')].find(el => el.textContent.includes(text))?.click();
const steps = {
  menu: [() => click('[aria-label="끼니 바꾸기"]')],
  more: [() => click('[aria-label="더보기"]')],
  plus: [() => click('[aria-label="다른 방법으로 넣기"]')],
  foods: [() => click('[aria-label="다른 방법으로 넣기"]'), () => clickText('저장된 음식에서 고르기')],
  search: [() => click('[aria-label="다른 방법으로 넣기"]'), () => clickText('식약처 자료에서')],
  manual: [() => click('[aria-label="다른 방법으로 넣기"]'), () => clickText('포장지 숫자 그대로')],
  edit: [() => click('[aria-label$="고치기"]')],
  focus: [() => document.querySelector('textarea')?.focus()],
}[params.get('open')] || [];
const pick = Number(params.get('pick') || 0);
if (pick) steps.push(() => [...document.querySelectorAll('button[aria-pressed]')].slice(0, pick).forEach(el => el.click()));

createRoot(document.getElementById('root')).render(
  <div style={{ width: Number(params.get('w')) || 402, height: Number(params.get('h')) || 874, margin: '0 auto', position: 'relative', overflow: 'hidden' }}>
    <DietDetailScreen
      onBack={() => {}}
      onSave={() => {}}
      initialData={initialData}
      initialMeal={params.get('meal') || 'lunch'}
      uid={UID}
      profile={{ targetKcal: 2100 }}
    />
  </div>
);
steps.forEach((step, i) => setTimeout(step, 400 + i * 400));
