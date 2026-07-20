import Foundation

final class CurrentASREngine: StreamingASREngine {
    let name = "current_fold_baseline"
    var onResult: ((StreamingASRResult) -> Void)?
    var onStatus: ((String) -> Void)?
    private let resolver = PartialResultResolver()
    private var samples: [Float] = []
    private var sampleRate = 16_000
    private var lastResult = StreamingASRResult(fullText: "", stableText: "", unstableText: "")

    func prepare() async throws {
        guard ProcessInfo.processInfo.environment["FOLD_LOCAL_WHISPER_MODEL_PATH"] != nil else {
            throw ASREngineError.missingEnvironment("FOLD_LOCAL_WHISPER_MODEL_PATH")
        }
    }

    func startStream() throws {
        samples.removeAll(keepingCapacity: true)
        resolver.reset()
        lastResult = StreamingASRResult(fullText: "", stableText: "", unstableText: "")
    }

    func accept(samples newSamples: [Float], sampleRate: Int) {
        self.sampleRate = sampleRate
        samples.append(contentsOf: newSamples)
    }

    func currentResult() -> StreamingASRResult {
        lastResult
    }

    func finishStream() async throws -> StreamingASRResult {
        let wav = try TemporaryWavWriter.write(samples: samples, sampleRate: sampleRate)
        defer { try? FileManager.default.removeItem(at: wav) }

        let repoRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let script = repoRoot.appendingPathComponent("Experiments/StreamingASRBenchmark/Sources/StreamingASRBenchmark/Engines/run-current-baseline.mjs")
        guard FileManager.default.fileExists(atPath: script.path) else {
            throw ASREngineError.unsupportedBaseline("Missing baseline runner at \(script.path)")
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["node", script.path, wav.path]
        process.currentDirectoryURL = repoRoot
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = Pipe()
        try process.run()
        process.waitUntilExit()

        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        lastResult = resolver.resolve(newText: text).result
        onResult?(lastResult)
        return lastResult
    }

    func reset() {
        samples.removeAll(keepingCapacity: false)
        resolver.reset()
        lastResult = StreamingASRResult(fullText: "", stableText: "", unstableText: "")
    }
}

enum TemporaryWavWriter {
    static func write(samples: [Float], sampleRate: Int) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("fold-current-asr-\(UUID().uuidString).wav")
        var data = Data()
        let pcm = samples.map { sample -> Int16 in
            let clipped = max(-1, min(1, sample))
            return Int16(clipped * Float(Int16.max))
        }
        let byteCount = UInt32(pcm.count * MemoryLayout<Int16>.size)
        data.append("RIFF".data(using: .ascii)!)
        data.appendLE(UInt32(36) + byteCount)
        data.append("WAVEfmt ".data(using: .ascii)!)
        data.appendLE(UInt32(16))
        data.appendLE(UInt16(1))
        data.appendLE(UInt16(1))
        data.appendLE(UInt32(sampleRate))
        data.appendLE(UInt32(sampleRate * 2))
        data.appendLE(UInt16(2))
        data.appendLE(UInt16(16))
        data.append("data".data(using: .ascii)!)
        data.appendLE(byteCount)
        for value in pcm {
            data.appendLE(UInt16(bitPattern: value))
        }
        try data.write(to: url)
        return url
    }
}

private extension Data {
    mutating func appendLE(_ value: UInt16) {
        var little = value.littleEndian
        append(Data(bytes: &little, count: MemoryLayout<UInt16>.size))
    }

    mutating func appendLE(_ value: UInt32) {
        var little = value.littleEndian
        append(Data(bytes: &little, count: MemoryLayout<UInt32>.size))
    }
}
