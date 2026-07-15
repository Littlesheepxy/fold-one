import EventKit
import Foundation

/// 最小日历读取 CLI：stdout 输出 TSV（title \t startMs \t endMs \t calendar），stderr 状态。
/// 用法：fold-calendar [withinHours=12] [limit=5]

let withinHours = Double(CommandLine.arguments.dropFirst().first ?? "12") ?? 12
let limit = Int(CommandLine.arguments.dropFirst(2).first ?? "5") ?? 5

let store = EKEventStore()
var granted = false
var authError: String?
var finished = false

func finishAuth(ok: Bool, err: Error?) {
	granted = ok
	authError = err?.localizedDescription
	finished = true
	CFRunLoopStop(CFRunLoopGetMain())
}

if #available(macOS 14.0, *) {
	store.requestFullAccessToEvents { ok, err in
		finishAuth(ok: ok, err: err)
	}
} else {
	store.requestAccess(to: .event) { ok, err in
		finishAuth(ok: ok, err: err)
	}
}

// 必须跑 runloop，否则系统授权弹窗不会出现 / 回调不会回来
let deadline = Date().addingTimeInterval(60)
while !finished && Date() < deadline {
	_ = RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.25))
}

if !granted {
	fputs("DENIED\t\(authError ?? "calendar access denied")\n", stderr)
	exit(2)
}

let start = Date()
let end = start.addingTimeInterval(max(1, withinHours) * 3600)
let predicate = store.predicateForEvents(withStart: start, end: end, calendars: nil)
let events = store.events(matching: predicate).sorted { $0.startDate < $1.startDate }

for event in events.prefix(max(1, limit)) {
	let title = (event.title ?? "")
		.replacingOccurrences(of: "\t", with: " ")
		.replacingOccurrences(of: "\n", with: " ")
	let startMs = Int(event.startDate.timeIntervalSince1970 * 1000)
	let endMs = Int(event.endDate.timeIntervalSince1970 * 1000)
	let cal = (event.calendar?.title ?? "")
		.replacingOccurrences(of: "\t", with: " ")
	print("\(title)\t\(startMs)\t\(endMs)\t\(cal)")
}
