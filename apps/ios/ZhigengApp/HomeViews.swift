import SwiftUI
import UIKit
import ZhigengCore

struct MainTabView: View {
	@Bindable var store: AppStore

	var body: some View {
		TabView(selection: $store.selectedTab) {
			HomeView(store: store)
				.tabItem { Label("首页", systemImage: "house.fill") }
				.tag(AppTab.home)

			ActivityView(store: store)
				.tabItem { Label("活动", systemImage: "list.bullet.rectangle") }
				.tag(AppTab.activity)

			LexiconView(store: store)
				.tabItem { Label("懂我", systemImage: "sparkles") }
				.tag(AppTab.lexicon)

			MeView(store: store)
				.tabItem { Label("我的", systemImage: "person.crop.circle") }
				.tag(AppTab.me)
		}
		.tint(Brand.primary)
		.sheet(isPresented: $store.showSessionSheet) {
			SessionSheet(store: store)
		}
		.fullScreenCover(isPresented: $store.showDictation) {
			DictationFullScreen(store: store)
		}
		.sheet(isPresented: $store.showAddTerm) {
			AddTermSheet(store: store)
		}
		.onAppear { store.reloadSharedState() }
	}
}

struct HomeView: View {
	@Bindable var store: AppStore

	var body: some View {
		NavigationStack {
			ScrollView {
				VStack(spacing: 16) {
					readyCard
					recentResults
					if !store.recentLearnedTexts.isEmpty {
						Button {
							store.selectedTab = .lexicon
						} label: {
							ZhigengCard {
								Text("最近学会：\(store.recentLearnedTexts.joined(separator: "、"))")
									.font(.subheadline)
									.foregroundStyle(.primary)
							}
						}
						.buttonStyle(.plain)
					}
				}
				.padding(16)
			}
			.background(Color(.systemGroupedBackground))
			.navigationBarTitleDisplayMode(.inline)
			.toolbar {
				ToolbarItem(placement: .topBarLeading) {
					Text(Brand.name)
						.font(.title2.bold())
				}
				ToolbarItem(placement: .topBarTrailing) {
					Button {
						store.selectedTab = .me
					} label: {
						Image(systemName: "person.crop.circle")
					}
				}
			}
		}
	}

	@ViewBuilder
	private var readyCard: some View {
		ZhigengCard {
			switch store.readyKind {
			case let .setupIncomplete(missing):
				Text("还差 \(missing.count) 步即可使用")
					.font(.title3.bold())
				ForEach(missing, id: \.self) { item in
					Text(setupLabel(item))
						.font(.subheadline)
						.foregroundStyle(.secondary)
				}
				PrimaryButton(title: "继续设置") {
					store.reopenOnboarding(at: .keyboardSetup)
				}
			case .ready:
				HStack(alignment: .center, spacing: 14) {
					Image("Robin")
						.resizable()
						.scaledToFit()
						.frame(width: 72, height: 72)
					VStack(alignment: .leading, spacing: 4) {
						Text("知更已就绪")
							.font(.title3.bold())
						Text("任意 App 切到知更，点麦说话。")
							.font(.subheadline)
							.foregroundStyle(.secondary)
					}
				}
				PrimaryButton(title: "开始免切换会话") {
					store.showSessionSheet = true
				}
				SecondaryButton(title: "在 App 内试说") {
					store.showDictation = true
				}
			case let .sessionActive(remaining, mode):
				Text("免切换已开启")
					.font(.title3.bold())
				Text("\(mode) · 剩余 \(formatRemaining(remaining)) · 待机不录音")
					.font(.subheadline)
					.foregroundStyle(.secondary)
				PrimaryButton(title: "试说") {
					store.showDictation = true
				}
				SecondaryButton(title: "结束会话") {
					store.endSession()
				}
			case let .error(message, actionTitle):
				Text(message)
					.font(.headline)
				PrimaryButton(title: actionTitle) {
					store.selectedTab = .me
				}
			}
		}
	}

	@ViewBuilder
	private var recentResults: some View {
		ZhigengCard {
			HStack {
				Text("最近听写")
					.font(.headline)
				Spacer()
				Button("查看全部") {
					store.selectedTab = .activity
				}
				.font(.subheadline)
			}
			if store.recentHistory.isEmpty {
				Text("第一次听写会出现在这里")
					.font(.subheadline)
					.foregroundStyle(.secondary)
				SecondaryButton(title: "试说一句") {
					store.showDictation = true
				}
			} else {
				ForEach(store.recentHistory) { item in
					Button {
						store.editingHistoryItem = item
						store.selectedTab = .activity
					} label: {
						VStack(alignment: .leading, spacing: 4) {
							Text(item.cleanedText)
								.lineLimit(2)
								.foregroundStyle(.primary)
							Text(statusLabel(item))
								.font(.caption)
								.foregroundStyle(.secondary)
						}
						.frame(maxWidth: .infinity, alignment: .leading)
					}
					.buttonStyle(.plain)
					if item.id != store.recentHistory.last?.id {
						Divider()
					}
				}
			}
		}
	}

