const crypto = require('crypto');
const { AiPolicyError, resolveRequest, extractResponse, validateResponse, reviewPayload, readReview, responseEnvelope } = require('./policy');
const { reservationUnits } = require('./quota');

const MODEL = 'gemini-3.6-flash';
const MAX_BODY_BYTES = 100 * 1024;
const MAX_PROMPT_CHARS = 60000;
const TIMEOUT_MS = 30000;

function createAiHandler({ auth, quota, verifyAppCheck, setCors, allowedOrigins, fetchImpl = fetch, env = process.env, logger = console, timeoutMs = TIMEOUT_MS }) {
  return async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'method-not-allowed' });
    const origin = req.get('origin');
    if (origin && !allowedOrigins.has(origin)) return res.status(403).json({ error: 'origin-not-allowed' });
    const authorization = req.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' });
    let uid;
    try {
      const decoded = await auth.verifyIdToken(authorization.slice(7));
      if (!decoded.uid || decoded.firebase?.sign_in_provider === 'anonymous') return res.status(401).json({ error: 'unauthorized' });
      uid = decoded.uid;
    } catch { return res.status(401).json({ error: 'unauthorized' }); }
    const body = req.body || {};
    if (body.model !== undefined && body.model !== MODEL) return res.status(400).json({ error: 'model-not-allowed' });
    const serialized = JSON.stringify(body);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) return res.status(413).json({ error: 'payload-too-large' });
    if (serialized.length > MAX_PROMPT_CHARS) return res.status(413).json({ error: 'prompt-too-large' });
    let resolved;
    try { resolved = resolveRequest(body); } catch (error) { return res.status(error.status || 400).json({ error: error.code || 'invalid-request' }); }
    const requestId = crypto.randomUUID();
    let reserved = false;
    let timer;
    try {
      const admission = await quota.reserve(uid, requestId, reservationUnits(resolved.payload, resolved.spec.maxOutputTokens));
      if (!admission.allowed) {
        res.set('Retry-After', String(admission.retryAfterSeconds));
        return res.status(429).json({ error: 'rate-limited', scope: admission.scope, retryAfterSeconds: admission.retryAfterSeconds });
      }
      reserved = true;
      const appCheckToken = req.get('X-Firebase-AppCheck');
      let appCheckValid = false;
      if (appCheckToken) {
        try { await verifyAppCheck(appCheckToken); appCheckValid = true; } catch { /* Logged without tokens or input data below. */ }
      }
      if (!appCheckValid) {
        logger.info('AI App Check', { uid, task: resolved.task, state: appCheckToken ? 'invalid' : 'missing', mode: admission.appCheckMode });
        if (admission.appCheckMode === 'enforce') return res.status(403).json({ error: 'app-check-required' });
      }
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), timeoutMs);
      const generate = async payload => {
        const upstream = await fetchImpl(`${env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta'}/models/${MODEL}:generateContent?key=${env.GEMINI_KEY}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal,
        });
        if (controller.signal.aborted) throw new AiPolicyError('upstream-timeout', 504);
        if (!upstream.ok) throw new AiPolicyError(upstream.status === 429 ? 'upstream-rate-limited' : 'upstream-error', upstream.status === 429 ? 429 : 502);
        const data = await upstream.json();
        if (controller.signal.aborted) throw new AiPolicyError('upstream-timeout', 504);
        return data;
      };
      const data = await generate(resolved.payload);
      const text = validateResponse(resolved.task, extractResponse(data));
      // Independent, fixed-purpose review: JSON shape alone cannot detect off-topic
      // content hidden inside valid fields. Never return the unreviewed response.
      const review = readReview(await generate(reviewPayload(resolved, text)));
      if (!review.allowed) {
        logger.warn('AI policy blocked', { uid, task: resolved.task, reason: review.reason });
        if (resolved.task === 'coach') return res.status(200).json(responseEnvelope('운동·식단과 관련된 안전한 질문을 도와드릴 수 있어요. 목표나 최근 기록을 알려주세요.'));
        return res.status(422).json({ error: 'policy-blocked' });
      }
      logger.info('AI request completed', { uid, task: resolved.task, requestId });
      return res.status(200).json(responseEnvelope(text));
    } catch (error) {
      const timedOut = error.name === 'AbortError' || error.code === 'upstream-timeout';
      logger.error('AI request failed', { uid, task: resolved.task, requestId, code: timedOut ? 'timeout' : error.code || 'upstream-error' });
      return res.status(timedOut ? 504 : error.status || (reserved ? 502 : 503)).json({ error: timedOut ? 'upstream-timeout' : error.code || (reserved ? 'upstream-error' : 'quota-unavailable') });
    } finally {
      clearTimeout(timer);
      if (reserved) {
        try { await quota.release(uid, requestId); } catch { logger.error('AI lease release failed', { uid, requestId }); }
      }
    }
  };
}

module.exports = { createAiHandler };
