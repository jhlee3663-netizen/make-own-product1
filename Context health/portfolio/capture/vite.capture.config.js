import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
const here = p => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  root: here('../../'),
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^firebase\/app$/, replacement: here('./mock-app.js') },
      { find: /^firebase\/auth$/, replacement: here('./mock-auth.js') },
      { find: /^firebase\/firestore$/, replacement: here('./mock-firestore.js') },
    ],
  },
  define: { 'import.meta.env.VITE_SENTRY_DSN': '""', 'import.meta.env.VITE_GEMINI_GENERATE_URL': '"http://127.0.0.1:5190"' },
  server: { port: 5179, strictPort: true },
})
