// DillyWidget.swift — Dilly's home-screen widget bundle.
//
// Six widgets, each a small portrait with its own atmosphere:
//
//   1. DillyQuestionWidget   — today's question to sit with (sm + md)
//   2. OneMoveWidget         — single most important career move (sm + md + lg)
//   3. TonightWidget         — what to spend 15 min on tonight (sm + md, interactive)
//   4. DillyProfileWidget    — living, breathing profile (sm + md) [REPLACED HonestMirror]
//   5. MomentOfTruthWidget   — daily question, build the streak (sm, interactive)
//   6. DillySummaryWidget    — Question + One Move + Tonight in one large widget
//
// Design language (vs. the build-440 version):
//
//   - Per-widget gradient palette tied to the widget's mood, not a flat
//     color. Question = late-night navy, One Move = golden hour amber,
//     Tonight = deep evening purple, Profile = warm cream / slate
//     mirror, Truth = vibrant accent, Summary = soft dusk.
//
//   - DillyFace as a SwiftUI Shape. Real face (ring + eyes + smile)
//     with the matching accessory variant from build 437 (glasses for
//     Question, compass for One Move, pencil for Tonight, plain for
//     Profile, trophy for Truth). Fully drawn in Path commands so we
//     can theme it natively, no PNG assets.
//
//   - Time-of-day awareness: Provider returns a Timeline with morning /
//     midday / evening / night entries so the gradients shift through
//     the day. iOS reloads on its own ~15-30 min cadence.
//
//   - System .serif italic for headlines that should feel quoted —
//     Today's Question, Profile fact, Tonight task. Heavy sans for
//     action-oriented copy (One Move title, Truth streak).
//
// All widgets read from a shared App Group UserDefaults key
// `dilly_widget_data`. Zero API calls from the widget.
// Interactive widgets (Tonight, Truth) use App Intents (iOS 17+).

import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Shared data model

struct DillyWidgetData: Codable {
    var todaysQuestion: String?

    var oneMoveTitle: String?
    var oneMoveBody: String?
    var oneMoveDeepLink: String?

    var tonightTitle: String?
    var tonightDeepLink: String?

    // Dilly Profile (replaces Honest Mirror — feels living/breathing)
    var profileFactCount: Int?
    var profileCategoryCount: Int?
    var profileRecentFacts: [String]?
    var profileLatestFactDate: String?
    var profileLatestFactCategory: String?

    // Honest Mirror retired but still decoded for backward-compat
    var mirrorSentence: String?

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
        profileFactCount: 24,
        profileCategoryCount: 7,
        profileRecentFacts: [
            "Led a 3-person research team at the lab last summer.",
            "Built a sentiment analysis tool that processes 10K tweets/day.",
            "Targeting Stripe, Anthropic, and Notion for SWE intern roles.",
        ],
        profileLatestFactDate: "Tue",
        profileLatestFactCategory: "achievement",
        mirrorSentence: nil,
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

// MARK: - Time-of-day palette modulator

enum TimeOfDay {
    case morning, midday, evening, night
    static func now() -> TimeOfDay {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<11:  return .morning
        case 11..<17: return .midday
        case 17..<22: return .evening
        default:      return .night
        }
    }
}

// MARK: - Color helpers

extension Color {
    init(hex: UInt32, opacity: Double = 1.0) {
        self.init(.sRGB,
            red:   Double((hex >> 16) & 0xFF) / 255.0,
            green: Double((hex >> 8)  & 0xFF) / 255.0,
            blue:  Double(hex & 0xFF) / 255.0,
            opacity: opacity)
    }
}

// MARK: - DillyFace (SwiftUI port of the React component)

struct DillyFaceView: View {
    enum Accessory { case none, glasses, compass, pencil, trophy, briefcase, headphones, crown }
    enum Mood { case warm, attentive, thoughtful, proud, celebrating, curious, focused }

    let size: CGFloat
    let mood: Mood
    let accessory: Accessory
    let inkColor: Color
    let ringColor: Color
    let ringFill: Color

    var body: some View {
        ZStack {
            Circle()
                .fill(ringFill)
                .overlay(Circle().stroke(ringColor, lineWidth: max(1.5, size * 0.025)))
            FaceContent(size: size, mood: mood, ink: inkColor)
            AccessoryOverlay(size: size, accessory: accessory, inkColor: inkColor)
        }
        .frame(width: size, height: size)
    }
}

private struct FaceContent: View {
    let size: CGFloat
    let mood: DillyFaceView.Mood
    let ink: Color

