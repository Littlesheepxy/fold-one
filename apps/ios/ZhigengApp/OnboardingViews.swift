import SwiftUI
import UIKit
import ZhigengCore

struct OnboardingFlow: View {
	@Bindable var store: AppStore

	var body: some View {
		Group {
			switch store.onboardingStep {
			case .brandWelcome:
				BrandWelcomeView(store: store)
			case .tryLearn:
				TryLearnView(store: store)
			case .keyboardSetup:
				KeyboardSetupView(store: store)
			case .readyBrand:
				ReadyBrandView(store: store)
			}
		}
		.animation(.easeInOut(duration: 0.2), value: store.onboardingStep)
	}
}

struct BrandWelcomeView: View {
	@Bindable var store: AppStore

	var body: some View {
		ScrollView {
			VStack(spacing: 24) {
				Image("Robin")
					.resizable()
					.scaledToFit()
					.frame(width: 132, height: 132)
					.padding(.top, 28)

				VStack(spacing: 8) {
					Text(Brand.tagline)
						.font(.title.bold())
						.multilineTextAlignment(.center)
					Text("同一份记忆，在 iPhone 随时输入，在 Mac 理解并完成工作。")
						.font(.subheadline)
						.foregroundStyle(.secondary)
						.multilineTextAlignment(.center)
				}

				VStack(spacing: 12) {
					abilityCard(
						title: "知更输入",
						subtitle: "iPhone / Mac · 语音与拼音共用个人词库"
					)
					abilityCard(
						title: "知更代回",
						subtitle: "Mac 已支持 · iPhone 选中/分享入口上线后可用"
					)
					abilityCard(
						title: "知更执行",
						subtitle: "在线 Mac 或云连接执行 · iPhone 发起与确认"
					)
				}

				ScrollView(.horizontal, showsIndicators: false) {
					HStack(spacing: 8) {
						CapabilityChip(text: "轻声也能听清")
						CapabilityChip(text: "自动去口头词")
						CapabilityChip(text: "根据场景整理")
					}
				}

				Text(Brand.valueLine)
					.font(.footnote.weight(.medium))
					.foregroundStyle(Brand.primaryDark)

				PrimaryButton(title: "先试一句") {
					store.setOnboardingStep(.tryLearn)
				}
				SecondaryButton(title: "稍后设置") {
					store.completeOnboarding()
				}
			}
			.padding(20)
		}
		.background(Color(.systemGroupedBackground))
	}

	private func abilityCard(title: String, subtitle: String) -> some View {
		ZhigengCard {
			Text(title)
				.font(.headline)
			Text(subtitle)
				.font(.subheadline)
				.foregroundStyle(.secondary)
		}
	}
}

struct TryLearnView: View {
	@Bindable var store: AppStore
	@State private var phase: Phase = .idle
	@State private var elapsed = 0
	@State private var timer: Timer?

	private enum Phase {
		case idle, needPermission, listening, processing, done
	}

	private let sampleSpoken = "嗯，帮我跟小杨说一下，就是 ARR 的表我今晚改完，明早发他"
	private let sampleClean = "帮我跟小杨说一下，ARR 的表我今晚改完，明早发给他。"

