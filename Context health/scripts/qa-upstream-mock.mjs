/* 로컬 QA 전용 Gemini upstream 모의 서버.
   aiGenerate 프록시가 실제 Gemini로 나가지 않도록 GEMINI_API_BASE가 이 서버를 가리키게 한다.
   경로에 model 이름이 들어오므로 프록시가 허용 모델만 통과시키는지도 함께 관찰할 수 있다. */
import http from 'node:http';

const port = Number(process.env.QA_UPSTREAM_PORT || 5179);
const received = [];

const server = http.createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;

  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname === '/__received') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(received));
    return;
  }

  let body = {};
  try { body = JSON.parse(raw || '{}'); } catch {}
  received.push({
    path: url.pathname,
    hasKey: url.searchParams.has('key'),
    keyValue: url.searchParams.get('key'),
    promptChars: JSON.stringify(body?.contents || []).length,
  });

  const prompt = body?.contents?.[0]?.parts?.[0]?.text || '';
  if (prompt.includes('QA_UPSTREAM_429')) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'quota exceeded' } }));
    return;
  }
  if (prompt.includes('QA_UPSTREAM_HANG')) {
    await new Promise(resolve => setTimeout(resolve, 60000));
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    candidates: [{ content: { parts: [{ text: 'QA_UPSTREAM_OK' }] } }],
  }));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`qa upstream mock listening on ${port}`);
});
