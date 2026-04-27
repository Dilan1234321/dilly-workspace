// DillyWidget.swift - Dilly's home-screen widgets.
//
// Five widgets, each earning real estate by doing one specific thing:
//
//   1. DillyQuestionWidget    - today's question to sit with (sm + md)
//   2. OneMoveWidget          - the single most important career move (sm + md + lg)
//   3. TonightWidget          - what to spend 15 min on tonight (sm + md, interactive)
//   4. HonestMirrorWidget     - one sentence about who you are (sm + md)
//   5. MomentOfTruthWidget    - one question per day, tap to answer (sm, interactive)
//
// All widgets read from a shared App Group UserDefaults key
// "dilly_widget_data". The React Native app writes this whenever it
// computes fresh values (after Chapter, score update, daily refresh).
// Zero API calls from the widget.
//
// Interactive widgets use App Intents (iOS 17+). The intent runs in
// the widget extension process; we update App Group data + tell
// WidgetKit to reload.

import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Shared data model

struct DillyWidgetData: Codable {
    // Today's Dilly Question
    var todaysQuestion: String?

    // Your One Move
    var oneMoveTitle: String?
    var oneMoveBody: String?
    var oneMoveDeepLink: String?

    // Tonight's 15 minutes
    var tonightTitle: String?
    var tonightDeepLink: String?

    // Honest Mirror
    var mirrorSentence: String?

    // Moment of Truth
    var truthQuestion: String?
    var truthAnswered: Bool?
    var truthStreakDays: Int?

    var lastUpdatedAt: Double?

    static let placeholder = DillyWidgetData(
        todaysQuestion: "What would you do this week if you stopped caring what your parents think?",
        oneMoveTitle: "Email Anjali at McKinsey before Wednesday.",
        oneMoveBody: "She replies fast. Worth a 4-line note.",
        oneMoveDeepLink: "dilly:///(app)",
        tonightTitle: "1 mock interview, Goldman behaviorals.",
        tonightDeepLink: "dilly:///(app)/interview-practice",
        mirrorSentence: "You're a finisher who can't pick a finish line.",
        truthQuestion: "Did you reach out to someone new this week?",
        truthAnswered: false,
        truthStreakDays: 5,
        lastUpdatedAt: Date().timeIntervalSince1970
    )

    static func read() -> DillyWidgetData {
        let defaults = UserDefaults(suiteName: "group.com.dilly.app")
        guard let raw = defaults?.string(forKey: "dilly_widget_data"),
              let data = raw.data(using: .utf8) else {
            return DillyWidgetData()
        }
        return (try? JSONDecoder().decode(DillyWidgetData.self, from: data)) ?? DillyWidgetData()
    }

    static func write(_ data: DillyWidgetData) {
        let defaults = UserDefaults(suiteName: "group.com.dilly.app")
        if let encoded = try? JSONEncoder().encode(data),
           let str = String(data: encoded, encoding: .utf8) {
            defaults?.set(str, forKey: "dilly_widget_data")
        }
    }
}

struct DillyEntry: TimelineEntry {
    let date: Date
    let data: DillyWidgetData
}

// MARK: - Provider (shared by all widgets)

struct DillyProvider: TimelineProvider {
    func placeholder(in context: Context) -> DillyEntry {
        DillyEntry(date: Date(), data: DillyWidgetData.placeholder)
    }
    func getSnapshot(in context: Context, completion: @escaping (DillyEntry) -> Void) {
        let data = context.isPreview ? DillyWidgetData.placeholder : DillyWidgetData.read()
        completion(DillyEntry(date: Date(), data: data))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<DillyEntry>) -> Void) {
        let entry = DillyEntry(date: Date(), data: DillyWidgetData.read())
        // Refresh every 30 min. The main app calls
        // WidgetCenter.shared.reloadAllTimelines() when fresh data is
        // computed, so the widget often updates sooner.
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - Common visual primitives

struct EyebrowLabel: View {
    let text: String
    let tint: Color
    var body: some View {
        Text(text)
            .font(.system(size: 9, weight: .heavy))
            .tracking(1.6)
            .foregroundColor(tint)
    }
}

struct EmptyHint: View {
    let icon: String
    let line: String
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(.secondary)
            Text(line)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)
                .lineLimit(3)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: - 1) Today's Dilly Question

