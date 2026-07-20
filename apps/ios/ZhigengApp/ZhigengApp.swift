import SwiftUI
import ZhigengCore

@main
struct ZhigengApp: App {
	@State private var store = AppStore()

	var body: some Scene {
		WindowGroup {
			RootView(store: store)
				.onOpenURL { url in
					handleDeepLink(url)
				}
		}
	}

	private func handleDeepLink(_ url: URL) {
		guard url.scheme == "zhigeng" else { return }
		store.reloadSharedState()
		switch url.host {
		case "dictate":
			store.showDictation = true
		case "history":
			store.selectedTab = .activity
		case "settings":
			store.selectedTab = .me
		default:
			break
		}
	}
}

struct RootView: View {
	@Bindable var store: AppStore
	@Environment(\.scenePhase) private var scenePhase

	var body: some View {
		Group {
			if store.onboardingCompleted {
				MainTabView(store: store)
			} else {
				OnboardingFlow(store: store)
			}
		}
		.onChange(of: scenePhase) { _, phase in
			if phase == .active {
				store.reloadSharedState()
			}
		}
	}
}
