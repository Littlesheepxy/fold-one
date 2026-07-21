import ActivityKit
import Foundation

/// ActivityKit updates are async/nonisolated; keep the handle off the main actor.
final class DictationLiveActivityController: @unchecked Sendable {
	private var activity: Activity<DictationAttributes>?
	private let lock = NSLock()

	func start(modeLabel: String, remainingSeconds: Int) {
		guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
		end()
		let attributes = DictationAttributes(modeLabel: modeLabel)
		let state = DictationAttributes.ContentState(
			status: "待命中",
			remainingSeconds: remainingSeconds
		)
		do {
			let created = try Activity.request(
				attributes: attributes,
				content: .init(state: state, staleDate: nil),
				pushType: nil
			)
			lock.lock()
			activity = created
			lock.unlock()
		} catch {
			// Live Activity optional — session still works without it.
		}
	}

	func update(status: String, partial: String = "", remainingSeconds: Int) {
		lock.lock()
		let current = activity
		lock.unlock()
		guard let current else { return }
		let state = DictationAttributes.ContentState(
			status: status,
			partial: partial,
			remainingSeconds: remainingSeconds
		)
		Task {
			await current.update(.init(state: state, staleDate: nil))
		}
	}

	func end() {
		lock.lock()
		let current = activity
		activity = nil
		lock.unlock()
		guard let current else { return }
		Task {
			await current.end(nil, dismissalPolicy: .immediate)
		}
	}
}
