import { Capacitor } from '@capacitor/core';

/* 스토어 앱(Capacitor)은 capacitor://localhost·https://localhost에서 열린다.
   상대 주소 /api/* 는 앱 내부로 가므로, 앱에서는 서버 주소를 앞에 붙인다. */
export const isNativeApp = Capacitor.isNativePlatform();
export const WEB_ORIGIN = 'https://context-health-3eb84.web.app';
export const NATIVE_URL_SCHEME = 'com.contexthealth.app';

export const apiUrl = (path) => (isNativeApp ? `${WEB_ORIGIN}${path}` : path);