    var body: some View {
        let faceRadius = size * 0.44 / 2
        let s = faceRadius / 19
        let cx = size / 2
        let cy = size / 2
        let shape = moodShape(mood)
        let eyeR: CGFloat = 2.8 * s * shape.eyeScale
        let eyeY = cy - 4 * s + (shape.eyeLift * s)
        let mW: CGFloat = 8 * s

        ZStack {
            if shape.archEyes {
                Path { p in
                    p.move(to: CGPoint(x: cx - 10 * s, y: cy - 3 * s))
                    p.addQuadCurve(to: CGPoint(x: cx - 6 * s, y: cy - 3 * s), control: CGPoint(x: cx - 8 * s, y: cy - 7 * s))
                }.stroke(ink, lineWidth: 2.2 * s)
                Path { p in
                    p.move(to: CGPoint(x: cx + 6 * s, y: cy - 3 * s))
                    p.addQuadCurve(to: CGPoint(x: cx + 10 * s, y: cy - 3 * s), control: CGPoint(x: cx + 8 * s, y: cy - 7 * s))
                }.stroke(ink, lineWidth: 2.2 * s)
            } else {
                Circle().fill(ink).frame(width: eyeR * 2, height: eyeR * 2).position(x: cx - 8 * s, y: eyeY)
                Circle().fill(ink).frame(width: eyeR * 2, height: eyeR * 2).position(x: cx + 8 * s, y: eyeY)
            }
            let smileY = cy + 5 * s
            let controlOffset = shape.smile * 6 * s
            Path { p in
                p.move(to: CGPoint(x: cx - mW, y: smileY))
                p.addQuadCurve(to: CGPoint(x: cx + mW, y: smileY), control: CGPoint(x: cx, y: smileY + controlOffset))
            }.stroke(ink, style: StrokeStyle(lineWidth: 2.2 * s, lineCap: .round))
        }
        .rotationEffect(.degrees(shape.tilt))
    }

    private func moodShape(_ m: DillyFaceView.Mood) -> (smile: CGFloat, eyeScale: CGFloat, eyeLift: CGFloat, archEyes: Bool, tilt: Double) {
        switch m {
        case .warm:        return (0.85, 1.0, 0,    false, -2)
        case .attentive:   return (0.30, 1.1, -0.3, false, 0)
        case .thoughtful:  return (0.15, 0.8, -0.8, false, 3)
        case .proud:       return (0.70, 0.2, 0,    true,  -3)
        case .celebrating: return (1.00, 0.25, -0.5, true, 0)
        case .curious:     return (0.40, 1.1, 0,    false, -5)
        case .focused:     return (0.20, 0.9, -0.3, false, 0)
        }
    }
}

private struct AccessoryOverlay: View {
    let size: CGFloat
    let accessory: DillyFaceView.Accessory
    let inkColor: Color

