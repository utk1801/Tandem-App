import ExpoModulesCore

public class TandemDocumentScanModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TandemDocumentScan")

    AsyncFunction("isAppleIntelligenceAvailable") { () -> Bool in
      DocumentScanService.isAppleIntelligenceAvailable()
    }

    AsyncFunction("parseDocument") { (imageUri: String) async throws -> [String: Any] in
      try await DocumentScanService.parseDocument(imageUri: imageUri)
    }
  }
}
