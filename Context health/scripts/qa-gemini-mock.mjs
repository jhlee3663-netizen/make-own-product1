import http from 'node:http';

const port = Number(process.env.QA_GEMINI_PORT || 5178);

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  let raw = '';
  for await (const chunk of req) raw += chunk;
  const prompt = JSON.parse(raw || '{}')?.contents?.[0]?.parts?.[0]?.text || '';
  const isDietDelay = prompt.includes('QA_DIET_DELAY');
  const isDietFailure = prompt.includes('QA_DIET_FAIL');
  const dietMarker = isDietDelay ? 'QA_DIET_DELAY' : 'QA_DIET_FAIL';
  const isDietSplit = (isDietDelay || isDietFailure) && prompt.includes('"query"');
  const isDietEstimate = (isDietDelay || isDietFailure) && !isDietSplit;
  const isComment = prompt.includes('30') && !prompt.includes('JSON');
  const value = prompt.includes('99kg') ? 99 : prompt.includes('80kg') ? 80 : 60;
  const delay = isDietDelay ? 3000 : !isComment && value === 99 ? 10000 : !isComment && value === 60 ? 1500 : 50;

  await new Promise(resolve => setTimeout(resolve, delay));
  if (isDietFailure) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'QA forced diet failure' } }));
    return;
  }

  const text = isDietSplit
    ? JSON.stringify([{ name: dietMarker, amount: '1 serving', query: dietMarker }])
    : isDietEstimate
      ? JSON.stringify({ name: 'QA test food', kcal: 321, carb: 40, protein: 20, fat: 9 })
    : isComment
    ? 'QA comment complete'
    : JSON.stringify([{ part: '가슴', items: [{ title: 'QA 벤치파레스', body: `• 세트 1: ${value}kg 10회` }] }]);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`QA Gemini mock listening on http://127.0.0.1:${port}`);
});
