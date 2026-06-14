import Foundation
import UIKit
import Vision

#if canImport(FoundationModels)
import FoundationModels

@available(iOS 26.0, *)
@Generable
struct ScannedListItem {
  @Guide(description: "Line item text")
  var text: String
  @Guide(description: "Optional quantity or size, e.g. 2 lbs")
  var qty: String?
}

@available(iOS 26.0, *)
@Generable
struct ScannedListResult {
  @Guide(description: "Short suggested list name")
  var listName: String
  @Guide(description: "One of: todo, grocery, chores")
  var listType: String
  var items: [ScannedListItem]
}
#endif

enum DocumentScanError: LocalizedError {
  case imageLoadFailed
  case emptyOCR

  var errorDescription: String? {
    switch self {
    case .imageLoadFailed: return "Could not load the scanned image."
    case .emptyOCR: return "No text was found in the document."
    }
  }
}

struct ParsedItemPayload: Codable {
  let text: String
  let qty: String?
}

final class DocumentScanService {
  static func isAppleIntelligenceAvailable() -> Bool {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      return SystemLanguageModel.default.isAvailable
    }
    #endif
    return false
  }

  static func parseDocument(imageUri: String) async throws -> [String: Any] {
    let image = try loadImage(from: imageUri)
    let rawText = try await recognizeText(in: image)
    let trimmed = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty {
      throw DocumentScanError.emptyOCR
    }

    #if canImport(FoundationModels)
    if #available(iOS 26.0, *), isAppleIntelligenceAvailable() {
      if let ai = try? await parseWithFoundationModels(rawText: trimmed) {
        return ai
      }
    }
    #endif

    return buildPayload(
      rawText: trimmed,
      listName: nil,
      listType: nil,
      items: parseLinesHeuristic(trimmed),
      usedAI: false
    )
  }

  private static func loadImage(from uri: String) throws -> UIImage {
    var path = uri
    if path.hasPrefix("file://") {
      path = String(path.dropFirst("file://".count))
    }
    if let url = URL(string: uri), url.isFileURL, let img = UIImage(contentsOfFile: url.path) {
      return img
    }
    if let img = UIImage(contentsOfFile: path) {
      return img
    }
    throw DocumentScanError.imageLoadFailed
  }

  private static func recognizeText(in image: UIImage) async throws -> String {
    guard let cgImage = image.cgImage else { throw DocumentScanError.imageLoadFailed }

    return try await withCheckedThrowingContinuation { continuation in
      let request = VNRecognizeTextRequest { request, error in
        if let error = error {
          continuation.resume(throwing: error)
          return
        }
        let observations = request.results as? [VNRecognizedTextObservation] ?? []
        let lines = observations.compactMap { $0.topCandidates(1).first?.string }
        continuation.resume(returning: lines.joined(separator: "\n"))
      }
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true

      let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
      do {
        try handler.perform([request])
      } catch {
        continuation.resume(throwing: error)
      }
    }
  }

  private static func parseLinesHeuristic(_ text: String) -> [[String: Any]] {
    text
      .components(separatedBy: .newlines)
      .map { normalizeLine($0) }
      .filter { !$0.isEmpty && $0.count > 1 }
      .map { line in
        if let (qty, item) = splitQuantity(from: line) {
          return ["text": item, "qty": qty] as [String: Any]
        }
        return ["text": line, "qty": NSNull()] as [String: Any]
      }
  }

  private static func normalizeLine(_ line: String) -> String {
    var s = line.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.hasPrefix("- ") { s = String(s.dropFirst(2)) }
    if s.hasPrefix("• ") { s = String(s.dropFirst(2)) }
    if s.hasPrefix("* ") { s = String(s.dropFirst(2)) }
    if let range = s.range(of: #"^\d+[\.\)]\s+"#, options: .regularExpression) {
      s = String(s[range.upperBound...])
    }
    return s.trimmingCharacters(in: .whitespaces)
  }

  private static func splitQuantity(from line: String) -> (String, String)? {
    let pattern = #"^(\d+\s*(?:x|X|×)?|\d+\s*(?:oz|lb|lbs|g|kg|ml|l|pk|ct|pack|bunch)?)\s+(.+)$"#
    guard let regex = try? NSRegularExpression(pattern: pattern),
          let match = regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)),
          match.numberOfRanges >= 3,
          let qtyRange = Range(match.range(at: 1), in: line),
          let textRange = Range(match.range(at: 2), in: line) else {
      return nil
    }
    let qty = String(line[qtyRange]).trimmingCharacters(in: .whitespaces)
    let text = String(line[textRange]).trimmingCharacters(in: .whitespaces)
    guard !text.isEmpty else { return nil }
    return (qty, text)
  }

  private static func buildPayload(
    rawText: String,
    listName: String?,
    listType: String?,
    items: [[String: Any]],
    usedAI: Bool
  ) -> [String: Any] {
    [
      "rawText": rawText,
      "listName": listName as Any,
      "listType": listType as Any,
      "items": items,
      "usedAI": usedAI,
    ]
  }

  #if canImport(FoundationModels)
  @available(iOS 26.0, *)
  private static func parseWithFoundationModels(rawText: String) async throws -> [String: Any] {
    let model = SystemLanguageModel.default
    guard model.isAvailable else {
      throw DocumentScanError.emptyOCR
    }

    let session = LanguageModelSession(model: model)
    let prompt = """
    Parse this OCR text into a structured list. Return list name, list type (todo, grocery, or chores), and items with optional quantities.
    Ignore headers and OCR noise.

    OCR text:
    \(rawText)
    """

    let response = try await session.respond(to: prompt, generating: ScannedListResult.self)
    let parsed = response.content
    let normalizedType: String
    switch parsed.listType.lowercased() {
    case "grocery", "groceries": normalizedType = "grocery"
    case "chores", "chore", "household": normalizedType = "chores"
    default: normalizedType = "todo"
    }

    let items: [[String: Any]] = parsed.items.compactMap { item in
      let text = normalizeLine(item.text)
      guard !text.isEmpty else { return nil }
      let qty = item.qty?.trimmingCharacters(in: .whitespacesAndNewlines)
      if let q = qty, !q.isEmpty {
        return ["text": text, "qty": q] as [String: Any]
      }
      return ["text": text, "qty": NSNull()] as [String: Any]
    }

    return buildPayload(
      rawText: rawText,
      listName: parsed.listName.trimmingCharacters(in: .whitespacesAndNewlines),
      listType: normalizedType,
      items: items,
      usedAI: true
    )
  }
  #endif
}
