---
name: Phase 9-10 handoff for Mac Mini
description: Complete context for testing phases 1-8 and continuing phases 9-10 of the page.tsx refactor on Mac Mini
type: project
---

# page.tsx Refactor — Mac Mini Handoff

## Repo & Branch
- **Repo:** `Dilan1234321/dilly-workspace` (main branch)
- **File:** `projects/dilly/dashboard/src/app/page.tsx`
- **Started at:** 9,643 lines, 157 useState, 75 useEffects
- **Current:** 3,329 lines (65% reduction)
- **Latest commit:** `c85df74` — extract Hiring and Practice tabs [phase 8g-h]

## Setup
```bash
git pull origin main
npm install   # from workspace root (not from dashboard — @dilly/api is a local workspace package)
cd projects/dilly/dashboard
npm run dev
```

---

## What to Test (Phases 1-8)

### Quick smoke test — hit every extracted tab:

1. **Career Center** (`mainAppTab === "center"`)
   - Profile header renders (name, photo, track)
   - Feed cards load
   - "More" section expands
   - CenterTab.tsx (2,240 lines) — `src/features/center/CenterTab.tsx`

2. **Hiring tab** (`mainAppTab === "hiring"`)
   - Upload a PDF resume → progress bar → audit completes → navigates to report
   - Try paste mode: paste 50+ words → "Run audit" → completes
   - Cancel during upload works
   - "Taking longer" message shows after 60s (can test by throttling network)
   - Back button from upload returns to score home
   - HiringTab.tsx (1,209 lines) — `src/features/hiring/HiringTab.tsx`

3. **Hiring → Insights** (`reviewSubView === "insights"`)
   - Score trajectory, progress to next tier, before & after
   - Dilly's take, strongest signal, milestones
   - Progress over time chart (recharts LineChart)
   - Audit history list — tap opens report
   - Target firms — set and clear
   - Quick tips accordion

4. **Hiring → Dimensions** (`reviewSubView === "dimensions"`)
   - Score breakdown per Smart/Grit/Build
   - DimensionBreakdown component renders for each
   - "Back to Score" navigates correctly
   - "See full report" button works

5. **Calendar** (`mainAppTab === "calendar"`)
   - Month navigation, day selection
   - Add/rename/delete deadlines and sub-deadlines
   - CalendarTab.tsx (647 lines) — `src/features/calendar/CalendarTab.tsx`

6. **Resources / Get Hired** (`mainAppTab === "resources"`)
   - Applications section, Jobs panel
   - Job search checklist persists to localStorage
   - "Am I Ready?" runs and shows result
   - Sub-tabs: applications, jobs, playbook
   - ResourcesTab.tsx (495 lines) — `src/features/resources/ResourcesTab.tsx`

7. **Rank / Leaderboard** (`mainAppTab === "rank"`)
   - Leaderboard loads for user's track
   - Global view toggle works
   - Cached data loads from localStorage
   - RankTab.tsx (321 lines) — `src/features/rank/RankTab.tsx`

8. **Practice** (`mainAppTab === "practice"`)
   - Mock Interview button launches Voice
   - All 4 practice prompts launch Voice
   - "Ask Dilly AI" button works
   - PracticeTab.tsx (134 lines) — `src/features/practice/PracticeTab.tsx`

9. **Voice** (`mainAppTab === "voice"`)
   - Recording works (test on native Capacitor too)
   - Rich replies render
   - Overlay open/close
   - VoiceTab.tsx (2,637 lines) — `src/features/voice/VoiceTab.tsx`

10. **Deep links (critical — these touch cross-component state)**
    - `/?tab=upload&paste=1` → Hiring tab, paste mode active, file cleared
    - `/?tab=insights` → Hiring tab, Insights sub-view
    - `/?tab=resources&view=applications` → Resources tab, scrolls to applications
    - `/?tab=resources&view=certifications` → Certifications tab
    - `/?tab=resources&view=playbook` → Career Playbook tab
    - `/?tab=calendar` → Calendar tab
    - `/?tab=practice` → Practice tab
    - `/?tab=score` → Score tab
    - `/?tab=voice` → Career Center (voice deep links go to center, not voice)
    - `/?audit_refresh=1` → Refreshes centerRefreshKey

11. **Cross-tab state**
    - Run audit → Career Center shows updated scores
    - Run audit → Leaderboard refresh triggered (sessionStorage flag)
    - Voice notification appears after audit ("I noted your new audit...")
    - Profile edit saves → reflected in Center and other tabs

