import { auth } from './firebase';

/* QA-01: 브라우저에 Gemini 키를 두지 않는다.
   모든 호출은 Firebase ID 토큰을 붙여 서버 프록시(/api/ai-generate)로 보낸다.
   VITE_GEMINI_GENERATE_URL은 로컬 QA 모의 서버 전용이며 운영 번들에서는 비어 있다. */
const AI_ENDPOINT = import.meta.env.VITE_GEMINI_GENERATE_URL || '/api/ai-generate';
const USING_LOCAL_MOCK = Boolean(import.meta.env.VITE_GEMINI_GENERATE_URL);

export class AiRequestError extends Error {
  constructor(kind, { status = 0, retryAfterSeconds = 0, message } = {}) {
    super(message || kind);
    this.name = 'AiRequestError';
    this.kind = kind;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/* 서버 오류 코드를 화면에서 구분할 수 있는 종류로 옮긴다 (QA-10 대응 기반). */
function classify(status, payload) {
  if (status === 401) return 'unauthenticated';
  if (status === 429) return 'rate-limited';
  if (status === 413) return 'too-large';
  if (status === 504) return 'timeout';
  if (status === 400 && payload?.error === 'model-not-allowed') return 'model-not-allowed';
  if (status >= 500) return 'upstream';
  return 'request';
}

/**
 * Gemini generateContent 프록시 호출. 성공 시 Gemini 원본 응답 형태를 그대로 돌려준다.
 * 실패는 AiRequestError로 던지므로 호출부에서 종류별 처리가 가능하다.
 */
export async function generateContent({
  model = 'gemini-3.6-flash',
  contents,
  systemInstruction,
  generationConfig,
  signal,
} = {}) {
  const headers = { 'Content-Type': 'application/json' };

  if (!USING_LOCAL_MOCK) {
    const user = auth.currentUser;
    if (!user) throw new AiRequestError('unauthenticated', { status: 401 });
    let token;
    try {
      token = await user.getIdToken();
    } catch {
      throw new AiRequestError('unauthenticated', { status: 401 });
    }
    headers.Authorization = `Bearer ${token}`;
  }

  const payload = { model, contents };
  if (systemInstruction) payload.systemInstruction = systemInstruction;
  if (generationConfig) payload.generationConfig = generationConfig;

  let res;
  try {
    res = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new AiRequestError('network');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AiRequestError(classify(res.status, data), {
      status: res.status,
      retryAfterSeconds: Number(data?.retryAfterSeconds || 0),
      message: data?.error,
    });
  }
  if (!data) throw new AiRequestError('upstream', { status: res.status });
  return data;
}

/** candidates에서 사용자에게 보여줄 실제 텍스트만 뽑는다. thought 파트는 건너뛴다. */
export function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return '';
  const chosen = parts.find(p => !p.thought) ?? parts[parts.length - 1];
  return typeof chosen?.text === 'string' ? chosen.text : '';
}
