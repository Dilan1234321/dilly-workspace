// DillyScannerModule.swift — Expo native module wrapping VisionKit's
// document camera + Vision text recognition.
//
// Exposes 3 functions to React Native:
//   scanDocument()           → opens the system document camera, returns
//                              file URLs of the scanned images (PNG)
//   scanAndExtractText()     → same scan flow + runs Vision text
//                              recognition on each page, returns the
//                              concatenated text + the file URLs
//   extractTextFromImage(uri) → runs Vision text recognition on an
//                              existing image (e.g., from photo library
//                              picker). Implements "Photos OCR."
//
// All functions reject (with a clear error string) on iOS < 13 or
// when the user cancels.

import ExpoModulesCore
import VisionKit
import Vision
import UIKit
import Foundation

public class DillyScannerModule: Module {
    private var scanResolver: ((Result<[String: Any], Error>) -> Void)?

    public func definition() -> ModuleDefinition {
        Name("DillyScanner")

        AsyncFunction("scanDocument") { (promise: Promise) in
            self.presentScanner(extractText: false, promise: promise)
        }

        AsyncFunction("scanAndExtractText") { (promise: Promise) in
            self.presentScanner(extractText: true, promise: promise)
        }

        AsyncFunction("extractTextFromImage") { (uri: String, promise: Promise) in
            // Strip file:// prefix if present
            var path = uri
            if path.hasPrefix("file://") { path = String(path.dropFirst(7)) }
            guard let image = UIImage(contentsOfFile: path),
                  let cg = image.cgImage else {
                promise.reject("INVALID_IMAGE", "Could not read image at \(uri).")
                return
            }
            self.recognizeText(in: cg) { text in
                promise.resolve(["text": text])
            }
        }
    }

    private func presentScanner(extractText: Bool, promise: Promise) {
        guard VNDocumentCameraViewController.isSupported else {
            promise.reject("NOT_SUPPORTED", "Document scanner is not supported on this device.")
            return
        }
        DispatchQueue.main.async {
            guard let root = UIApplication.shared.connectedScenes
                .compactMap({ ($0 as? UIWindowScene)?.windows.first { $0.isKeyWindow } })
                .first?.rootViewController else {
                promise.reject("NO_PRESENTER", "No view controller available to present scanner.")
                return
            }
            let scanner = VNDocumentCameraViewController()
            let delegate = ScannerDelegate(extractText: extractText, promise: promise) { vc in
                vc.dismiss(animated: true)
            }
            scanner.delegate = delegate
            // Retain delegate by attaching it to the controller
            objc_setAssociatedObject(scanner, "dillyScannerDelegate", delegate, .OBJC_ASSOCIATION_RETAIN)
            root.present(scanner, animated: true)
        }
    }

    fileprivate func recognizeText(in cgImage: CGImage, completion: @escaping (String) -> Void) {
        DillyScannerOCR.recognizeText(in: cgImage, completion: completion)
    }
}

/// Free-function OCR helper. Pulled out of the Module class so the
/// VNDocumentCameraViewControllerDelegate can call it without needing
/// to construct a Module (which requires an appContext).
private enum DillyScannerOCR {
    static func recognizeText(in cgImage: CGImage, completion: @escaping (String) -> Void) {
        let request = VNRecognizeTextRequest { req, _ in
            let observations = (req.results as? [VNRecognizedTextObservation]) ?? []
            let text = observations
                .compactMap { $0.topCandidates(1).first?.string }
                .joined(separator: "\n")
            completion(text)
        }
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try handler.perform([request])
            } catch {
                completion("")
            }
        }
    }
}

private class ScannerDelegate: NSObject, VNDocumentCameraViewControllerDelegate {
    let extractText: Bool
    let promise: Promise
    let dismiss: (UIViewController) -> Void
    weak var module: DillyScannerModule?

    init(extractText: Bool, promise: Promise, dismiss: @escaping (UIViewController) -> Void) {
        self.extractText = extractText
        self.promise = promise
        self.dismiss = dismiss
    }

    func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
        var fileUris: [String] = []
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("dilly-scans", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

        for i in 0..<scan.pageCount {
            let img = scan.imageOfPage(at: i)
            if let png = img.pngData() {
                let fileUrl = dir.appendingPathComponent("scan-\(Int(Date().timeIntervalSince1970))-\(i).png")
                try? png.write(to: fileUrl)
                fileUris.append(fileUrl.absoluteString)
            }
        }

        if extractText {
            // Run OCR on each page, then concatenate. Uses the free
            // DillyScannerOCR helper since constructing a Module
            // here would need an appContext we don't have.
            var combined = ""
            let group = DispatchGroup()
            for i in 0..<scan.pageCount {
                let img = scan.imageOfPage(at: i)
                guard let cg = img.cgImage else { continue }
                group.enter()
                DillyScannerOCR.recognizeText(in: cg) { text in
                    combined += (combined.isEmpty ? "" : "\n\n") + text
                    group.leave()
                }
            }
            group.notify(queue: .main) {
                self.dismiss(controller)
                self.promise.resolve([
                    "fileUris": fileUris,
                    "text": combined,
                    "pageCount": scan.pageCount,
                ])
            }
        } else {
            dismiss(controller)
            promise.resolve([
                "fileUris": fileUris,
                "pageCount": scan.pageCount,
            ])
        }
    }

    func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        dismiss(controller)
        promise.reject("USER_CANCELLED", "Scan cancelled.")
    }

    func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
        dismiss(controller)
        promise.reject("SCAN_FAILED", error.localizedDescription)
    }
}