### Known risk area
The URL-sync logic (lines ~340-450 in current page.tsx) sets `file`, `pasteMode`, `pasteText`, `wantsNewAudit` which are now props passed to HiringTab. If `/?tab=upload&paste=1` doesn't work, the issue is that page.tsx sets these states before HiringTab mounts.

---

## Architecture After Phases 1-8

```
src/
  app/page.tsx                    (3,329 lines — THE REMAINING WORK)
  contexts/
    NavigationContext.tsx          (156 lines) — mainAppTab, reviewSubView, getHiredSubTab, etc.
    AuditScoreContext.tsx          (111 lines) — audit, lastAudit, savedAuditForCenter, viewingAudit, auditHistory, etc.
    VoiceContext.tsx               (268 lines) — 42 voice states
  context/
    AppContext.tsx                 (expanded) — user, authLoading, allowMainApp, onboardingNeeded, profileFetchDone, appProfile, school, theme
  components/
    Providers.tsx                  (34 lines) — ErrorBoundary > AppProvider > NavigationProvider > AuditScoreProvider > VoiceProvider > DillyVoiceNotificationProvider > ToastProvider
  features/
    voice/VoiceTab.tsx             (2,637 lines)
    center/CenterTab.tsx           (2,240 lines)
    hiring/HiringTab.tsx           (1,209 lines)
    calendar/CalendarTab.tsx       (647 lines)
    resources/ResourcesTab.tsx     (495 lines)
    rank/RankTab.tsx               (321 lines)
    practice/PracticeTab.tsx       (134 lines)
```

---

## Phase 9: Slim page.tsx to ~150-line Shell

### What's still in page.tsx (~3,329 lines):

**Shared functions that multiple tabs consume (passed as props):**
- `openVoiceWithNewChat` (~30 lines) — creates new voice convo, opens it
- `openVoiceFromScreen` (~15 lines) — opens voice with screen context
- `buildVoiceContext` (~80 lines) — assembles context blob for voice API
- `saveProfile` (~80 lines) — PATCH /profile + optimistic local updates
- `endVoiceMockInterviewByUser` — ends mock interview session
- `mergeVoiceAutoSavedDeadlines` — syncs voice-created deadlines to profile
- `navigateToAuditReport` / `replaceToAuditReport` / `goToStandaloneFullAuditReport`
- `voiceStarterSuggestions` (computed)

**Profile edit flow (~400+ lines):**
- `mainAppTab === "edit"` IIFE — full profile editor
- `mainAppTab === "profile_details"` — profile details view
- 15+ edit states: editName, editMajors, editMinors, editTrack, editPreProfessional, editCareerGoal, editJobLocations, editJobLocationScope, editLinkedIn, editProfileSaving, primaryGoalSaving/Input/Editing, appTargetLabelEditing/Input/Saving
- Profile photo upload: profilePhotoUrl, profilePhotoUploading, photoCropImageSrc, photoInputRef

**Settings / sticker sheet:**
- `mainAppTab === "settings"` renders the settings page (mostly delegated to a component)
- Sticker sheet modal: stickerSheetOpen, toggleStickerShareCard, achievement states

**Voice overlay wiring (~200 lines):**
- VoiceOverlay component rendering
- Voice overlay open/close/transition logic
- voiceEndRef, voiceSendRef, voiceOverlayActionsRef
- Voice session capture, conversation output, action items panel

**Onboarding (~300 lines):**
- School selection flow
- onboardingNeeded, profileFetchDone checks
- Initial profile setup

**Auth & lifecycle (~200 lines):**
- Auth check useEffect (token from URL, localStorage, API validation)
- Capacitor App listeners (URL open, back button, state change)
- Online/offline detection
- Profile fetch on mount
- Deep link URL-sync useEffect

**Cohort pulse, habits, proactive nudges, recommended jobs:**
- API fetch useEffects for these data sources
- State declarations

**Bottom nav bar rendering**

### Extraction order for Phase 9:

1. **Extract `ProfileEditTab.tsx`** (~400 lines)
   - All edit* states move in
   - Profile photo upload logic moves in
   - Consumes AppContext, AuditScoreContext
   - Props: saveProfile, profilePhotoUrl/setProfilePhotoUrl

2. **Extract `SettingsView.tsx`** (if not already a component — check)
   - Sticker sheet modal + achievement picker

3. **Extract `VoiceOverlayWrapper.tsx`** (~200 lines)
   - VoiceOverlay rendering + refs + session capture logic

