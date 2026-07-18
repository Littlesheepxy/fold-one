import Foundation

enum EnginePriority: String, Codable {
    case p0 = "P0"
    case p1 = "P1"
}

enum EngineCapability: String, Codable {
    case liveStreaming = "live_streaming"
    case fixtureBenchmark = "fixture_benchmark"
    case pendingAdapter = "pending_adapter"
}

struct EngineDescriptor: Codable {
    let id: String
    let label: String
    let priority: EnginePriority
    let capabilities: [EngineCapability]
    let adapterStatus: String
    let setupHint: String
}

enum EngineRegistry {
    static let liveReadyEngineIds = [
        "moonshine_v2_streaming",
        "sherpa_zipformer",
        "sherpa_paraformer"
    ]

    static let defaultEngineIds = liveReadyEngineIds

    static let descriptors: [EngineDescriptor] = [
        EngineDescriptor(
            id: "moonshine_v2_streaming",
            label: "Moonshine v2 Streaming",
            priority: .p0,
            capabilities: [.liveStreaming, .fixtureBenchmark],
            adapterStatus: "可用：本机真实流式 backend 已在 8791 端口启动。",
            setupHint: "使用 Moonshine 持久 stream state；每次只提交新增 PCM 音频块。"
        ),
        EngineDescriptor(
            id: "dolphin_cn_dialect_small_streaming",
            label: "Dolphin-CN-Dialect Small Streaming",
            priority: .p0,
            capabilities: [.pendingAdapter],
            adapterStatus: "暂不可用：官方 Python API 只暴露文件级 transcribe，尚无持久 PCM stream adapter。",
            setupHint: "依赖和模型入口已安装；需要基于官方 chunk/cache 接口完成解码 adapter，不能用整段音频轮询冒充流式。"
        ),
        EngineDescriptor(
            id: "sherpa_zipformer",
            label: "Streaming Zipformer",
            priority: .p0,
            capabilities: [.liveStreaming, .fixtureBenchmark],
            adapterStatus: "本地 sherpa-onnx Zipformer 已接入；模型文件在本机 Models 目录时可直接测试。",
            setupHint: "需要 tokens.txt、encoder、decoder、joiner ONNX 文件。当前已下载官方 sherpa-onnx Zipformer small bilingual 模型。"
        ),
        EngineDescriptor(
            id: "whisperkit_large_v3_turbo",
            label: "WhisperKit Large v3 Turbo",
            priority: .p0,
            capabilities: [.pendingAdapter],
            adapterStatus: "暂不可用：8793 已启动官方 HTTP 服务，但它不是 PCM 输入 WebSocket 流。",
            setupHint: "需要接入 WhisperKit 原生 Swift 实时管线；不能把 HTTP 文件上传/SSE 输出包装成伪流式。"
        ),
        EngineDescriptor(
            id: "qwen3_asr_0_6b_streaming",
            label: "Qwen3-ASR 0.6B Streaming",
            priority: .p0,
            capabilities: [.pendingAdapter],
            adapterStatus: "本机不可用：官方 streaming 依赖 vLLM backend，当前 Apple Silicon 环境没有可用 vLLM 服务。",
            setupHint: "可连接独立 vLLM 服务器做 Final Path 对照，但不应作为 macOS 常驻 Fast Path。"
        ),
        EngineDescriptor(
            id: "sherpa_paraformer",
            label: "Streaming Paraformer",
            priority: .p1,
            capabilities: [.liveStreaming, .fixtureBenchmark],
            adapterStatus: "本地 sherpa-onnx Paraformer 已接入；模型文件在本机 Models 目录时可直接测试。",
            setupHint: "需要 tokens.txt、encoder.onnx、decoder.onnx。当前已下载官方 sherpa-onnx streaming Paraformer bilingual 模型。"
        )
    ]

    static func descriptor(id: String) -> EngineDescriptor? {
        descriptors.first { $0.id == id }
    }

    static func makeEngine(id: String) -> StreamingASREngine {
        switch id {
        case "sherpa_zipformer":
            return SherpaZipformerEngine()
        case "sherpa_paraformer":
            return SherpaParaformerEngine()
        case "moonshine_v2_streaming":
            return WebSocketStreamingEngine(
                name: "moonshine_v2_streaming",
                label: "Moonshine v2 Streaming",
                urlEnvironmentKey: "MOONSHINE_STREAMING_WS_URL",
                defaultURL: "ws://127.0.0.1:8791/stream"
            )
        case "dolphin_cn_dialect_small_streaming":
            return WebSocketStreamingEngine(
                name: "dolphin_cn_dialect_small_streaming",
                label: "Dolphin-CN-Dialect Small Streaming",
                urlEnvironmentKey: "DOLPHIN_STREAMING_WS_URL",
                defaultURL: "ws://127.0.0.1:8792/stream"
            )
        case "whisperkit_large_v3_turbo":
            return WebSocketStreamingEngine(
                name: "whisperkit_large_v3_turbo",
                label: "WhisperKit Large v3 Turbo",
                urlEnvironmentKey: "WHISPERKIT_STREAMING_WS_URL",
                defaultURL: "ws://127.0.0.1:8793/stream"
            )
        case "qwen3_asr_0_6b_streaming":
            return WebSocketStreamingEngine(
                name: "qwen3_asr_0_6b_streaming",
                label: "Qwen3-ASR 0.6B Streaming",
                urlEnvironmentKey: "QWEN3_ASR_STREAMING_WS_URL",
                defaultURL: "ws://127.0.0.1:8794/stream"
            )
        case "current_fold_baseline":
            return CurrentASREngine()
        default:
            return PendingAdapterEngine(descriptor: descriptor(id: id) ?? EngineDescriptor(
                id: id,
                label: id,
                priority: .p1,
                capabilities: [.pendingAdapter],
                adapterStatus: "待接入：还没有注册 adapter。",
                setupHint: "需要先注册 StreamingASREngine adapter，才能 benchmark 这个模型。"
            ))
        }
    }
}

final class PendingAdapterEngine: StreamingASREngine {
    let name: String
    var onResult: ((StreamingASRResult) -> Void)?
    var onStatus: ((String) -> Void)?
    private let descriptor: EngineDescriptor

    init(descriptor: EngineDescriptor) {
        self.name = descriptor.id
        self.descriptor = descriptor
    }

    func prepare() async throws {
        throw ASREngineError.adapterUnavailable("\(descriptor.label): \(descriptor.adapterStatus) \(descriptor.setupHint)")
    }

    func startStream() throws {
        throw ASREngineError.adapterUnavailable("\(descriptor.label): adapter unavailable")
    }

    func accept(samples: [Float], sampleRate: Int) {}

    func currentResult() -> StreamingASRResult {
        StreamingASRResult(fullText: "", stableText: "", unstableText: "")
    }

    func finishStream() async throws -> StreamingASRResult {
        throw ASREngineError.adapterUnavailable("\(descriptor.label): adapter unavailable")
    }

    func reset() {}
}