struct DillyQuestionWidget: Widget {
    let kind = "DillyQuestionWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DillyProvider()) { entry in
            DillyQuestionView(entry: entry)
                .containerBackground(for: .widget) { Color("widgetBackground") }
        }
        .configurationDisplayName("Today's Question")
        .description("One question Dilly wants you to sit with today.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct DillyQuestionView: View {
    @Environment(\.widgetFamily) var family
    let entry: DillyEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 5) {
                EyebrowLabel(text: "TODAY'S QUESTION", tint: Color("$accent"))
                Spacer()
                Image(systemName: "sparkles")
                    .font(.system(size: 10, weight: .heavy))
                    .foregroundColor(Color("$accent"))
            }
            if let q = entry.data.todaysQuestion, !q.isEmpty {
                Text(q)
                    .font(.system(size: family == .systemSmall ? 13 : 16, weight: .heavy))
                    .lineSpacing(2)
                    .foregroundColor(.primary)
                    .lineLimit(family == .systemSmall ? 5 : 6)
                    .minimumScaleFactor(0.85)
            } else {
                EmptyHint(icon: "sparkles", line: "Open Dilly to load today's question.")
            }
            Spacer(minLength: 0)
            Text(family == .systemSmall ? "Tap to answer" : "Tap to talk it through with Dilly")
                .font(.system(size: 10, weight: .heavy))
                .tracking(1.0)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(URL(string: "dilly:///(app)?seed=todays-question"))
    }
}

// MARK: - 2) Your One Move

