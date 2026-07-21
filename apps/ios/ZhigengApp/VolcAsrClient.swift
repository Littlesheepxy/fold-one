import Foundation
import ZhigengCore

/// Fetches Volc credentials from account-api and streams PCM through `VolcAsrEngine`.
final class VolcAsrClient: @unchecked Sendable {
	struct Config: Sendable {
		var apiBase: URL
		var authToken: String
		var hotWords: [String]
		var finishTimeoutMs: Int = 8_000
	}

	private struct TokenResponse: Decodable {
		let appId: String
		let cluster: String
		let token: String
		let expireAt: String
	}

	private let config: Config
	private let onEvent: @Sendable (AsrStreamEvent) -> Void
	private var engine: VolcAsrEngine?
	private var finishTimeoutWork: DispatchWorkItem?
	private var lastPartial = ""
	private let lock = NSLock()
	private var started = false

	init(config: Config, onEvent: @escaping @Sendable (AsrStreamEvent) -> Void) {
		self.config = config
		self.onEvent = onEvent
	}

	func start() {
		lock.lock()
		guard !started else {
			lock.unlock()
			return
		}
		started = true
		lock.unlock()

		Task {
			do {
				let credentials = try await Self.fetchToken(apiBase: config.apiBase, authToken: config.authToken)
				let engine = VolcAsrEngine { [weak self] event in
					self?.handleEngineEvent(event)
				}
				self.engine = engine
				guard engine.configure(
					credentials: .init(
						appId: credentials.appId,
						cluster: credentials.cluster,
						token: credentials.token
					),
					hotWords: config.hotWords
				), engine.start()
				else {
					fail("豆包引擎初始化失败")
					return
				}
			} catch {
				fail(error.localizedDescription)
			}
		}
	}

	func sendPCM(_ data: Data) {
		engine?.sendPCM(data)
	}

	func finish() {
		scheduleFinishTimeout()
		engine?.finish()
	}

	func abort() {
		finishTimeoutWork?.cancel()
		engine?.abort()
		cleanup()
	}

	func close() {
		finishTimeoutWork?.cancel()
		engine?.close()
		cleanup()
	}

	private func handleEngineEvent(_ event: AsrStreamEvent) {
		switch event {
		case .ready:
			emit(.ready)
		case let .partial(text):
			lastPartial = text
			emit(.partial(text))
		case let .done(result):
			finishTimeoutWork?.cancel()
			emit(.done(result))
			cleanup()
		case let .failed(message):
			finishTimeoutWork?.cancel()
			emit(.failed(message))
			cleanup()
		}
	}

	private func scheduleFinishTimeout() {
		finishTimeoutWork?.cancel()
		let work = DispatchWorkItem { [weak self] in
			guard let self else { return }
			if !self.lastPartial.isEmpty {
				self.emit(.done(VoiceResult(text: self.lastPartial, directStructured: false, incomplete: true)))
			} else {
				self.emit(.failed("识别超时，请重说一遍"))
			}
			self.engine?.close()
			self.cleanup()
		}
		finishTimeoutWork = work
		DispatchQueue.global().asyncAfter(
			deadline: .now() + .milliseconds(config.finishTimeoutMs),
			execute: work
		)
	}

	private static func fetchToken(apiBase: URL, authToken: String) async throws -> TokenResponse {
		guard let url = URL(string: "/asr/volc-token", relativeTo: apiBase) else {
			throw VolcAsrClientError.invalidURL
		}
		var request = URLRequest(url: url)
		request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
		let (data, response) = try await URLSession.shared.data(for: request)
		guard let http = response as? HTTPURLResponse else {
			throw VolcAsrClientError.unexpectedResponse
		}
		switch http.statusCode {
		case 200:
			return try JSONDecoder().decode(TokenResponse.self, from: data)
		case 401:
			throw VolcAsrClientError.notSignedIn
		case 503:
			throw VolcAsrClientError.notConfigured
		default:
			if let body = try? JSONDecoder().decode(APIErrorBody.self, from: data), let error = body.error {
				throw VolcAsrClientError.server(error)
			}
			throw VolcAsrClientError.unexpectedResponse
		}
	}

	private func fail(_ message: String) {
		emit(.failed(message))
		cleanup()
	}

	private func emit(_ event: AsrStreamEvent) {
		onEvent(event)
	}

	private func cleanup() {
		finishTimeoutWork?.cancel()
		finishTimeoutWork = nil
		engine = nil
		lock.lock()
		started = false
		lock.unlock()
	}
}

private struct APIErrorBody: Decodable {
	let error: String?
}

enum VolcAsrClientError: LocalizedError {
	case invalidURL
	case unexpectedResponse
	case notSignedIn
	case notConfigured
	case server(String)

	var errorDescription: String? {
		switch self {
		case .invalidURL: "账户 API 地址无效"
		case .unexpectedResponse: "无法获取豆包识别凭证"
		case .notSignedIn: "请先登录账户后再使用听写"
		case .notConfigured: "服务端未配置豆包 ASR，请联系管理员"
		case .server(let code): "识别凭证获取失败：\(code)"
		}
	}
}
