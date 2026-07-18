// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "StreamingASRBenchmark",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "StreamingASRBenchmark", targets: ["StreamingASRBenchmark"])
    ],
    targets: [
        .executableTarget(
            name: "StreamingASRBenchmark",
            path: "Sources/StreamingASRBenchmark",
            exclude: ["Engines/run-current-baseline.mjs"],
            linkerSettings: [
                .linkedFramework("AVFoundation"),
                .linkedFramework("Accelerate"),
                .linkedFramework("Network")
            ]
        )
    ]
)
