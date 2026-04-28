// DillyWidget.swift — Dilly's home-screen + lock-screen widget bundle.
//
// Three widgets. Each represents a different relationship with Dilly,
// available on the home screen at one specific size AND on the lock
// screen as accessory complications (iOS 16+):
//
//   HABIT   MomentOfTruthWidget
//           Home: small (2x2)
//           Lock: accessoryCircular (streak number with flame)
//                 accessoryInline ("🔥 14 day Dilly streak")
//
//   MEMORY  DillyProfileWidget
//           Home: medium (4x2)
//           Lock: accessoryRectangular ("Dilly remembers: <fact>")
//                 accessoryInline ("Dilly remembers <N> things")
//
//   MISSION DillyTodayWidget
//           Home: large (4x4)
//           Lock: accessoryRectangular ("Today: <one move>")
//                 accessoryInline ("Today's Dilly move ↗")
//
// No multi-size variants. No standalone Today's Question / One Move /
// Tonight / Summary widgets — that content lives inside Dilly Today
// (Large). Editorial decision to force the user into one widget per
// relationship instead of decision fatigue across 6 options.
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
import ActivityKit

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
    // forestPulse — small widget. Emerald growth/habit energy that
    //   stands apart from the large dusk + medium cream.
    // midnightAurora — large widget. 3-stop deep-navy → indigo → warm
    //   horizon glow. More sophisticated than the old 2-stop dusk.
    enum Mood { case lateNight, goldenHour, deepEvening, journalCream, vibrantAccent, dusk, forestPulse, midnightAurora }
    let mood: Mood
    let time: TimeOfDay
    var body: some View {
        ZStack {
            LinearGradient(colors: colors(), startPoint: .topLeading, endPoint: .bottomTrailing)
            // Subtle radial highlight in the upper-left adds dimension —
            // makes the gradient feel like a 3D surface rather than flat
            // paint. Very faint so it never competes with content.
            if hasHighlight {
                RadialGradient(
                    colors: [Color.white.opacity(0.18), Color.white.opacity(0)],
                    center: .topLeading, startRadius: 0, endRadius: 220
                ).blendMode(.softLight)
            }
        }
        .ignoresSafeArea()
    }
    private var hasHighlight: Bool {
        switch mood {
        case .midnightAurora, .forestPulse, .dusk, .lateNight, .deepEvening: return true
        default: return false
        }
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
        case .forestPulse:
            // Emerald → deep forest. Carries growth/habit energy
            // without competing with the small flame badge.
            switch time {
            case .morning: return [Color(hex: 0x6BC18A), Color(hex: 0x1F5235)]
            case .midday:  return [Color(hex: 0x4FAE76), Color(hex: 0x1A4530)]
            case .evening: return [Color(hex: 0x2F8A5C), Color(hex: 0x0F2E23)]
            case .night:   return [Color(hex: 0x1F5240), Color(hex: 0x05140E)]
            }
        case .midnightAurora:
            // 3-stop: deep midnight navy → indigo → warm aurora glow.
            // Reads like a premium night sky. The warm glow at the
            // bottom-right anchors it without making it look hot.
            switch time {
            case .morning: return [Color(hex: 0x4B6FB5), Color(hex: 0x2A2F70), Color(hex: 0xC56F8E)]
            case .midday:  return [Color(hex: 0x3A5398), Color(hex: 0x1F1F60), Color(hex: 0xA85878)]
            case .evening: return [Color(hex: 0x1F2D6A), Color(hex: 0x110F46), Color(hex: 0x7B2F58)]
            case .night:   return [Color(hex: 0x101535), Color(hex: 0x05071F), Color(hex: 0x3A1330)]
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

/// Seven dots, one per day of the week. Days before today are filled
/// based on streak depth (capped at 7). Today's dot pulses (faint
/// outline + slightly larger). Future days are dim. Reads at a glance:
/// "this is my week, this is where I am, this is what's left."
struct WeekDotsRow: View {
    let streakDays: Int
    let today: Int  // 1=Sun ... 7=Sat from Calendar
    var body: some View {
        HStack(spacing: 6) {
            ForEach(1...7, id: \.self) { day in
                dot(for: day)
            }
            Spacer(minLength: 0)
            Text(weekStreakLabel)
                .font(.system(size: 9, weight: .heavy)).tracking(0.8)
                .foregroundColor(Color.white.opacity(0.6))
        }
    }
    @ViewBuilder
    private func dot(for day: Int) -> some View {
        if day < today {
            // Past day this week — filled if streak covers it.
            let daysBack = today - day
            let filled = daysBack <= streakDays
            Circle()
                .fill(filled ? Color.white.opacity(0.9) : Color.white.opacity(0.18))
                .frame(width: 8, height: 8)
        } else if day == today {
            // Today — outlined ring with a small dot inside.
            ZStack {
                Circle().stroke(Color.white.opacity(0.85), lineWidth: 1.4).frame(width: 11, height: 11)
                Circle().fill(Color.white).frame(width: 4, height: 4)
            }
        } else {
            // Future day — faint outline only.
            Circle().stroke(Color.white.opacity(0.25), lineWidth: 1).frame(width: 8, height: 8)
        }
    }
    private var weekStreakLabel: String {
        if streakDays >= 7 { return "PERFECT WEEK" }
        if streakDays >= 3 { return "ON A ROLL" }
        if streakDays >= 1 { return "BUILDING" }
        return "START THIS WEEK"
    }
}

/// Hero streak ring. Outer trim shows progress toward a perfect
/// 7-day week. Inner shows the streak number + a flame. Replaces
/// the small flame chip with a real visual centerpiece.
struct StreakRing: View {
    let streakDays: Int
    var body: some View {
        let pct: CGFloat = min(1.0, CGFloat(streakDays) / 7.0)
        ZStack {
            Circle().stroke(Color.white.opacity(0.18), lineWidth: 4)
            Circle()
                .trim(from: 0, to: pct)
                .stroke(LinearGradient(
                    colors: [Color(hex: 0xFFD27A), Color(hex: 0xFF8E5C)],
                    startPoint: .top, endPoint: .bottomTrailing
                ), style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: -2) {
                Image(systemName: "flame.fill").font(.system(size: 12)).foregroundColor(Color(hex: 0xFFD27A))
                Text("\(streakDays)")
                    .font(.system(size: 20, weight: .black, design: .rounded))
                    .foregroundColor(Color.white)
                    .minimumScaleFactor(0.5)
            }
        }
    }
}

/// 7 day dots with weekday labels (M T W T F S S). Today's dot pulses
/// outline; past days fill based on streak; future days are dim.
/// Same idea as WeekDotsRow but bigger + with letter labels for the
/// large widget's hero presence.
struct WeekDotsRowLarge: View {
    let streakDays: Int
    let today: Int
    private let labels = ["S","M","T","W","T","F","S"]
    var body: some View {
        HStack(spacing: 0) {
            ForEach(1...7, id: \.self) { day in
                VStack(spacing: 5) {
                    Text(labels[day-1])
                        .font(.system(size: 8, weight: .heavy)).tracking(0.5)
                        .foregroundColor(Color.white.opacity(day == today ? 0.95 : 0.45))
                    dot(for: day)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 4)
    }
    @ViewBuilder
    private func dot(for day: Int) -> some View {
        if day < today {
            let daysBack = today - day
            let filled = daysBack <= streakDays
            Circle()
                .fill(filled ? Color.white.opacity(0.92) : Color.white.opacity(0.18))
                .frame(width: 10, height: 10)
        } else if day == today {
            ZStack {
                Circle().stroke(Color.white.opacity(0.9), lineWidth: 1.6).frame(width: 13, height: 13)
                Circle().fill(Color.white).frame(width: 5, height: 5)
            }
        } else {
            Circle().stroke(Color.white.opacity(0.30), lineWidth: 1).frame(width: 10, height: 10)
        }
    }
}

/// Card row used for the large widget's three info sections. Icon
/// in a tinted circle on the left, eyebrow + body text on the right,
/// glassy translucent background.
struct InfoCard: View {
    let eyebrow: String
    let text: String?
    let icon: String
    let accent: Color
    let italicStyle: Bool
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            ZStack {
                Circle().fill(accent.opacity(0.18)).frame(width: 32, height: 32)
                Image(systemName: icon).font(.system(size: 14, weight: .heavy)).foregroundColor(accent)
            }
            VStack(alignment: .leading, spacing: 2) {
                EyebrowLabel(text: eyebrow, tint: Color.white.opacity(0.65))
                if let t = text, !t.isEmpty {
                    if italicStyle {
                        Text(t).font(.system(size: 13, weight: .heavy, design: .serif)).italic()
                            .foregroundColor(Color.white).lineLimit(2).minimumScaleFactor(0.85)
                    } else {
                        Text(t).font(.system(size: 13, weight: .heavy))
                            .foregroundColor(Color.white).lineLimit(2).minimumScaleFactor(0.85)
                    }
                } else {
                    Text("Open Dilly to load.")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color.white.opacity(0.45))
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color.white.opacity(0.06)))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.08), lineWidth: 0.5))
    }
}

