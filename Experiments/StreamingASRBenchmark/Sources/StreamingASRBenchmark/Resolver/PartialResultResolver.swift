import Foundation

struct PartialPatch: Codable, Equatable {
    let rangeStart: Int
    let removed: String
    let inserted: String
    let stableText: String
    let unstableText: String
}

final class PartialResultResolver {
    private(set) var lastText = ""
    private let unstableTailCharacterCount: Int

    init(unstableTailCharacterCount: Int = 6) {
        self.unstableTailCharacterCount = unstableTailCharacterCount
    }

    func reset() {
        lastText = ""
    }

    func resolve(newText: String) -> (result: StreamingASRResult, patch: PartialPatch) {
        let old = Array(lastText)
        let new = Array(newText)
        let prefixLength = Self.longestCommonPrefix(old, new)
        let suffixLength = Self.longestCommonSuffix(old, new, prefixLength: prefixLength)

        let oldChangedEnd = old.count - suffixLength
        let newChangedEnd = new.count - suffixLength
        let removed = String(old[prefixLength..<oldChangedEnd])
        let inserted = String(new[prefixLength..<newChangedEnd])

        let stableEnd = max(0, new.count - unstableTailCharacterCount)
        let stableText = String(new[..<stableEnd])
        let unstableText = String(new[stableEnd...])

        lastText = newText
        let patch = PartialPatch(
            rangeStart: prefixLength,
            removed: removed,
            inserted: inserted,
            stableText: stableText,
            unstableText: unstableText
        )
        return (
            StreamingASRResult(fullText: newText, stableText: stableText, unstableText: unstableText),
            patch
        )
    }

    static func longestCommonPrefix(_ a: [Character], _ b: [Character]) -> Int {
        let limit = min(a.count, b.count)
        var index = 0
        while index < limit, a[index] == b[index] {
            index += 1
        }
        return index
    }

    static func longestCommonSuffix(_ a: [Character], _ b: [Character], prefixLength: Int) -> Int {
        var count = 0
        while count < a.count - prefixLength,
              count < b.count - prefixLength,
              a[a.count - 1 - count] == b[b.count - 1 - count] {
            count += 1
        }
        return count
    }
}
