import AVFoundation
import Foundation

final class MicrophoneCapture {
    private let engine = AVAudioEngine()
    private let ringBuffer: AudioRingBuffer
    private let targetSampleRate: Double
    private var converter: AVAudioConverter?

    init(ringBuffer: AudioRingBuffer, targetSampleRate: Int = 16_000) {
        self.ringBuffer = ringBuffer
        self.targetSampleRate = Double(targetSampleRate)
    }

    func start(onFirstAudioFrame: @escaping (ContinuousClock.Instant) -> Void) throws {
        let input = engine.inputNode
        let inputFormat = input.outputFormat(forBus: 0)
        guard let outputFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: targetSampleRate,
            channels: 1,
            interleaved: false
        ) else {
            throw ASREngineError.runtimeLoadFailed("Unable to create microphone output format")
        }
        converter = AVAudioConverter(from: inputFormat, to: outputFormat)

        var sawAudio = false
        input.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { [weak self] buffer, _ in
            guard let self, let converter = self.converter else { return }
            if !sawAudio {
                sawAudio = true
                onFirstAudioFrame(.now)
            }

            let frameCapacity = AVAudioFrameCount(Double(buffer.frameLength) * self.targetSampleRate / inputFormat.sampleRate) + 1
            guard let converted = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: frameCapacity) else { return }
            var error: NSError?
            var consumed = false
            converter.convert(to: converted, error: &error) { _, status in
                if consumed {
                    status.pointee = .noDataNow
                    return nil
                }
                consumed = true
                status.pointee = .haveData
                return buffer
            }
            guard error == nil, let channel = converted.floatChannelData?[0] else { return }
            self.ringBuffer.write(UnsafeBufferPointer(start: channel, count: Int(converted.frameLength)))
        }

        try engine.start()
    }

    func stop() {
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
    }
}