/// Full-widget constellation field. 9 stars + curved connecting
/// lines drift across the entire surface. Sits behind content with
/// soft opacity so it gives the large widget atmospheric depth
/// without competing with the data. The corner-only earlier version
/// felt like an afterthought; this one feels like the night sky.
struct ConstellationField: View {
    var body: some View {
        Canvas { ctx, size in
            // 9 hand-tuned star positions distributed across the
            // surface (avoiding the hot zones where text lives).
            let stars: [(CGFloat, CGFloat, CGFloat)] = [
                (0.08, 0.06, 1.6),
                (0.92, 0.04, 1.3),
                (0.18, 0.22, 2.2),
                (0.62, 0.10, 1.5),
                (0.85, 0.30, 1.9),
                (0.05, 0.55, 1.4),
                (0.45, 0.55, 1.7),
                (0.92, 0.62, 1.6),
                (0.30, 0.92, 1.5),
            ].map { ($0.0, $0.1, $0.2) }

            // Draw faint connecting curves between subsets of stars.
            let lineColor = Color.white.opacity(0.10)
            let connections: [(Int, Int)] = [(0, 2), (2, 3), (3, 4), (5, 6), (6, 7), (8, 6)]
            for (a, b) in connections {
                let pa = CGPoint(x: stars[a].0 * size.width, y: stars[a].1 * size.height)
                let pb = CGPoint(x: stars[b].0 * size.width, y: stars[b].1 * size.height)
                var p = Path()
                p.move(to: pa); p.addLine(to: pb)
                ctx.stroke(p, with: .color(lineColor), lineWidth: 0.5)
            }

            // Stars themselves (small filled circle + soft halo).
            for s in stars {
                let p = CGPoint(x: s.0 * size.width, y: s.1 * size.height)
                let r = s.2
                let halo = Path(ellipseIn: CGRect(x: p.x - r * 2.4, y: p.y - r * 2.4, width: r * 4.8, height: r * 4.8))
                let core = Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2))
                ctx.fill(halo, with: .color(Color.white.opacity(0.06)))
                ctx.fill(core, with: .color(Color.white.opacity(0.55)))
            }
        }
    }
}

