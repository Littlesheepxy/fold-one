import Foundation

let arguments = Array(CommandLine.arguments.dropFirst())

if arguments.contains("--cost-baseline") {
    let reportsDir = argumentValue("--reports-dir", in: arguments) ?? "Reports"
    do {
        CostCatalog.assertBaselineInvariants()
        try CostCatalog.writeBaselineMarkdown(to: "\(reportsDir)/COST_BASELINE.md")
        print("Cost baseline written to \(reportsDir)/COST_BASELINE.md")
        exit(0)
    } catch {
        fputs("Cost baseline failed: \(error)\n", stderr)
        exit(1)
    }
}

if arguments.contains("--live-ui") {
    let port = UInt16(argumentValue("--port", in: arguments).flatMap(Int.init) ?? 8787)
    do {
        let server = try LiveUIServer(port: port)
        try server.start()
        print("Live ASR UI: http://127.0.0.1:\(port)")
        print("Press Ctrl-C to stop.")
        dispatchMain()
    } catch {
        fputs("Live UI failed: \(error)\n", stderr)
        exit(1)
    }
}

let options = BenchmarkOptions.parse(arguments: arguments)
let runner = BenchmarkRunner(options: options)

do {
    try await runner.run()
    try CostCatalog.writeBaselineMarkdown(to: "\(options.reportsDirectory)/COST_BASELINE.md")
    print("Reports written to \(options.reportsDirectory)")
} catch {
    fputs("StreamingASRBenchmark failed: \(error)\n", stderr)
    exit(1)
}

private func argumentValue(_ flag: String, in arguments: [String]) -> String? {
    guard let index = arguments.firstIndex(of: flag), index + 1 < arguments.count else {
        return nil
    }
    return arguments[index + 1]
}
