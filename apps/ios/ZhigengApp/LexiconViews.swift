import SwiftUI
import ZhigengCore

struct LexiconView: View {
	@Bindable var store: AppStore
	@State private var query = ""

	var body: some View {
		NavigationStack {
			Group {
				if filtered.isEmpty {
					ContentUnavailableView {
						Label("把容易听错的词告诉知更", systemImage: "sparkles")
					} description: {
						Text("修正一次，语音和拼音都会记住")
					} actions: {
						Button("添加第一个词") { store.showAddTerm = true }
					}
				} else {
					List {
						ForEach(filtered) { term in
							NavigationLink {
								TermDetailView(store: store, term: term)
							} label: {
								VStack(alignment: .leading, spacing: 4) {
									Text(term.text)
									Text(sourceLabel(term.source))
										.font(.caption)
										.foregroundStyle(.secondary)
								}
							}
						}
						.onDelete { offsets in
							for i in offsets {
								store.forgetTerm(id: filtered[i].id)
							}
						}
					}
					.searchable(text: $query, prompt: "搜索人名、公司或术语")
				}
			}
			.navigationTitle("懂我")
			.toolbar {
				ToolbarItem(placement: .topBarTrailing) {
					Button {
						store.showAddTerm = true
					} label: {
						Image(systemName: "plus")
					}
				}
			}
			.safeAreaInset(edge: .top) {
				if !store.lexicon.allTerms.isEmpty {
					Text("修正一次，语音和拼音都会记住")
						.font(.footnote)
						.foregroundStyle(.secondary)
						.frame(maxWidth: .infinity, alignment: .leading)
						.padding(.horizontal, 16)
						.padding(.vertical, 8)
				}
			}
		}
	}

	private var filtered: [PersonalTerm] {
		let terms = store.lexicon.allTerms.sorted { $0.lastUsedAt > $1.lastUsedAt }
		let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
		guard !q.isEmpty else { return terms }
		return terms.filter { $0.text.localizedCaseInsensitiveContains(q) }
	}

	private func sourceLabel(_ source: PersonalTermSource) -> String {
		switch source {
		case .manual: "手动添加"
		case .pinyinCorrection: "拼音修正"
		case .desktopSync: "桌面同步"
		}
	}
}

struct TermDetailView: View {
	@Bindable var store: AppStore
	let term: PersonalTerm
	@Environment(\.dismiss) private var dismiss

	var body: some View {
		List {
			Section {
				Text(term.text)
					.font(.title2.bold())
			}
			Section {
				LabeledContent("用于语音热词", value: "开启")
				LabeledContent("提升拼音候选", value: "开启")
				LabeledContent("来源", value: sourceLabel(term.source))
			}
			Section {
				Button("忘掉这个词", role: .destructive) {
					store.forgetTerm(id: term.id)
					dismiss()
				}
			} footer: {
				Text("删除后，语音和拼音都不再优先识别它。")
			}
		}
		.navigationTitle("词条")
	}

	private func sourceLabel(_ source: PersonalTermSource) -> String {
		switch source {
		case .manual: "手动添加"
		case .pinyinCorrection: "拼音修正"
		case .desktopSync: "桌面同步"
		}
	}
}

struct AddTermSheet: View {
	@Bindable var store: AppStore
	@Environment(\.dismiss) private var dismiss
	@State private var text = ""

	var body: some View {
		NavigationStack {
			Form {
				Section {
					TextField("正确写法", text: $text)
						.autocorrectionDisabled()
				} footer: {
					Text("添加后，语音热词和拼音候选都会优先使用。")
				}
			}
			.navigationTitle("添加常用词")
			.navigationBarTitleDisplayMode(.inline)
			.toolbar {
				ToolbarItem(placement: .cancellationAction) {
					Button("取消") { dismiss() }
				}
				ToolbarItem(placement: .confirmationAction) {
					Button("添加") {
						_ = store.addTerm(text)
						dismiss()
					}
					.disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
				}
			}
		}
	}
}
