import Foundation

struct StreamingASRResult: Codable, Equatable {
    let fullText: String
    let stableText: String
    let unstableText: String
    let timestampNanoseconds: UInt64

    init(fullText: String, stableText: String, unstableText: String, timestamp: ContinuousClock.Instant = .now) {
        self.fullText = fullText
        self.stableText = stableText
        self.unstableText = unstableText
        self.timestampNanoseconds = UInt64(Date().timeIntervalSince1970 * 1_000_000_000)
    }
}

protocol StreamingASREngine {
    var name: String { get }
    var onResult: ((StreamingASRResult) -> Void)? { get set }
    var onStatus: ((String) -> Void)? { get set }

    func prepare() async throws
    func startStream() throws
    func accept(samples: [Float], sampleRate: Int)
    func currentResult() -> StreamingASRResult
    func finishStream() async throws -> StreamingASRResult
    func reset()
}

extension StreamingASREngine {
    var onResult: ((StreamingASRResult) -> Void)? {
        get { nil }
        set {}
    }

    var onStatus: ((String) -> Void)? {
        get { nil }
        set {}
    }
}

enum ASREngineError: Error, CustomStringConvertible {
    case missingEnvironment(String)
    case missingModelFile(String)
    case runtimeLoadFailed(String)
    case symbolMissing(String)
    case recognizerCreateFailed(String)
    case streamNotStarted
    case unsupportedBaseline(String)
    case adapterUnavailable(String)

    var description: String {
        switch self {
        case .missingEnvironment(let key): return "Missing environment variable: \(key)"
        case .missingModelFile(let path): return "Missing model file: \(path)"
        case .runtimeLoadFailed(let message): return "Unable to load sherpa-onnx runtime: \(message)"
        case .symbolMissing(let name): return "Missing sherpa-onnx C API symbol: \(name)"
        case .recognizerCreateFailed(let name): return "Unable to create recognizer for \(name)"
        case .streamNotStarted: return "ASR stream has not started"
        case .unsupportedBaseline(let message): return message
        case .adapterUnavailable(let message): return message
        }
    }
}
