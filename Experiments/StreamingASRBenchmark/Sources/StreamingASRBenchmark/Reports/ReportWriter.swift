import Foundation

enum ReportWriter {
    static func write(records: [ASRRunRecord], reportsDirectory: String) throws {
        try FileManager.default.createDirectory(atPath: reportsDirectory, withIntermediateDirectories: true)
        let summary = ASRMetricsSummary.summarize(records)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let json = try encoder.encode(BenchmarkReportPayload(runs: records, summary: summary))
        try json.write(to: URL(fileURLWithPath: "\(reportsDirectory)/asr_benchmark_results.json"))
        try csv(records: records, summary: summary).write(toFile: "\(reportsDirectory)/asr_benchmark_results.csv", atomically: true, encoding: .utf8)
        try markdown(summary: summary, records: records).write(toFile: "\(reportsDirectory)/ASR_BENCHMARK.md", atomically: true, encoding: .utf8)
    }

    private static func csv(records: [ASRRunRecord], summary: [ASRSummaryRecord]) -> String {
        var lines = [
            "type,model,fixture_id,first_char_ms,first_audio_ms,update_interval_ms,revision_rate,rtf,cpu_avg,cpu_peak,ram_mb,warmup_ms,recognized_text"
        ]
        for record in records {
            lines.append([
                "run",
                record.model,
                record.fixtureId,
                fmt(record.firstCharacterLatencyMs),
                fmt(record.firstAudioLatencyMs),
                fmt(record.partialUpdateIntervalMs),
                fmt(record.revisionRate),
                fmt(record.realTimeFactor),
                fmt(record.cpuAveragePercent),
                fmt(record.cpuPeakPercent),
                fmt(record.residentMemoryMB),
                fmt(record.modelWarmupMs),
                escape(record.recognizedText)
            ].joined(separator: ","))
        }
        for row in summary {
            lines.append([
                "summary",
                row.model,
                "",
                fmt(row.firstCharP50Ms),
                "",
                fmt(row.updateIntervalMs),
                fmt(row.revisionRate),
                fmt(row.realTimeFactor),
                fmt(row.cpuAveragePercent),
                fmt(row.cpuPeakPercent),
                fmt(row.residentMemoryMB),
                fmt(row.modelWarmupMs),
                ""
            ].joined(separator: ","))
        }
        return lines.joined(separator: "\n") + "\n"
    }

    private static func markdown(summary: [ASRSummaryRecord], records: [ASRRunRecord]) -> String {
        let fastest = summary.min { ($0.firstCharP50Ms ?? .greatestFiniteMagnitude) < ($1.firstCharP50Ms ?? .greatestFiniteMagnitude) }?.model ?? "TBD"
        let finalPath = summary.min { ($0.revisionRate, $0.realTimeFactor) < ($1.revisionRate, $1.realTimeFactor) }?.model ?? "TBD"
        var text = "# ASR Benchmark\n\n"
        text += "Generated from Apple Silicon local fixture runs. Conclusions should be updated only after all required WAV fixtures have been recorded and all engines complete successfully.\n\n"
        text += "| Model | First Char P50 | First Char P95 | Update Interval | Revision Rate | RTF | CPU | RAM |\n"
        text += "| ----- | -------------- | -------------- | --------------- | ------------- | --- | --- | --- |\n"
        for row in summary {
            text += "| \(row.model) | \(fmtMs(row.firstCharP50Ms)) | \(fmtMs(row.firstCharP95Ms)) | \(fmtMs(row.updateIntervalMs)) | \(fmtPercent(row.revisionRate)) | \(fmt(row.realTimeFactor)) | \(fmtPercent(row.cpuAveragePercent)) | \(fmtMB(row.residentMemoryMB)) |\n"
        }
        text += "\n## Recommendation\n\n"
        text += "1. Fast Path candidate: \(fastest), based on measured first-character latency and update cadence.\n"
        text += "2. Final Path candidate: \(finalPath), based on lower revision rate and acceptable RTF.\n"
        text += "3. Not recommended: any engine with missing partials, high first-character P95, or RTF above 1.0 on the same fixtures.\n"
        text += "4. Current bottleneck: inspect `firstAudioLatencyMs`, `realTimeFactor`, resolver revision counts, and UI patch timings. This report records audio, ASR, and resolver-facing data; production UI timing is intentionally outside this experiment module.\n\n"
        text += "## Cloud Cost Routes\n\n"
        text += "See `COST_BASELINE.md` for DashScope cloud route ¥/min estimates. Local engines are treated as ¥0 company COGS.\n\n"
        text += "## Coverage\n\n"
        text += "- Runs: \(records.count)\n"
        text += "- Fixtures: \(Set(records.map(\.fixtureId)).count)\n"
        return text
    }

    private static func fmt(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "" }
        return String(format: "%.3f", value)
    }

    private static func fmtMs(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "n/a" }
        return String(format: "%.0f ms", value)
    }

    private static func fmtMB(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "n/a" }
        return String(format: "%.0f MB", value)
    }

    private static func fmtPercent(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "n/a" }
        return String(format: "%.1f%%", value)
    }

    private static func escape(_ value: String) -> String {
        "\"\(value.replacingOccurrences(of: "\"", with: "\"\""))\""
    }
}

private struct BenchmarkReportPayload: Encodable {
    let runs: [ASRRunRecord]
    let summary: [ASRSummaryRecord]
}