	private func setupLabel(_ item: HomeSetupItem) -> String {
		switch item {
		case .microphone: return "麦克风待授权"
		case .keyboard: return "键盘待添加或需重新验证"
		case .fullAccess: return "完全访问待开启"
		}
	}

	private func statusLabel(_ item: DictationHistoryItem) -> String {
		let status: String = switch item.status {
		case .ready: item.directStructured ? "已整理" : "原始"
		case .incomplete: "未完整"
		case .error: "失败"
		default: item.status.rawValue
		}
		return "\(status) · \(item.source.rawValue)"
	}

	private func formatRemaining(_ seconds: Int) -> String {
		let m = seconds / 60
		let s = seconds % 60
		return String(format: "%d:%02d", m, s)
	}
}

struct SessionSheet: View {
	@Bindable var store: AppStore
	@Environment(\.dismiss) private var dismiss

	var body: some View {
		NavigationStack {
			Form {
				Section {
					Text("待机不录音，只有点麦后才使用麦克风。")
						.font(.subheadline)
						.foregroundStyle(.secondary)
				}
				Section("模式") {
					Picker("模式", selection: $store.sessionMode) {
						ForEach(SessionMode.allCases) { mode in
							Text(mode.rawValue).tag(mode)
						}
					}
					.pickerStyle(.segmented)
					if store.sessionMode == .pip {
						Text("推荐。会出现可收起的小窗。")
							.font(.caption)
							.foregroundStyle(.secondary)
					} else {
						Text("灵动岛负责状态与入口，后台能力仍来自主 App。")
							.font(.caption)
							.foregroundStyle(.secondary)
					}
				}
				Section("时长") {
					Picker("时长", selection: $store.sessionDuration) {
						ForEach(SessionDuration.allCases) { d in
							Text(d.label).tag(d)
						}
					}
					.pickerStyle(.segmented)
				}
			}
			.navigationTitle("跳过应用切换")
			.navigationBarTitleDisplayMode(.inline)
			.toolbar {
				ToolbarItem(placement: .cancellationAction) {
					Button("关闭") { dismiss() }
				}
				ToolbarItem(placement: .confirmationAction) {
					Button("开始会话") {
						if store.microphoneGranted {
							store.startSession()
						} else {
							store.requestMicrophone { granted in
								if granted { store.startSession() }
							}
						}
					}
				}
			}
		}
	}
}

struct DictationFullScreen: View {
	@Bindable var store: AppStore
	@Environment(\.dismiss) private var dismiss
	@State private var phase: Phase = .idle
	@State private var draft = ""
	@State private var elapsed = 0
	@State private var timer: Timer?

	private enum Phase { case idle, listening, processing, done, incomplete }

	var body: some View {
		NavigationStack {
			VStack(spacing: 24) {
				Text(statusText)
					.font(.headline)
				Text(draft.isEmpty ? "点麦克风开始" : draft)
					.font(.title3)
					.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
					.padding()
				Button(action: toggle) {
					Image(systemName: phase == .listening ? "stop.fill" : "mic.fill")
						.font(.title)
						.foregroundStyle(.white)
						.frame(width: 80, height: 80)
						.background(phase == .listening ? Color.orange : Brand.primary)
						.clipShape(Circle())
				}
				if phase == .done || phase == .incomplete {
					HStack {
						Button("复制") { UIPasteboard.general.string = draft }
						Button("再说一次") { reset() }
					}
				}
			}
			.padding()
			.navigationTitle("试说")
			.navigationBarTitleDisplayMode(.inline)
			.toolbar {
				ToolbarItem(placement: .cancellationAction) {
					Button("取消") { dismiss() }
				}
				ToolbarItem(placement: .topBarTrailing) {
					if phase == .listening {
						Text("\(elapsed)s")
							.monospacedDigit()
					}
				}
			}
		}
		.onDisappear { timer?.invalidate() }
	}

	private var statusText: String {
		switch phase {
		case .idle: "可以开始"
		case .listening: "正在听"
		case .processing: "正在整理"
		case .done: "已完成"
		case .incomplete: "未完整处理"
		}
	}

	private func toggle() {
		switch phase {
		case .idle:
			guard store.microphoneGranted else {
				store.requestMicrophone { ok in if ok { start() } }
				return
			}
			start()
		case .listening:
			finish()
		default:
			break
		}
	}

	private func start() {
		phase = .listening
		elapsed = 0
		draft = ""
		timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
			Task { @MainActor in elapsed += 1 }
		}
	}

	private func finish() {
		timer?.invalidate()
		phase = .processing
		DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
			// ponytail: placeholder until AsrStreamClient lands; mark as demo-structured.
			draft = "明天下午三点联系张晨，确认 ARR。"
			phase = .done
			store.appendHistory(
				DictationHistoryItem(
					source: .main,
					status: .ready,
					cleanedText: draft,
					directStructured: true,
					durationMs: elapsed * 1000,
					processingTags: ["示例整理"]
				)
			)
		}
	}

	private func reset() {
		phase = .idle
		draft = ""
		elapsed = 0
	}
}
