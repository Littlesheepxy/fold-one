import Foundation

final class LiveStreamingSession {
    private let ringBuffer = AudioRingBuffer(capacity: 16_000 * 30)
    private let decodeQueue = DispatchQueue(label: "fold.streaming-asr-benchmark.decode")
    private var engine: StreamingASREngine
    private var microphone: MicrophoneCapture?
    private var decodeTimer: DispatchSourceTimer?
    private var running = false

    init(engine: StreamingASREngine) {
        self.engine = engine
    }

    func start(onPartial: @escaping (StreamingASRResult) -> Void) throws {
        engine.onResult = { result in
            DispatchQueue.main.async {
                onPartial(result)
            }
        }
        try engine.startStream()
        running = true

        let capture = MicrophoneCapture(ringBuffer: ringBuffer, targetSampleRate: 16_000)
        microphone = capture
        try capture.start { _ in
            // The audio thread only writes PCM into the ring buffer.
        }

        let timer = DispatchSource.makeTimerSource(queue: decodeQueue)
        timer.schedule(deadline: .now(), repeating: .milliseconds(20))
        timer.setEventHandler { [weak self] in
            guard let self, self.running else { return }
            let samples = self.ringBuffer.read(maxCount: 16_000 / 50)
            guard !samples.isEmpty else { return }
            self.engine.accept(samples: samples, sampleRate: 16_000)
            let result = self.engine.currentResult()
            DispatchQueue.main.async {
                onPartial(result)
            }
        }
        decodeTimer = timer
        timer.resume()
    }

    func stop() async throws -> StreamingASRResult {
        running = false
        decodeTimer?.cancel()
        decodeTimer = nil
        microphone?.stop()
        microphone = nil
        return try await engine.finishStream()
    }
}
