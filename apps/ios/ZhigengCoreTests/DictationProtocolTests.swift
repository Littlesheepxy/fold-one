import XCTest
@testable import ZhigengCore

final class DictationProtocolTests: XCTestCase {
	private var tempDir: URL!
	private var bridge: AppGroupBridge!

	override func setUpWithError() throws {
		tempDir = FileManager.default.temporaryDirectory
			.appendingPathComponent("zg-proto-\(UUID().uuidString)", isDirectory: true)
		try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
		bridge = AppGroupBridge(containerOverride: tempDir)
	}

	override func tearDownWithError() throws {
		try? FileManager.default.removeItem(at: tempDir)
	}

	func testCommandRoundTripAndConsumeOnce() throws {
		let command = DictationCommand(kind: .start, requestId: "r1")
		try bridge.writeCommand(command)
		let first = try bridge.consumeCommand()
		XCTAssertEqual(first?.kind, .start)
		XCTAssertEqual(first?.requestId, "r1")
		XCTAssertNil(try bridge.consumeCommand())
	}

	func testSessionAliveRequiresHeartbeatAndDeadline() throws {
		let now: TimeInterval = 1_000
		let alive = DictationSession(
			activeUntil: now + 60,
			state: .idle,
			mode: .pip,
			heartbeatAt: now - 2
		)
		XCTAssertTrue(alive.isServiceAlive(now: now))

		let staleHeartbeat = DictationSession(
			activeUntil: now + 60,
			state: .idle,
			mode: .pip,
			heartbeatAt: now - 30
		)
		XCTAssertFalse(staleHeartbeat.isServiceAlive(now: now))

		let expired = DictationSession(
			activeUntil: now - 1,
			state: .idle,
			mode: .liveActivity,
			heartbeatAt: now
		)
		XCTAssertFalse(expired.isServiceAlive(now: now))
	}

	func testPartialResultUsesRevisionAndIsNotInsertable() throws {
		let partial = DictationResult(
			requestId: "r1",
			status: .recording,
			text: "半",
			revision: 3
		)
		XCTAssertFalse(partial.isInsertable)
		XCTAssertEqual(partial.revision, 3)

		try bridge.writeResult(partial)
		XCTAssertNil(try bridge.consumeInsertableResult(matching: "r1"))
		XCTAssertEqual(try bridge.readResult()?.revision, 3)
	}

	func testConsumeNewerRevisionOnly() throws {
		try bridge.writeResult(
			DictationResult(requestId: "r1", status: .recording, text: "一", revision: 1)
		)
		XCTAssertEqual(try bridge.readResultIfNewer(than: 0)?.revision, 1)
		XCTAssertNil(try bridge.readResultIfNewer(than: 1))

		try bridge.writeResult(
			DictationResult(requestId: "r1", status: .recording, text: "一二", revision: 2)
		)
		XCTAssertEqual(try bridge.readResultIfNewer(than: 1)?.text, "一二")
	}
}
