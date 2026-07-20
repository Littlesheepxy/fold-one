import SwiftUI
import UIKit
import ZhigengCore

final class KeyboardViewController: UIInputViewController {
	private var hostingController: UIHostingController<KeyboardRootView>?
	private let bridge = AppGroupBridge()
	private var linkStatus: KeyboardLinkStatus = .unknown

	override func viewDidLoad() {
		super.viewDidLoad()
		view.backgroundColor = .secondarySystemBackground
		refreshLinkStatus()
		rebuildHost()
	}

	override func viewWillAppear(_ animated: Bool) {
		super.viewWillAppear(animated)
		refreshLinkStatus()
		rebuildHost()
	}

	private func rebuildHost() {
		let root = KeyboardRootView(
			needsInputModeSwitchKey: needsInputModeSwitchKey,
			linkStatus: linkStatus,
			onInsert: { [weak self] text in
				self?.textDocumentProxy.insertText(text)
			},
			onDelete: { [weak self] in
				self?.textDocumentProxy.deleteBackward()
			},
			onNextKeyboard: { [weak self] in
				self?.advanceToNextInputMode()
			},
			onDictate: { [weak self] in
				self?.requestDictation()
			}
		)
		if let hostingController {
			hostingController.rootView = root
			return
		}
		let host = UIHostingController(rootView: root)
		host.view.backgroundColor = .clear
		addChild(host)
		view.addSubview(host.view)
		host.view.translatesAutoresizingMaskIntoConstraints = false
		NSLayoutConstraint.activate([
			host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
			host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
			host.view.topAnchor.constraint(equalTo: view.topAnchor),
			host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
			view.heightAnchor.constraint(greaterThanOrEqualToConstant: 260),
		])
		host.didMove(toParent: self)
		hostingController = host
	}

	private func refreshLinkStatus() {
		let full = hasFullAccess
		let hb = KeyboardHeartbeat(hasFullAccess: full)
		do {
			try bridge.writeHeartbeat(hb)
			writeDefaultsHeartbeat(hb)
			linkStatus = full ? .connected : .needsFullAccess
		} catch {
			linkStatus = full ? .appGroupMissing : .needsFullAccess
		}
	}

	private func writeDefaultsHeartbeat(_ hb: KeyboardHeartbeat) {
		guard let defaults = UserDefaults(suiteName: AppGroupConstants.suiteName) else { return }
		defaults.set(hb.lastSeenAt, forKey: "keyboard.lastSeenAt")
		defaults.set(hb.hasFullAccess, forKey: "keyboard.hasFullAccess")
		defaults.set(hb.extensionVersion, forKey: "keyboard.extensionVersion")
		defaults.synchronize()
	}

	private func requestDictation() {
		refreshLinkStatus()
		rebuildHost()
		guard linkStatus == .connected else { return }
		let request = DictationRequest()
		do {
			try bridge.writeRequest(request)
		} catch {
			linkStatus = .appGroupMissing
			rebuildHost()
			return
		}
		if let url = URL(string: "zhigeng://dictate?requestId=\(request.requestId)") {
			openURL(url)
		}
	}

	private func openURL(_ url: URL) {
		var responder: UIResponder? = self
		while let r = responder {
			if let application = r as? UIApplication {
				application.open(url, options: [:], completionHandler: nil)
				return
			}
			responder = r.next
		}
		extensionContext?.open(url, completionHandler: nil)
	}
}

enum KeyboardLinkStatus: Equatable {
	case unknown
	case connected
	case needsFullAccess
	case appGroupMissing

	var banner: String {
		switch self {
		case .unknown:
			return "正在连接知更…"
		case .connected:
			return "已连接主 App"
		case .needsFullAccess:
			return "请开启「允许完全访问」，主 App 才能检测到键盘"
		case .appGroupMissing:
			return "无法写入 App Group，请在 Xcode 确认 App Groups 签名"
		}
	}
}

struct KeyboardRootView: View {
	var needsInputModeSwitchKey: Bool
	var linkStatus: KeyboardLinkStatus
	var onInsert: (String) -> Void
	var onDelete: () -> Void
	var onNextKeyboard: () -> Void
	var onDictate: () -> Void

	var body: some View {
		VStack(spacing: 12) {
			Text(linkStatus.banner)
				.font(.caption)
				.foregroundStyle(linkStatus == .connected ? Color.secondary : Color.orange)
				.multilineTextAlignment(.center)
				.frame(maxWidth: .infinity)

			Button(action: onDictate) {
				Label(
					linkStatus == .connected ? "点按说话" : "先开启完全访问",
					systemImage: "mic.fill"
				)
				.font(.title3.weight(.semibold))
				.foregroundStyle(Color(uiColor: .systemBackground))
				.frame(maxWidth: .infinity, minHeight: 56)
			}
			.buttonStyle(.borderedProminent)
			.tint(Color(uiColor: .label))
			.disabled(linkStatus != .connected)

			HStack(spacing: 8) {
				Button(",") { onInsert(",") }
				Button("空格") { onInsert(" ") }
					.frame(maxWidth: .infinity)
				Button("删除", action: onDelete)
				Button("回车") { onInsert("\n") }
				if needsInputModeSwitchKey {
					Button("🌐", action: onNextKeyboard)
				}
			}
			.buttonStyle(.bordered)
		}
		.padding()
	}
}