    var body: some View {
        let faceRadius = size * 0.44 / 2
        let s = faceRadius / 19
        let cx = size / 2
        let cy = size / 2

        switch accessory {
        case .none: EmptyView()

        case .glasses:
            let lensR: CGFloat = 5.5 * s
            let frameW: CGFloat = 1 * s
            let eyeY = cy - 4 * s
            ZStack {
                Path { p in
                    p.move(to: CGPoint(x: cx - 8 * s + lensR - 0.3 * s, y: eyeY))
                    p.addLine(to: CGPoint(x: cx + 8 * s - lensR + 0.3 * s, y: eyeY))
                }.stroke(inkColor, lineWidth: frameW)
                Circle().stroke(inkColor, lineWidth: frameW).frame(width: lensR * 2, height: lensR * 2).position(x: cx - 8 * s, y: eyeY)
                Circle().stroke(inkColor, lineWidth: frameW).frame(width: lensR * 2, height: lensR * 2).position(x: cx + 8 * s, y: eyeY)
            }

        case .compass:
            let ccx = cx + 13 * s
            let ccy = cy + 13 * s
            let outerR: CGFloat = 3.6 * s
            ZStack {
                Circle().fill(Color(hex: 0xB88A1F)).frame(width: outerR * 2, height: outerR * 2).position(x: ccx, y: ccy)
                Circle().fill(Color(hex: 0xFFF6D6)).frame(width: outerR * 1.7, height: outerR * 1.7).position(x: ccx, y: ccy)
                Path { p in
                    p.move(to: CGPoint(x: ccx, y: ccy - 2.6 * s))
                    p.addLine(to: CGPoint(x: ccx - 0.8 * s, y: ccy))
                    p.addLine(to: CGPoint(x: ccx + 0.8 * s, y: ccy))
                    p.closeSubpath()
                }.fill(inkColor)
                Path { p in
                    p.move(to: CGPoint(x: ccx, y: ccy + 2.6 * s))
                    p.addLine(to: CGPoint(x: ccx - 0.8 * s, y: ccy))
                    p.addLine(to: CGPoint(x: ccx + 0.8 * s, y: ccy))
                    p.closeSubpath()
                }.fill(Color.white)
                Circle().fill(Color(hex: 0x1A1A1A)).frame(width: 1 * s, height: 1 * s).position(x: ccx, y: ccy)
            }

        case .pencil:
            let tipX = cx + 14 * s, tipY = cy + 14 * s
            let butX = cx + 20 * s, butY = cy + 8 * s
            ZStack {
                Path { p in
                    p.move(to: CGPoint(x: tipX, y: tipY))
                    p.addLine(to: CGPoint(x: butX, y: butY))
                }.stroke(Color(hex: 0xFFD83D), style: StrokeStyle(lineWidth: 2.4 * s, lineCap: .round))
                Circle().fill(Color(hex: 0x111111)).frame(width: 1.8 * s, height: 1.8 * s).position(x: tipX, y: tipY)
                Circle().fill(Color(hex: 0xFF7AA2)).frame(width: 2.4 * s, height: 2.4 * s).position(x: butX, y: butY)
            }

        case .trophy:
            let cupTopL = cx + 11 * s, cupTopR = cx + 22 * s
            let cupBotL = cx + 13.5 * s, cupBotR = cx + 19.5 * s
            let cupTopY = cy + 5 * s, cupBottomY = cy + 11 * s
            let stemL = cx + 15 * s, stemR = cx + 18 * s
            let stemBottomY = cy + 13.5 * s
            let baseL = cx + 13 * s, baseR = cx + 20 * s
            let baseBottomY = cy + 16 * s
            ZStack {
                Path { p in
                    p.move(to: CGPoint(x: cupTopL, y: cupTopY))
                    p.addLine(to: CGPoint(x: cupTopR, y: cupTopY))
                    p.addLine(to: CGPoint(x: cupBotR, y: cupBottomY))
                    p.addLine(to: CGPoint(x: cupBotL, y: cupBottomY))
                    p.closeSubpath()
                }.fill(Color(hex: 0xE5B143))
                Rectangle().fill(Color(hex: 0xE5B143))
                    .frame(width: stemR - stemL, height: stemBottomY - cupBottomY)
                    .position(x: (stemL + stemR) / 2, y: (cupBottomY + stemBottomY) / 2)
                Rectangle().fill(Color(hex: 0xE5B143))
                    .frame(width: baseR - baseL, height: baseBottomY - stemBottomY)
                    .position(x: (baseL + baseR) / 2, y: (stemBottomY + baseBottomY) / 2)
                Circle().fill(inkColor).frame(width: 2 * s, height: 2 * s)
                    .position(x: (cupTopL + cupTopR) / 2, y: (cupTopY + cupBottomY) / 2)
            }

        case .briefcase:
            let bodyX = cx + 11 * s, bodyY = cy + 7 * s
            let bodyW = 12 * s, bodyH = 9 * s
            ZStack {
                RoundedRectangle(cornerRadius: 1 * s)
                    .fill(Color(hex: 0x3F2E1B))
                    .frame(width: bodyW, height: bodyH)
                    .position(x: bodyX + bodyW / 2, y: bodyY + bodyH / 2)
                Path { p in
                    let leftX = bodyX + 2.2 * s
                    let rightX = bodyX + bodyW - 2.2 * s
                    p.move(to: CGPoint(x: leftX, y: bodyY))
                    p.addQuadCurve(to: CGPoint(x: rightX, y: bodyY), control: CGPoint(x: (leftX + rightX) / 2, y: bodyY - 1.5 * s))
                }.stroke(Color(hex: 0x2A1F12), lineWidth: 0.9 * s)
                RoundedRectangle(cornerRadius: 0.2 * s)
                    .fill(Color(hex: 0xB88A1F))
                    .frame(width: 2.4 * s, height: 1.2 * s)
                    .position(x: bodyX + bodyW / 2, y: bodyY + 1.2 * s)
            }

        case .headphones:
            let cupOuterX: CGFloat = 14 * s, cupInnerX: CGFloat = 11 * s
            let cupTopY = cy - 3 * s, cupBottomY = cy + 5 * s
            let cupW = cupOuterX - cupInnerX, cupH = cupBottomY - cupTopY
            ZStack {
                Path { p in
                    let leftX = cx - (cupInnerX + cupW / 2)
                    let rightX = cx + (cupInnerX + cupW / 2)
                    p.move(to: CGPoint(x: leftX, y: cupTopY))
                    p.addQuadCurve(to: CGPoint(x: rightX, y: cupTopY), control: CGPoint(x: cx, y: cy - 17 * s))
                }.stroke(Color(hex: 0x2A2F3A), style: StrokeStyle(lineWidth: 1.6 * s, lineCap: .round))
                Capsule().fill(Color(hex: 0x2A2F3A)).frame(width: cupW, height: cupH).position(x: cx - cupOuterX + cupW / 2, y: cupTopY + cupH / 2)
                Capsule().fill(Color(hex: 0x2A2F3A)).frame(width: cupW, height: cupH).position(x: cx + cupInnerX + cupW / 2, y: cupTopY + cupH / 2)
                Capsule().fill(inkColor.opacity(0.85)).frame(width: cupW * 0.6, height: cupH * 0.6).position(x: cx - cupOuterX + cupW / 2, y: cupTopY + cupH / 2)
                Capsule().fill(inkColor.opacity(0.85)).frame(width: cupW * 0.6, height: cupH * 0.6).position(x: cx + cupInnerX + cupW / 2, y: cupTopY + cupH / 2)
            }

        case .crown:
            let baseY = cy - 12 * s, peakY = cy - 18 * s, valleyY = cy - 14.5 * s
            let half: CGFloat = 7 * s
            ZStack {
                Path { p in
                    p.move(to: CGPoint(x: cx - half, y: baseY))
                    p.addLine(to: CGPoint(x: cx - half, y: valleyY + 1.5 * s))
                    p.addLine(to: CGPoint(x: cx - 5 * s, y: peakY))
                    p.addLine(to: CGPoint(x: cx - 2.5 * s, y: valleyY))
                    p.addLine(to: CGPoint(x: cx, y: peakY - 1 * s))
                    p.addLine(to: CGPoint(x: cx + 2.5 * s, y: valleyY))
                    p.addLine(to: CGPoint(x: cx + 5 * s, y: peakY))
                    p.addLine(to: CGPoint(x: cx + half, y: valleyY + 1.5 * s))
                    p.addLine(to: CGPoint(x: cx + half, y: baseY))
                    p.closeSubpath()
                }.fill(Color(hex: 0xE5B143))
                Circle().fill(inkColor).frame(width: 2.2 * s, height: 2.2 * s).position(x: cx, y: peakY + 0.5 * s)
            }
        }
    }
}

