import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { initSentry, Sentry } from './lib/sentry.js'
import { isNativeApp, NATIVE_URL_SCHEME } from './lib/native.js'
import './index.css'

initSentry()
if (isNativeApp) document.documentElement.classList.add('native-app')
document.getElementById('boot-loader')?.remove()

/* 앱 셸 서비스 워커는 웹에서만 등록한다.
   스토어 앱(Capacitor)은 자산이 이미 기기에 있어 캐싱이 필요 없고,
   https://localhost에서는 /sw.js를 가져오지 못해 등록이 실패한다.
   실패를 잡아두지 않으면 처리되지 않은 Promise로 Sentry에 에러가 쌓인다. */
if (!isNativeApp && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
  })
}

/* 스토어 앱에서 시작한 카카오/네이버 로그인은 등록된 웹 주소(/oauth/...)로 돌아온다.
   state가 'n'으로 시작하면(앱이 만든 요청) 웹에서 로그인하지 않고 앱으로 넘겨준다.
   일부 브라우저는 자동 이동을 막으므로 직접 누를 버튼도 둔다. */
const nativeCallback = window.location.pathname.match(/^\/oauth\/(kakao|naver)\/?$/)
const toNativeApp = nativeCallback && new URLSearchParams(window.location.search).get('state')?.startsWith('n')
  ? `${NATIVE_URL_SCHEME}://oauth/${nativeCallback[1]}${window.location.search}`
  : null

const root = ReactDOM.createRoot(document.getElementById('root'))
if (toNativeApp) {
  window.location.replace(toNativeApp)
  root.render(
    <div className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="w-full max-w-[360px] text-center">
        <h1 className="font-pretendard text-[18px] font-semibold text-[#171a1d] m-0">앱으로 돌아가는 중이에요</h1>
        <p className="font-pretendard text-[14px] leading-5 text-[#646d76] mt-2 mb-5">자동으로 넘어가지 않으면 아래 버튼을 눌러주세요.</p>
        <a href={toNativeApp} className="flex h-11 w-full items-center justify-center rounded-xl bg-[#7171FF] font-pretendard text-[14px] font-semibold text-white">
          툭핏 앱으로 돌아가기
        </a>
      </div>
    </div>,
  )
} else root.render(
  <React.StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa] px-6">
          <div className="w-full max-w-[360px] rounded-2xl bg-white p-6 text-center shadow-sm">
            <h1 className="font-pretendard text-[18px] font-semibold text-[#171a1d] m-0">잠시 문제가 생겼어요</h1>
            <p className="font-pretendard text-[14px] leading-5 text-[#646d76] mt-2 mb-5">
              화면을 새로고침하면 다시 이어서 사용할 수 있어요.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-11 w-full rounded-xl bg-[#7171FF] font-pretendard text-[14px] font-semibold text-white"
            >
              새로고침
            </button>
          </div>
        </div>
      }
    >
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
)
