import AVFoundation
import Foundation

struct FixtureUtterance: Codable {
    let id: String
    let text: String
    let category: String
    let wavFile: String
    let notes: String?
}

struct FixtureManifest: Codable {
    let utterances: [FixtureUtterance]
}

enum FixtureLoader {
    static func load(path: String) throws -> [FixtureUtterance] {
        let data = try Data(contentsOf: URL(fileURLWithPath: path))
        return try JSONDecoder().decode(FixtureManifest.self, from: data).utterances
    }
}

struct AudioFixture {
    let samples: [Float]
    let sampleRate: Int
    let durationMs: Double
    let speechOnsetMs: Double
}

enum AudioFixtureLoader {
    static func load(wavPath: String) throws -> AudioFixture {
        let file = try AVAudioFile(forReading: URL(fileURLWithPath: wavPath))
        guard let targetFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16_000, channels: 1, interleaved: false) else {
            throw ASREngineError.runtimeLoadFailed("Unable to create fixture output format")
        }
        let inputFormat = file.processingFormat
        guard let inputBuffer = AVAudioPCMBuffer(pcmFormat: inputFormat, frameCapacity: AVAudioFrameCount(file.length)) else {
            throw ASREngineError.runtimeLoadFailed("Unable to allocate fixture input buffer")
        }
        try file.read(into: inputBuffer)

        guard let converter = AVAudioConverter(from: inputFormat, to: targetFormat) else {
            throw ASREngineError.runtimeLoadFailed("Unable to create fixture converter")
        }
        let outputCapacity = AVAudioFrameCount(Double(inputBuffer.frameLength) * 16_000.0 / inputFormat.sampleRate) + 1
        guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: outputCapacity) else {
            throw ASREngineError.runtimeLoadFailed("Unable to allocate fixture output buffer")
        }
        var consumed = false
        var error: NSError?
        converter.convert(to: outputBuffer, error: &error) { _, status in
            if consumed {
                status.pointee = .noDataNow
                return nil
            }
            consumed = true
            status.pointee = .haveData
            return inputBuffer
        }
        if let error { throw error }
        guard let channel = outputBuffer.floatChannelData?[0] else {
            throw ASREngineError.runtimeLoadFailed("Missing converted fixture channel")
        }
        let samples = Array(UnsafeBufferPointer(start: channel, count: Int(outputBuffer.frameLength)))
        let onset = detectSpeechOnset(samples: samples, sampleRate: 16_000)
        return AudioFixture(
            samples: samples,
            sampleRate: 16_000,
            durationMs: Double(samples.count) / 16_000.0 * 1000.0,
            speechOnsetMs: onset
        )
    }

    private static func detectSpeechOnset(samples: [Float], sampleRate: Int) -> Double {
        let window = max(1, sampleRate / 100)
        let threshold: Float = 0.012
        var index = 0
        while index + window < samples.count {
            let rms = sqrt(samples[index..<index + window].reduce(Float(0)) { $0 + $1 * $1 } / Float(window))
            if rms > threshold {
                return Double(index) / Double(sampleRate) * 1000.0
            }
            index += window
        }
        return 0
    }
}
