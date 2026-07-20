import AVFoundation
import Foundation
import Observation
import UIKit
import ZhigengCore

enum OnboardingStep: Int, Codable, CaseIterable {
	case brandWelcome
	case tryLearn
	case keyboardSetup
	case readyBrand
}

enum AppTab: Hashable {
	case home
	case activity
	case lexicon
	case me
}

enum SessionMode: String, CaseIterable, Identifiable {
	case pip = "画中画"
	case liveActivity = "灵动岛"

	var id: String { rawValue }
}

enum SessionDuration: Int, CaseIterable, Identifiable {
	case five = 5
	case fifteen = 15
	case sixty = 60

	var id: Int { rawValue }
	var label: String {
		switch self {
		case .five: "5 分钟"
		case .fifteen: "15 分钟"
		case .sixty: "1 小时"
		}
	}
}

@Observable
@MainActor
final class AppStore {
	private let defaults: UserDefaults
	private let bridge: AppGroupBridge
	private let historyURL: URL

	var onboardingCompleted: Bool
	var onboardingStep: OnboardingStep
	var selectedTab: AppTab = .home
	var microphoneGranted: Bool
	var heartbeat: KeyboardHeartbeat?
	var lexicon: PersonalLexicon
	var history: [DictationHistoryItem] = []
	var sessionActiveUntil: TimeInterval?
	var sessionMode: SessionMode = .pip
	var sessionDuration: SessionDuration = .fifteen
	var showSessionSheet = false
	var showDictation = false
	var showAddTerm = false
	var editingHistoryItem: DictationHistoryItem?
	var pendingLearnTerm: String?
	var tryLearnDraft = ""
	var serviceError: String?

	init(
		defaults: UserDefaults = .standard,
		bridge: AppGroupBridge = AppGroupBridge(),
		historyDirectory: URL? = nil
	) {
		self.defaults = defaults
		self.bridge = bridge
		let dir = historyDirectory
			?? FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
		self.historyURL = dir.appendingPathComponent("dictation_history.json")
		self.onboardingCompleted = defaults.bool(forKey: "onboardingCompleted")
		if let raw = defaults.string(forKey: "onboardingStep"),
		   let step = OnboardingStep(rawValue: Int(raw) ?? 0) {
			self.onboardingStep = step
		} else {
			self.onboardingStep = .brandWelcome
		}
		self.microphoneGranted = AVAudioApplication.shared.recordPermission == .granted
		self.lexicon = PersonalLexicon()
		reloadSharedState()
		loadHistory()
	}

	var readyKind: HomeReadyKind {
		HomeReadyState.resolve(
			microphoneGranted: microphoneGranted,
			heartbeat: heartbeat,
			sessionActiveUntil: sessionActiveUntil,
			sessionModeLabel: sessionMode.rawValue,
			serviceError: serviceError
		)
	}

	var recentHistory: [DictationHistoryItem] {
		Array(history.prefix(3))
	}

	var recentLearnedTexts: [String] {
		lexicon.allTerms
			.sorted { $0.lastUsedAt > $1.lastUsedAt }
			.prefix(3)
			.map(\.text)
	}

	func reloadSharedState() {
		heartbeat = (try? bridge.readHeartbeat()) ?? readDefaultsHeartbeat()
		if let data = try? bridge.readLexiconData(),
		   let loaded = try? PersonalLexicon.decode(from: data) {
			lexicon = loaded
		}
		if let session = try? bridge.readSession(), session.isActive {
			sessionActiveUntil = session.activeUntil
		} else {
			sessionActiveUntil = nil
		}
		microphoneGranted = AVAudioApplication.shared.recordPermission == .granted
	}

	private func readDefaultsHeartbeat() -> KeyboardHeartbeat? {
		guard let defaults = UserDefaults(suiteName: AppGroupConstants.suiteName),
		      defaults.object(forKey: "keyboard.lastSeenAt") != nil
		else { return nil }
		return KeyboardHeartbeat(
			lastSeenAt: defaults.double(forKey: "keyboard.lastSeenAt"),
			hasFullAccess: defaults.bool(forKey: "keyboard.hasFullAccess"),
			extensionVersion: defaults.string(forKey: "keyboard.extensionVersion") ?? "0.1.0"
		)
	}

	func completeOnboarding() {
		onboardingCompleted = true
		defaults.set(true, forKey: "onboardingCompleted")
		selectedTab = .home
	}

	func setOnboardingStep(_ step: OnboardingStep) {
		onboardingStep = step
		defaults.set(String(step.rawValue), forKey: "onboardingStep")
	}

	func requestMicrophone(completion: @escaping @MainActor (Bool) -> Void) {
		AVAudioApplication.requestRecordPermission { granted in
			Task { @MainActor in
				self.microphoneGranted = granted
				completion(granted)
			}
		}
	}

	func openSystemSettings() {
		guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
		UIApplication.shared.open(url)
	}

	func startSession() {
		let until = Date().timeIntervalSince1970 + TimeInterval(sessionDuration.rawValue * 60)
		sessionActiveUntil = until
		try? bridge.writeSession(DictationSession(activeUntil: until, state: .idle))
		showSessionSheet = false
	}

	func endSession() {
		sessionActiveUntil = nil
		try? bridge.writeSession(DictationSession(activeUntil: 0, state: .idle))
	}

	@discardableResult
	func addTerm(_ text: String) -> PersonalTerm? {
		guard let term = lexicon.addManual(text) else { return nil }
		persistLexicon()
		return term
	}

	func forgetTerm(id: String) {
		lexicon.forget(id: id)
		persistLexicon()
	}

	func rememberCorrection(original: String, replacement: String, requestId: String) {
		_ = lexicon.recordCorrection(
			original: original,
			replacement: replacement,
			requestId: requestId,
			insertedAt: Date().timeIntervalSince1970
		)
		persistLexicon()
	}

	func appendHistory(_ item: DictationHistoryItem) {
		history.insert(item, at: 0)
		persistHistory()
	}

	func deleteHistory(id: String) {
		history.removeAll { $0.id == id }
		persistHistory()
	}

	/// Onboarding demo: shows structure value without claiming live ASR success.
	func finishTryLearnDemo() {
		let cleaned = "帮我跟小杨说一下，ARR 的表我今晚改完，明早发给他。"
		tryLearnDraft = cleaned
		pendingLearnTerm = "小杨"
		appendHistory(
			DictationHistoryItem(
				source: .demo,
				status: .ready,
				cleanedText: cleaned,
				directStructured: true,
				processingTags: ["示例：去除口头词", "示例：按消息整理", "示例：专名命中"]
			)
		)
	}

	func reopenOnboarding(at step: OnboardingStep = .brandWelcome) {
		onboardingCompleted = false
		defaults.set(false, forKey: "onboardingCompleted")
		setOnboardingStep(step)
	}

	func confirmPendingLearn() {
		if let term = pendingLearnTerm {
			_ = addTerm(term)
			_ = addTerm("ARR")
		}
		pendingLearnTerm = nil
	}

	func skipPendingLearn() {
		pendingLearnTerm = nil
	}

	private func persistLexicon() {
		if let data = try? lexicon.encode() {
			try? bridge.writeLexicon(data)
		}
	}

	private func loadHistory() {
		guard let data = try? Data(contentsOf: historyURL),
		      let items = try? JSONDecoder().decode([DictationHistoryItem].self, from: data)
		else { return }
		history = items
	}

	private func persistHistory() {
		guard let data = try? JSONEncoder().encode(history) else { return }
		try? data.write(to: historyURL, options: .atomic)
	}
}
