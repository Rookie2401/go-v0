import Capacitor
import CryptoKit
import Foundation
import Security
import UIKit

@objc(GoReviewNativePlugin)
public final class GoReviewNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GoReviewNativePlugin"
    public let jsName = "GoReviewNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "storageGet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "storageSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "storageRemove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "storageList", returnType: CAPPluginReturnPromise),
    ]

    private let storeQueue = DispatchQueue(label: "org.gopractice.goreview.storage")
    private var lifecycleObservers: [NSObjectProtocol] = []

    private var storageFile: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("GoReview/key-value.json", isDirectory: false)
    }

    override public func load() {
        lifecycleObservers.append(NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in self?.notifyListeners("appStateChange", data: ["isActive": true]) })
        lifecycleObservers.append(NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in self?.notifyListeners("appStateChange", data: ["isActive": false]) })
    }

    deinit { lifecycleObservers.forEach { NotificationCenter.default.removeObserver($0) } }

    @objc func getSession(_ call: CAPPluginCall) {
        guard let serviceUrl = call.getString("serviceUrl"), let account = accountName(for: serviceUrl) else {
            call.reject("A valid serviceUrl is required.")
            return
        }
        guard let data = keychainData(account: account) else { call.resolve([:]); return }
        guard let session = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            call.reject("The saved session could not be read securely.")
            return
        }
        call.resolve(["session": session])
    }

    @objc func setSession(_ call: CAPPluginCall) {
        guard let session = call.getObject("session"),
              let serviceUrl = session["serviceUrl"] as? String,
              let account = accountName(for: serviceUrl),
              session["token"] is String, session["learnerId"] is String,
              session["email"] is String, session["expiresAt"] is String,
              let data = try? JSONSerialization.data(withJSONObject: session) else {
            call.reject("A complete session with a valid serviceUrl is required.")
            return
        }
        var query = keychainQuery(account: account)
        let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            query[kSecValueData as String] = data
            query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else { call.reject("Could not store the session securely."); return }
        } else if status != errSecSuccess {
            call.reject("Could not update the secure session.")
            return
        }
        call.resolve()
    }

    @objc func clearSession(_ call: CAPPluginCall) {
        guard let serviceUrl = call.getString("serviceUrl"), let account = accountName(for: serviceUrl) else {
            call.reject("A valid serviceUrl is required.")
            return
        }
        let status = SecItemDelete(keychainQuery(account: account) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { call.reject("Could not clear the secure session."); return }
        call.resolve()
    }

    @objc func storageGet(_ call: CAPPluginCall) {
        storeQueue.async {
            do {
                let store = try self.readStore()
                let requested = call.getArray("keys", String.self) ?? Array(store.keys)
                var values: [String: Any] = [:]
                for key in requested { if let value = store[key] { values[key] = value } }
                call.resolve(["values": values])
            } catch { call.reject("Could not read durable app storage.", "STORAGE_READ", error) }
        }
    }

    @objc func storageSet(_ call: CAPPluginCall) {
        guard let values = call.getObject("values") else { call.reject("values must be an object."); return }
        storeQueue.async {
            do {
                var store = try self.readStore()
                for (key, value) in values { store[key] = value }
                try self.writeStore(store)
                call.resolve()
            } catch { call.reject("Could not persist app storage.", "STORAGE_WRITE", error) }
        }
    }

    @objc func storageRemove(_ call: CAPPluginCall) {
        guard let keys = call.getArray("keys", String.self) else { call.reject("keys must be an array."); return }
        storeQueue.async {
            do {
                var store = try self.readStore()
                keys.forEach { store.removeValue(forKey: $0) }
                try self.writeStore(store)
                call.resolve()
            } catch { call.reject("Could not update app storage.", "STORAGE_WRITE", error) }
        }
    }

    @objc func storageList(_ call: CAPPluginCall) {
        let prefix = call.getString("prefix") ?? ""
        storeQueue.async {
            do {
                let keys = try self.readStore().keys.filter { $0.hasPrefix(prefix) }.sorted()
                call.resolve(["keys": keys])
            } catch { call.reject("Could not list durable app storage.", "STORAGE_READ", error) }
        }
    }

    private func readStore() throws -> [String: Any] {
        guard FileManager.default.fileExists(atPath: storageFile.path) else { return [:] }
        let data = try Data(contentsOf: storageFile)
        guard let store = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw NSError(domain: "GoReviewStorage", code: 1, userInfo: [NSLocalizedDescriptionKey: "Stored key/value data is not a JSON object."])
        }
        return store
    }

    private func writeStore(_ store: [String: Any]) throws {
        try FileManager.default.createDirectory(at: storageFile.deletingLastPathComponent(), withIntermediateDirectories: true)
        let data = try JSONSerialization.data(withJSONObject: store, options: [.sortedKeys])
        try data.write(to: storageFile, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    private func accountName(for raw: String) -> String? {
        guard let url = URL(string: raw), url.scheme?.lowercased() == "https", let host = url.host, !host.isEmpty,
              url.user == nil, url.password == nil, url.query == nil, url.fragment == nil else { return nil }
        let normalized = url.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let digest = SHA256.hash(data: Data(normalized.utf8)).map { String(format: "%02x", $0) }.joined()
        return "repository-\(digest)"
    }

    private func keychainQuery(account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "org.gopractice.goreview.session.v1",
         kSecAttrAccount as String: account]
    }

    private func keychainData(account: String) -> Data? {
        var query = keychainQuery(account: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }
}
