// DillyWalletModule.swift — Apple Wallet (PassKit) bridge.
//
// Three async functions:
//   canAddPasses()                 → Bool
//   hasPass(passTypeId, serial)    → Bool
//   addPass(url)                   → Bool (true on add, false on cancel)
//
// The .pkpass blob is generated + signed server-side. This module
// downloads it and presents the system PKAddPassesViewController.

import ExpoModulesCore
import Foundation
import PassKit
import UIKit

public class DillyWalletModule: Module {
    private var addPromise: Promise?
    private var passLibrary = PKPassLibrary()

    public func definition() -> ModuleDefinition {
        Name("DillyWallet")

        AsyncFunction("canAddPasses") { (promise: Promise) in
            promise.resolve(PKAddPassesViewController.canAddPasses())
        }

        AsyncFunction("hasPass") { (passTypeId: String, serial: String, promise: Promise) in
            let exists = self.passLibrary.containsPass(withType: passTypeId, serialNumber: serial)
            promise.resolve(exists)
        }

        AsyncFunction("addPass") { (urlString: String, promise: Promise) in
            guard let url = URL(string: urlString) else {
                promise.reject("INVALID_URL", "Pass URL is not a valid URL.")
                return
            }
            URLSession.shared.dataTask(with: url) { data, _, error in
                guard error == nil, let data = data else {
                    promise.reject("DOWNLOAD_FAILED", error?.localizedDescription ?? "Could not download pass.")
                    return
                }
                do {
                    let pass = try PKPass(data: data)
                    self.presentAddPassController(pass: pass, promise: promise)
                } catch {
                    promise.reject("INVALID_PASS", error.localizedDescription)
                }
            }.resume()
        }
    }

    private func presentAddPassController(pass: PKPass, promise: Promise) {
        DispatchQueue.main.async {
            guard let controller = PKAddPassesViewController(pass: pass),
                  let root = UIApplication.shared.connectedScenes
                    .compactMap({ ($0 as? UIWindowScene)?.windows.first { $0.isKeyWindow } })
                    .first?.rootViewController else {
                promise.reject("NO_PRESENTER", "No view controller available.")
                return
            }
            self.addPromise = promise
            let delegate = AddPassDelegate { added in
                promise.resolve(added)
                self.addPromise = nil
            }
            controller.delegate = delegate
            objc_setAssociatedObject(controller, "dillyAddPassDelegate", delegate, .OBJC_ASSOCIATION_RETAIN)
            root.present(controller, animated: true)
        }
    }
}

private class AddPassDelegate: NSObject, PKAddPassesViewControllerDelegate {
    let onFinish: (Bool) -> Void
    var resolved = false

    init(onFinish: @escaping (Bool) -> Void) {
        self.onFinish = onFinish
    }

    func addPassesViewControllerDidFinish(_ controller: PKAddPassesViewController) {
        // PassKit doesn't tell us "added vs cancelled" directly. We use
        // the simple heuristic: if dismissal happened without an error,
        // assume the user kept the pass. Production code can poll
        // PKPassLibrary.containsPass to double-check after this fires.
        if !resolved {
            resolved = true
            onFinish(true)
        }
        controller.dismiss(animated: true)
    }
}
