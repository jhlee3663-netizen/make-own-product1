const WINDOW_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LEASE_MS = 70 * 1000;
const DEFAULT_LIMITS = Object.freeze({ userWindowRequests: 30, userDayRequests: 200, userDayTokenUnits: 8000000, userConcurrent: 6, globalDayRequests: 5000, globalDayTokenUnits: 100000000, globalConcurrent: 100 });

function limitsFrom(control = {}) {
  const limits = { ...DEFAULT_LIMITS };
  for (const key of Object.keys(limits)) {
    const value = control.limits?.[key];
    // A runtime control can lower limits, never silently remove the hard cap.
    if (Number.isSafeInteger(value) && value > 0) limits[key] = Math.min(value, limits[key]);
  }
  return limits;
}

function activeLeases(value, now) {
  return Object.fromEntries(Object.entries(value || {}).filter(([, until]) => Number.isFinite(until) && until > now));
}

// Budget units are conservative text-byte/output-token reservations, not a currency
// estimate. They are NOT refunded on failure: retries cannot evade the daily limit.
function reservationUnits(payload, maxOutputTokens) {
  return Buffer.byteLength(JSON.stringify(payload), 'utf8') * 2 + maxOutputTokens * 8 + 512;
}

function createQuotaStore(db, clock = Date.now) {
  const controlRef = db.doc('aiServiceUsage/control');
  const globalRef = db.doc('aiServiceUsage/global');
  return {
    async reserve(uid, requestId, units) {
      const now = clock();
      const userRef = db.doc(`aiUsage/${uid}`);
      return db.runTransaction(async tx => {
        const [userSnap, globalSnap, controlSnap] = await tx.getAll(userRef, globalRef, controlRef);
        const user = userSnap.data() || {}, global = globalSnap.data() || {}, control = controlSnap.data() || {};
        const limits = limitsFrom(control);
        if (control.enabled === false) return { allowed: false, scope: 'service-paused', retryAfterSeconds: 60 };
        const windowStartedAt = now - Number(user.windowStartedAt || 0) < WINDOW_MS ? Number(user.windowStartedAt) : now;
        const dayStartedAt = now - Number(user.dayStartedAt || 0) < DAY_MS ? Number(user.dayStartedAt) : now;
        const windowCount = windowStartedAt === user.windowStartedAt ? Number(user.windowCount || 0) : 0;
        const dayCount = dayStartedAt === user.dayStartedAt ? Number(user.dayCount || 0) : 0;
        const userUnits = dayStartedAt === user.dayStartedAt ? Number(user.reservedTokenUnits || 0) : 0;
        const dayKey = new Date(now).toISOString().slice(0, 10);
        const globalCount = global.dayKey === dayKey ? Number(global.dayCount || 0) : 0;
        const globalUnits = global.dayKey === dayKey ? Number(global.reservedTokenUnits || 0) : 0;
        const userLeases = activeLeases(user.activeRequests, now), globalLeases = activeLeases(global.activeRequests, now);
        const reject = (scope, until) => ({ allowed: false, scope, retryAfterSeconds: Math.max(1, Math.ceil((until - now) / 1000)) });
        if (windowCount >= limits.userWindowRequests) return reject('window', windowStartedAt + WINDOW_MS);
        if (dayCount >= limits.userDayRequests || userUnits + units > limits.userDayTokenUnits) return reject('day', dayStartedAt + DAY_MS);
        if (globalCount >= limits.globalDayRequests || globalUnits + units > limits.globalDayTokenUnits) return reject('service-day', Date.parse(`${dayKey}T00:00:00Z`) + DAY_MS);
        if (Object.keys(userLeases).length >= limits.userConcurrent) return reject('concurrent', Math.min(...Object.values(userLeases)));
        if (Object.keys(globalLeases).length >= limits.globalConcurrent) return reject('service-concurrent', Math.min(...Object.values(globalLeases)));
        userLeases[requestId] = now + LEASE_MS;
        globalLeases[requestId] = now + LEASE_MS;
        const userUpdate = { windowStartedAt, dayStartedAt, windowCount: windowCount + 1, dayCount: dayCount + 1, reservedTokenUnits: userUnits + units, activeRequests: userLeases, updatedAt: now };
        if (userSnap.exists) tx.update(userRef, userUpdate);
        else tx.set(userRef, userUpdate);
        tx.set(globalRef, { dayKey, dayCount: globalCount + 1, reservedTokenUnits: globalUnits + units, activeRequests: globalLeases, updatedAt: now });
        return { allowed: true, appCheckMode: control.appCheckMode === 'enforce' ? 'enforce' : 'monitor' };
      });
    },
    async release(uid, requestId) {
      const userRef = db.doc(`aiUsage/${uid}`);
      await db.runTransaction(async tx => {
        const [userSnap, globalSnap] = await tx.getAll(userRef, globalRef);
        for (const [ref, snap] of [[userRef, userSnap], [globalRef, globalSnap]]) {
          if (!snap.exists) continue;
          const leases = activeLeases(snap.data().activeRequests, clock());
          delete leases[requestId];
          // update replaces the map. set(..., merge:true) would retain removed leases.
          tx.update(ref, { activeRequests: leases });
        }
      });
    },
  };
}

module.exports = { createQuotaStore, reservationUnits, DEFAULT_LIMITS, LEASE_MS };