/// Subtle constellation in the upper-right of the large widget.
/// Three stars connected by faint lines — adds atmospheric depth
/// without competing with content. Pure decoration.
struct ConstellationDecoration: View {
    var body: some View {
        Canvas { ctx, size in
            // Three star positions inside the frame.
            let p1 = CGPoint(x: size.width * 0.18, y: size.height * 0.30)
            let p2 = CGPoint(x: size.width * 0.55, y: size.height * 0.55)
            let p3 = CGPoint(x: size.width * 0.85, y: size.height * 0.20)
            // Lines between them — very faint.
            var path = Path()
            path.move(to: p1); path.addLine(to: p2)
            path.move(to: p2); path.addLine(to: p3)
            ctx.stroke(path, with: .color(Color.white.opacity(0.18)), lineWidth: 0.6)
            // Stars (small filled circles + faint glow).
            for (p, r) in [(p1, 1.6), (p2, 2.2), (p3, 1.8)] {
                let core = Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2))
                let halo = Path(ellipseIn: CGRect(x: p.x - r * 2.2, y: p.y - r * 2.2, width: r * 4.4, height: r * 4.4))
                ctx.fill(halo, with: .color(Color.white.opacity(0.10)))
                ctx.fill(core, with: .color(Color.white.opacity(0.85)))
            }
        }
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
        .supportedFamilies([.systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

struct DillyProfileView: View {
    @Environment(\.widgetFamily) var family
    let entry: DillyEntry

    @ViewBuilder
    private var lockRectangular: some View {
        // Lock-screen rectangular accessory (~160x55pt). Single line
        // of "Dilly remembers: <fact>" with a tiny header. Truncates.
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 3) {
                Image(systemName: "book.closed").font(.system(size: 9, weight: .heavy))
                Text("DILLY REMEMBERS").font(.system(size: 9, weight: .black)).tracking(0.8)
            }
            if let fact = surfacedFact {
                Text(fact)
                    .font(.system(size: 12, weight: .semibold, design: .serif))
                    .italic()
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
            } else {
                Text("Tell Dilly more about you.").font(.system(size: 12)).foregroundColor(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(URL(string: "dilly:///(app)/my-dilly-profile"))
    }

    @ViewBuilder
    private var lockInline: some View {
        // Above-the-time text strip (~30 chars max).
        if let n = entry.data.profileFactCount, n > 0 {
            Text("Dilly remembers \(n) things about you")
        } else {
            Text("Dilly is learning about you")
        }
    }


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
        switch family {
        case .accessoryRectangular: lockRectangular
        case .accessoryInline:      lockInline
        default:                    homeMedium
        }
    }

    private var homeMedium: some View {
        // Two-column layout: a visual identity block on the left
        // (face + count + category ring), a quote-style fact on the
        // right with category pills and freshness indicator.
        HStack(alignment: .top, spacing: 12) {
            // ── LEFT COLUMN — identity + visual count ──────────
            VStack(alignment: .leading, spacing: 6) {
                EyebrowLabel(text: "DILLY REMEMBERS", tint: inkSecondary)
                ZStack {
                    // Background ring showing how filled out the
                    // profile is (categories covered out of ~24 total).
                    Circle()
                        .stroke(inkPrimary.opacity(0.12), lineWidth: 6)
                        .frame(width: 76, height: 76)
                    Circle()
                        .trim(from: 0, to: categoryCompletion)
                        .stroke(LinearGradient(
                            colors: [Color(hex: 0xE5B143), Color(hex: 0xC78A3A)],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        ), style: StrokeStyle(lineWidth: 6, lineCap: .round))
                        .frame(width: 76, height: 76)
                        .rotationEffect(.degrees(-90))
                    VStack(spacing: -2) {
                        Text("\(entry.data.profileFactCount ?? 0)")
                            .font(.system(size: 26, weight: .black, design: .rounded))
                            .foregroundColor(inkPrimary)
                            .minimumScaleFactor(0.6)
                        Text("facts")
                            .font(.system(size: 9, weight: .heavy)).tracking(1.0)
                            .foregroundColor(inkSecondary)
                    }
                }
                HStack(spacing: 4) {
                    Image(systemName: "square.grid.3x3.fill")
                        .font(.system(size: 8)).foregroundColor(inkSecondary)
                    Text("\(entry.data.profileCategoryCount ?? 0) categories")
                        .font(.system(size: 10, weight: .heavy)).tracking(0.4)
                        .foregroundColor(inkSecondary)
                }
            }
            .frame(width: 100, alignment: .leading)

            // ── RIGHT COLUMN — quote + category pills + freshness ──
            VStack(alignment: .leading, spacing: 8) {
                if let fact = surfacedFact {
                    Text("\u{201C}\(fact)\u{201D}")
                        .font(.system(size: 13, weight: .semibold, design: .serif))
                        .italic().foregroundColor(inkPrimary).lineSpacing(2)
                        .lineLimit(4).minimumScaleFactor(0.85)
                } else {
                    EmptyHint(icon: "book.closed", line: "Tell Dilly about you and your profile fills in here.")
                }
                Spacer(minLength: 0)
                // Category pill row — pulls from latest category if
                // available, otherwise shows a couple of common ones.
                HStack(spacing: 4) {
                    ForEach(displayCategories, id: \.self) { cat in
                        Text(cat.uppercased())
                            .font(.system(size: 8, weight: .black)).tracking(0.6)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(Capsule().fill(inkPrimary.opacity(0.10)))
                            .foregroundColor(inkSecondary)
                    }
                    Spacer(minLength: 0)
                }
                if let date = entry.data.profileLatestFactDate, !date.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "circle.fill")
                            .font(.system(size: 5))
                            .foregroundColor(Color(hex: 0xE5B143))
                        Text("Latest capture · \(date)")
                            .font(.system(size: 9, weight: .heavy)).tracking(0.8)
                            .foregroundColor(inkSecondary)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(URL(string: "dilly:///(app)/my-dilly-profile"))
    }

    // ~24 is the rough total category count Dilly tracks. Used to
    // visualize "how filled out is the profile" in the ring chart.
    private var categoryCompletion: CGFloat {
        let cats = CGFloat(entry.data.profileCategoryCount ?? 0)
        return min(1.0, cats / 24.0)
    }

    // Latest category gets shown first; fall back to a default mix.
    private var displayCategories: [String] {
        var out: [String] = []
        if let latest = entry.data.profileLatestFactCategory, !latest.isEmpty {
            out.append(latest.replacingOccurrences(of: "_", with: " "))
        }
        for d in ["goal", "trait"] where !out.contains(where: { $0.lowercased() == d }) {
            out.append(d)
        }
        return Array(out.prefix(3))
    }
}

// MARK: - 5) Moment of Truth

struct MomentOfTruthWidget: Widget {
    let kind = "MomentOfTruthWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DillyProvider()) { entry in
            MomentOfTruthView(entry: entry)
                .containerBackground(for: .widget) { WidgetGradient(mood: .forestPulse, time: entry.timeOfDay) }
        }
        .configurationDisplayName("Moment of Truth")
        .description("One question a day. Build the streak.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryInline])
    }
}

struct MomentOfTruthView: View {
    @Environment(\.widgetFamily) var family
    let entry: DillyEntry

    @ViewBuilder
    private var lockCircular: some View {
        // Lock-screen circular accessory (~52x52pt). Streak number with
        // flame — the iOS Fitness-rings of habit. Glanceable from the
        // lock screen every time the user picks up the phone.
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: -1) {
                Image(systemName: "flame.fill").font(.system(size: 12, weight: .heavy))
                Text("\(entry.data.truthStreakDays ?? 0)")
                    .font(.system(size: 18, weight: .black, design: .rounded))
                    .minimumScaleFactor(0.6)
            }
        }
        .widgetURL(URL(string: "dilly:///(app)"))
    }

    @ViewBuilder
    private var lockInline: some View {
        if let s = entry.data.truthStreakDays, s > 0 {
            Text("🔥 \(s) day Dilly streak")
        } else {
            Text("Start your Dilly streak today")
        }
    }

    var body: some View {
        switch family {
        case .accessoryCircular:    lockCircular
        case .accessoryInline:      lockInline
        default:                    homeSmall
        }
    }

    private var homeSmall: some View {
        let streak = entry.data.truthStreakDays ?? 0
        let today = Calendar.current.component(.weekday, from: entry.date)
        return VStack(alignment: .leading, spacing: 6) {
            // ── HEADER: eyebrow + streak ring ─────────────────
            HStack(alignment: .center, spacing: 6) {
                EyebrowLabel(text: "MOMENT OF TRUTH", tint: Color.white.opacity(0.92))
                Spacer()
                ZStack {
                    Circle().stroke(Color.white.opacity(0.20), lineWidth: 2.5)
                        .frame(width: 26, height: 26)
                    Circle()
                        .trim(from: 0, to: min(1.0, CGFloat(streak) / 7.0))
                        .stroke(Color.white, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                        .frame(width: 26, height: 26)
                        .rotationEffect(.degrees(-90))
                    Text("\(streak)")
                        .font(.system(size: 11, weight: .black, design: .rounded))
                        .foregroundColor(Color.white)
                }
            }

            // ── QUESTION (italic serif, the hero) ─────────────
            if let q = entry.data.truthQuestion, !q.isEmpty {
                Text(q)
                    .font(.system(size: 13, weight: .heavy, design: .serif))
                    .foregroundColor(Color.white)
                    .lineLimit(4).minimumScaleFactor(0.85).padding(.top, 2)
            } else {
                EmptyHint(icon: "questionmark.circle", line: "Today's question will appear here.")
            }

            Spacer(minLength: 0)

            // ── MINI WEEK BAR — visual streak indicator ───────
            HStack(spacing: 4) {
                ForEach(1...7, id: \.self) { day in
                    if day < today {
                        let filled = (today - day) <= streak
                        Capsule()
                            .fill(filled ? Color.white.opacity(0.92) : Color.white.opacity(0.18))
                            .frame(width: 10, height: 4)
                    } else if day == today {
                        Capsule().fill(Color.white).frame(width: 14, height: 4)
                    } else {
                        Capsule().fill(Color.white.opacity(0.20)).frame(width: 10, height: 4)
                    }
                }
                Spacer(minLength: 0)
            }

            // ── ACTION ROW ────────────────────────────────────
            if entry.data.truthAnswered != true, entry.data.truthQuestion != nil {
                Button(intent: AnswerTruthIntent(answer: true)) {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark").font(.system(size: 10, weight: .heavy))
                        Text("Yes, today").font(.system(size: 11, weight: .heavy))
                    }
                    .foregroundColor(Color(hex: 0x0F2E23)).padding(.horizontal, 10).padding(.vertical, 6)
                    .background(Color.white).clipShape(Capsule())
                }
                .buttonStyle(.plain)
            } else if entry.data.truthAnswered == true {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark.seal.fill").font(.system(size: 10)).foregroundColor(Color.white)
                    Text("Logged today").font(.system(size: 10, weight: .heavy)).tracking(0.6).foregroundColor(Color.white.opacity(0.85))
                }
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

struct DillyTodayWidget: Widget {
    let kind = "DillyTodayWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DillyProvider()) { entry in
            DillyTodayView(entry: entry)
                .containerBackground(for: .widget) { WidgetGradient(mood: .midnightAurora, time: entry.timeOfDay) }
        }
        .configurationDisplayName("Dilly Today")
        .description("Today's Question, your One Move, and Tonight's 15 minutes — all in one.")
        .supportedFamilies([.systemLarge, .accessoryRectangular, .accessoryInline])
    }
}

struct DillyTodayView: View {
    @Environment(\.widgetFamily) var family
    let entry: DillyEntry

    @ViewBuilder
    private var lockRectangular: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 3) {
                Image(systemName: "flag.checkered").font(.system(size: 9, weight: .heavy))
                Text("TODAY · ONE MOVE").font(.system(size: 9, weight: .black)).tracking(0.8)
            }
            if let move = entry.data.oneMoveTitle, !move.isEmpty {
                Text(move).font(.system(size: 12, weight: .heavy)).lineLimit(2).minimumScaleFactor(0.8)
            } else if let q = entry.data.todaysQuestion, !q.isEmpty {
                Text(q).font(.system(size: 12, weight: .semibold, design: .serif)).italic()
                    .lineLimit(2).minimumScaleFactor(0.8)
            } else {
                Text("Open Dilly to load today.").font(.system(size: 12)).foregroundColor(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(URL(string: entry.data.oneMoveDeepLink ?? "dilly:///(app)"))
    }

    @ViewBuilder
    private var lockInline: some View {
        if let move = entry.data.oneMoveTitle, !move.isEmpty {
            Text("Dilly · \(move)")
        } else {
            Text("Open Dilly for today's move")
        }
    }

    var body: some View {
        switch family {
        case .accessoryRectangular: lockRectangular
        case .accessoryInline:      lockInline
        default:                    homeLarge
        }
    }

    private var homeLarge: some View {
        // Layered design — full-bleed constellation field overlays the
        // gradient background, then content sits on top. Hero ring,
        // day-label habit row, three info cards, then a quote footer.
        ZStack {
            // Full-widget constellation field (not just a corner). 9
            // stars + curved connecting lines drift across the whole
            // surface for "night sky" feel. Sits BEHIND content with
            // low opacity so it never competes.
            ConstellationField()

            VStack(alignment: .leading, spacing: 12) {
                // ── HERO BAND: face + day/title + streak ring ──
                HStack(alignment: .center, spacing: 12) {
                    ZStack {
                        // Soft halo behind the face — premium glow.
                        Circle()
                            .fill(RadialGradient(
                                colors: [Color.white.opacity(0.22), Color.white.opacity(0)],
                                center: .center, startRadius: 0, endRadius: 36))
                            .frame(width: 72, height: 72)
                        DillyFaceView(size: 52, mood: .warm, accessory: .none,
                            inkColor: Color.white,
                            ringColor: Color.white.opacity(0.55),
                            ringFill: Color.white.opacity(0.10))
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        EyebrowLabel(text: "DILLY · TODAY", tint: Color.white.opacity(0.9))
                        Text(formattedDate())
                            .font(.system(size: 13, weight: .heavy))
                            .foregroundColor(Color.white)
                        Text(greeting())
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(Color.white.opacity(0.65))
                    }
                    Spacer()
                    StreakRing(streakDays: entry.data.truthStreakDays ?? 0)
                        .frame(width: 60, height: 60)
                }

                // ── HABIT WEEK with day labels ──
                WeekDotsRowLarge(
                    streakDays: entry.data.truthStreakDays ?? 0,
                    today: Calendar.current.component(.weekday, from: entry.date)
                )

                // ── THREE INFO CARDS ──
                VStack(spacing: 6) {
                    InfoCard(
                        eyebrow: "TODAY · QUESTION",
                        text: entry.data.todaysQuestion,
                        icon: "moon.stars.fill",
                        accent: Color(hex: 0xC0A4FF),
                        italicStyle: true
                    )
                    InfoCard(
                        eyebrow: "THIS WEEK · ONE MOVE",
                        text: entry.data.oneMoveTitle,
                        icon: "flag.checkered",
                        accent: Color(hex: 0xFFC078),
                        italicStyle: false
                    )
                    InfoCard(
                        eyebrow: "TONIGHT · 15 MIN",
                        text: entry.data.tonightTitle,
                        icon: "play.circle.fill",
                        accent: Color(hex: 0x7AC6E8),
                        italicStyle: false
                    )
                }

                Spacer(minLength: 0)

                // ── QUOTE FOOTER — recent win in italic serif ──
                recentSignalFooter
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(URL(string: "dilly:///(app)"))
    }

    private func greeting() -> String {
        switch entry.timeOfDay {
        case .morning: return "Good morning. Here's your day."
        case .midday:  return "Mid-day check-in."
        case .evening: return "Evening reflection."
        case .night:   return "Late-night clarity."
        }
    }

    @ViewBuilder
    private var recentSignalFooter: some View {
        if let recent = (entry.data.profileRecentFacts ?? []).first, !recent.isEmpty {
            HStack(spacing: 6) {
                Image(systemName: "sparkle").font(.system(size: 10, weight: .heavy)).foregroundColor(Color.white.opacity(0.65))
                Text(recent)
                    .font(.system(size: 11, weight: .semibold, design: .serif)).italic()
                    .foregroundColor(Color.white.opacity(0.82))
                    .lineLimit(1).truncationMode(.tail)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 8).padding(.vertical, 6)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.06)))
        } else {
            HStack { Spacer()
                Text("Tap to open Dilly").font(.system(size: 10, weight: .heavy)).tracking(1.0).foregroundColor(Color.white.opacity(0.7))
            }
        }
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

// MARK: - Live Activities (Chapter sessions)

/// Live Activity for an in-progress Chapter session — the weekly
/// advisory ritual. Shows on the lock screen as a banner, in the
/// Dynamic Island as compact + expanded regions, and ends gracefully
/// when the user finishes Screen 5 (or 5+ minutes after no activity).
///
/// The mobile app starts/updates/ends this activity via a tiny
/// ActivityKit native module. While active, the user sees their
/// Chapter progress without opening the app — same psychology as
/// Apple Maps "navigation in progress" or Apple Music "song playing."

struct ChapterActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var currentScreen: Int
        var totalScreens: Int
        var screenLabel: String   // e.g., "Surface", "Synthesis", "Recap"
        var startedAt: Date       // for elapsed-time computation
    }

    var chapterId: String
    var chapterTitle: String      // e.g., "Chapter 4 · Apr 27"
}

