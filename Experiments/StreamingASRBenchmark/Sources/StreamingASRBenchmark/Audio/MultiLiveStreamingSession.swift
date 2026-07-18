import Foundation

struct LiveModelUpdate: Codable {
    let engine: String
    let result: StreamingASRResult
    let metrics: LiveASRMetricSnapshot
}

struct LiveModelStatus: Codable {
    let engine: String
    let ok: Bool
    let message: String
}

final class MultiLiveStreamingSession {
    private final class EngineBox: @unchecked Sendable {
        let descriptor: EngineDescriptor
        var engine: StreamingASREngine
        let queue: DispatchQueue
        let metrics = LiveASRMetrics()
        var prepared = false
        var started = false
        var lastResult = StreamingASRResult(fullText: "", stableText: "", unstableText: "")

        init(descriptor: EngineDescriptor, engine: StreamingASREngine) {
            self.descriptor = descriptor
            self.engine = engine
            self.queue = DispatchQueue(label: "fold.streaming-asr-benchmark.decode.\(descriptor.id)")
        }
    }

    private let ringBuffer = AudioRingBuffer(capacity: 16_000 * 30)
    private let decodeQueue = DispatchQueue(label: "fold.streaming-asr-benchmark.multi-live")
    private let boxes: [EngineBox]
    private var microphone: MicrophoneCapture?
    private var decodeTimer: DispatchSourceTimer?
    private var running = false

    init(engineIds: [String]) {
        self.boxes = engineIds.compactMap { id in
            guard let descriptor = EngineRegistry.descriptor(id: id),
                  descriptor.capabilities.contains(.liveStreaming) else {
                return nil
            }
            return EngineBox(descriptor: descriptor, engine: EngineRegistry.makeEngine(id: id))
        }
    }

    func start(
        onStatus: @escaping (LiveModelStatus) -> Void,
        onUpdate: @escaping (LiveModelUpdate) -> Void
    ) async throws {
        running = true

        for box in boxes {
            do {
                let warmupStart = ContinuousClock.now
                try await box.engine.prepare()
                let warmupMs = wallClockMs(from: warmupStart, to: .now)
                box.engine.onResult = { [weak box] result in
                    guard let box else { return }
                    box.lastResult = result
                    let metrics = box.metrics.recordPartial(result.fullText)
                    DispatchQueue.main.async {
                        onUpdate(LiveModelUpdate(engine: box.descriptor.id, result: result, metrics: metrics))
                    }
                }
                box.engine.onStatus = { [weak box] message in
                    guard let box else { return }
                    DispatchQueue.main.async {
                        onStatus(LiveModelStatus(engine: box.descriptor.id, ok: false, message: message))
                    }
                }
                try box.engine.startStream()
                box.metrics.markStart()
                box.prepared = true
                box.started = true
                onStatus(LiveModelStatus(engine: box.descriptor.id, ok: true, message: "已启动，预热 \(String(format: "%.0f", warmupMs)) ms"))
            } catch {
                onStatus(LiveModelStatus(engine: box.descriptor.id, ok: false, message: "\(error)"))
            }
        }

        let capture = MicrophoneCapture(ringBuffer: ringBuffer, targetSampleRate: 16_000)
        microphone = capture
        try capture.start { [weak self] _ in
            for box in self?.boxes ?? [] {
                box.metrics.markFirstAudioIfNeeded()
            }
        }

        let timer = DispatchSource.makeTimerSource(queue: decodeQueue)
        timer.schedule(deadline: .now(), repeating: .milliseconds(20))
        timer.setEventHandler { [weak self] in
            guard let self, self.running else { return }
            let samples = self.ringBuffer.read(maxCount: 16_000 / 50)
            guard !samples.isEmpty else { return }
            for box in self.boxes where box.started {
                box.metrics.addAudio(samples: samples.count, sampleRate: 16_000)
                box.queue.async {
                    let start = ContinuousClock.now
                    box.engine.accept(samples: samples, sampleRate: 16_000)
                    box.metrics.addInferenceTime(start.duration(to: .now))
                    let result = box.engine.currentResult()
                    box.lastResult = result
                    let metrics = box.metrics.recordPartial(result.fullText)
                    DispatchQueue.main.async {
                        onUpdate(LiveModelUpdate(engine: box.descriptor.id, result: result, metrics: metrics))
                    }
                }
            }
        }
        decodeTimer = timer
        timer.resume()
    }

    func stop(onStatus: @escaping (LiveModelStatus) -> Void) async {
        running = false
        decodeTimer?.cancel()
        decodeTimer = nil
        microphone?.stop()
        microphone = nil

        for box in boxes where box.started {
            do {
                let final = try await box.engine.finishStream()
                box.lastResult = final
                onStatus(LiveModelStatus(engine: box.descriptor.id, ok: true, message: "已完成最终识别"))
            } catch {
                onStatus(LiveModelStatus(engine: box.descriptor.id, ok: false, message: "\(error)"))
            }
            box.engine.reset()
            box.started = false
        }
    }
}
