import Foundation

class SherpaStreamingEngine: StreamingASREngine {
    let name: String
    var onResult: ((StreamingASRResult) -> Void)?
    var onStatus: ((String) -> Void)?
    private let modelDirectoryEnv: String
    private let resolver = PartialResultResolver()
    private let configurationBuilder: (String, ProcessInfo) throws -> SherpaModelConfiguration

    private var runtime: SherpaOnnxRuntime?
    private var recognizer: SherpaOnnxRuntime.RecognizerHandle?
    private var stream: SherpaOnnxRuntime.StreamHandle?
    private var lastResult = StreamingASRResult(fullText: "", stableText: "", unstableText: "")

    init(
        name: String,
        modelDirectoryEnv: String,
        configurationBuilder: @escaping (String, ProcessInfo) throws -> SherpaModelConfiguration
    ) {
        self.name = name
        self.modelDirectoryEnv = modelDirectoryEnv
        self.configurationBuilder = configurationBuilder
    }

    func prepare() async throws {
        let environment = ProcessInfo.processInfo.environment
        guard let dylib = environment["SHERPA_ONNX_DYLIB"] ?? Self.firstExistingPath([
            "Runtime/sherpa-onnx-v1.13.4-osx-arm64-shared-no-tts/lib/libsherpa-onnx-c-api.dylib"
        ]) else {
            throw ASREngineError.missingEnvironment("SHERPA_ONNX_DYLIB")
        }
        guard let modelDirectory = environment[modelDirectoryEnv] ?? Self.defaultModelDirectory(for: modelDirectoryEnv) else {
            throw ASREngineError.missingEnvironment(modelDirectoryEnv)
        }

        let configuration = try configurationBuilder(modelDirectory, .processInfo)
        try Self.requireFiles(configuration)
        let loadedRuntime = try SherpaOnnxRuntime(dylibPath: dylib)
        recognizer = try loadedRuntime.makeRecognizer(configuration: configuration)
        runtime = loadedRuntime
    }

    func startStream() throws {
        guard let runtime, let recognizer else {
            throw ASREngineError.recognizerCreateFailed(name)
        }
        if let stream {
            runtime.destroyStreamHandle(stream)
        }
        stream = try runtime.makeStream(recognizer: recognizer)
        resolver.reset()
        lastResult = StreamingASRResult(fullText: "", stableText: "", unstableText: "")
    }

    func accept(samples: [Float], sampleRate: Int) {
        guard let runtime, let recognizer, let stream else { return }
        runtime.accept(stream: stream, samples: samples, sampleRate: sampleRate)
        runtime.decodeReady(recognizer: recognizer, stream: stream)
        let text = runtime.result(recognizer: recognizer, stream: stream)
        if text != lastResult.fullText {
            lastResult = resolver.resolve(newText: text).result
            onResult?(lastResult)
        }
    }

    func currentResult() -> StreamingASRResult {
        lastResult
    }

    func finishStream() async throws -> StreamingASRResult {
        guard let runtime, let recognizer, let stream else {
            throw ASREngineError.streamNotStarted
        }
        runtime.finish(stream: stream, isParaformer: name.contains("paraformer"))
        runtime.decodeReady(recognizer: recognizer, stream: stream)
        let text = runtime.result(recognizer: recognizer, stream: stream)
        lastResult = resolver.resolve(newText: text).result
        onResult?(lastResult)
        return lastResult
    }

    func reset() {
        if let runtime, let stream {
            runtime.destroyStreamHandle(stream)
        }
        stream = nil
        resolver.reset()
        lastResult = StreamingASRResult(fullText: "", stableText: "", unstableText: "")
    }

    deinit {
        reset()
        if let runtime, let recognizer {
            runtime.destroyRecognizerHandle(recognizer)
        }
    }

    private static func requireFiles(_ configuration: SherpaModelConfiguration) throws {
        var files = [configuration.tokens]
        switch configuration.family {
        case .transducer(let encoder, let decoder, let joiner):
            files.append(contentsOf: [encoder, decoder, joiner])
        case .paraformer(let encoder, let decoder):
            files.append(contentsOf: [encoder, decoder])
        }
        for file in files where !FileManager.default.fileExists(atPath: file) {
            throw ASREngineError.missingModelFile(file)
        }
    }

    private static func defaultModelDirectory(for environmentKey: String) -> String? {
        switch environmentKey {
        case "SHERPA_ZIPFORMER_MODEL_DIR":
            return firstExistingPath([
                "Models/sherpa-onnx-streaming-zipformer-small-bilingual-zh-en-2023-02-16",
                "Models/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20"
            ])
        case "SHERPA_PARAFORMER_MODEL_DIR":
            return firstExistingPath([
                "Models/sherpa-onnx-streaming-paraformer-bilingual-zh-en"
            ])
        default:
            return nil
        }
    }

    private static func firstExistingPath(_ paths: [String]) -> String? {
        paths.first { FileManager.default.fileExists(atPath: $0) }
    }
}

final class SherpaZipformerEngine: SherpaStreamingEngine {
    init() {
        super.init(name: "sherpa_zipformer", modelDirectoryEnv: "SHERPA_ZIPFORMER_MODEL_DIR") { directory, process in
            let env = process.environment
            let encoder = firstExisting(in: directory, names: [
                "encoder-epoch-99-avg-1.int8.onnx",
                "encoder-epoch-99-avg-1.onnx"
            ]) ?? "\(directory)/encoder-epoch-99-avg-1.int8.onnx"
            let joiner = firstExisting(in: directory, names: [
                "joiner-epoch-99-avg-1.int8.onnx",
                "joiner-epoch-99-avg-1.onnx"
            ]) ?? "\(directory)/joiner-epoch-99-avg-1.int8.onnx"
            return SherpaModelConfiguration(
                name: "sherpa_zipformer",
                family: .transducer(
                    encoder: encoder,
                    decoder: "\(directory)/decoder-epoch-99-avg-1.onnx",
                    joiner: joiner
                ),
                tokens: "\(directory)/tokens.txt",
                modelType: nil,
                provider: env["SHERPA_PROVIDER"] ?? "cpu",
                numThreads: Int(env["SHERPA_NUM_THREADS"] ?? "2") ?? 2,
                decodingMethod: env["SHERPA_DECODING_METHOD"] ?? "greedy_search",
                sampleRate: 16_000,
                featureDim: 80
            )
        }
    }
}

private func firstExisting(in directory: String, names: [String]) -> String? {
    names.map { "\(directory)/\($0)" }.first { FileManager.default.fileExists(atPath: $0) }
}

final class SherpaParaformerEngine: SherpaStreamingEngine {
    init() {
        super.init(name: "sherpa_paraformer", modelDirectoryEnv: "SHERPA_PARAFORMER_MODEL_DIR") { directory, process in
            let env = process.environment
            return SherpaModelConfiguration(
                name: "sherpa_paraformer",
                family: .paraformer(
                    encoder: "\(directory)/encoder.onnx",
                    decoder: "\(directory)/decoder.onnx"
                ),
                tokens: "\(directory)/tokens.txt",
                modelType: "paraformer",
                provider: env["SHERPA_PROVIDER"] ?? "cpu",
                numThreads: Int(env["SHERPA_NUM_THREADS"] ?? "2") ?? 2,
                decodingMethod: env["SHERPA_DECODING_METHOD"] ?? "greedy_search",
                sampleRate: 16_000,
                featureDim: 80
            )
        }
    }
}
