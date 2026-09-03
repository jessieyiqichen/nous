// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "NousHelper",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "NousHelper",
            path: "Sources/NousHelper",
            swiftSettings: [.swiftLanguageMode(.v5)]
        )
    ]
)