@available(iOS 16.2, *)
struct ChapterLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ChapterActivityAttributes.self) { context in
            // Lock-screen / banner presentation
            ChapterLockBannerView(
                state: context.state,
                attributes: context.attributes
            )
            .activityBackgroundTint(Color(hex: 0x1A0E40))
            .activitySystemActionForegroundColor(Color.white)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded (when user long-presses or activity is most recent)
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        DillyFaceView(
                            size: 36, mood: .focused, accessory: .pencil,
                            inkColor: Color(hex: 0xE2D6FF),
                            ringColor: Color(hex: 0xE2D6FF).opacity(0.4),
                            ringFill: Color.clear
                        )
                        VStack(alignment: .leading, spacing: 0) {
                            Text("CHAPTER")
                                .font(.system(size: 8, weight: .black))
                                .tracking(1.0)
                                .foregroundColor(Color.white.opacity(0.6))
                            Text(context.state.screenLabel.uppercased())
                                .font(.system(size: 13, weight: .heavy))
                                .foregroundColor(Color.white)
                        }
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 0) {
                        Text("\(context.state.currentScreen) / \(context.state.totalScreens)")
                            .font(.system(size: 18, weight: .black, design: .rounded))
                            .foregroundColor(Color.white)
                        Text("screens")
                            .font(.system(size: 9, weight: .heavy))
                            .tracking(0.8)
                            .foregroundColor(Color.white.opacity(0.6))
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    // Progress bar — visual stripe across the bottom
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Color.white.opacity(0.15))
                                .frame(height: 4)
                            Capsule()
                                .fill(Color(hex: 0xE2D6FF))
                                .frame(
                                    width: geo.size.width * progressFraction(state: context.state),
                                    height: 4
                                )
                        }
                    }
                    .frame(height: 4)
                    .padding(.top, 4)
                }
            } compactLeading: {
                // Compact left side (when island is small + active)
                Image(systemName: "moon.stars.fill")
                    .foregroundColor(Color(hex: 0xE2D6FF))
            } compactTrailing: {
                Text("\(context.state.currentScreen)/\(context.state.totalScreens)")
                    .font(.system(size: 12, weight: .heavy, design: .rounded))
                    .foregroundColor(Color(hex: 0xE2D6FF))
            } minimal: {
                // Tiny circular dot when island is showing multiple activities
                Image(systemName: "moon.stars.fill")
                    .foregroundColor(Color(hex: 0xE2D6FF))
            }
            .keylineTint(Color(hex: 0xE2D6FF))
            .widgetURL(URL(string: "dilly:///(app)/chapter"))
        }
    }

    private func progressFraction(state: ChapterActivityAttributes.ContentState) -> Double {
        let total = max(1, state.totalScreens)
        return min(1.0, max(0.0, Double(state.currentScreen) / Double(total)))
    }
}

