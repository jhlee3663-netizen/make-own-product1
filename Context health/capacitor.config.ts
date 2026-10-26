import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.contexthealth.app',
  appName: 'Context Health',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    // Google/Apple은 기기 로그인 창에서 토큰만 받고, Firebase 로그인은 웹 SDK가 한다(LoginScreen signInNative).
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com', 'apple.com'],
    },
  },
};

export default config;
