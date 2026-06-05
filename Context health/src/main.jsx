import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { initSentry, Sentry } from './lib/sentry.js'
import './index.css'

initSentry()
document.getElementById('boot-loader')?.remove()

ReactDOM.createRoot(document.getElementById('root')).render(
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
              className="h-11 w-full rounded-xl bg-[#3476EE] font-pretendard text-[14px] font-semibold text-white"
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
