import Foundation

final class WebSocketStreamingEngine: StreamingASREngine {
    let name: String
    var onResult: ((StreamingASRResult) -> Void)?
    var onStatus: ((String) -> Void)?

    private let label: String
    private let urlEnvironmentKey: String
    private let defaultURL: String
    private let resolver = PartialResultResolver()
    private let lock = NSLock()
    private var task: URLSessionWebSocketTask?
    private var latest = StreamingASRResult(fullText: "", stableText: "", unstableText: "")
    private var finalReceived = false
    private var preparedURL: URL?

    init(name: String, label: String, urlEnvironmentKey: String, defaultURL: String) {
        self.name = name
        self.label = label
        self.urlEnvironmentKey = urlEnvironmentKey
        self.defaultURL = defaultURL
    }

    func prepare() async throws {
        let urlString = ProcessInfo.processInfo.environment[urlEnvironmentKey] ?? defaultURL
        guard let url = URL(string: urlString) else {
            throw ASREngineError.runtimeLoadFailed("\(label): invalid WebSocket URL \(urlString)")
        }
        preparedURL = url
    }

    func startStream() throws {
        guard let preparedURL else {
            throw ASREngineError.missingEnvironment(urlEnvironmentKey)
        }

        reset()
        let task = URLSession.shared.webSocketTask(with: preparedURL)
        self.task = task
        task.resume()
        receiveNext()
        sendJSON([
            "type": "start",
            "engine": name,
            "sampleRate": 16_000,
            "format": "pcm_s16le",
            "channels": 1,
            "streaming": true
        ])
    }

    func accept(samples: [Float], sampleRate: Int) {
        guard sampleRate == 16_000 else { return }
        let data = pcm16Data(samples)
        task?.send(.data(data)) { error in
            if let error {
                self.reportStatus("audio send failed: \(error)")
            }
        }
    }

    func currentResult() -> StreamingASRResult {
        lock.lock()
        defer { lock.unlock() }
        return latest
    }

    func finishStream() async throws -> StreamingASRResult {
        setFinalReceived(false)
        sendJSON(["type": "finish"])
        for _ in 0..<100 where !isFinalReceived() {
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        let result = currentResult()
        task?.cancel(with: .normalClosure, reason: nil)
        task = nil
        return result
    }

    func reset() {
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        resolver.reset()
        setLatest(StreamingASRResult(fullText: "", stableText: "", unstableText: ""))
        setFinalReceived(false)
    }

    private func receiveNext() {
        task?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let message):
                self.handle(message)
                self.receiveNext()
            case .failure(let error):
                self.reportStatus("receive failed: \(error)")
                self.setFinalReceived(true)
            }
        }
    }

    private func handle(_ message: URLSessionWebSocketTask.Message) {
        let data: Data?
        switch message {
        case .string(let text):
            data = Data(text.utf8)
        case .data(let binary):
            data = binary
        @unknown default:
            data = nil
        }
        guard let data,
              let payload = try? JSONDecoder().decode(BackendASRMessage.self, from: data) else {
            return
        }

        switch payload.type {
        case "partial", "final", "done":
            let fullText = payload.fullText ?? payload.text ?? ""
            let result = resolver.resolve(newText: fullText).result
            setLatest(result)
            onResult?(result)
            if payload.type != "partial" {
                setFinalReceived(true)
            }
        case "error":
            reportStatus("backend error: \(payload.message ?? "unknown")")
            setFinalReceived(true)
        default:
            break
        }
    }

    private func setLatest(_ result: StreamingASRResult) {
        lock.lock()
        latest = result
        lock.unlock()
    }

    private func setFinalReceived(_ value: Bool) {
        lock.lock()
        finalReceived = value
        lock.unlock()
    }

    private func isFinalReceived() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return finalReceived
    }

    private func sendJSON(_ payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let text = String(data: data, encoding: .utf8) else {
            return
        }
        task?.send(.string(text)) { error in
            if let error {
                self.reportStatus("control send failed: \(error)")
            }
        }
    }

    private func reportStatus(_ message: String) {
        fputs("[\(name)] \(message)\n", stderr)
        onStatus?(message)
    }

    private func pcm16Data(_ samples: [Float]) -> Data {
        var data = Data(capacity: samples.count * 2)
        for sample in samples {
            let clipped = max(-1, min(1, sample))
            var value = Int16(clipped * Float(Int16.max)).littleEndian
            data.append(Data(bytes: &value, count: MemoryLayout<Int16>.size))
        }
        return data
    }
}

private struct BackendASRMessage: Decodable {
    let type: String
    let text: String?
    let fullText: String?
    let message: String?
}
