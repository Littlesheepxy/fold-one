import Darwin
import Foundation

private struct SherpaOnnxOnlineTransducerModelConfig {
    var encoder: UnsafePointer<CChar>?
    var decoder: UnsafePointer<CChar>?
    var joiner: UnsafePointer<CChar>?
}

private struct SherpaOnnxOnlineParaformerModelConfig {
    var encoder: UnsafePointer<CChar>?
    var decoder: UnsafePointer<CChar>?
}

private struct SherpaOnnxOnlineZipformer2CtcModelConfig {
    var model: UnsafePointer<CChar>?
}

private struct SherpaOnnxOnlineNemoCtcModelConfig {
    var model: UnsafePointer<CChar>?
}

private struct SherpaOnnxOnlineToneCtcModelConfig {
    var model: UnsafePointer<CChar>?
}

private struct SherpaOnnxOnlineModelConfig {
    var transducer = SherpaOnnxOnlineTransducerModelConfig()
    var paraformer = SherpaOnnxOnlineParaformerModelConfig()
    var zipformer2Ctc = SherpaOnnxOnlineZipformer2CtcModelConfig()
    var tokens: UnsafePointer<CChar>?
    var numThreads: Int32 = 1
    var provider: UnsafePointer<CChar>?
    var debug: Int32 = 0
    var modelType: UnsafePointer<CChar>?
    var modelingUnit: UnsafePointer<CChar>?
    var bpeVocab: UnsafePointer<CChar>?
    var tokensBuf: UnsafePointer<CChar>?
    var tokensBufSize: Int32 = 0
    var nemoCtc = SherpaOnnxOnlineNemoCtcModelConfig()
    var toneCtc = SherpaOnnxOnlineToneCtcModelConfig()
}

private struct SherpaOnnxFeatureConfig {
    var sampleRate: Int32 = 16_000
    var featureDim: Int32 = 80
}

private struct SherpaOnnxOnlineCtcFstDecoderConfig {
    var graph: UnsafePointer<CChar>?
    var maxActive: Int32 = 0
}

private struct SherpaOnnxHomophoneReplacerConfig {
    var dictDir: UnsafePointer<CChar>?
    var lexicon: UnsafePointer<CChar>?
    var ruleFsts: UnsafePointer<CChar>?
}

private struct SherpaOnnxOnlineRecognizerConfig {
    var featConfig = SherpaOnnxFeatureConfig()
    var modelConfig = SherpaOnnxOnlineModelConfig()
    var decodingMethod: UnsafePointer<CChar>?
    var maxActivePaths: Int32 = 4
    var enableEndpoint: Int32 = 1
    var rule1MinTrailingSilence: Float = 2.4
    var rule2MinTrailingSilence: Float = 1.2
    var rule3MinUtteranceLength: Float = 20.0
    var hotwordsFile: UnsafePointer<CChar>?
    var hotwordsScore: Float = 1.5
    var ctcFstDecoderConfig = SherpaOnnxOnlineCtcFstDecoderConfig()
    var ruleFsts: UnsafePointer<CChar>?
    var ruleFars: UnsafePointer<CChar>?
    var blankPenalty: Float = 0
    var hotwordsBuf: UnsafePointer<CChar>?
    var hotwordsBufSize: Int32 = 0
    var hr = SherpaOnnxHomophoneReplacerConfig()
}

private struct SherpaOnnxOnlineRecognizerResultC {
    var text: UnsafePointer<CChar>?
    var tokens: UnsafePointer<CChar>?
    var tokensArr: UnsafePointer<UnsafePointer<CChar>?>?
    var timestamps: UnsafeMutablePointer<Float>?
    var count: Int32
    var json: UnsafePointer<CChar>?
}

private final class CStringBox {
    private var storage: [String: UnsafeMutablePointer<CChar>] = [:]

    func pointer(_ string: String?) -> UnsafePointer<CChar>? {
        guard let string, !string.isEmpty else { return nil }
        if let existing = storage[string] { return UnsafePointer(existing) }
        let pointer = strdup(string)!
        storage[string] = pointer
        return UnsafePointer(pointer)
    }

    deinit {
        for pointer in storage.values {
            free(pointer)
        }
    }
}

final class SherpaOnnxRuntime {
    typealias RecognizerHandle = UnsafeMutableRawPointer
    typealias StreamHandle = UnsafeMutableRawPointer
    private typealias ResultHandle = UnsafeMutableRawPointer

    private typealias CreateRecognizerFn = @convention(c) (UnsafeRawPointer?) -> RecognizerHandle?
    private typealias DestroyRecognizerFn = @convention(c) (RecognizerHandle?) -> Void
    private typealias CreateStreamFn = @convention(c) (RecognizerHandle?) -> StreamHandle?
    private typealias DestroyStreamFn = @convention(c) (StreamHandle?) -> Void
    private typealias AcceptWaveformFn = @convention(c) (StreamHandle?, Int32, UnsafePointer<Float>?, Int32) -> Void
    private typealias IsReadyFn = @convention(c) (RecognizerHandle?, StreamHandle?) -> Int32
    private typealias DecodeFn = @convention(c) (RecognizerHandle?, StreamHandle?) -> Void
    private typealias GetResultFn = @convention(c) (RecognizerHandle?, StreamHandle?) -> ResultHandle?
    private typealias DestroyResultFn = @convention(c) (ResultHandle?) -> Void
    private typealias InputFinishedFn = @convention(c) (StreamHandle?) -> Void
    private typealias SetOptionFn = @convention(c) (StreamHandle?, UnsafePointer<CChar>?, UnsafePointer<CChar>?) -> Void

