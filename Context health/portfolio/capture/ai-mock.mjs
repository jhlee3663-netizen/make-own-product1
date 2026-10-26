// 캡처용 Gemini 응답 모의 서버
import http from 'node:http';
const sets = (start, rows) => rows.map((r, i) => `• 세트 ${start + i}: ${r}`).join('\n');
const WORKOUT = [
  { part: '가슴', items: [
    { title: '벤치프레스', body: sets(1, ['60kg 12회', '70kg 10회', '80kg 8회', '82.5kg 8회 (강제반복)']), note: '마지막 세트 보조 2회, 왼쪽 어깨 살짝 걸림', supersetGroup: null },
    { title: '인클라인 덤벨프레스', body: sets(5, ['28kg 10회', '28kg 10회', '26kg 10회']), note: '벤치 각도 30도로 낮춤', supersetGroup: null },
    { title: '펙덱 플라이', body: sets(8, ['45kg 12회', '35kg 12회 (드랍세트)', '25kg 15회 (드랍세트)']), note: '기존 머신 고장 → 해머 스트렝스로 교체', supersetGroup: null },
  ] },
  { part: '삼두', items: [
    { title: '케이블 푸시다운', body: sets(11, ['32.5kg 12회', '30kg 12회', '27.5kg 15회']), supersetGroup: null },
  ] },
];
const COACH = '벤치 82.5kg 8회, 3주 만에 정체 구간을 넘었어요! 🎉\n보조 2개가 들어갔으니 다음 주엔 82.5kg × 8회를 보조 없이 완주하는 걸 목표로 잡아볼게요.';
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.end();
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    const text = body.includes('거친 운동 메모') ? JSON.stringify(WORKOUT) : COACH;
    setTimeout(() => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
    }, 300);
  });
}).listen(5190, () => console.log('ai mock :5190'));
