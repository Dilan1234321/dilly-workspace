# Animated State Icons — Implementation Summary

## Component Location

`projects/meridian/dashboard/src/components/ui/animated-state-icons.tsx`

## All 12 Icons (with `state` prop for controlled usage)

| Icon | Export | Controlled `state` | Description |
|------|--------|-------------------|-------------|
| 1 | `SuccessIcon` | `state={true}` = done | Loading spinner → checkmark |
| 2 | `MenuCloseIcon` | `state={true}` = open | Hamburger → X |
| 3 | `PlayPauseIcon` | `state={true}` = playing | Play → Pause |
| 4 | `LockUnlockIcon` | `state={true}` = unlocked | Lock → Unlock |
| 5 | `CopiedIcon` | `state={true}` = copied | Clipboard lines → checkmark |
| 6 | `NotificationIcon` | `state={true}` = has notification | Bell → bell + red dot |
| 7 | `HeartIcon` | `state={true}` = filled | Outline heart → filled |
| 8 | `DownloadDoneIcon` | `state={true}` = done | Download arrow → checkmark |
| 9 | `SendIcon` | `state={true}` = sent | Paper plane → flies off |
| 10 | `ToggleIcon` | `state={true}` = on | Switch off → on |
| 11 | `EyeToggleIcon` | `state={true}` = hidden | Eye → eye with slash |
| 12 | `VolumeIcon` | `state={true}` = muted | Volume waves → mute X |

When `state` is omitted, each icon auto-toggles on its `duration` interval (demo mode).

---

## Where Each Icon Is Implemented

### In-app integrations

| Icon | Location | Usage |
|------|----------|-------|
| **CopiedIcon** | `DimensionBreakdown.tsx` → CopyableEvidence | Copy button for cited evidence snippets. Shows clipboard → checkmark when copied. |
| **SendIcon** | `meridian-voice-prompt.tsx` | Send button in Meridian Voice chat input. Paper plane icon. |
| **SuccessIcon** | `page.tsx` → audit progress | When audit completes, shows checkmark for 1.5s before transitioning to report. |
| **DownloadDoneIcon** | `page.tsx` → share card | Download Badge, Download Snapshot, Download PDF buttons show checkmark + "Downloaded" for 1.5s on success. |

### Demo page (all 12)

| Route | Content |
|-------|---------|
| `/demo` | `AnimatedStateIconsDemo` — grid of all 12 icons auto-cycling. Linked from **Settings** → "Component demo". |

### Not yet integrated (no natural use case in current app)
- **MenuCloseIcon** — No hamburger menu in app (bottom nav).
- **PlayPauseIcon** — No media playback.
- **LockUnlockIcon** — No lock/unlock UI.
- **NotificationIcon** — No notification bell.
- **HeartIcon** — Voice feedback uses `HeartFavorite` (different component).
- **ToggleIcon** — No switch toggles in current UI.
- **EyeToggleIcon** — No show/hide password.
- **VolumeIcon** — No volume control.

---

## Dependencies

- `framer-motion` (already in project)
- `@/lib/utils` (`cn`)

## Usage example (controlled)

```tsx
import { CopiedIcon } from "@/components/ui/animated-state-icons";

const [copied, setCopied] = useState(false);
// ...
<button onClick={() => { copy(); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
  <CopiedIcon size={16} state={copied} color="currentColor" />
</button>
```