// MARK: - Gradient backgrounds (per-widget palette × time-of-day)

struct WidgetGradient: View {
    enum Mood { case lateNight, goldenHour, deepEvening, journalCream, vibrantAccent, dusk }
    let mood: Mood
    let time: TimeOfDay
    var body: some View {
        LinearGradient(colors: colors(), startPoint: .topLeading, endPoint: .bottomTrailing).ignoresSafeArea()
    }
    private func colors() -> [Color] {
        switch mood {
        case .lateNight:
            switch time {
            case .morning: return [Color(hex: 0x2C3E58), Color(hex: 0x141A2B)]
            case .midday:  return [Color(hex: 0x1F2A44), Color(hex: 0x0B1024)]
            case .evening: return [Color(hex: 0x162042), Color(hex: 0x07091B)]
            case .night:   return [Color(hex: 0x0E1430), Color(hex: 0x02030B)]
            }
        case .goldenHour:
            switch time {
            case .morning: return [Color(hex: 0xFFE6B5), Color(hex: 0xFF9966)]
            case .midday:  return [Color(hex: 0xFFC774), Color(hex: 0xFF7A4C)]
            case .evening: return [Color(hex: 0xFF8C5A), Color(hex: 0xC03A2A)]
            case .night:   return [Color(hex: 0x9C3D2A), Color(hex: 0x4A1810)]
            }
        case .deepEvening:
            switch time {
            case .morning: return [Color(hex: 0x3B2A6A), Color(hex: 0x1A0E40)]
            case .midday:  return [Color(hex: 0x382561), Color(hex: 0x180A38)]
            case .evening: return [Color(hex: 0x271552), Color(hex: 0x0C0426)]
            case .night:   return [Color(hex: 0x1B0E3F), Color(hex: 0x05021A)]
            }
        case .journalCream:
            switch time {
            case .morning: return [Color(hex: 0xFAF1E2), Color(hex: 0xE8D7B5)]
            case .midday:  return [Color(hex: 0xF5E8D0), Color(hex: 0xE0CBA1)]
            case .evening: return [Color(hex: 0xEEDBB6), Color(hex: 0xC8AB78)]
            case .night:   return [Color(hex: 0x2C2415), Color(hex: 0x14100A)]
            }
        case .vibrantAccent:
            switch time {
            case .morning: return [Color(hex: 0xFFB36B), Color(hex: 0xE9436E)]
            case .midday:  return [Color(hex: 0xFF8E5C), Color(hex: 0xCC2E5F)]
            case .evening: return [Color(hex: 0xE05A45), Color(hex: 0x8B1747)]
            case .night:   return [Color(hex: 0x7A1F30), Color(hex: 0x2C0A18)]
            }
        case .dusk:
            switch time {
            case .morning: return [Color(hex: 0x7CA5DC), Color(hex: 0xC684C0)]
            case .midday:  return [Color(hex: 0x4F7DC6), Color(hex: 0xA0588F)]
            case .evening: return [Color(hex: 0x32487E), Color(hex: 0x631B5C)]
            case .night:   return [Color(hex: 0x1A2244), Color(hex: 0x230F2B)]
            }
        }
    }
}

