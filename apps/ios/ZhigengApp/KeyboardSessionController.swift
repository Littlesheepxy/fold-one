import Foundation
import Observation
import UIKit
import ZhigengCore

/// Long-lived keyboard dictation session: keepalive + App Group command loop + Volc ASR.
@MainActor
@Observable
final class KeyboardSessionController {
	private(set) var isRunning = false
	private(set) var mode: DictationSessionMode?
	private(set) var activeUntil: TimeInterval = 0
	private(set) var recording = false
	private(set) var lastError: String?

	private let store: AppStore
	private let bridge = AppGroupBridge()
	private let capture = AudioCaptureEngine()
	private let liveActivity = DictationLiveActivityController()
	private let pip = PictureInPictureSession()

	private var client: VolcAsrClient?
	private var currentRequestId: String?
	private var revision = 0
	private var heartbeatTimer: Timer?
	private var commandTimer: Timer?
	private var expiryTimer: Timer?
	private var pipHostView: UIView?

	init(store: AppStore) {
		self.store = store
		pip.onStopped = { [weak self] in
			Task { @MainActor in
				guard let self, self.mode == .pip, self.isRunning else { return }
				self.end(reason: "画中画已关闭")
			}
		}
	}

	func start(mode: DictationSessionMode, durationMinutes: Int) {
		end(silent: true)
		lastError = nil
		let until = Date().timeIntervalSince1970 + TimeInterval(durationMinutes * 60)
		self.mode = mode
		self.activeUntil = until

		do {
			switch mode {
			case .pip:
				try startPiPKeepAlive()
			case .liveActivity:
				guard startWarmMic() else {
					lastError = "麦克风暂时不可用"
					return
				}
			}
		} catch {
			lastError = error.localizedDescription
			return
		}

		isRunning = true
		writeSession(state: .idle)
		startHeartbeat()
		startCommandLoop()
		scheduleExpiry()
		liveActivity.start(
			modeLabel: mode == .pip ? "省电待命" : "长时间待命",
			remainingSeconds: Int(until - Date().timeIntervalSince1970)
		)
		store.sessionActiveUntil = until
		store.serviceError = nil
	}

	func end(reason: String? = nil, silent: Bool = false) {
		stopRecording(abort: true)
		heartbeatTimer?.invalidate()
		commandTimer?.invalidate()
		expiryTimer?.invalidate()
		heartbeatTimer = nil
		commandTimer = nil
		expiryTimer = nil
		capture.stop()
		pip.stop()
		pipHostView?.removeFromSuperview()
		pipHostView = nil
		liveActivity.end()
		isRunning = false
		recording = false
		mode = nil
		activeUntil = 0
		if !silent {
			try? bridge.writeSession(DictationSession(activeUntil: 0, state: .idle))
			store.sessionActiveUntil = nil
			if let reason {
				lastError = reason
				store.serviceError = reason
			}
		}
	}

	// MARK: - Keepalive

	private func startWarmMic() -> Bool {
		capture.startWarm(onPCM: { [weak self] data in
			Task { @MainActor in
				self?.client?.sendPCM(data)
			}
		})
	}

	private func startPiPKeepAlive() throws {
		guard let window = UIApplication.shared.connectedScenes
			.compactMap({ $0 as? UIWindowScene })
			.flatMap(\.windows)
			.first(where: \.isKeyWindow)
		else {
			throw PictureInPictureError.unsupported
		}
		let host = UIView(frame: .zero)
		host.isUserInteractionEnabled = false
		window.addSubview(host)
		pipHostView = host
		try pip.start(in: host)
	}

	// MARK: - Commands

	private func startCommandLoop() {
		commandTimer = Timer.scheduledTimer(withTimeInterval: 0.35, repeats: true) { [weak self] _ in
			Task { @MainActor in self?.pollCommand() }
		}
	}

	private func pollCommand() {
		guard isRunning else { return }
		guard let command = try? bridge.consumeCommand() else { return }
		switch command.kind {
		case .start:
			beginRecording(requestId: command.requestId)
		case .stop:
			finishRecording()
		case .cancel:
			stopRecording(abort: true)
			writeResult(
				DictationResult(requestId: command.requestId, status: .idle, text: "", revision: revision + 1)
			)
		}
	}

