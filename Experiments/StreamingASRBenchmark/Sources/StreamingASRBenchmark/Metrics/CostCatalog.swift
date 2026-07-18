import Foundation

/// Official DashScope China rates (CNY). Keep in sync with Fold `cost-catalog.ts`.
enum CostCatalog {
    struct RouteEstimate: Codable {
        let routeId: String
        let displayName: String
        let audioSeconds: Double
        let inputAudioTokens: Int
        let inputTextTokens: Int
        let outputTextTokens: Int
        let funAsrSeconds: Double
        let companyCostCny: Double
        let costPerMinuteCny: Double
        let meetsDefaultRouteBudget: Bool
    }

    /// Audio → tokens: 25 tokens / second (Aliyun Omni / ASR docs).
    static let audioTokensPerSecond = 25.0

    // qwen3.5-omni-plus: audio input ¥53 / MTok, text output ¥40 / MTok
    static let omniPlusAudioInPerMTok = 53.0
    static let omniPlusTextOutPerMTok = 40.0

    // qwen3.5-omni-flash: audio input ¥18 / MTok, text output ¥13.3 / MTok
    static let omniFlashAudioInPerMTok = 18.0
    static let omniFlashTextOutPerMTok = 13.3

    // fun-asr-realtime ≈ ¥0.00033 / second
    static let funAsrPerSecond = 0.00033

    // qwen-flash text: input ¥0.15 / MTok, output ¥1.5 / MTok (≤128K)
    static let qwenFlashInPerMTok = 0.15
    static let qwenFlashOutPerMTok = 1.5

    /// Default-route budget from the billing plan.
    static let defaultRouteBudgetPerMinuteCny = 0.03

    static func estimateRoutes(
        audioSeconds: Double,
        transcriptChars: Int = 120,
        structurePromptTokens: Int = 280
    ) -> [RouteEstimate] {
        let audioTokens = Int(ceil(audioSeconds * audioTokensPerSecond))
        let outputTokens = max(16, Int(ceil(Double(transcriptChars) * 1.2)))
        let textInForStructure = structurePromptTokens + outputTokens

        let omniPlus = cost(
            routeId: "omni_plus_realtime",
            displayName: "Qwen3.5 Omni Plus Realtime",
            audioSeconds: audioSeconds,
            inputAudioTokens: audioTokens,
            inputTextTokens: 80,
            outputTextTokens: outputTokens,
            funAsrSeconds: 0,
            companyCostCny:
                microsToYuan(audioTokens, omniPlusAudioInPerMTok) +
                microsToYuan(80, 7.0) +
                microsToYuan(outputTokens, omniPlusTextOutPerMTok)
        )

        let omniFlash = cost(
            routeId: "omni_flash_realtime",
            displayName: "Qwen3.5 Omni Flash Realtime",
            audioSeconds: audioSeconds,
            inputAudioTokens: audioTokens,
            inputTextTokens: 80,
            outputTextTokens: outputTokens,
            funAsrSeconds: 0,
            companyCostCny:
                microsToYuan(audioTokens, omniFlashAudioInPerMTok) +
                microsToYuan(80, 2.2) +
                microsToYuan(outputTokens, omniFlashTextOutPerMTok)
        )

        let funAsrPlusFlash = cost(
            routeId: "fun_asr_plus_qwen_flash",
            displayName: "Fun-ASR + Qwen Flash",
            audioSeconds: audioSeconds,
            inputAudioTokens: 0,
            inputTextTokens: textInForStructure,
            outputTextTokens: outputTokens,
            funAsrSeconds: audioSeconds,
            companyCostCny:
                audioSeconds * funAsrPerSecond +
                microsToYuan(textInForStructure, qwenFlashInPerMTok) +
                microsToYuan(outputTokens, qwenFlashOutPerMTok)
        )

        return [omniPlus, omniFlash, funAsrPlusFlash]
    }

