/* 앱 코드가 시작된 시각. 시작 화면과 로그인 화면이 같은 로고 모션을 끊김 없이 이어 그리는 기준이다. */
export const APP_EPOCH = typeof performance !== 'undefined' ? performance.now() : 0;
export const LOGO_INTRO_MS = 1600; // LogoMotion 인트로가 끝나는 시간