	var body: some View {
		ScrollView {
			VStack(alignment: .leading, spacing: 20) {
				Text("先试一句")
					.font(.largeTitle.bold())
				Text("点一下开始，再点一下结束。仅在你点麦后录音，原始音频默认不保存。")
					.font(.subheadline)
					.foregroundStyle(.secondary)

				ZhigengCard {
					Text("示例")
						.font(.caption)
						.foregroundStyle(.secondary)
					Text(sampleSpoken)
						.font(.body)
				}

				statusBlock

				Button(action: toggle) {
					Image(systemName: phase == .listening ? "stop.fill" : "mic.fill")
						.font(.title)
						.foregroundStyle(.white)
						.frame(width: 84, height: 84)
						.background(phase == .listening ? Color.orange : Brand.primary)
						.clipShape(Circle())
				}
				.frame(maxWidth: .infinity)
				.accessibilityLabel(phase == .listening ? "结束听写" : "开始听写")

				if phase == .done {
					ZhigengCard {
						Text("整理后")
							.font(.caption)
							.foregroundStyle(.secondary)
						TextEditor(text: $store.tryLearnDraft)
							.frame(minHeight: 100)
						HStack {
							ForEach(["示例：去除口头词", "示例：按消息整理", "示例：专名命中"], id: \.self) { tag in
								CapabilityChip(text: tag)
							}
						}
					}

					if let term = store.pendingLearnTerm {
						ZhigengCard {
							Text("要记住「\(term)」吗？")
								.font(.headline)
							Text("语音和拼音都会优先使用。")
								.font(.subheadline)
								.foregroundStyle(.secondary)
							HStack {
								PrimaryButton(title: "记住") {
									store.confirmPendingLearn()
								}
								SecondaryButton(title: "仅改这次") {
									store.skipPendingLearn()
								}
							}
						}
					}

					PrimaryButton(title: "在其他 App 里使用") {
						store.setOnboardingStep(.keyboardSetup)
					}
					SecondaryButton(title: "再试一次") {
						phase = .idle
						store.tryLearnDraft = ""
						store.pendingLearnTerm = nil
					}
				}
			}
			.padding(20)
		}
		.background(Color(.systemGroupedBackground))
		.onDisappear { timer?.invalidate() }
	}

	@ViewBuilder
	private var statusBlock: some View {
		switch phase {
		case .idle:
			Text("准备好了就点麦克风")
				.foregroundStyle(.secondary)
		case .needPermission:
			VStack(alignment: .leading, spacing: 8) {
				Text("需要麦克风才能试说")
				PrimaryButton(title: "允许麦克风") {
					store.requestMicrophone { granted in
						phase = granted ? .idle : .needPermission
					}
				}
				SecondaryButton(title: "打开知更设置") {
					store.openSystemSettings()
				}
			}
		case .listening:
			Text("正在听 · \(elapsed)s")
				.foregroundStyle(.orange)
		case .processing:
			Text("正在整理…")
				.foregroundStyle(Brand.primary)
		case .done:
			Text("已完成（当前为示例整理，ASR 接通后会变成真实结果）")
				.font(.footnote)
				.foregroundStyle(.secondary)
		}
	}

	private func toggle() {
		switch phase {
		case .idle:
			if !store.microphoneGranted {
				phase = .needPermission
				store.requestMicrophone { granted in
					if granted { startListening() }
				}
				return
			}
			startListening()
		case .listening:
			finishListening()
		default:
			break
		}
	}

	private func startListening() {
		phase = .listening
		elapsed = 0
		timer?.invalidate()
		timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
			Task { @MainActor in elapsed += 1 }
		}
	}

	private func finishListening() {
		timer?.invalidate()
		phase = .processing
		DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
			// ponytail: ASR not wired yet — demo path is labeled as example, not claimed live ASR.
			store.finishTryLearnDemo()
			store.tryLearnDraft = sampleClean
			phase = .done
		}
	}
}

struct KeyboardSetupView: View {
	@Bindable var store: AppStore
	@State private var practiceText = ""
	@State private var pollTask: Task<Void, Never>?
	@FocusState private var practiceFocused: Bool
	@Environment(\.scenePhase) private var scenePhase

	private let settingsPath = "设置 → 通用 → 键盘 → 键盘 → 添加新键盘 → 知更"
	private let fullAccessPath = "设置 → 通用 → 键盘 → 键盘 → 知更 → 允许完全访问"

