import UIKit
import Capacitor

// iOS 26부터는 UIScene 생명주기를 쓰지 않으면 앱이 실행 직후 종료된다.
// Capacitor 8에는 아직 SceneDelegate가 없어서 여기서 직접 만든다.
// 화면은 Main.storyboard(CAPBridgeViewController)를 그대로 띄우고,
// 소셜 로그인 콜백 같은 URL은 Capacitor가 받던 통로(ApplicationDelegateProxy)로 넘긴다.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = UIStoryboard(name: "Main", bundle: nil).instantiateInitialViewController()
        window.makeKeyAndVisible()
        self.window = window

        // 앱이 꺼져 있을 때 링크로 열린 경우. 웹뷰가 뜬 뒤에 알려야 받는 쪽이 준비돼 있다.
        if let url = connectionOptions.urlContexts.first?.url {
            DispatchQueue.main.async {
                _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
            }
        }
        for activity in connectionOptions.userActivities {
            DispatchQueue.main.async {
                _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
            }
        }
    }

    // 앱이 떠 있는 동안 링크로 돌아온 경우 (카카오·네이버 로그인 콜백)
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url else { return }
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
    }

    // 유니버설 링크 (공유 링크로 앱이 열릴 때)
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }
}
