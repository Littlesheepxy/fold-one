import ActivityKit
import SwiftUI
import WidgetKit

@main
struct ZhigengLiveActivityBundle: WidgetBundle {
	var body: some Widget {
		DictationLiveActivity()
	}
}

struct DictationLiveActivity: Widget {
	var body: some WidgetConfiguration {
		ActivityConfiguration(for: DictationAttributes.self) { context in
			HStack {
				Image(systemName: "mic.fill")
				VStack(alignment: .leading, spacing: 4) {
					Text(context.state.status)
						.font(.headline)
					if !context.state.partial.isEmpty {
						Text(context.state.partial)
							.font(.caption)
							.lineLimit(2)
					} else if context.state.remainingSeconds > 0 {
						Text(remainingLabel(context.state.remainingSeconds))
							.font(.caption)
							.foregroundStyle(.secondary)
					}
				}
				Spacer()
			}
			.padding()
			.activityBackgroundTint(Color(red: 0.404, green: 0.361, blue: 0.945).opacity(0.15))
		} dynamicIsland: { context in
			DynamicIsland {
				DynamicIslandExpandedRegion(.leading) {
					Image(systemName: "mic.fill")
				}
				DynamicIslandExpandedRegion(.center) {
					Text(context.state.status)
				}
				DynamicIslandExpandedRegion(.bottom) {
					if !context.state.partial.isEmpty {
						Text(context.state.partial).lineLimit(2)
					} else if context.state.remainingSeconds > 0 {
						Text(remainingLabel(context.state.remainingSeconds))
					}
				}
			} compactLeading: {
				Image(systemName: "mic.fill")
			} compactTrailing: {
				Text(context.state.status).font(.caption2)
			} minimal: {
				Image(systemName: "mic.fill")
			}
		}
	}

	private func remainingLabel(_ seconds: Int) -> String {
		let m = seconds / 60
		let s = seconds % 60
		return String(format: "剩余 %d:%02d", m, s)
	}
}