@available(iOS 16.2, *)
struct ChapterLockBannerView: View {
    let state: ChapterActivityAttributes.ContentState
    let attributes: ChapterActivityAttributes

    var body: some View {
        HStack(spacing: 12) {
            DillyFaceView(
                size: 48, mood: .focused, accessory: .pencil,
                inkColor: Color(hex: 0xE2D6FF),
                ringColor: Color(hex: 0xE2D6FF).opacity(0.4),
                ringFill: Color.white.opacity(0.05)
            )
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Image(systemName: "moon.stars.fill")
                        .font(.system(size: 10, weight: .heavy))
                        .foregroundColor(Color(hex: 0xC9B8FF))
                    Text("CHAPTER IN SESSION")
                        .font(.system(size: 9, weight: .black))
                        .tracking(1.4)
                        .foregroundColor(Color(hex: 0xC9B8FF))
                }
                Text(state.screenLabel)
                    .font(.system(size: 17, weight: .heavy, design: .serif))
                    .foregroundColor(Color.white)
                    .lineLimit(1)
                Text("\(state.currentScreen) of \(state.totalScreens) · \(elapsedString())")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Color.white.opacity(0.7))
            }
            Spacer()
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
    }

    private func elapsedString() -> String {
        let secs = max(0, Int(Date().timeIntervalSince(state.startedAt)))
        let m = secs / 60
        return m == 0 ? "just started" : (m == 1 ? "1 min" : "\(m) min")
    }
}


// MARK: - Bundle

@main
struct DillyWidgetBundle: WidgetBundle {
    var body: some Widget {
        // SMALL — habit. The daily streak/question loop.
        MomentOfTruthWidget()
        // MEDIUM — memory. The rotating "Dilly remembers..." recall.
        DillyProfileWidget()
        // LARGE — mission. Question + One Move + Tonight in one panel.
        DillyTodayWidget()
        // Live activity — Chapter session in progress (Dynamic Island
        // + lock-screen banner). Available on iOS 16.2+; on older
        // OSes the bundle entry is skipped at runtime.
        if #available(iOS 16.2, *) {
            ChapterLiveActivityWidget()
        }
    }
}
