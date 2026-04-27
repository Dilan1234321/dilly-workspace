// DillyActivityModule.swift — Expo native module wrapping ActivityKit
// for the Chapter Live Activity. Exposes start/update/end functions
// to React Native.
//
// The Live Activity Widget itself lives in the widget extension target
// (DillyWidget.swift). This module is in the MAIN APP target — it's
// what calls Activity.request() to spawn an activity that the widget
// extension then renders.
//
// All three functions are no-ops on iOS < 16.2 (early return).

import ExpoModulesCore
import ActivityKit
import Foundation

// Mirrors ChapterActivityAttributes in DillyWidget.swift. The two
// targets share the same struct definitions via this file in the app
// target + the matching one in the widget extension target. If you
// rename a field, update both.
struct ChapterActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var currentScreen: Int
        var totalScreens: Int
        var screenLabel: String
        var startedAt: Date
    }

    var chapterId: String
    var chapterTitle: String
}

public class DillyActivityModule: Module {
    // Track active activities by chapter id so we can update / end them.
    private var activities: [String: Any] = [:]

    public func definition() -> ModuleDefinition {
        Name("DillyActivity")

        AsyncFunction("startChapter") { (chapterId: String, chapterTitle: String, totalScreens: Int) -> String? in
            guard #available(iOS 16.2, *) else { return nil }
            // Check Live Activities are allowed (user can disable in
            // Settings; we silently no-op when off).
            guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }

            let attrs = ChapterActivityAttributes(
                chapterId: chapterId,
                chapterTitle: chapterTitle
            )
            let initial = ChapterActivityAttributes.ContentState(
                currentScreen: 1,
                totalScreens: totalScreens,
                screenLabel: "Welcome",
                startedAt: Date()
            )
            do {
                let activity = try Activity<ChapterActivityAttributes>.request(
                    attributes: attrs,
                    contentState: initial,
                    pushType: nil
                )
                self.activities[chapterId] = activity
                return activity.id
            } catch {
                return nil
            }
        }

        AsyncFunction("updateChapter") { (chapterId: String, currentScreen: Int, screenLabel: String) -> Bool in
            guard #available(iOS 16.2, *) else { return false }
            guard let activity = self.activities[chapterId] as? Activity<ChapterActivityAttributes> else {
                return false
            }
            let next = ChapterActivityAttributes.ContentState(
                currentScreen: currentScreen,
                totalScreens: activity.contentState.totalScreens,
                screenLabel: screenLabel,
                startedAt: activity.contentState.startedAt
            )
            Task {
                await activity.update(using: next)
            }
            return true
        }

        AsyncFunction("endChapter") { (chapterId: String) -> Bool in
            guard #available(iOS 16.2, *) else { return false }
            guard let activity = self.activities[chapterId] as? Activity<ChapterActivityAttributes> else {
                return false
            }
            Task {
                // Dismiss with a short trailing animation; users see
                // the activity slide away gracefully.
                await activity.end(dismissalPolicy: .after(.now + 6))
            }
            self.activities.removeValue(forKey: chapterId)
            return true
        }

        // Diagnostic — useful when debugging "why isn't my live
        // activity showing up?" issues. Returns auth state + count of
        // currently-active Dilly activities.
        Function("areLiveActivitiesEnabled") { () -> Bool in
            guard #available(iOS 16.2, *) else { return false }
            return ActivityAuthorizationInfo().areActivitiesEnabled
        }
    }
}
