import assert from 'node:assert/strict';
import { preserveUserRemarks } from '../src/utils/workoutNotes.js';

// 1) AI가 "-"로 적은 메모를 지웠으면 해당 종목 note로 되돌린다
{
  const source = [{ part: '삼두', items: [{ title: '케이블 푸쉬다운 (로프)', body: '20kg 15회\n25kg 12회\n- 팔꿈치 고정이 잘 안됨\n- 다음엔 30kg 도전' }] }];
  const ai = [{ part: '삼두', items: [{ title: '케이블 푸쉬다운', body: '• 세트 1: 20kg 15회\n• 세트 2: 25kg 12회' }] }];
  const out = preserveUserRemarks(ai, source);
  assert.equal(out[0].items[0].note, '팔꿈치 고정이 잘 안됨\n다음엔 30kg 도전');
  assert.equal(ai[0].items[0].note, undefined, '원본 객체는 바꾸지 않는다');
}
// 2) 이미 note에 들어 있으면(조금 다듬어졌어도) 중복으로 넣지 않는다
{
  const source = [{ part: '가슴', items: [{ title: '벤치프레스', body: '60kg 10회\n- 확실히 10회는 빡세다' }] }];
  const ai = [{ part: '가슴', items: [{ title: '벤치프레스', body: '• 세트 1: 60kg 10회', note: '확실히 10회는 빡세다.' }] }];
  assert.equal(preserveUserRemarks(ai, source)[0].items[0].note, '확실히 10회는 빡세다.');
}
// 3) 세트 기록·세트 타입 표기는 메모로 보지 않는다
{
  const source = [{ part: '등', items: [{ title: '랫풀다운', body: '- 40kg 12회\n45kg x 10\n(드랍세트)\n60 10 10 8' }] }];
  const ai = [{ part: '등', items: [{ title: '랫풀다운', body: '• 세트 1: 40kg 12회' }] }];
  assert.equal(preserveUserRemarks(ai, source)[0].items[0].note, undefined);
}
// 4) 종목 순서가 바뀌거나 이름이 달라져도 제목으로 찾아 붙인다
{
  const source = [{ part: '하체', items: [{ title: '스쿼트', body: '100kg 5회' }, { title: '레그프레스', body: '200kg 10회\n- 무릎이 조금 아팠음' }] }];
  const ai = [{ part: '하체', items: [{ title: '레그 프레스', body: '• 세트 2: 200kg 10회' }, { title: '바벨 스쿼트', body: '• 세트 1: 100kg 5회' }] }];
  const out = preserveUserRemarks(ai, source);
  assert.equal(out[0].items[0].note, '무릎이 조금 아팠음');
  assert.equal(out[0].items[1].note, undefined);
}
// 5) 자유 메모(문자열): 표시로 시작한 줄만 메모로 보고, 바로 위 종목에 붙인다
{
  const source = '벤치프레스\n60 10 10 8\n- 어깨가 뻐근했음\n스쿼트\n100kg 5회';
  const ai = [{ part: '가슴', items: [{ title: '벤치프레스', body: '• 세트 1: 60kg 10회' }] }, { part: '하체', items: [{ title: '스쿼트', body: '• 세트 4: 100kg 5회' }] }];
  const out = preserveUserRemarks(ai, source);
  assert.equal(out[0].items[0].note, '어깨가 뻐근했음');
  assert.equal(out[1].items[0].note, undefined);
}
// 6) 메모만 있는 종목
{
  const source = [{ part: '가슴', items: [{ title: '마사지', body: '가슴 마사지 받음, 확실히 나아짐' }] }];
  const ai = [{ part: '가슴', items: [{ title: '마사지', body: '' }] }];
  assert.equal(preserveUserRemarks(ai, source)[0].items[0].note, '가슴 마사지 받음, 확실히 나아짐');
}
console.log('workout notes: 6 cases passed');