4. **Extract `OnboardingFlow.tsx`** (~300 lines)
   - School selection, initial setup

5. **Create `useAppLifecycle.ts`** hook (~200 lines)
   - Auth check
   - Capacitor listeners
   - Profile fetch
   - Online/offline
   - Deep link URL-sync

6. **Create `useVoiceOrchestrator.ts`** hook
   - openVoiceWithNewChat, openVoiceFromScreen, buildVoiceContext
   - Voice session management functions
   - These are the hardest to extract — they touch many contexts

7. **Create `TabRouter.tsx`**
   - Switch/case for all tabs
   - Each case renders the extracted component with its props

8. **Final page.tsx** (~150 lines):
   ```tsx
   "use client";
   import { useAppLifecycle } from "@/hooks/useAppLifecycle";
   import { TabRouter } from "@/app/TabRouter";

   export default function Page() {
     const lifecycle = useAppLifecycle();
     if (lifecycle.loading) return <LoadingScreen />;
     if (!lifecycle.user) return null;
     return <TabRouter />;
   }
   ```

### Critical gotcha for Phase 9:
The shared functions (`openVoiceWithNewChat`, `buildVoiceContext`, `saveProfile`) reference 10+ context values and local state. The cleanest approach is to make them hooks that consume contexts directly, so tabs don't need to receive them as props. For example:
- `useVoiceActions()` → returns `openVoiceWithNewChat`, `openVoiceFromScreen`, `buildVoiceContext`
- `useProfileActions()` → returns `saveProfile`

This would let tabs call `const { openVoiceWithNewChat } = useVoiceActions()` instead of receiving it as a prop, dramatically simplifying the prop chains.

---

## Phase 10: Cleanup

### Split dillyUtils.ts (996 lines, 47 exports)
- `scoreUtils.ts` — scoreColor, gapToNextLevel, computeScoreTrajectory, scoresCrossedMilestones, progressPercentTowardTop25Rank
- `auditUtils.ts` — auditStorageKey, stashAuditForReportHandoff, minimalAuditFromHistorySummary, readLastAtsScoreCache, writeLastAtsScoreCache
- `voiceUtils.ts` — voiceStorageKey, getDillyVoiceEmptyGreeting, hasCompletedDillyVoiceIntro, markDillyVoiceIntroSeen
- `shareUtils.ts` — generateBadgeSvg, generateShareCardSvg, downloadSvg, svgToPngFile, copyTextSync
- `profileUtils.ts` — profilePhotoCacheKey, setCareerCenterReturnPath, topPercentileHeadline, oneLineSummary
- `formatUtils.ts` — safeUuid, getTopThreeActions, toNaturalSuggestion, getMilestoneNudge
- Keep barrel re-export `dillyUtils.ts` that re-exports everything for backward compat

### Co-locate API endpoints
- Move audit API calls into `features/hiring/useAuditApi.ts`
- Move voice API calls into `features/voice/useVoiceApi.ts`
- Move profile API calls into `hooks/useProfileApi.ts`
- Move leaderboard API calls into `features/rank/useLeaderboardApi.ts`

### Audit globals.css (1,786 lines)
- Move feature-specific styles into CSS modules or co-located files
- Keep only global resets and CSS variables in globals.css

---

## Extraction Pattern (for continuing)
1. Find the tab's conditional block in page.tsx (`mainAppTab === "xyz"`)
2. Read the full IIFE to identify all dependencies (contexts, page-level functions, refs)
3. Create `src/features/{name}/{Name}Tab.tsx` as a "use client" component
4. Component consumes contexts directly via hooks (useAppContext, useAuditScore, useVoice, useNavigation)
5. Page-level dependencies (functions, refs, computed values) passed as props
6. Replace the IIFE in page.tsx with `<NameTab ... />`
7. Commit: `refactor(dashboard): extract {Name} into {Name}.tsx [phase 9x]`

## Important Notes
- `@dilly/api` is a local workspace package — `npm install` must run from workspace root
- Next.js 16 / React 19 / Tailwind 4 / Capacitor
- The local `type User` was removed from page.tsx — it matches `@dilly/api` User type
- VoiceMockInterviewSession type moved to VoiceContext
- Phase 3 (UIContext/ModalManager) was skipped — modal states migrate with their feature tabs
- Phase 5 (ProfileContext) was skipped — appProfile is already in AppContext
- `tsc --noEmit` after every commit for type checking
