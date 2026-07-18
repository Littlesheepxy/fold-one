import Foundation

struct ASRRunRecord: Codable {
    let model: String
    let fixtureId: String
    let referenceText: String
    let recognizedText: String
    let audioDurationMs: Double
    let firstAudioLatencyMs: Double?
    let firstCharacterLatencyMs: Double?
    let partialUpdateIntervalMs: Double?
    let tokenEmissionDelayMs: Double?
    let finalizationLatencyMs: Double?
    let revisionRate: Double
    let realTimeFactor: Double
    let cpuAveragePercent: Double?
    let cpuPeakPercent: Double?
    let residentMemoryMB: Double?
    let modelWarmupMs: Double?
    let displayedCharacters: Int
    let revisedCharacters: Int
}

struct ASRSummaryRecord: Codable {
    let model: String
    let firstCharP50Ms: Double?
    let firstCharP95Ms: Double?
    let updateIntervalMs: Double?
    let revisionRate: Double
    let realTimeFactor: Double
    let cpuAveragePercent: Double?
    let cpuPeakPercent: Double?
    let residentMemoryMB: Double?
    let modelWarmupMs: Double?
}

final class ASRMetricsCollector {
    private let model: String
    private let fixture: FixtureUtterance
    private let audioDurationMs: Double
    private let speechOnsetAudioMs: Double
    private var runStart = ContinuousClock.now
    private var inferenceNanoseconds: UInt64 = 0
    private var firstAcceptTime: ContinuousClock.Instant?
    private var firstCharacterTime: ContinuousClock.Instant?
    private var speechEndTime: ContinuousClock.Instant?
    private var finalTime: ContinuousClock.Instant?
    private var partialTimes: [ContinuousClock.Instant] = []
    private var lastText = ""
    private var displayedCharacters = 0
    private var revisedCharacters = 0
    private var tokenDelays: [Double] = []
    private var cpuSamples: [Double] = []
    private var memorySamples: [Double] = []

    init(model: String, fixture: FixtureUtterance, audioDurationMs: Double, speechOnsetAudioMs: Double) {
        self.model = model
        self.fixture = fixture
        self.audioDurationMs = audioDurationMs
        self.speechOnsetAudioMs = speechOnsetAudioMs
    }

    func markRunStart() {
        runStart = .now
    }

    func markFirstAcceptIfNeeded() {
        if firstAcceptTime == nil {
            firstAcceptTime = .now
        }
    }

    func addInferenceTime(_ duration: Duration) {
        inferenceNanoseconds += UInt64(duration.components.seconds) * 1_000_000_000
        inferenceNanoseconds += UInt64(duration.components.attoseconds / 1_000_000_000)
    }

    func recordPartial(_ text: String, audioCursorMs: Double) {
        guard text != lastText else { return }
        let now = ContinuousClock.now
        partialTimes.append(now)
        if firstCharacterTime == nil, text.containsChineseOrASCIIWord {
            firstCharacterTime = now
        }
        let oldChars = Array(lastText)
        let newChars = Array(text)
        let prefix = PartialResultResolver.longestCommonPrefix(oldChars, newChars)
        let suffix = PartialResultResolver.longestCommonSuffix(oldChars, newChars, prefixLength: prefix)
        revisedCharacters += max(0, oldChars.count - prefix - suffix)
        displayedCharacters += max(0, newChars.count - prefix - suffix)
        if newChars.count > oldChars.count {
            tokenDelays.append(max(0, wallClockMs(from: runStart, to: now) - audioCursorMs))
        }
        lastText = text
        sampleProcessStats()
    }

    func markSpeechEnd() {
        speechEndTime = .now
    }

    func recordFinal(_ text: String) {
        finalTime = .now
        recordPartial(text, audioCursorMs: audioDurationMs)
    }

    func makeRecord(recognizedText: String, warmupMs: Double?) -> ASRRunRecord {
        let firstAudioLatency = firstAcceptTime.map { wallClockMs(from: runStart, to: $0) - speechOnsetAudioMs }
        let firstCharLatency = firstCharacterTime.map { wallClockMs(from: runStart, to: $0) - speechOnsetAudioMs }
        let updateInterval = intervals(partialTimes).average
        let finalLatency: Double?
        if let speechEndTime, let finalTime {
            finalLatency = wallClockMs(from: speechEndTime, to: finalTime)
        } else {
            finalLatency = nil
        }
        return ASRRunRecord(
            model: model,
            fixtureId: fixture.id,
            referenceText: fixture.text,
            recognizedText: recognizedText,
            audioDurationMs: audioDurationMs,
            firstAudioLatencyMs: firstAudioLatency,
            firstCharacterLatencyMs: firstCharLatency,
            partialUpdateIntervalMs: updateInterval,
            tokenEmissionDelayMs: tokenDelays.average,
            finalizationLatencyMs: finalLatency,
            revisionRate: displayedCharacters == 0 ? 0 : Double(revisedCharacters) / Double(displayedCharacters),
            realTimeFactor: Double(inferenceNanoseconds) / 1_000_000.0 / audioDurationMs,
            cpuAveragePercent: cpuSamples.average,
            cpuPeakPercent: cpuSamples.max(),
            residentMemoryMB: memorySamples.max(),
            modelWarmupMs: warmupMs,
            displayedCharacters: displayedCharacters,
            revisedCharacters: revisedCharacters
        )
    }

