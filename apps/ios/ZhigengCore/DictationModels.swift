import Foundation

public enum AppGroupConstants {
	public static let suiteName = "group.app.zhigeng.ios"
	public static let requestFileName = "dictation_request.json"
	public static let resultFileName = "dictation_result.json"
	public static let sessionFileName = "dictation_session.json"
	public static let lexiconFileName = "personal_lexicon.json"
	public static let keyboardHeartbeatFileName = "keyboard_heartbeat.json"
	/// Darwin notification name for result ready (App Group + notify).
	public static let resultReadyNotification = "app.zhigeng.ios.dictation.result"
}

/// Heartbeat written by the keyboard extension; main app must not invent Full Access.
public struct KeyboardHeartbeat: Codable, Equatable, Sendable {
	public var lastSeenAt: TimeInterval
	public var hasFullAccess: Bool
	public var extensionVersion: String

	public init(
		lastSeenAt: TimeInterval = Date().timeIntervalSince1970,
		hasFullAccess: Bool,
		extensionVersion: String = "0.1.0"
	) {
		self.lastSeenAt = lastSeenAt
		self.hasFullAccess = hasFullAccess
		self.extensionVersion = extensionVersion
	}

	public static let freshWindowSeconds: TimeInterval = 7 * 24 * 60 * 60

	public var isFresh: Bool {
		Date().timeIntervalSince1970 - lastSeenAt <= Self.freshWindowSeconds
	}
}

public enum DictationHistorySource: String, Codable, Sendable {
	case main
	case keyboard
	case demo
}

/// Local history for the main app only — not shared via App Group.
public struct DictationHistoryItem: Codable, Equatable, Identifiable, Sendable {
	public var id: String
	public var createdAt: TimeInterval
	public var source: DictationHistorySource
	public var status: DictationStatus
	public var cleanedText: String
	public var directStructured: Bool
	public var durationMs: Int?
	public var errorMessage: String?
	public var processingTags: [String]

	public init(
		id: String = UUID().uuidString,
		createdAt: TimeInterval = Date().timeIntervalSince1970,
		source: DictationHistorySource,
		status: DictationStatus,
		cleanedText: String,
		directStructured: Bool = false,
		durationMs: Int? = nil,
		errorMessage: String? = nil,
		processingTags: [String] = []
	) {
		self.id = id
		self.createdAt = createdAt
		self.source = source
		self.status = status
		self.cleanedText = cleanedText
		self.directStructured = directStructured
		self.durationMs = durationMs
		self.errorMessage = errorMessage
		self.processingTags = processingTags
	}
}

public enum HomeReadyKind: Equatable, Sendable {
	case setupIncomplete(missing: [HomeSetupItem])
	case ready
	case sessionActive(remainingSeconds: Int, modeLabel: String)
	case error(message: String, actionTitle: String)
}

public enum HomeSetupItem: String, Equatable, CaseIterable, Sendable {
	case microphone
	case keyboard
	case fullAccess
}

/// Pure reducer for the home hero — keeps UI honest about keyboard/Full Access detection.
public enum HomeReadyState {
	public static func resolve(
		microphoneGranted: Bool,
		heartbeat: KeyboardHeartbeat?,
		sessionActiveUntil: TimeInterval?,
		sessionModeLabel: String?,
		now: TimeInterval = Date().timeIntervalSince1970,
		serviceError: String? = nil
	) -> HomeReadyKind {
		if let serviceError, !serviceError.isEmpty {
			return .error(message: serviceError, actionTitle: "查看说明")
		}
		if let until = sessionActiveUntil, until > now {
			return .sessionActive(
				remainingSeconds: Int(until - now),
				modeLabel: sessionModeLabel ?? "免切换"
			)
		}
		var missing: [HomeSetupItem] = []
		if !microphoneGranted { missing.append(.microphone) }
		guard let heartbeat else {
			missing.append(.keyboard)
			return .setupIncomplete(missing: missing)
		}
		if !heartbeat.isFresh {
			// Stale heartbeat: do not claim Full Access is off; treat keyboard as needing re-check.
			missing.append(.keyboard)
			return .setupIncomplete(missing: missing)
		}
		if !heartbeat.hasFullAccess {
			missing.append(.fullAccess)
		}
		if missing.isEmpty {
			return .ready
		}
		return .setupIncomplete(missing: missing)
	}
}

public enum DictationStatus: String, Codable, Sendable {
	case idle
	case requesting
	case recording
	case processing
	case ready
	case incomplete
	case error
}

public struct DictationRequest: Codable, Equatable, Sendable {
	public var requestId: String
	public var createdAt: TimeInterval
	public var source: String

	public init(requestId: String = UUID().uuidString, createdAt: TimeInterval = Date().timeIntervalSince1970, source: String = "keyboard") {
		self.requestId = requestId
		self.createdAt = createdAt
		self.source = source
	}
}

public struct DictationResult: Codable, Equatable, Sendable {
	public var requestId: String
	public var status: DictationStatus
	public var text: String
	public var directStructured: Bool
	public var ts: TimeInterval
	public var errorMessage: String?

	public init(
		requestId: String,
		status: DictationStatus,
		text: String = "",
		directStructured: Bool = false,
		ts: TimeInterval = Date().timeIntervalSince1970,
		errorMessage: String? = nil
	) {
		self.requestId = requestId
		self.status = status
		self.text = text
		self.directStructured = directStructured
		self.ts = ts
		self.errorMessage = errorMessage
	}

	public var isInsertable: Bool {
		status == .ready && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
	}
}

public struct DictationSession: Codable, Equatable, Sendable {
	public var activeUntil: TimeInterval
	public var state: DictationStatus

	public init(activeUntil: TimeInterval, state: DictationStatus = .idle) {
		self.activeUntil = activeUntil
		self.state = state
	}

	public var isActive: Bool {
		Date().timeIntervalSince1970 < activeUntil
	}
}
