import SwiftUI

enum Brand {
	static let name = "知更"
	static let tagline = "知你所言，更懂你意。"
	static let taglineFoot = "知更，越用越懂你。"
	static let valueLine = "说得更自然 → 写得更清楚 → 越用越像你"
	static let primary = Color(red: 0.404, green: 0.361, blue: 0.945)
	static let primaryDark = Color(red: 0.337, green: 0.294, blue: 0.839)
}

struct ZhigengCard<Content: View>: View {
	@ViewBuilder var content: () -> Content

	var body: some View {
		VStack(alignment: .leading, spacing: 12) {
			content()
		}
		.padding(16)
		.frame(maxWidth: .infinity, alignment: .leading)
		.background(Color(.secondarySystemGroupedBackground))
		.clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
	}
}

struct PrimaryButton: View {
	var title: String
	var enabled: Bool = true
	var action: () -> Void

	var body: some View {
		Button(action: action) {
			Text(title)
				.font(.body.weight(.semibold))
				.frame(maxWidth: .infinity, minHeight: 50)
		}
		.buttonStyle(.borderedProminent)
		.tint(Brand.primary)
		.disabled(!enabled)
	}
}

struct SecondaryButton: View {
	var title: String
	var action: () -> Void

	var body: some View {
		Button(action: action) {
			Text(title)
				.font(.body.weight(.medium))
				.frame(maxWidth: .infinity, minHeight: 44)
		}
		.buttonStyle(.bordered)
	}
}

struct CapabilityChip: View {
	var text: String

	var body: some View {
		Text(text)
			.font(.caption.weight(.medium))
			.padding(.horizontal, 10)
			.padding(.vertical, 6)
			.background(Brand.primary.opacity(0.12))
			.foregroundStyle(Brand.primaryDark)
			.clipShape(Capsule())
	}
}