    private func sampleProcessStats() {
        memorySamples.append(ProcessStats.residentMemoryMB())
        if let cpu = ProcessStats.cpuPercent() {
            cpuSamples.append(cpu)
        }
    }
}

enum ASRMetricsSummary {
    static func summarize(_ records: [ASRRunRecord]) -> [ASRSummaryRecord] {
        Dictionary(grouping: records, by: \.model)
            .map { model, modelRecords in
                ASRSummaryRecord(
                    model: model,
                    firstCharP50Ms: modelRecords.compactMap(\.firstCharacterLatencyMs).percentile(0.50),
                    firstCharP95Ms: modelRecords.compactMap(\.firstCharacterLatencyMs).percentile(0.95),
                    updateIntervalMs: modelRecords.compactMap(\.partialUpdateIntervalMs).average,
                    revisionRate: modelRecords.map(\.revisionRate).average ?? 0,
                    realTimeFactor: modelRecords.map(\.realTimeFactor).average ?? 0,
                    cpuAveragePercent: modelRecords.compactMap(\.cpuAveragePercent).average,
                    cpuPeakPercent: modelRecords.compactMap(\.cpuPeakPercent).max(),
                    residentMemoryMB: modelRecords.compactMap(\.residentMemoryMB).max(),
                    modelWarmupMs: modelRecords.compactMap(\.modelWarmupMs).average
                )
            }
            .sorted { $0.model < $1.model }
    }
}

private extension String {
    var containsChineseOrASCIIWord: Bool {
        unicodeScalars.contains { scalar in
            (scalar.value >= 0x4E00 && scalar.value <= 0x9FFF) ||
            CharacterSet.alphanumerics.contains(scalar)
        }
    }
}

extension Array where Element == Double {
    var average: Double? {
        guard !isEmpty else { return nil }
        return reduce(0, +) / Double(count)
    }

    func percentile(_ percentile: Double) -> Double? {
        guard !isEmpty else { return nil }
        let sorted = sorted()
        let index = Swift.min(sorted.count - 1, Swift.max(0, Int((Double(sorted.count - 1) * percentile).rounded())))
        return sorted[index]
    }
}

private func intervals(_ times: [ContinuousClock.Instant]) -> [Double] {
    guard times.count > 1 else { return [] }
    return zip(times.dropFirst(), times).map { later, earlier in
        wallClockMs(from: earlier, to: later)
    }
}

func wallClockMs(from start: ContinuousClock.Instant, to end: ContinuousClock.Instant) -> Double {
    let duration = start.duration(to: end)
    return Double(duration.components.seconds) * 1000.0 +
        Double(duration.components.attoseconds) / 1_000_000_000_000_000.0
}

enum ProcessStats {
    static func residentMemoryMB() -> Double {
        var info = mach_task_basic_info()
        var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size) / 4
        let result = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
            }
        }
        guard result == KERN_SUCCESS else { return 0 }
        return Double(info.resident_size) / 1024.0 / 1024.0
    }

    static func cpuPercent() -> Double? {
        var count = mach_msg_type_number_t()
        var threadList: thread_act_array_t?
        guard task_threads(mach_task_self_, &threadList, &count) == KERN_SUCCESS,
              let threadList else { return nil }
        defer {
            vm_deallocate(mach_task_self_, vm_address_t(bitPattern: threadList), vm_size_t(Int(count) * MemoryLayout<thread_t>.stride))
        }
        var total: Double = 0
        for index in 0..<Int(count) {
            var info = thread_basic_info()
            var infoCount = mach_msg_type_number_t(THREAD_INFO_MAX)
            let result = withUnsafeMutablePointer(to: &info) {
                $0.withMemoryRebound(to: integer_t.self, capacity: Int(infoCount)) {
                    thread_info(threadList[index], thread_flavor_t(THREAD_BASIC_INFO), $0, &infoCount)
                }
            }
            if result == KERN_SUCCESS, info.flags & TH_FLAGS_IDLE == 0 {
                total += Double(info.cpu_usage) / Double(TH_USAGE_SCALE) * 100.0
            }
        }
        return total
    }
}
