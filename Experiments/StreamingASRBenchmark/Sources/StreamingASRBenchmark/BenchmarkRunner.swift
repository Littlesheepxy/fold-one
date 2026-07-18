import Foundation

struct BenchmarkOptions {
    let fixturesPath: String
    let wavDirectory: String
    let reportsDirectory: String
    let chunkMilliseconds: Double
    let realtimePlayback: Bool
    let engines: [String]

    static func parse(arguments: [String]) -> BenchmarkOptions {
        func value(after flag: String, default defaultValue: String) -> String {
            guard let index = arguments.firstIndex(of: flag), index + 1 < arguments.count else {
                return defaultValue
            }
            return arguments[index + 1]
        }
        let engineArg = value(after: "--engines", default: EngineRegistry.defaultEngineIds.joined(separator: ","))
        return BenchmarkOptions(
            fixturesPath: value(after: "--fixtures", default: "Fixtures/utterances.json"),
            wavDirectory: value(after: "--wav-dir", default: "Fixtures/WAV"),
            reportsDirectory: value(after: "--reports-dir", default: "Reports"),
            chunkMilliseconds: Double(value(after: "--chunk-ms", default: "40")) ?? 40,
            realtimePlayback: !arguments.contains("--no-realtime"),
            engines: engineArg.split(separator: ",").map(String.init)
        )
    }
}

final class BenchmarkRunner {
    private let options: BenchmarkOptions

    init(options: BenchmarkOptions) {
        self.options = options
    }

    func run() async throws {
        let fixtures = try FixtureLoader.load(path: options.fixturesPath)
        let engines = makeEngines()
        var warmups: [String: Double] = [:]
        var records: [ASRRunRecord] = []

        for engine in engines {
            let start = ContinuousClock.now
            do {
                try await engine.prepare()
                warmups[engine.name] = wallClockMs(from: start, to: .now)
            } catch {
                print("[skip] \(engine.name): \(error)")
                continue
            }

            for fixture in fixtures {
                let wavPath = "\(options.wavDirectory)/\(fixture.wavFile)"
                guard FileManager.default.fileExists(atPath: wavPath) else {
                    print("[skip] missing WAV for \(fixture.id): \(wavPath)")
                    continue
                }
                let audio = try AudioFixtureLoader.load(wavPath: wavPath)
                let record = try await runFixture(engine: engine, fixture: fixture, audio: audio, warmupMs: warmups[engine.name])
                records.append(record)
                print("[run] \(engine.name) \(fixture.id): firstChar=\(record.firstCharacterLatencyMs.map { String(format: "%.0fms", $0) } ?? "n/a") rtf=\(String(format: "%.3f", record.realTimeFactor)) text=\(record.recognizedText)")
                engine.reset()
            }
        }

        try ReportWriter.write(records: records, reportsDirectory: options.reportsDirectory)
    }

    private func runFixture(
        engine: StreamingASREngine,
        fixture: FixtureUtterance,
        audio: AudioFixture,
        warmupMs: Double?
    ) async throws -> ASRRunRecord {
        let collector = ASRMetricsCollector(
            model: engine.name,
            fixture: fixture,
            audioDurationMs: audio.durationMs,
            speechOnsetAudioMs: audio.speechOnsetMs
        )
        try engine.startStream()
        collector.markRunStart()

        let chunkSize = max(1, Int(Double(audio.sampleRate) * options.chunkMilliseconds / 1000.0))
        var offset = 0
        while offset < audio.samples.count {
            let end = min(audio.samples.count, offset + chunkSize)
            let chunk = Array(audio.samples[offset..<end])
            let audioCursorMs = Double(end) / Double(audio.sampleRate) * 1000.0
            if audioCursorMs >= audio.speechOnsetMs {
                collector.markFirstAcceptIfNeeded()
            }
            let decodeStart = ContinuousClock.now
            engine.accept(samples: chunk, sampleRate: audio.sampleRate)
            collector.addInferenceTime(decodeStart.duration(to: .now))
            collector.recordPartial(engine.currentResult().fullText, audioCursorMs: audioCursorMs)
            offset = end
            if options.realtimePlayback {
                try await Task.sleep(nanoseconds: UInt64(options.chunkMilliseconds * 1_000_000.0))
            }
        }

        collector.markSpeechEnd()
        let final = try await engine.finishStream()
        collector.recordFinal(final.fullText)
        return collector.makeRecord(recognizedText: final.fullText, warmupMs: warmupMs)
    }

    private func makeEngines() -> [StreamingASREngine] {
        options.engines.map { EngineRegistry.makeEngine(id: $0) }
    }
}