	var body: some View {
		ScrollView {
			VStack(alignment: .leading, spacing: 20) {
				Text("在其他 App 里使用")
					.font(.largeTitle.bold())
				Text("必须开启「允许完全访问」，主 App 才能收到键盘心跳。未开启时验证区会一直显示尚未检测。")
					.font(.subheadline)
					.foregroundStyle(.secondary)

				ZhigengCard {
					stepRow(1, "添加知更键盘")
					stepRow(2, "打开「允许完全访问」（关键）")
					stepRow(3, "回到这里，点验证框，长按地球键切到知更")
					Text(settingsPath)
						.font(.footnote)
						.foregroundStyle(.secondary)
						.textSelection(.enabled)
					Text(fullAccessPath)
						.font(.footnote)
						.foregroundStyle(.secondary)
						.textSelection(.enabled)
					PrimaryButton(title: "我去设置") {
						store.openSystemSettings()
					}
					SecondaryButton(title: "复制设置路径") {
						UIPasteboard.general.string = "\(settingsPath)\n\(fullAccessPath)"
					}
				}

				ZhigengCard {
					Text("验证区")
						.font(.headline)
					detectionRows
					TextEditor(text: $practiceText)
						.focused($practiceFocused)
						.frame(minHeight: 88)
						.overlay(
							RoundedRectangle(cornerRadius: 12)
								.stroke(Brand.primary.opacity(practiceFocused ? 1 : 0.35), lineWidth: practiceFocused ? 2 : 1)
						)
					Text("点输入框 → 长按地球键选知更。若键盘顶部出现橙色提示，说明还没开完全访问。")
						.font(.caption)
						.foregroundStyle(.secondary)
					SecondaryButton(title: "重新检测") {
						store.reloadSharedState()
					}
				}

				if canContinue {
					PrimaryButton(title: "继续") {
						store.setOnboardingStep(.readyBrand)
					}
				} else {
					SecondaryButton(title: "暂时跳过，稍后再验证") {
						store.setOnboardingStep(.readyBrand)
					}
				}
			}
			.padding(20)
		}
		.background(Color(.systemGroupedBackground))
		.onAppear {
			store.reloadSharedState()
			startPolling()
		}
		.onDisappear {
			pollTask?.cancel()
			pollTask = nil
		}
		.onChange(of: scenePhase) { _, phase in
			if phase == .active {
				store.reloadSharedState()
				startPolling()
			}
		}
	}

	private var canContinue: Bool {
		guard let hb = store.heartbeat else { return false }
		return hb.isFresh && hb.hasFullAccess
	}

	@ViewBuilder
	private var detectionRows: some View {
		if let hb = store.heartbeat {
			LabeledContent("键盘", value: hb.isFresh ? "已检测到知更" : "上次检测较旧，请再切一次")
			LabeledContent(
				"完全访问",
				value: hb.isFresh
					? (hb.hasFullAccess ? "已开启" : "未开启 — 验证写不进主 App")
					: "建议重新验证"
			)
		} else {
			LabeledContent("键盘", value: "尚未检测")
			LabeledContent("完全访问", value: "切到知更并开启完全访问后再检测")
		}
	}

	private func startPolling() {
		pollTask?.cancel()
		pollTask = Task { @MainActor in
			while !Task.isCancelled {
				store.reloadSharedState()
				try? await Task.sleep(nanoseconds: 1_000_000_000)
			}
		}
	}

	private func stepRow(_ n: Int, _ text: String) -> some View {
		HStack(alignment: .top, spacing: 10) {
			Text("\(n)")
				.font(.caption.bold())
				.frame(width: 22, height: 22)
				.background(Brand.primary.opacity(0.15))
				.clipShape(Circle())
			Text(text)
				.font(.subheadline)
		}
	}
}

struct ReadyBrandView: View {
	@Bindable var store: AppStore

	var body: some View {
		VStack(spacing: 24) {
			Spacer()
			Image("Robin")
				.resizable()
				.scaledToFit()
				.frame(width: 120, height: 120)
			Text("你的知更准备好了")
				.font(.title.bold())
			Text("从这次开始，它会越来越懂你的词和表达。")
				.font(.subheadline)
				.foregroundStyle(.secondary)
				.multilineTextAlignment(.center)

			VStack(spacing: 8) {
				if !store.recentLearnedTexts.isEmpty {
					Text("已记住 \(store.recentLearnedTexts.count) 个词")
						.font(.subheadline.weight(.medium))
				}
				if store.heartbeat?.isFresh == true {
					Text("键盘已连接")
						.font(.subheadline.weight(.medium))
				}
			}

			PrimaryButton(title: "开始使用") {
				store.completeOnboarding()
			}
			Spacer()
		}
		.padding(24)
		.background(Color(.systemGroupedBackground))
	}
}
