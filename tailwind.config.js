/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: '#0054d1',
        'brand-light': 'rgba(0, 84, 209, 0.1)',
        cyan: '#008dcf',
        'red-orange': '#c94a00',
        ui: {
          1: '#f8f9fa',
          2: '#f1f3f5',
          3: '#e9ecef',
          4: '#dee2e6',
          5: '#ced4da',
          6: '#adb5bd',
        },
        typo: {
          strong: '#171a1d',
          normal: '#495057',
          secondary: '#646d76',
          alternative: '#868e96',
          inverse: '#ffffff',
        }
      },
      boxShadow: {
        card: '0 0 25px rgba(3, 27, 38, 0.08)',
        fab: '0 6px 16px rgba(0, 0, 0, 0.1)',
      },
      fontSize: {
        // Pretendard Title Series
        'title-hero': ['60px', { lineHeight: '80px', letterSpacing: '-0.025em' }], 
        'title-main': ['40px', { lineHeight: '52px', letterSpacing: '-0.025em' }], 
        'title-l': ['32px', { lineHeight: '42px', letterSpacing: '-0.025em' }],
        'title-m': ['28px', { lineHeight: '36px', letterSpacing: '-0.025em' }],
        'title-s': ['24px', { lineHeight: '32px', letterSpacing: '-0.025em' }],
        
        // Pretendard Body Series
        'body-xl': ['20px', { lineHeight: '36px', letterSpacing: '-0.025em' }],
        'body-l': ['18px', { lineHeight: '28px', letterSpacing: '-0.025em' }],
        'body-m': ['16px', { lineHeight: '24px', letterSpacing: '-0.025em' }],
        'body-s': ['14px', { lineHeight: '20px', letterSpacing: '-0.025em' }],
        
        // Pretendard Caption Series
        'caption-l': ['13px', { lineHeight: '20px', letterSpacing: '-0.025em' }],
        'caption-m': ['12px', { lineHeight: '18px', letterSpacing: '-0.025em' }],
        'caption-s': ['11px', { lineHeight: '16px', letterSpacing: '-0.025em' }],
        
        // Legacy fallbacks (to avoid breaking current UI during transition)
        xs: ['13px', '20px'],
        sm: ['14px', '20px'],
        md: ['16px', '24px'],
        lg: ['18px', '28px'],
        xl: ['24px', '32px'],
      }
    },
  },
  plugins: [],
}