	private func beginRecording(requestId: String) {
		guard isRunning, !recording else { return }
		guard let authToken = store.remote.asrAuthToken,
		      let apiBase = store.remote.accountApiBase
		else {
			writeResult(
				DictationResult(
					requestId: requestId,
					status: .error,
					errorMessage: VolcAsrClientError.notSignedIn.errorDescription ?? "请先登录",
					revision: 1
				)
			)
			return
		}

		stopRecording(abort: true)
		currentRequestId = requestId
		revision = 0
		recording = true
		writeSession(state: .recording)

		let asr = VolcAsrClient(
			config: VolcAsrClient.Config(
				apiBase: apiBase,
				authToken: authToken,
				hotWords: store.lexicon.asrHotWords()
			)
		) { [weak self] event in
			Task { @MainActor in self?.handle(event) }
		}
		client = asr
		asr.start()

		switch mode {
		case .liveActivity:
			capture.feedEnabled = true
		case .pip:
			guard capture.start(onPCM: { [weak self] data in
				Task { @MainActor in self?.client?.sendPCM(data) }
			}) else {
				failRecording("麦克风暂时不可用")
				return
			}
		case .none:
			failRecording("会话未启动")
			return
		}

		liveActivity.update(
			status: "正在听",
			remainingSeconds: remainingSeconds()
		)
	}

	private func finishRecording() {
		guard recording else { return }
		capture.feedEnabled = false
		if mode == .pip {
			capture.stop()
		}
		writeSession(state: .processing)
		liveActivity.update(status: "整理中", remainingSeconds: remainingSeconds())
		client?.finish()
	}

	private func stopRecording(abort: Bool) {
		capture.feedEnabled = false
		if mode == .pip {
			capture.stop()
		}
		if abort {
			client?.abort()
		}
		client = nil
		recording = false
		currentRequestId = nil
		if isRunning {
			writeSession(state: .idle)
			liveActivity.update(status: "待命中", remainingSeconds: remainingSeconds())
		}
	}

	private func failRecording(_ message: String) {
		let id = currentRequestId ?? UUID().uuidString
		stopRecording(abort: true)
		writeResult(
			DictationResult(requestId: id, status: .error, errorMessage: message, revision: revision + 1)
		)
	}

	private func handle(_ event: AsrStreamEvent) {
		guard let requestId = currentRequestId else { return }
		switch event {
		case .ready:
			liveActivity.update(status: "正在听", remainingSeconds: remainingSeconds())
		case let .partial(text):
			revision += 1
			writeResult(
				DictationResult(requestId: requestId, status: .recording, text: text, revision: revision)
			)
			liveActivity.update(status: "正在听", partial: text, remainingSeconds: remainingSeconds())
		case let .done(result):
			revision += 1
			let status: DictationStatus = result.incomplete
				? .incomplete
				: (result.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .error : .ready)
			writeResult(
				DictationResult(
					requestId: requestId,
					status: status,
					text: result.text,
					directStructured: result.directStructured,
					errorMessage: status == .error ? "没有听清，请再说一次" : nil,
					revision: revision
				)
			)
			if !result.text.isEmpty {
				store.appendHistory(
					DictationHistoryItem(
						id: requestId,
						source: .keyboard,
						status: status == .ready ? .ready : (status == .incomplete ? .incomplete : .error),
						cleanedText: result.text,
						directStructured: result.directStructured,
						processingTags: result.directStructured ? ["按场景整理"] : []
					)
				)
			}
			client = nil
			recording = false
			currentRequestId = nil
			if mode == .pip {
				capture.stop()
			} else {
				capture.feedEnabled = false
			}
			writeSession(state: .idle)
			liveActivity.update(status: "待命中", remainingSeconds: remainingSeconds())
		case let .failed(message):
			revision += 1
			writeResult(
				DictationResult(
					requestId: requestId,
					status: .error,
					errorMessage: message,
					revision: revision
				)
			)
			stopRecording(abort: true)
		}
	}

	// MARK: - Session persistence

	private func startHeartbeat() {
		heartbeatTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
			Task { @MainActor in
				self?.writeSession(state: self?.recording == true ? .recording : .idle)
				self?.liveActivity.update(
					status: self?.recording == true ? "正在听" : "待命中",
					remainingSeconds: self?.remainingSeconds() ?? 0
				)
			}
		}
		writeSession(state: .idle)
	}

	private func scheduleExpiry() {
		let remaining = max(activeUntil - Date().timeIntervalSince1970, 0)
		expiryTimer = Timer.scheduledTimer(withTimeInterval: remaining, repeats: false) { [weak self] _ in
			Task { @MainActor in self?.end(reason: "待命已结束") }
		}
	}

	private func writeSession(state: DictationStatus) {
		guard let mode else { return }
		let session = DictationSession(
			activeUntil: activeUntil,
			state: state,
			mode: mode,
			heartbeatAt: Date().timeIntervalSince1970
		)
		try? bridge.writeSession(session)
	}

	private func writeResult(_ result: DictationResult) {
		try? bridge.writeResult(result)
	}

	private func remainingSeconds() -> Int {
		max(Int(activeUntil - Date().timeIntervalSince1970), 0)
	}
}
