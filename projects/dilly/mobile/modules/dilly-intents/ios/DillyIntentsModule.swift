// DillyIntentsModule.swift — App Intents + Siri shortcut bridge.
//
// Five intents are defined here:
//   LogWinIntent          — "Hey Siri, log a Dilly win"
//   OpenTodayIntent       — "Hey Siri, what's my Dilly mission today"
//   StartChapterIntent    — "Hey Siri, start a Dilly chapter"
//   OpenVoiceIntent       — "Hey Siri, open Dilly voice"
//   MarkHabitDoneIntent   — fired by the small-widget Button (iOS 17+)
//
// Each intent writes a small payload to the App Group UserDefaults
// (group.com.dilly.app) under the key 'dilly:pending_intent'. The JS
// side polls this on AppState change → 'active' and clears it.
//
// AppShortcutsProvider exposes them as App Shortcuts so they appear
// in Spotlight + Shortcuts app without user setup.
//
// All intent types are gated to iOS 16.0+; widget-button intents to 17+.

import ExpoModulesCore
import Foundation
import AppIntents

private let APP_GROUP = "group.com.dilly.app"
private let PENDING_KEY = "dilly:pending_intent"

private func writePending(_ name: String, payload: [String: Any] = [:]) {
    guard let defaults = UserDefaults(suiteName: APP_GROUP) else { return }
    let entry: [String: Any] = [
        "name": name,
        "payload": payload,
        "firedAt": Int(Date().timeIntervalSince1970 * 1000),
    ]
    defaults.set(entry, forKey: PENDING_KEY)
}

// ─── Module ──────────────────────────────────────────────────────────

public class DillyIntentsModule: Module {
    public func definition() -> ModuleDefinition {
        Name("DillyIntents")

        AsyncFunction("consumePendingIntent") { (promise: Promise) in
            guard let defaults = UserDefaults(suiteName: APP_GROUP),
                  let entry = defaults.dictionary(forKey: PENDING_KEY) else {
                promise.resolve(nil)
                return
            }
            defaults.removeObject(forKey: PENDING_KEY)
            promise.resolve(entry)
        }

        AsyncFunction("donateIntents") { (promise: Promise) in
            if #available(iOS 16.0, *) {
                Task {
                    // Donations help Siri rank these intents; also
                    // makes them appear in Spotlight + Suggestions.
                    let donations: [any AppIntent] = [
                        LogWinIntent(),
                        OpenTodayIntent(),
                        StartChapterIntent(),
                        OpenVoiceIntent(),
                    ]
                    for intent in donations {
                        try? await intent.donate()
                    }
                    promise.resolve(nil)
                }
            } else {
                promise.resolve(nil)
            }
        }

        AsyncFunction("refreshAppShortcuts") { (promise: Promise) in
            if #available(iOS 16.4, *) {
                DillyAppShortcuts.updateAppShortcutParameters()
            }
            promise.resolve(nil)
        }
    }
}

// ─── Intents ─────────────────────────────────────────────────────────

@available(iOS 16.0, *)
struct LogWinIntent: AppIntent {
    static var title: LocalizedStringResource = "Log a Dilly win"
    static var description = IntentDescription("Quickly capture a small win in Dilly.")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "What did you do?", requestValueDialog: "What did you ship?")
    var winText: String?

    func perform() async throws -> some IntentResult {
        writePending("log-win", payload: ["text": winText ?? ""])
        return .result()
    }
}

@available(iOS 16.0, *)
struct OpenTodayIntent: AppIntent {
    static var title: LocalizedStringResource = "Open today in Dilly"
    static var description = IntentDescription("Jump straight to today's Dilly mission and read.")
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        writePending("open-today")
        return .result()
    }
}

@available(iOS 16.0, *)
struct StartChapterIntent: AppIntent {
    static var title: LocalizedStringResource = "Start a Dilly chapter"
    static var description = IntentDescription("Begin a new chapter in Dilly.")
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        writePending("new-chapter")
        return .result()
    }
}

@available(iOS 16.0, *)
struct OpenVoiceIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Dilly voice"
    static var description = IntentDescription("Open voice mode to think out loud with Dilly.")
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        writePending("open-voice")
        return .result()
    }
}

// Widget button intent — fires WITHOUT opening the app. iOS 17+.
@available(iOS 17.0, *)
struct MarkHabitDoneIntent: AppIntent {
    static var title: LocalizedStringResource = "Mark today's habit done"
    static var description = IntentDescription("Tick today's Moment of Truth from the widget.")
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult {
        // Persist a flag the app reads on next foreground.
        writePending("mark-habit-done")
        // Also mirror to a streak counter the small widget reads.
        if let defaults = UserDefaults(suiteName: APP_GROUP) {
            let key = "dilly:habit_ticked_today"
            let today = ISO8601DateFormatter().string(from: Date()).prefix(10)
            defaults.set(String(today), forKey: key)
        }
        return .result()
    }
}

// ─── App Shortcuts (Siri / Spotlight visibility) ─────────────────────

@available(iOS 16.4, *)
struct DillyAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: LogWinIntent(),
            phrases: [
                "Log a win in \(.applicationName)",
                "Add a win in \(.applicationName)",
                "I shipped something in \(.applicationName)",
            ],
            shortTitle: "Log a win",
            systemImageName: "trophy.fill"
        )
        AppShortcut(
            intent: OpenTodayIntent(),
            phrases: [
                "What's my mission in \(.applicationName)",
                "Open today in \(.applicationName)",
                "Show my today in \(.applicationName)",
            ],
            shortTitle: "Today",
            systemImageName: "sun.max.fill"
        )
        AppShortcut(
            intent: StartChapterIntent(),
            phrases: [
                "Start a chapter in \(.applicationName)",
                "New chapter in \(.applicationName)",
            ],
            shortTitle: "New chapter",
            systemImageName: "book.fill"
        )
        AppShortcut(
            intent: OpenVoiceIntent(),
            phrases: [
                "Open voice in \(.applicationName)",
                "Talk to \(.applicationName)",
            ],
            shortTitle: "Voice",
            systemImageName: "waveform"
        )
    }
}
