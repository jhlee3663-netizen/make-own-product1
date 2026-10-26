import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/* 로컬 개발에서는 /api/* 가 Hosting rewrite 대신 Functions 에뮬레이터로 가야 한다.
   운영 빌드에는 영향이 없다 (dev server 전용 설정). */
const FUNCTIONS_EMULATOR_PROJECT = process.env.VITE_FIREBASE_PROJECT_ID || 'demo-context-health';
const FUNCTIONS_EMULATOR_ORIGIN = process.env.VITE_FUNCTIONS_EMULATOR_ORIGIN || 'http://127.0.0.1:5001';

export default defineConfig({
  server: {
    proxy: {
      '/api/ai-generate': {
        target: FUNCTIONS_EMULATOR_ORIGIN,
        changeOrigin: true,
        rewrite: () => `/${FUNCTIONS_EMULATOR_PROJECT}/us-central1/aiGenerate`,
      },
      '/api/delete-account': {
        target: FUNCTIONS_EMULATOR_ORIGIN,
        changeOrigin: true,
        rewrite: () => `/${FUNCTIONS_EMULATOR_PROJECT}/us-central1/deleteAccount`,
      },
      '/api/mcp-oauth': {
        target: FUNCTIONS_EMULATOR_ORIGIN,
        changeOrigin: true,
        rewrite: (path) => `/${FUNCTIONS_EMULATOR_PROJECT}/us-central1/mcp${path}`,
      },
      '/api/social/': {
        target: FUNCTIONS_EMULATOR_ORIGIN,
        changeOrigin: true,
        rewrite: (path) => `/${FUNCTIONS_EMULATOR_PROJECT}/us-central1/social${path.replace(/^\/api\/social/, '')}`,
      },
      '/api/social-auth': {
        target: FUNCTIONS_EMULATOR_ORIGIN,
        changeOrigin: true,
        rewrite: () => `/${FUNCTIONS_EMULATOR_PROJECT}/us-central1/socialAuth`,
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'logo-gradient-fill.jpg', 'favicon.png', 'apple-touch-icon.png', 'memo-workout.png', 'memo-diet.png', 'logo-badge.svg'],
      manifest: {
        name: 'Context Health',
        short_name: 'Context Health',
        description: 'AI 기반 운동·식단 관리',
        theme_color: '#ffffff',
        // 폰이 앱을 띄우는 순간 보여주는 화면의 배경. 시작 화면 그라데이션의 중간색으로 맞춘다.
        // 설치한 앱(안드로이드)은 이 색으로 화면 맨 아래 시스템 줄을 칠한다. 보라로 두면 하단 네비 아래에 보라 띠가 생긴다.
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // Firebase 인증 핸들러(/__/auth/*)와 API는 절대 앱 셸로 가로채지 않는다.
        navigateFallbackDenylist: [/^\/__\//, /^\/api\//, /^\/mcp$/, /^\/\.well-known\//, /^\/firebase-messaging-sw\.js/],
      },
    }),
  ],
})