    static func writeBaselineMarkdown(to path: String, audioSeconds: Double = 60) throws {
        let routes = estimateRoutes(audioSeconds: audioSeconds)
        let defaultCandidates = routes.filter(\.meetsDefaultRouteBudget)
        let recommended = defaultCandidates.min(by: { $0.costPerMinuteCny < $1.costPerMinuteCny })
            ?? routes.min(by: { $0.costPerMinuteCny < $1.costPerMinuteCny })!

        var md = "# Voice Cost Baseline\n\n"
        md += "Assumes \(Int(audioSeconds))s audio, ~120-character cleaned transcript, China DashScope list prices.\n"
        md += "Audio token rule: \(Int(audioTokensPerSecond)) tokens/second.\n"
        md += "Default-route budget: ≤ ¥\(String(format: "%.2f", defaultRouteBudgetPerMinuteCny))/min.\n\n"
        md += "| Route | Cost / min | Cost / \(Int(audioSeconds))s | Default-route OK |\n"
        md += "| ----- | ---------- | --------------------------- | ---------------- |\n"
        for route in routes {
            md += "| \(route.displayName) | ¥\(fmt(route.costPerMinuteCny)) | ¥\(fmt(route.companyCostCny)) | \(route.meetsDefaultRouteBudget ? "yes" : "no") |\n"
        }
        md += "\n## Recommendation\n\n"
        md += "1. Default structure route: **\(recommended.displayName)** (¥\(fmt(recommended.costPerMinuteCny))/min).\n"
        md += "2. Keep Omni Plus for reply / hard correction only — it exceeds the ¥0.03/min default budget.\n"
        md += "3. At 300 Pro minutes/user/month, Omni Flash ≈ ¥\(fmt(recommended.routeId == "omni_flash_realtime" ? 300 * recommended.costPerMinuteCny : 300 * (routes.first { $0.routeId == "omni_flash_realtime" }?.costPerMinuteCny ?? 0))); Fun-ASR path ≈ ¥\(fmt(300 * (routes.first { $0.routeId == "fun_asr_plus_qwen_flash" }?.costPerMinuteCny ?? 0))).\n"
        md += "4. Never ship unlimited Omni Plus on ¥29.9/mo.\n"

        try FileManager.default.createDirectory(
            atPath: (path as NSString).deletingLastPathComponent,
            withIntermediateDirectories: true
        )
        try md.write(toFile: path, atomically: true, encoding: .utf8)

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let jsonPath = (path as NSString).deletingLastPathComponent + "/cost_baseline.json"
        try encoder.encode(routes).write(to: URL(fileURLWithPath: jsonPath))
    }

    static func assertBaselineInvariants() {
        let routes = estimateRoutes(audioSeconds: 60)
        guard let plus = routes.first(where: { $0.routeId == "omni_plus_realtime" }),
              let flash = routes.first(where: { $0.routeId == "omni_flash_realtime" }),
              let fun = routes.first(where: { $0.routeId == "fun_asr_plus_qwen_flash" })
        else {
            fatalError("cost baseline routes missing")
        }
        precondition(!plus.meetsDefaultRouteBudget, "Omni Plus must exceed default-route budget")
        precondition(flash.meetsDefaultRouteBudget, "Omni Flash must fit default-route budget")
        precondition(fun.meetsDefaultRouteBudget, "Fun-ASR+Flash must fit default-route budget")
        precondition(flash.costPerMinuteCny < plus.costPerMinuteCny)
        precondition(fun.costPerMinuteCny < plus.costPerMinuteCny)
    }

    private static func cost(
        routeId: String,
        displayName: String,
        audioSeconds: Double,
        inputAudioTokens: Int,
        inputTextTokens: Int,
        outputTextTokens: Int,
        funAsrSeconds: Double,
        companyCostCny: Double
    ) -> RouteEstimate {
        let minutes = max(audioSeconds, 1) / 60.0
        let perMinute = companyCostCny / minutes
        return RouteEstimate(
            routeId: routeId,
            displayName: displayName,
            audioSeconds: audioSeconds,
            inputAudioTokens: inputAudioTokens,
            inputTextTokens: inputTextTokens,
            outputTextTokens: outputTextTokens,
            funAsrSeconds: funAsrSeconds,
            companyCostCny: companyCostCny,
            costPerMinuteCny: perMinute,
            meetsDefaultRouteBudget: perMinute <= defaultRouteBudgetPerMinuteCny + 1e-9
        )
    }

    private static func microsToYuan(_ tokens: Int, _ yuanPerMillion: Double) -> Double {
        Double(tokens) * yuanPerMillion / 1_000_000.0
    }

    private static func fmt(_ value: Double) -> String {
        String(format: "%.4f", value)
    }
}
