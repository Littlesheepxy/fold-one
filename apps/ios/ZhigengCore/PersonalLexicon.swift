import Foundation

public enum PersonalTermSource: String, Codable, Sendable {
	case manual
	case pinyinCorrection
	case desktopSync
}

public struct PersonalTerm: Codable, Equatable, Identifiable, Sendable {
	public var id: String
	public var text: String
	public var source: PersonalTermSource
	public var weight: Int
	public var lastUsedAt: TimeInterval
	public var createdAt: TimeInterval

	public init(
		id: String = UUID().uuidString,
		text: String,
		source: PersonalTermSource,
		weight: Int = 1,
		lastUsedAt: TimeInterval = Date().timeIntervalSince1970,
		createdAt: TimeInterval = Date().timeIntervalSince1970
	) {
		self.id = id
		self.text = text
		self.source = source
		self.weight = weight
		self.lastUsedAt = lastUsedAt
		self.createdAt = createdAt
	}
}

public struct CorrectionEvent: Equatable, Sendable {
	public var original: String
	public var replacement: String
	public var requestId: String
	public var at: TimeInterval

	public init(original: String, replacement: String, requestId: String, at: TimeInterval = Date().timeIntervalSince1970) {
		self.original = original
		self.replacement = replacement
		self.requestId = requestId
		self.at = at
	}
}

/// Shared personal lexicon for Rime boosts and ASR hotWords.
///
/// Learning rules (v1):
/// - same requestId
/// - short window after insert
/// - replacement must differ and be non-empty
/// - user can forget / undo later
public final class PersonalLexicon: @unchecked Sendable {
	public static let correctionWindowSeconds: TimeInterval = 30
	public static let maxHotWords = 100

	private var terms: [PersonalTerm]
	private let now: () -> TimeInterval

	public init(terms: [PersonalTerm] = [], now: @escaping () -> TimeInterval = { Date().timeIntervalSince1970 }) {
		self.terms = terms
		self.now = now
	}

	public var allTerms: [PersonalTerm] { terms }

	public func asrHotWords(limit: Int = PersonalLexicon.maxHotWords) -> [String] {
		rankedTexts(limit: limit)
	}

	public func rimeBoosts(limit: Int = PersonalLexicon.maxHotWords) -> [(text: String, weight: Int)] {
		ranked(limit: limit).map { ($0.text, min(5, max(1, $0.weight))) }
	}

	@discardableResult
	public func recordCorrection(
		original: String,
		replacement: String,
		requestId: String,
		insertedAt: TimeInterval,
		at: TimeInterval? = nil
	) -> PersonalTerm? {
		let moment = at ?? now()
		let o = original.trimmingCharacters(in: .whitespacesAndNewlines)
		let r = replacement.trimmingCharacters(in: .whitespacesAndNewlines)
		guard !r.isEmpty, r != o else { return nil }
		guard !requestId.isEmpty else { return nil }
		guard moment - insertedAt <= Self.correctionWindowSeconds else { return nil }

		if let idx = terms.firstIndex(where: { $0.text.caseInsensitiveCompare(r) == .orderedSame }) {
			terms[idx].weight += 1
			terms[idx].lastUsedAt = moment
			terms[idx].source = .pinyinCorrection
			return terms[idx]
		}

		let term = PersonalTerm(text: r, source: .pinyinCorrection, weight: 2, lastUsedAt: moment, createdAt: moment)
		terms.append(term)
		return term
	}

	@discardableResult
	public func addManual(_ text: String) -> PersonalTerm? {
		let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
		guard !t.isEmpty else { return nil }
		if let idx = terms.firstIndex(where: { $0.text.caseInsensitiveCompare(t) == .orderedSame }) {
			terms[idx].lastUsedAt = now()
			return terms[idx]
		}
		let term = PersonalTerm(text: t, source: .manual, weight: 3, lastUsedAt: now())
		terms.append(term)
		return term
	}

	public func forget(id: String) {
		terms.removeAll { $0.id == id }
	}

	public func encode() throws -> Data {
		try JSONEncoder().encode(terms)
	}

	public static func decode(from data: Data, now: @escaping () -> TimeInterval = { Date().timeIntervalSince1970 }) throws -> PersonalLexicon {
		let terms = try JSONDecoder().decode([PersonalTerm].self, from: data)
		return PersonalLexicon(terms: terms, now: now)
	}

	private func ranked(limit: Int) -> [PersonalTerm] {
		terms
			.sorted {
				if $0.weight != $1.weight { return $0.weight > $1.weight }
				return $0.lastUsedAt > $1.lastUsedAt
			}
			.prefix(limit)
			.map { $0 }
	}

	private func rankedTexts(limit: Int) -> [String] {
		ranked(limit: limit).map(\.text)
	}
}
