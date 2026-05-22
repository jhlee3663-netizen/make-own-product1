import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.contexthealth.app',
  appName: 'Context Health',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
