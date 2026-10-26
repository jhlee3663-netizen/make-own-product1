/* 폰 알림(FCM) 전용 서비스 워커. 앱 셸 서비스 워커(sw.js)와 따로 둔다.
   설정값은 등록할 때 주소 뒤 쿼리로 받는다 (src/lib/push.js). */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const params = new URL(self.location.href).searchParams;
firebase.initializeApp({
  apiKey: params.get('apiKey'),
  projectId: params.get('projectId'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
});
firebase.messaging();

/* 알림을 누르면 앱을 열고 그 화면으로 */
self.addEventListener('notificationclick', (event) => {
  const link = event.notification?.data?.FCM_MSG?.data?.link || event.notification?.data?.link || '/';
  event.notification.close();
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find((c) => new URL(c.url).origin === self.location.origin);
    if (open) { await open.focus(); open.postMessage({ type: 'push-open', link }); return; }
    await clients.openWindow(link);
  })());
});
