import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;

export function initSentry() {
  if (typeof window !== 'undefined') {
    window.__throwSentryTestError = () => {
      const error = new Error('Sentry test error');
      Sentry.captureException(error);
      throw error;
    };
  }

  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION || undefined,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.15 : 1,
    replaysSessionSampleRate: import.meta.env.PROD ? 0.05 : 0,
    replaysOnErrorSampleRate: 1,
    sendDefaultPii: false,
  });
}

export function setSentryUser(user) {
  if (!dsn) return;
  if (!user?.uid) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({
    id: user.uid,
    email: user.email || undefined,
    username: user.name || undefined,
  });
}

export { Sentry };
