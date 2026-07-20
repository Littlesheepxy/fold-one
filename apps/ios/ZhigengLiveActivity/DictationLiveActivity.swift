import ActivityKit
import SwiftUI
import WidgetKit

struct DictationAttributes: ActivityAttributes {
	public struct ContentState: Codable, Hashable {
		var status: String
		var partial: String
	}

	var startedAt: Date
}

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
				VStack(alignment: .leading) {
					Text(context.state.status)
						.font(.headline)
					if !context.state.partial.isEmpty {
						Text(context.state.partial)
							.font(.caption)
							.lineLimit(2)
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
					Text(context.state.partial).lineLimit(2)
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
}