struct OneMoveWidget: Widget {
    let kind = "OneMoveWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DillyProvider()) { entry in
            OneMoveView(entry: entry)
                .containerBackground(for: .widget) { Color("widgetBackground") }
        }
        .configurationDisplayName("Your One Move")
        .description("The single most important career move this week.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct OneMoveView: View {
    @Environment(\.widgetFamily) var family
    let entry: DillyEntry
    var body: some View {
        VStack(alignment: .leading, spacing: family == .systemLarge ? 10 : 6) {
            HStack(spacing: 5) {
                Image(systemName: "flag.checkered")
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundColor(Color("$accent"))
                EyebrowLabel(text: "YOUR ONE MOVE", tint: Color("$accent"))
                Spacer()
            }
            if let title = entry.data.oneMoveTitle, !title.isEmpty {
                Text(title)
                    .font(.system(size: family == .systemSmall ? 13 : (family == .systemLarge ? 20 : 16), weight: .heavy))
                    .lineSpacing(2)
                    .foregroundColor(.primary)
                    .lineLimit(family == .systemSmall ? 4 : (family == .systemLarge ? 5 : 4))
                    .minimumScaleFactor(0.9)
                if family != .systemSmall, let body = entry.data.oneMoveBody, !body.isEmpty {
                    Text(body)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.secondary)
                        .lineLimit(family == .systemLarge ? 4 : 2)
                }
            } else {
                EmptyHint(icon: "flag.checkered", line: "Dilly will pick your weekly move after your next Chapter.")
            }
            Spacer(minLength: 0)
            HStack {
                Text("Tap to act")
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(1.0)
                    .foregroundColor(Color("$accent"))
                Image(systemName: "arrow.right")
                    .font(.system(size: 10, weight: .heavy))
                    .foregroundColor(Color("$accent"))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(URL(string: entry.data.oneMoveDeepLink ?? "dilly:///(app)"))
    }
}

// MARK: - 3) Tonight's 15 Minutes (interactive)

struct TonightWidget: Widget {
    let kind = "TonightWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DillyProvider()) { entry in
            TonightView(entry: entry)
                .containerBackground(for: .widget) { Color("widgetBackground") }
        }
        .configurationDisplayName("Tonight's 15 Minutes")
        .description("What to spend 15 minutes on tonight, end of story.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct TonightView: View {
    @Environment(\.widgetFamily) var family
    let entry: DillyEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 5) {
                Image(systemName: "moon.stars.fill")
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundColor(Color("$accent"))
                EyebrowLabel(text: "TONIGHT, 15 MIN", tint: Color("$accent"))
                Spacer()
            }
            if let title = entry.data.tonightTitle, !title.isEmpty {
                Text(title)
                    .font(.system(size: family == .systemSmall ? 14 : 17, weight: .heavy))
                    .lineSpacing(1)
                    .foregroundColor(.primary)
                    .lineLimit(family == .systemSmall ? 4 : 3)
                    .minimumScaleFactor(0.9)
            } else {
                EmptyHint(icon: "moon.stars.fill", line: "Dilly is picking your 15 minutes for tonight.")
            }
            Spacer(minLength: 0)
            // iOS 17 interactive button starts the action without
            // opening the app. The intent's deep-link is stored in
            // tonightDeepLink so the routing stays data-driven.
            if let deepLink = entry.data.tonightDeepLink, !deepLink.isEmpty {
                Link(destination: URL(string: deepLink)!) {
                    HStack(spacing: 6) {
                        Image(systemName: "play.fill").font(.system(size: 11, weight: .heavy))
                        Text("Start").font(.system(size: 12, weight: .heavy))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(Color("$accent"))
                    .clipShape(Capsule())
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: - 4) The Honest Mirror Sentence

struct HonestMirrorWidget: Widget {
    let kind = "HonestMirrorWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DillyProvider()) { entry in
            HonestMirrorView(entry: entry)
                .containerBackground(for: .widget) { Color("widgetBackground") }
        }
        .configurationDisplayName("Honest Mirror")
        .description("One sentence about who you are right now.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct HonestMirrorView: View {
    @Environment(\.widgetFamily) var family
    let entry: DillyEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 5) {
                Image(systemName: "eye")
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundColor(Color("$accent"))
                EyebrowLabel(text: "HONEST MIRROR", tint: Color("$accent"))
                Spacer()
            }
            if let s = entry.data.mirrorSentence, !s.isEmpty {
                // Quote-styled with a thin accent bar on the left so it
                // reads like a pulled quote, not a notification body.
                HStack(alignment: .top, spacing: 10) {
                    Rectangle()
                        .fill(Color("$accent"))
                        .frame(width: 3)
                        .cornerRadius(2)
                    Text("\u{201C}\(s)\u{201D}")
                        .font(.system(size: family == .systemSmall ? 13 : 15, weight: .heavy))
                        .italic()
                        .lineSpacing(2)
                        .foregroundColor(.primary)
                        .lineLimit(family == .systemSmall ? 5 : 5)
                        .minimumScaleFactor(0.85)
                }
            } else {
                EmptyHint(icon: "eye", line: "Open AI Arena → Honest Mirror to see your read.")
            }
            Spacer(minLength: 0)
            Text("Tap for the full read")
                .font(.system(size: 10, weight: .heavy))
                .tracking(1.0)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(URL(string: "dilly:///(app)/arena/mirror"))
    }
}

// MARK: - 5) Moment of Truth (interactive)

struct MomentOfTruthWidget: Widget {
    let kind = "MomentOfTruthWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DillyProvider()) { entry in
            MomentOfTruthView(entry: entry)
                .containerBackground(for: .widget) { Color("widgetBackground") }
        }
        .configurationDisplayName("Moment of Truth")
        .description("One question a day. Build the streak.")
        .supportedFamilies([.systemSmall])
    }
}

