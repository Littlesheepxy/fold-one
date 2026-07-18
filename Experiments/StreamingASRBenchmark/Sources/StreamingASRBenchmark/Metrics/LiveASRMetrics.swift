import Foundation

struct LiveASRMetricSnapshot: Codable {
    let firstCharLatencyMs: Double?
    let updateIntervalMs: Double?
    let revisionRate: Double
    let rtf: Double
    let partialCount: Int
    let displayedCharacters: Int
    let revisedCharacters: Int
}

final class LiveASRMetrics {
    private let lock = NSLock()
    private var runStart = ContinuousClock.now
    private var firstAudioTime: ContinuousClock.Instant?
    private var firstCharacterTime: ContinuousClock.Instant?
    private var partialTimes: [ContinuousClock.Instant] = []
    private var lastText = ""
    private var displayedCharacters = 0
    private var revisedCharacters = 0
    private var audioDurationMs: Double = 0
    private var inferenceNanoseconds: UInt64 = 0

    func markStart() {
        lock.lock()
        runStart = .now
        firstAudioTime = nil
        firstCharacterTime = nil
        partialTimes = []
        lastText = ""
        displayedCharacters = 0
        revisedCharacters = 0
        audioDurationMs = 0
        inferenceNanoseconds = 0
        lock.unlock()
    }

    func markFirstAudioIfNeeded() {
        lock.lock()
        if firstAudioTime == nil {
            firstAudioTime = .now
        }
        lock.unlock()
    }

    func addAudio(samples: Int, sampleRate: Int) {
        lock.lock()
        audioDurationMs += Double(samples) / Double(sampleRate) * 1000
        lock.unlock()
    }

    func addInferenceTime(_ duration: Duration) {
        lock.lock()
        inferenceNanoseconds += UInt64(duration.components.seconds) * 1_000_000_000
        inferenceNanoseconds += UInt64(duration.components.attoseconds / 1_000_000_000)
        lock.unlock()
    }

    func recordPartial(_ text: String) -> LiveASRMetricSnapshot {
        lock.lock()
        defer { lock.unlock() }
        if text != lastText {
            let now = ContinuousClock.now
            partialTimes.append(now)
            if firstCharacterTime == nil, text.containsVisibleText {
                firstCharacterTime = now
            }
            let oldChars = Array(lastText)
            let newChars = Array(text)
            let prefix = PartialResultResolver.longestCommonPrefix(oldChars, newChars)
            let suffix = PartialResultResolver.longestCommonSuffix(oldChars, newChars, prefixLength: prefix)
            revisedCharacters += max(0, oldChars.count - prefix - suffix)
            displayedCharacters += max(0, newChars.count - prefix - suffix)
            lastText = text
        }
        return snapshotLocked()
    }

    func snapshot() -> LiveASRMetricSnapshot {
        lock.lock()
        defer { lock.unlock() }
        return snapshotLocked()
    }

    private func snapshotLocked() -> LiveASRMetricSnapshot {
        let firstChar = firstCharacterTime.map { wallClockMs(from: firstAudioTime ?? runStart, to: $0) }
        let updateIntervals = partialTimes.count > 1
            ? zip(partialTimes.dropFirst(), partialTimes).map { wallClockMs(from: $1, to: $0) }
            : []
        let rtf = audioDurationMs > 0 ? Double(inferenceNanoseconds) / 1_000_000 / audioDurationMs : 0
        return LiveASRMetricSnapshot(
            firstCharLatencyMs: firstChar,
            updateIntervalMs: updateIntervals.average,
            revisionRate: displayedCharacters == 0 ? 0 : Double(revisedCharacters) / Double(displayedCharacters),
            rtf: rtf,
            partialCount: partialTimes.count,
            displayedCharacters: displayedCharacters,
            revisedCharacters: revisedCharacters
        )
    }
}

private extension String {
    var containsVisibleText: Bool {
        unicodeScalars.contains { scalar in
            (scalar.value >= 0x4E00 && scalar.value <= 0x9FFF) ||
            CharacterSet.alphanumerics.contains(scalar)
        }
    }
}