    private let handle: UnsafeMutableRawPointer
    private let createRecognizer: CreateRecognizerFn
    private let destroyRecognizer: DestroyRecognizerFn
    private let createStream: CreateStreamFn
    private let destroyStream: DestroyStreamFn
    private let acceptWaveform: AcceptWaveformFn
    private let isReady: IsReadyFn
    private let decode: DecodeFn
    private let getResult: GetResultFn
    private let destroyResult: DestroyResultFn
    private let inputFinished: InputFinishedFn
    private let setOption: SetOptionFn

    init(dylibPath: String) throws {
        guard let handle = dlopen(dylibPath, RTLD_NOW | RTLD_LOCAL) else {
            throw ASREngineError.runtimeLoadFailed(String(cString: dlerror()))
        }
        self.handle = handle
        createRecognizer = try Self.load(handle, "SherpaOnnxCreateOnlineRecognizer")
        destroyRecognizer = try Self.load(handle, "SherpaOnnxDestroyOnlineRecognizer")
        createStream = try Self.load(handle, "SherpaOnnxCreateOnlineStream")
        destroyStream = try Self.load(handle, "SherpaOnnxDestroyOnlineStream")
        acceptWaveform = try Self.load(handle, "SherpaOnnxOnlineStreamAcceptWaveform")
        isReady = try Self.load(handle, "SherpaOnnxIsOnlineStreamReady")
        decode = try Self.load(handle, "SherpaOnnxDecodeOnlineStream")
        getResult = try Self.load(handle, "SherpaOnnxGetOnlineStreamResult")
        destroyResult = try Self.load(handle, "SherpaOnnxDestroyOnlineRecognizerResult")
        inputFinished = try Self.load(handle, "SherpaOnnxOnlineStreamInputFinished")
        setOption = try Self.load(handle, "SherpaOnnxOnlineStreamSetOption")
    }

    deinit {
        dlclose(handle)
    }

    private static func load<T>(_ handle: UnsafeMutableRawPointer, _ name: String) throws -> T {
        guard let symbol = dlsym(handle, name) else {
            throw ASREngineError.symbolMissing(name)
        }
        return unsafeBitCast(symbol, to: T.self)
    }

    func makeRecognizer(configuration: SherpaModelConfiguration) throws -> RecognizerHandle {
        let strings = CStringBox()
        var config = SherpaOnnxOnlineRecognizerConfig()
        config.featConfig.sampleRate = Int32(configuration.sampleRate)
        config.featConfig.featureDim = Int32(configuration.featureDim)
        config.modelConfig.tokens = strings.pointer(configuration.tokens)
        config.modelConfig.provider = strings.pointer(configuration.provider)
        config.modelConfig.numThreads = Int32(configuration.numThreads)
        config.modelConfig.modelType = strings.pointer(configuration.modelType)
        config.decodingMethod = strings.pointer(configuration.decodingMethod)

        switch configuration.family {
        case .transducer(let encoder, let decoder, let joiner):
            config.modelConfig.transducer.encoder = strings.pointer(encoder)
            config.modelConfig.transducer.decoder = strings.pointer(decoder)
            config.modelConfig.transducer.joiner = strings.pointer(joiner)
        case .paraformer(let encoder, let decoder):
            config.modelConfig.paraformer.encoder = strings.pointer(encoder)
            config.modelConfig.paraformer.decoder = strings.pointer(decoder)
        }

        let created = withUnsafePointer(to: &config) { pointer in
            createRecognizer(UnsafeRawPointer(pointer))
        }
        guard let recognizer = created else {
            throw ASREngineError.recognizerCreateFailed(configuration.name)
        }
        return recognizer
    }

    func destroyRecognizerHandle(_ recognizer: RecognizerHandle?) {
        destroyRecognizer(recognizer)
    }

    func makeStream(recognizer: RecognizerHandle) throws -> StreamHandle {
        guard let stream = createStream(recognizer) else {
            throw ASREngineError.streamNotStarted
        }
        return stream
    }

    func destroyStreamHandle(_ stream: StreamHandle?) {
        destroyStream(stream)
    }

    func accept(stream: StreamHandle, samples: [Float], sampleRate: Int) {
        samples.withUnsafeBufferPointer { buffer in
            acceptWaveform(stream, Int32(sampleRate), buffer.baseAddress, Int32(buffer.count))
        }
    }

    func decodeReady(recognizer: RecognizerHandle, stream: StreamHandle) {
        while isReady(recognizer, stream) != 0 {
            decode(recognizer, stream)
        }
    }

    func result(recognizer: RecognizerHandle, stream: StreamHandle) -> String {
        guard let result = getResult(recognizer, stream) else { return "" }
        defer { destroyResult(result) }
        let typed = result.assumingMemoryBound(to: SherpaOnnxOnlineRecognizerResultC.self)
        guard let text = typed.pointee.text else { return "" }
        return String(cString: text)
    }

    func finish(stream: StreamHandle, isParaformer: Bool) {
        if isParaformer {
            "is_final".withCString { key in
                "1".withCString { value in
                    setOption(stream, key, value)
                }
            }
        }
        inputFinished(stream)
    }
}

enum SherpaModelFamily {
    case transducer(encoder: String, decoder: String, joiner: String)
    case paraformer(encoder: String, decoder: String)
}

struct SherpaModelConfiguration {
    let name: String
    let family: SherpaModelFamily
    let tokens: String
    let modelType: String?
    let provider: String
    let numThreads: Int
    let decodingMethod: String
    let sampleRate: Int
    let featureDim: Int
}