// MARK: - Provider

struct DillyEntry: TimelineEntry {
    let date: Date
    let data: DillyWidgetData
    let timeOfDay: TimeOfDay
}

struct DillyProvider: TimelineProvider {
    func placeholder(in context: Context) -> DillyEntry {
        DillyEntry(date: Date(), data: DillyWidgetData.placeholder, timeOfDay: .midday)
    }
    func getSnapshot(in context: Context, completion: @escaping (DillyEntry) -> Void) {
        completion(DillyEntry(date: Date(), data: DillyWidgetData.read(), timeOfDay: TimeOfDay.now()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<DillyEntry>) -> Void) {
        let now = Date()
        let cal = Calendar.current
        let d = DillyWidgetData.read()
        var entries: [DillyEntry] = [DillyEntry(date: now, data: d, timeOfDay: TimeOfDay.now())]
        for hour in [11, 17, 22, 5] {
            if let next = cal.nextDate(after: now, matching: DateComponents(hour: hour, minute: 0), matchingPolicy: .nextTime) {
                let tod: TimeOfDay = (hour == 5 ? .morning : hour == 11 ? .midday : hour == 17 ? .evening : .night)
                entries.append(DillyEntry(date: next, data: d, timeOfDay: tod))
            }
        }
        completion(Timeline(entries: entries.sorted(by: { $0.date < $1.date }), policy: .atEnd))
    }
}

// MARK: - Common helpers

struct EyebrowLabel: View {
    let text: String
    let tint: Color
    var body: some View {
        Text(text).font(.system(size: 9, weight: .black)).tracking(2.0).foregroundColor(tint)
    }
}

struct EmptyHint: View {
    let icon: String
    let line: String
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: icon).font(.system(size: 14, weight: .semibold)).foregroundColor(.secondary)
            Text(line).font(.system(size: 13, weight: .medium)).foregroundColor(.secondary).lineLimit(3)
        }
    }
}

// MARK: - 1) Today's Question