struct MomentOfTruthView: View {
    let entry: DillyEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: "checkmark.circle")
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundColor(Color("$accent"))
                EyebrowLabel(text: "MOMENT OF TRUTH", tint: Color("$accent"))
                Spacer()
                if let n = entry.data.truthStreakDays, n > 0 {
                    HStack(spacing: 2) {
                        Image(systemName: "flame.fill").font(.system(size: 9, weight: .heavy))
                        Text("\(n)d").font(.system(size: 9, weight: .heavy))
                    }
                    .foregroundColor(.orange)
                }
            }
            if let q = entry.data.truthQuestion, !q.isEmpty {
                Text(q)
                    .font(.system(size: 12, weight: .heavy))
                    .lineSpacing(1)
                    .foregroundColor(.primary)
                    .lineLimit(3)
                    .minimumScaleFactor(0.9)
                Spacer(minLength: 0)
                if entry.data.truthAnswered == true {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark.seal.fill").font(.system(size: 11))
                        Text("Logged").font(.system(size: 11, weight: .heavy))
                    }
                    .foregroundColor(Color("$accent"))
                } else {
                    HStack(spacing: 6) {
                        Button(intent: AnswerTruthIntent(answer: "yes")) {
                            Text("Yes")
                                .font(.system(size: 11, weight: .heavy))
                                .foregroundColor(.white)
                                .padding(.horizontal, 10).padding(.vertical, 6)
                                .background(Color("$accent"))
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        Button(intent: AnswerTruthIntent(answer: "no")) {
                            Text("No")
                                .font(.system(size: 11, weight: .heavy))
                                .foregroundColor(Color("$accent"))
                                .padding(.horizontal, 10).padding(.vertical, 6)
                                .background(Color("$accent").opacity(0.13))
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
            } else {
                EmptyHint(icon: "checkmark.circle", line: "Open Dilly to start your streak.")
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: - App Intents (interactive widgets)

/// Records a Yes/No answer for the daily Moment of Truth question.
/// Writes to App Group UserDefaults so the next widget render reflects
/// the answered state, and queues the answer for the main app to sync
/// with the backend on next foreground.
struct AnswerTruthIntent: AppIntent {
    static var title: LocalizedStringResource = "Answer Today's Truth"
    static var description = IntentDescription("Log your answer to today's Moment of Truth.")

    @Parameter(title: "Answer") var answer: String

    init() {}
    init(answer: String) { self.answer = answer }

    func perform() async throws -> some IntentResult {
        let defaults = UserDefaults(suiteName: "group.com.dilly.app")
        // Mark the current question answered so the widget flips to
        // the "Logged" state immediately.
        var data = DillyWidgetData.read()
        data.truthAnswered = true
        DillyWidgetData.write(data)

        // Queue the answer for the main app to sync. Uses a separate
        // key so the queue can hold multiple pending answers across
        // days without clobbering the live widget data.
        var queue: [[String: Any]] = []
        if let raw = defaults?.string(forKey: "dilly_widget_truth_queue"),
           let qData = raw.data(using: .utf8),
           let parsed = try? JSONSerialization.jsonObject(with: qData) as? [[String: Any]] {
            queue = parsed
        }
        queue.append([
            "answer": answer,
            "question": data.truthQuestion ?? "",
            "answeredAt": Date().timeIntervalSince1970,
        ])
        if let payload = try? JSONSerialization.data(withJSONObject: queue),
           let str = String(data: payload, encoding: .utf8) {
            defaults?.set(str, forKey: "dilly_widget_truth_queue")
        }

        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

// MARK: - Bundle entry

@main
struct DillyWidgetBundle: WidgetBundle {
    var body: some Widget {
        DillyQuestionWidget()
        OneMoveWidget()
        TonightWidget()
        HonestMirrorWidget()
        MomentOfTruthWidget()
    }
}
