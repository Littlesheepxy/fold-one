import SwiftUI
import UIKit
import ZhigengCore

struct ActivityView: View {
	@Bindable var store: AppStore

	var body: some View {
		NavigationStack {
			Group {
				if store.history.isEmpty {
					ContentUnavailableView {
						Label("活动", systemImage: "list.bullet.rectangle")
					} description: {
						Text("你的输入、代回和执行结果会汇总在这里")
					} actions: {
						Button("试说一句") { store.showDictation = true }
					}
				} else {
					List {
						ForEach(grouped, id: \.title) { section in
							Section(section.title) {
								ForEach(section.items) { item in
									NavigationLink {
										DictationDetailView(store: store, item: item)
									} label: {
										VStack(alignment: .leading, spacing: 4) {
											Text(item.cleanedText)
												.lineLimit(2)
											Text(meta(item))
												.font(.caption)
												.foregroundStyle(.secondary)
										}
									}
								}
								.onDelete { offsets in
									for i in offsets {
										store.deleteHistory(id: section.items[i].id)
									}
								}
							}
						}
					}
				}
			}
			.navigationTitle("活动")
		}
	}

	private var grouped: [(title: String, items: [DictationHistoryItem])] {
		let cal = Calendar.current
		var today: [DictationHistoryItem] = []
		var yesterday: [DictationHistoryItem] = []
		var earlier: [DictationHistoryItem] = []
		let now = Date()
		for item in store.history {
			let date = Date(timeIntervalSince1970: item.createdAt)
			if cal.isDateInToday(date) {
				today.append(item)
			} else if cal.isDateInYesterday(date) {
				yesterday.append(item)
			} else {
				earlier.append(item)
			}
		}
		var out: [(String, [DictationHistoryItem])] = []
		if !today.isEmpty { out.append(("今天", today)) }
		if !yesterday.isEmpty { out.append(("昨天", yesterday)) }
		if !earlier.isEmpty { out.append(("更早", earlier)) }
		_ = now
		return out
	}

	private func meta(_ item: DictationHistoryItem) -> String {
		let status = item.status == .ready
			? (item.directStructured ? "已整理" : "原始")
			: (item.status == .incomplete ? "未完整" : item.status.rawValue)
		return "\(status) · \(item.source == .keyboard ? "键盘" : item.source == .demo ? "示例" : "主 App")"
	}
}

struct DictationDetailView: View {
	@Bindable var store: AppStore
	let item: DictationHistoryItem

	var body: some View {
		List {
			Section {
				Text(item.cleanedText)
					.textSelection(.enabled)
			}
			if !item.processingTags.isEmpty {
				Section("整理了什么") {
					ForEach(item.processingTags, id: \.self) { tag in
						Text(tag)
					}
				}
			}
			Section {
				Button("复制") { UIPasteboard.general.string = item.cleanedText }
				ShareLink(item: item.cleanedText)
				Button("添加到懂我") {
					_ = store.addTerm(String(item.cleanedText.prefix(12)))
					store.selectedTab = .lexicon
				}
				Button("删除", role: .destructive) {
					store.deleteHistory(id: item.id)
				}
			}
		}
		.navigationTitle("详情")
	}
}