struct DillyQuestionWidget: Widget {
    let kind = "DillyQuestionWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DillyProvider()) { entry in
            DillyQuestionView(entry: entry)
                .containerBackground(for: .widget) { WidgetGradient(mood: .lateNight, time: entry.timeOfDay) }
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
        ZStack(alignment: .topLeading) {
            HStack { Spacer()
                VStack { Spacer()
                    DillyFaceView(size: family == .systemSmall ? 50 : 70, mood: .thoughtful, accessory: .glasses,
                        inkColor: Color(hex: 0xE9E2C9), ringColor: Color(hex: 0xE9E2C9).opacity(0.3), ringFill: Color.clear)
                        .opacity(0.85)
                }
            }
            .padding(.bottom, family == .systemSmall ? 4 : 8).padding(.trailing, family == .systemSmall ? 0 : 4)

            VStack(alignment: .leading, spacing: 8) {
                EyebrowLabel(text: "TODAY", tint: Color(hex: 0xE9E2C9))
                if let q = entry.data.todaysQuestion, !q.isEmpty {
                    Text(q)
                        .font(.system(size: family == .systemSmall ? 14 : 18, weight: .semibold, design: .serif))
                        .italic()
                        .foregroundColor(Color(hex: 0xF5F0DD))
                        .lineLimit(family == .systemSmall ? 6 : 5)
                        .lineSpacing(2).minimumScaleFactor(0.85)
                } else {
                    EmptyHint(icon: "moon.stars", line: "Open Dilly to load today's question.")
                }
                Spacer(minLength: 0)
                Text(family == .systemSmall ? "Tap to think" : "Tap to think it through with Dilly")
                    .font(.system(size: 10, weight: .heavy)).tracking(1.0).foregroundColor(Color(hex: 0xE9E2C9).opacity(0.7))
            }
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
                .containerBackground(for: .widget) { WidgetGradient(mood: .goldenHour, time: entry.timeOfDay) }
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
        ZStack(alignment: .topLeading) {
            HStack { Spacer()
                VStack { Spacer()
                    DillyFaceView(size: family == .systemLarge ? 90 : (family == .systemMedium ? 60 : 48), mood: .focused, accessory: .compass,
                        inkColor: Color(hex: 0x4A1810), ringColor: Color(hex: 0x4A1810).opacity(0.4), ringFill: Color(hex: 0xFFF5DC).opacity(0.18))
                }
            }
            .padding(.bottom, 4)

            VStack(alignment: .leading, spacing: family == .systemLarge ? 12 : 6) {
                HStack(spacing: 6) { EyebrowLabel(text: "THIS WEEK · ONE MOVE", tint: Color(hex: 0x4A1810)); Spacer() }
                if let title = entry.data.oneMoveTitle, !title.isEmpty {
                    Text(title)
                        .font(.system(size: family == .systemSmall ? 14 : (family == .systemLarge ? 22 : 17), weight: .heavy))
                        .lineSpacing(2).foregroundColor(Color(hex: 0x2A0A05))
                        .lineLimit(family == .systemSmall ? 5 : (family == .systemLarge ? 6 : 4))
                        .minimumScaleFactor(0.85)
                    if family != .systemSmall, let body = entry.data.oneMoveBody, !body.isEmpty {
                        Text(body).font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Color(hex: 0x4A1810).opacity(0.85))
                            .lineLimit(family == .systemLarge ? 5 : 2)
                    }
                } else {
                    EmptyHint(icon: "flag.checkered", line: "Dilly will pick your weekly move after your next Chapter.")
                }
                Spacer(minLength: 0)
                HStack {
                    Text("Tap to act").font(.system(size: 10, weight: .heavy)).tracking(1.0).foregroundColor(Color(hex: 0x2A0A05))
                    Image(systemName: "arrow.right").font(.system(size: 10, weight: .heavy)).foregroundColor(Color(hex: 0x2A0A05))
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(URL(string: entry.data.oneMoveDeepLink ?? "dilly:///(app)"))
    }
}

// MARK: - 3) Tonight's 15 Minutes

struct TonightWidget: Widget {
    let kind = "TonightWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DillyProvider()) { entry in
            TonightView(entry: entry)
                .containerBackground(for: .widget) { WidgetGradient(mood: .deepEvening, time: entry.timeOfDay) }
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
        ZStack(alignment: .topLeading) {
            VStack {
                HStack { Spacer()
                    Image(systemName: "sparkle").font(.system(size: 9)).foregroundColor(Color.white.opacity(0.4))
                    Image(systemName: "sparkle").font(.system(size: 6)).foregroundColor(Color.white.opacity(0.25))
                        .padding(.leading, -2).padding(.top, 6)
                }
                Spacer()
            }
            .padding(.top, 4).padding(.trailing, 4)

            HStack { Spacer()
                VStack { Spacer()
                    DillyFaceView(size: family == .systemSmall ? 48 : 64, mood: .focused, accessory: .pencil,
                        inkColor: Color(hex: 0xE2D6FF), ringColor: Color(hex: 0xE2D6FF).opacity(0.3), ringFill: Color.white.opacity(0.05))
                }
            }
            .padding(.bottom, family == .systemSmall ? 4 : 8).padding(.trailing, family == .systemSmall ? 2 : 4)

            VStack(alignment: .leading, spacing: 8) {
                EyebrowLabel(text: "TONIGHT · 15 MIN", tint: Color(hex: 0xC9B8FF))
                if let title = entry.data.tonightTitle, !title.isEmpty {
                    Text(title)
                        .font(.system(size: family == .systemSmall ? 14 : 17, weight: .heavy, design: .serif))
                        .lineSpacing(1).foregroundColor(Color(hex: 0xF5F0FF))
                        .lineLimit(family == .systemSmall ? 5 : 3).minimumScaleFactor(0.9)
                } else {
                    EmptyHint(icon: "moon.stars.fill", line: "Dilly is picking your 15 minutes for tonight.")
                }
                Spacer(minLength: 0)
                if let deepLink = entry.data.tonightDeepLink, !deepLink.isEmpty {
                    Link(destination: URL(string: deepLink)!) {
                        HStack(spacing: 6) {
                            Image(systemName: "play.fill").font(.system(size: 11, weight: .heavy))
                            Text("Start").font(.system(size: 12, weight: .heavy))
                        }
                        .foregroundColor(Color(hex: 0x180A38)).padding(.horizontal, 14).padding(.vertical, 8)
                        .background(Color(hex: 0xE2D6FF)).clipShape(Capsule())
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: - 4) Dilly Profile (REPLACES HonestMirror)

struct DillyProfileWidget: Widget {
    let kind = "DillyProfileWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DillyProvider()) { entry in
            DillyProfileView(entry: entry)
                .containerBackground(for: .widget) { WidgetGradient(mood: .journalCream, time: entry.timeOfDay) }
        }
        .configurationDisplayName("Your Dilly Profile")
        .description("What Dilly remembers about you. Updates as your profile grows.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct DillyProfileView: View {
    @Environment(\.widgetFamily) var family
    let entry: DillyEntry

    private var surfacedFact: String? {
        let facts = entry.data.profileRecentFacts ?? []
        guard !facts.isEmpty else { return nil }
        let idx = Int(entry.date.timeIntervalSince1970 / 60) % facts.count
        return facts[abs(idx) % facts.count]
    }
    private var inkPrimary: Color {
        entry.timeOfDay == .night ? Color(hex: 0xF5E8D0) : Color(hex: 0x3A2912)
    }
    private var inkSecondary: Color {
        entry.timeOfDay == .night ? Color(hex: 0xC8AB78) : Color(hex: 0x6B5836)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                DillyFaceView(size: family == .systemSmall ? 32 : 38, mood: .warm, accessory: .none,
                    inkColor: inkPrimary, ringColor: inkPrimary.opacity(0.45), ringFill: inkPrimary.opacity(0.06))
                VStack(alignment: .leading, spacing: 1) {
                    EyebrowLabel(text: "DILLY REMEMBERS", tint: inkSecondary)
                    if let n = entry.data.profileFactCount, n > 0 {
                        Text(family == .systemSmall ? "\(n) facts" : "\(n) facts · \(entry.data.profileCategoryCount ?? 1) categories")
                            .font(.system(size: 10, weight: .semibold)).foregroundColor(inkSecondary)
                    }
                }
                Spacer()
            }
            if let fact = surfacedFact {
                Text("\u{201C}\(fact)\u{201D}")
                    .font(.system(size: family == .systemSmall ? 13 : 15, weight: .semibold, design: .serif))
                    .italic().foregroundColor(inkPrimary).lineSpacing(2)
                    .lineLimit(family == .systemSmall ? 5 : 4).minimumScaleFactor(0.85).padding(.top, 2)
            } else {
                EmptyHint(icon: "book.closed", line: "Tell Dilly about you and your profile fills in here.")
            }
            Spacer(minLength: 0)
            if family != .systemSmall, let date = entry.data.profileLatestFactDate, !date.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: "circle.fill").font(.system(size: 5)).foregroundColor(Color(hex: 0xE5B143))
                    Text("Latest capture · \(date)")
                        .font(.system(size: 10, weight: .heavy)).tracking(0.8).foregroundColor(inkSecondary)
                }
            } else if family == .systemSmall {
                Text("Tap to add more").font(.system(size: 10, weight: .heavy)).tracking(1.0).foregroundColor(inkSecondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(URL(string: "dilly:///(app)/my-dilly-profile"))
    }
}

// MARK: - 5) Moment of Truth

struct MomentOfTruthWidget: Widget {
    let kind = "MomentOfTruthWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DillyProvider()) { entry in
            MomentOfTruthView(entry: entry)
                .containerBackground(for: .widget) { WidgetGradient(mood: .vibrantAccent, time: entry.timeOfDay) }
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
            HStack {
                EyebrowLabel(text: "MOMENT OF TRUTH", tint: Color.white.opacity(0.85))
                Spacer()
                if let streak = entry.data.truthStreakDays, streak > 0 {
                    HStack(spacing: 3) {
                        Image(systemName: "flame.fill").font(.system(size: 10)).foregroundColor(Color.white)
                        Text("\(streak)").font(.system(size: 12, weight: .black)).foregroundColor(Color.white)
                    }
                    .padding(.horizontal, 6).padding(.vertical, 2).background(Color.white.opacity(0.18)).clipShape(Capsule())
                }
            }
            if let q = entry.data.truthQuestion, !q.isEmpty {
                Text(q).font(.system(size: 13, weight: .heavy, design: .serif)).foregroundColor(Color.white)
                    .lineLimit(4).minimumScaleFactor(0.85).padding(.top, 2)
            } else {
                EmptyHint(icon: "questionmark.circle", line: "Today's question will appear here.")
            }
            Spacer(minLength: 0)
            HStack { Spacer()
                DillyFaceView(size: 36, mood: .proud, accessory: .trophy,
                    inkColor: Color.white, ringColor: Color.white.opacity(0.35), ringFill: Color.white.opacity(0.1))
            }
            if entry.data.truthAnswered != true, entry.data.truthQuestion != nil {
                Button(intent: AnswerTruthIntent(answer: true)) {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark").font(.system(size: 10, weight: .heavy))
                        Text("Yes, today").font(.system(size: 11, weight: .heavy))
                    }
                    .foregroundColor(Color(hex: 0x2C0A18)).padding(.horizontal, 10).padding(.vertical, 6)
                    .background(Color.white).clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct AnswerTruthIntent: AppIntent {
    static var title: LocalizedStringResource = "Answer today's Moment of Truth"
    static var description = IntentDescription("Log your answer to today's Moment of Truth.")
    @Parameter(title: "Answer") var answer: Bool
    init() {}
    init(answer: Bool) { self.answer = answer }
    func perform() async throws -> some IntentResult {
        var d = DillyWidgetData.read()
        d.truthAnswered = answer
        if answer { d.truthStreakDays = (d.truthStreakDays ?? 0) + 1 }
        DillyWidgetData.write(d)
        WidgetCenter.shared.reloadTimelines(ofKind: "MomentOfTruthWidget")
        return .result()
    }
}

// MARK: - 6) Dilly Today summary (large)

struct DillySummaryWidget: Widget {
    let kind = "DillySummaryWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DillyProvider()) { entry in
            DillySummaryView(entry: entry)
                .containerBackground(for: .widget) { WidgetGradient(mood: .dusk, time: entry.timeOfDay) }
        }
        .configurationDisplayName("Dilly Today")
        .description("Question + One Move + Tonight, all in one.")
        .supportedFamilies([.systemLarge])
    }
}

struct DillySummaryView: View {
    let entry: DillyEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                DillyFaceView(size: 44, mood: .warm, accessory: .none,
                    inkColor: Color.white, ringColor: Color.white.opacity(0.45), ringFill: Color.white.opacity(0.1))
                VStack(alignment: .leading, spacing: 1) {
                    EyebrowLabel(text: "DILLY · TODAY", tint: Color.white.opacity(0.85))
                    Text(formattedDate()).font(.system(size: 11, weight: .semibold)).foregroundColor(Color.white.opacity(0.7))
                }
                Spacer()
            }
            Divider().background(Color.white.opacity(0.2))
            sectionRow(eyebrow: "TODAY · QUESTION", body: entry.data.todaysQuestion, icon: "moon.stars", fontSize: 14, italicStyle: true)
            sectionRow(eyebrow: "THIS WEEK · ONE MOVE", body: entry.data.oneMoveTitle, icon: "flag.checkered", fontSize: 15, italicStyle: false)
            sectionRow(eyebrow: "TONIGHT · 15 MIN", body: entry.data.tonightTitle, icon: "play.circle", fontSize: 14, italicStyle: false)
            Spacer(minLength: 0)
            HStack { Spacer()
                Text("Tap to open Dilly").font(.system(size: 10, weight: .heavy)).tracking(1.0).foregroundColor(Color.white.opacity(0.7))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(URL(string: "dilly:///(app)"))
    }

    @ViewBuilder
    private func sectionRow(eyebrow: String, body: String?, icon: String, fontSize: CGFloat, italicStyle: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: 9, weight: .heavy)).foregroundColor(Color.white.opacity(0.7))
                EyebrowLabel(text: eyebrow, tint: Color.white.opacity(0.7))
            }
            if let b = body, !b.isEmpty {
                if italicStyle {
                    Text(b).font(.system(size: fontSize, weight: .heavy, design: .serif)).italic()
                        .foregroundColor(Color.white).lineLimit(2).minimumScaleFactor(0.85)
                } else {
                    Text(b).font(.system(size: fontSize, weight: .heavy))
                        .foregroundColor(Color.white).lineLimit(2).minimumScaleFactor(0.85)
                }
            } else {
                Text("(Open Dilly to load)").font(.system(size: fontSize - 1, weight: .semibold)).foregroundColor(Color.white.opacity(0.5))
            }
        }
    }

    private func formattedDate() -> String {
        let f = DateFormatter()
        f.dateFormat = "EEE, MMM d"
        return f.string(from: entry.date)
    }
}

// MARK: - Bundle

@main
struct DillyWidgetBundle: WidgetBundle {
    var body: some Widget {
        DillyQuestionWidget()
        OneMoveWidget()
        TonightWidget()
        DillyProfileWidget()
        MomentOfTruthWidget()
        DillySummaryWidget()
    }
}
