// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Bernise",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "Bernise", targets: ["Bernise"]),
    ],
    targets: [
        .executableTarget(
            name: "Bernise",
            path: "Sources/Bernise"
        ),
    ]
)
