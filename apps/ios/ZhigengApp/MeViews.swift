import SwiftUI
import UIKit
import ZhigengCore

struct MeView: View {
	@Bindable var store: AppStore

	var body: some View {
		NavigationStack {
			List {
				Section {
					VStack(alignment: .leading, spacing: 6) {
						Text("本地用户")
							.font(.headline)
						Text("登录后同步权益与个人词")
							.font(.subheadline)
							.foregroundStyle(.secondary)
					}
					.padding(.vertical, 4)
				}

				Section {
					LabeledContent("方案", value: "免费版")
					LabeledContent("云端语音", value: "体验额度")
				} header: {
					Text("权益")
				}

				Section("键盘与语音") {
					NavigationLink("键盘设置指南") {
						KeyboardSetupView(store: store)
					}
					LabeledContent("默认会话", value: store.sessionDuration.label)
					LabeledContent("免切换模式", value: store.sessionMode.rawValue)
				}

				Section("个人词与同步") {
					Toggle("同步个人词到云端", isOn: .constant(false))
						.disabled(true)
					Text("登录后可开启。关闭不影响本地拼音与词库。")
						.font(.caption)
						.foregroundStyle(.secondary)
				}

				Section("连接与设备") {
					LabeledContent("本机", value: "iPhone")
					LabeledContent("Mac", value: "未连接")
					Text("需要 Mac 本地能力的项会标注「在 Mac 上配置」。")
						.font(.caption)
						.foregroundStyle(.secondary)
				}

				Section("隐私") {
					NavigationLink("完全访问说明") {
						PrivacyFullAccessView()
					}
					LabeledContent("原始音频", value: "默认不保存")
				}

				Section("帮助") {
					Button("重新运行引导") {
						store.reopenOnboarding(at: .brandWelcome)
					}
					NavigationLink("诊断") {
						DiagnosticsView(store: store)
					}
					LabeledContent("版本", value: "0.1.0")
				}
			}
			.navigationTitle("我的")
		}
	}
}

struct PrivacyFullAccessView: View {
	var body: some View {
		List {
			Section {
				Text("完全访问用于主 App 与键盘通过 App Group 交换听写结果和个人词库。")
				Text("不会上传你键入的所有内容。密码框不会使用知更键盘。")
			}
			Section {
				Text("路径：设置 → 通用 → 键盘 → 键盘 → 知更 → 允许完全访问")
					.textSelection(.enabled)
			}
		}
		.navigationTitle("完全访问")
	}
}

struct DiagnosticsView: View {
	@Bindable var store: AppStore

	var body: some View {
		List {
			LabeledContent("麦克风", value: store.microphoneGranted ? "已授权" : "未授权")
			LabeledContent("键盘心跳", value: heartbeatLabel)
			LabeledContent("完全访问(扩展)", value: fullAccessLabel)
			LabeledContent("词条数", value: "\(store.lexicon.allTerms.count)")
			LabeledContent("历史条数", value: "\(store.history.count)")
			Button("复制诊断信息") {
				UIPasteboard.general.string = diagnosticText
			}
		}
		.navigationTitle("诊断")
		.onAppear { store.reloadSharedState() }
	}

	private var heartbeatLabel: String {
		guard let hb = store.heartbeat else { return "无" }
		let ago = Int(Date().timeIntervalSince1970 - hb.lastSeenAt)
		return hb.isFresh ? "\(ago)s 前" : "过期 · \(ago)s 前"
	}

	private var fullAccessLabel: String {
		guard let hb = store.heartbeat else { return "尚未检测" }
		if !hb.isFresh { return "结果过期，请重新验证" }
		return hb.hasFullAccess ? "开启" : "关闭"
	}

	private var diagnosticText: String {
		"""
		version=0.1.0
		mic=\(store.microphoneGranted)
		heartbeat=\(heartbeatLabel)
		fullAccess=\(fullAccessLabel)
		terms=\(store.lexicon.allTerms.count)
		history=\(store.history.count)
		"""
	}
}
