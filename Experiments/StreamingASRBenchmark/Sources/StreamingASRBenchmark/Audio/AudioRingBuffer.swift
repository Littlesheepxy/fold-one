import Foundation

final class AudioRingBuffer {
    private var storage: [Float]
    private var readIndex = 0
    private var writeIndex = 0
    private var availableCount = 0
    private let lock = NSLock()

    init(capacity: Int) {
        precondition(capacity > 0)
        self.storage = Array(repeating: 0, count: capacity)
    }

    var capacity: Int { storage.count }

    func write(_ samples: UnsafeBufferPointer<Float>) {
        lock.lock()
        defer { lock.unlock() }

        for sample in samples {
            storage[writeIndex] = sample
            writeIndex = (writeIndex + 1) % storage.count
            if availableCount == storage.count {
                readIndex = (readIndex + 1) % storage.count
            } else {
                availableCount += 1
            }
        }
    }

    func read(maxCount: Int) -> [Float] {
        lock.lock()
        defer { lock.unlock() }

        let count = min(maxCount, availableCount)
        guard count > 0 else { return [] }

        var output = [Float]()
        output.reserveCapacity(count)
        for _ in 0..<count {
            output.append(storage[readIndex])
            readIndex = (readIndex + 1) % storage.count
        }
        availableCount -= count
        return output
    }

    func clear() {
        lock.lock()
        readIndex = 0
        writeIndex = 0
        availableCount = 0
        lock.unlock()
    }
}
