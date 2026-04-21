/**
 * DillyFace — the face of Dilly. One SVG character that carries
 * the product's personality across every surface.
 *
 * Layers:
 *   1. Eyes + smile (the face itself). Every mood is an interpolation
 *      between a few anchor paths, so transitions are always smooth.
 *   2. Optional accessory (pencil, magnifier, paintbrush). Rendered
 *      as a second SVG layer, positioned near the hand/mouth zone.
 *   3. Idle drift (the original random-gaze behavior). Only active
 *      when mood === 'idle' — other moods lock the gaze so the
 *      expression reads cleanly.
 *
 * Prefer the <OnboardingDilly> / <ChatDilly> wrappers in most cases
 * — they derive mood + accessory automatically. Use <DillyFace mood="x" />
 * directly only when you need manual control.
 */

import { useEffect, useRef } from 'react'
import { Animated, Easing, View } from 'react-native'
import Svg, { Circle, Path, G, Line, Rect } from 'react-native-svg'
import { useResolvedTheme } from '../hooks/useTheme'

export type DillyMood =
  | 'idle'
  | 'happy'
  | 'thinking'
  | 'curious'
  | 'celebrating'
  | 'concerned'
  | 'sleeping'
  | 'proud'
  | 'writing'

export type DillyAccessory = 'none' | 'pencil' | 'magnifier' | 'paintbrush'

interface DillyFaceProps {
  size: number
  mood?: DillyMood
  accessory?: DillyAccessory
  /** Override for accessory color (e.g. match the user's theme). */
  accessoryColor?: string
  /** Show the accent perimeter ring + tinted fill behind the face.
   *  Default true. Pass false for "clean" contexts (loading screens,
   *  onboarding hero, AI arena) where the ring reads as chrome. */
  ring?: boolean
}

const AnimatedPath = Animated.createAnimatedComponent(Path)
const AnimatedG = Animated.createAnimatedComponent(G)

// Historical defaults, kept only as a fallback if theme resolution
// somehow returns nothing. The active ink comes from theme.accent so
// Dilly's eyes + smile follow the user's Customize Dilly accent.
const FACE_INK_FALLBACK = '#2B3A8E'

/* ─────────────────────────────────────────────────────────────── */
/* Mood → spring targets                                           */
/* ─────────────────────────────────────────────────────────────── */

interface MoodShape {
  /** 0 = flat smile, 1 = full smile, -1 = frown. */
  smile: number
  /** Eye scale multiplier. 1 = normal, <1 = narrow/squint, 0 = closed. */
  eyeScale: number
  /** Eye vertical offset as a fraction of face unit `s`. Negative = up. */
  eyeLift: number
  /** When true, eyes render as little upward arcs ("smiling eyes"). */
  archEyes: boolean
  /** Head-tilt in degrees. Subtle character move. */
  tilt: number
  /** Locks gaze to center (true) or lets it drift (false). */
  lockGaze: boolean
  /** Brow lift. 0 = none, positive = raised (curious). */
  browLift: number
}

function shapeFor(mood: DillyMood): MoodShape {
  switch (mood) {
    case 'happy':       return { smile:  0.85, eyeScale: 1,    eyeLift:  0, archEyes: false, tilt:  0, lockGaze: true,  browLift: 0 }
    case 'celebrating': return { smile:  1,    eyeScale: 0.25, eyeLift: -0.5, archEyes: true,  tilt:  0, lockGaze: true,  browLift: 0 }
    case 'thinking':    return { smile:  0.1,  eyeScale: 0.7,  eyeLift: -1, archEyes: false, tilt:  4, lockGaze: true,  browLift: 0.3 }
    case 'curious':     return { smile:  0.4,  eyeScale: 1.1,  eyeLift:  0, archEyes: false, tilt: -5, lockGaze: false, browLift: 0.8 }
    case 'concerned':   return { smile: -0.3,  eyeScale: 0.9,  eyeLift:  0.5, archEyes: false, tilt:  0, lockGaze: true,  browLift: 0 }
    case 'sleeping':    return { smile:  0.2,  eyeScale: 0,    eyeLift:  1, archEyes: false, tilt:  6, lockGaze: true,  browLift: 0 }
    case 'proud':       return { smile:  0.7,  eyeScale: 0.2,  eyeLift:  0, archEyes: true,  tilt: -3, lockGaze: true,  browLift: 0 }
    case 'writing':     return { smile:  0.3,  eyeScale: 0.5,  eyeLift: -0.5, archEyes: false, tilt:  2, lockGaze: true,  browLift: 0 }
    case 'idle':
    default:            return { smile:  0.3,  eyeScale: 1,    eyeLift:  0, archEyes: false, tilt:  0, lockGaze: false, browLift: 0 }
  }
}

/* ─────────────────────────────────────────────────────────────── */
/* DillyFace                                                       */
/* ─────────────────────────────────────────────────────────────── */

export function DillyFace({ size, mood = 'idle', accessory = 'none', accessoryColor, ring = true }: DillyFaceProps) {
  const TRAVEL = size * 0.15
  const faceRadius = (size * 0.44) / 2
  const s = faceRadius / 19

  // Ink color follows the user's accent so the face adapts to
  // Customize Dilly — rose gets a rose face, teal gets a teal face,
  // etc. Previously hardcoded to indigo regardless of theme, which
  // is what users were seeing as "the face doesn't match the theme".
  const theme = useResolvedTheme()
  const faceInk = theme.accent || FACE_INK_FALLBACK

  const shape = shapeFor(mood)

  // Spring physics refs for the idle drift + smile lerp.
  const posRef = useRef({ x: 0, y: 0 })
  const velRef = useRef({ x: 0, y: 0 })
  const targetRef = useRef({ x: 0, y: 0 })
  const smileRef = useRef(shape.smile)
  const smileTargetRef = useRef(shape.smile)
  const animFrame = useRef<ReturnType<typeof requestAnimationFrame>>()

  // Animated values that drive the SVG render.
  const posX = useRef(new Animated.Value(0)).current
  const posY = useRef(new Animated.Value(0)).current
  const smileAnim = useRef(new Animated.Value(shape.smile)).current
  // Transitionable shape props — we animate these via Animated.timing
  // when mood changes so swaps feel smooth (no jump-cut).
  const eyeScaleAnim = useRef(new Animated.Value(shape.eyeScale)).current
  const eyeLiftAnim  = useRef(new Animated.Value(shape.eyeLift)).current
  const tiltAnim     = useRef(new Animated.Value(shape.tilt)).current
  const browLiftAnim = useRef(new Animated.Value(shape.browLift)).current
  // Accessory "writing" scribble. Only active for writing mood with pencil.
  const scribbleAnim = useRef(new Animated.Value(0)).current

  const cx = size / 2
  const cy = size / 2
  const mW = 8 * s

  function pickTarget() {
    // Writing: gaze settles down-right toward the pencil but with
    // slight jitter so Dilly looks alive — previously the target
    // was a constant, so after converging the face sat perfectly
    // still (loading screens felt frozen). Small ±TRAVEL*0.15
    // wobble reads like natural micro-movements while writing.
    if (mood === 'writing') {
      const baseX = TRAVEL * 0.9
      const baseY = TRAVEL * 0.9
      const jx = (Math.random() - 0.5) * TRAVEL * 0.3
      const jy = (Math.random() - 0.5) * TRAVEL * 0.3
      targetRef.current = { x: baseX + jx, y: baseY + jy }
      return
    }
    if (shape.lockGaze) {
      targetRef.current = { x: 0, y: 0 }
      return
    }
    const angle = Math.random() * Math.PI * 2
    const dist = (0.72 + Math.random() * 0.28) * TRAVEL
    targetRef.current = { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist }
  }

  // React to mood changes — animate the transition. Runs whenever mood
  // changes, with a 280ms cubic ease that feels alive but not rubbery.
  useEffect(() => {
    const next = shapeFor(mood)
    smileTargetRef.current = next.smile
    pickTarget()
    Animated.parallel([
      Animated.timing(eyeScaleAnim, { toValue: next.eyeScale, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(eyeLiftAnim,  { toValue: next.eyeLift,  duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(tiltAnim,     { toValue: next.tilt,     duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true  }),
      Animated.timing(browLiftAnim, { toValue: next.browLift, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
    ]).start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood])

  // Writing scribble — a dash-offset loop on the pencil tip stroke.
  useEffect(() => {
    scribbleAnim.setValue(0)
    if (mood !== 'writing') return
    const loop = Animated.loop(
      Animated.timing(scribbleAnim, {
        toValue: 1,
        duration: 900,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [mood, scribbleAnim])

  useEffect(() => {
    pickTarget()
    const moveInterval = setInterval(pickTarget, 2600)
    const smileInterval = setInterval(() => {
      // Idle roams freely. Writing gets a gentle breath so the
      // chapter loading screen doesn't read as frozen — smile
      // wobbles between 0.25 and 0.45 on a slow cycle.
      if (mood === 'idle') {
        smileTargetRef.current = 0.15 + Math.random() * 0.45
      } else if (mood === 'writing') {
        smileTargetRef.current = 0.25 + Math.random() * 0.20
      }
    }, 2200)

    function frame() {
      const dx = targetRef.current.x - posRef.current.x
      const dy = targetRef.current.y - posRef.current.y
      velRef.current.x = velRef.current.x + (dx * 0.06 - velRef.current.x) * 0.20
      velRef.current.y = velRef.current.y + (dy * 0.06 - velRef.current.y) * 0.20
      posRef.current.x += velRef.current.x
      posRef.current.y += velRef.current.y
      smileRef.current += (smileTargetRef.current - smileRef.current) * 0.08
      posX.setValue(posRef.current.x)
      posY.setValue(posRef.current.y)
      smileAnim.setValue(smileRef.current)
      animFrame.current = requestAnimationFrame(frame)
    }
    animFrame.current = requestAnimationFrame(frame)

    return () => {
      clearInterval(moveInterval)
      clearInterval(smileInterval)
      if (animFrame.current) cancelAnimationFrame(animFrame.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood])

  // Smile path interpolation. 0 = flat, 1 = big, -1 = frown (invert the
  // bezier control point so the curve dips).
  const smilePath = smileAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [
      `M ${cx - mW} ${cy + 5 * s} Q ${cx} ${cy + 5 * s - 6 * s} ${cx + mW} ${cy + 5 * s}`,
      `M ${cx - mW} ${cy + 5 * s} Q ${cx} ${cy + 5 * s} ${cx + mW} ${cy + 5 * s}`,
      `M ${cx - mW} ${cy + 5 * s} Q ${cx} ${cy + 5 * s + 9 * s} ${cx + mW} ${cy + 5 * s}`,
    ],
  })

  const tiltRotate = tiltAnim.interpolate({
    inputRange: [-10, 10],
    outputRange: ['-10deg', '10deg'],
  })

  // Accent-colored perimeter ring behind Dilly. The ring + fill stay
  // STATIC. Only the face (eyes/smile/tilt) animates inside.
  // Stroke width scales with size: 1.5px min, ~3px on hero.
  const ringBorder = Math.max(1.5, Math.round(size * 0.025))

  // When Dilly is "writing" with a pencil, the pencil renders in its
  // own static SVG layer outside the perimeter ring. Same original
  // PencilAccessory design (body, tip highlight, eraser, scribble
  // wiggle), just translated so the tip aligns with the bottom-right
  // of the ring while the body extends past the ring edge. Dilly's
  // gaze locks down-right so she reads like she's looking at the
  // pencil.
  const pinnedPencil = mood === 'writing' && accessory === 'pencil'
  // Outer wrapper has room for the pencil to extend past the ring.
  // Accessory SVG is normally the same size as the face; we pad the
  // wrapper by ~60% of the face size on the bottom-right to fit the
  // 1.8x-scaled pencil comfortably.
  const pencilPad = pinnedPencil ? Math.round(size * 0.6) : 0
  const outerW = size + pencilPad
  const outerH = size + pencilPad

  // Face renders at its natural size inside the ring. The earlier
  // attempt to inset the SVG (86% of ring) made the smile look off
  // and didn't even address the real issue — the RING itself was
  // clipping at the edge of the parent screen, not Dilly's face
  // inside the ring. That gets fixed at the wrapper level below
  // with a margin. Here we keep the face coords unchanged so it
  // looks right.

  return (
    <View style={{ width: outerW, height: outerH }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ring ? ringBorder : 0,
          borderColor: ring ? theme.accent : 'transparent',
          backgroundColor: ring ? theme.accentSoft : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={{
            width: size,
            height: size,
            transform: [
              { translateX: posX },
              { translateY: posY },
              { rotate: tiltRotate },
            ],
          }}
        >
          <Svg width={size} height={size}>
            <EyesAndSmile
              cx={cx}
              cy={cy}
              s={s}
              eyeScaleAnim={eyeScaleAnim}
              eyeLiftAnim={eyeLiftAnim}
              browLiftAnim={browLiftAnim}
              smilePath={smilePath}
              archEyes={shape.archEyes}
              ink={faceInk}
            />
            {/* Non-pencil accessories (magnifier, paintbrush) still
                render inside the animated layer so they track with
                the face as before. The pencil pulls out to its own
                static layer below. */}
            {accessory !== 'none' && !pinnedPencil && (
              <Accessory
                kind={accessory}
                cx={cx}
                cy={cy}
                s={s}
                color={accessoryColor || faceInk}
                scribbleAnim={mood === 'writing' ? scribbleAnim : null}
              />
            )}
          </Svg>
        </Animated.View>
      </View>

      {/* Pencil layer — OUTSIDE the ring. Rendered in its own Svg
          positioned so the pencil tip just touches the ring's
          bottom-right edge and the body extends into the padding
          area. Static: Dilly moves, pencil doesn't.
          Scaled up 1.8x from the default Accessory size because the
          old "face-hand-zone" pencil was tiny. The Accessory SVG
          coords don't change — we just pass a larger `s` value. */}
      {pinnedPencil && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            // Offset so the pencil's tip (Accessory draws tip at
            // cx+14s, cy+14s) lands right on the ring edge. Shifting
            // the SVG by ~35% of size down-right does this cleanly.
            left: Math.round(size * 0.35),
            top: Math.round(size * 0.35),
            width: size,
            height: size,
          }}
        >
          <Svg width={size} height={size}>
            <Accessory
              kind="pencil"
              cx={cx}
              cy={cy}
              s={s * 1.8}
              color={accessoryColor || faceInk}
              scribbleAnim={scribbleAnim}
            />
          </Svg>
        </View>
      )}
    </View>
  )
}

/* ─────────────────────────────────────────────────────────────── */
/* Eyes + smile layer                                               */
/* ─────────────────────────────────────────────────────────────── */

interface EyesProps {
  cx: number
  cy: number
  s: number
  eyeScaleAnim: Animated.Value
  eyeLiftAnim: Animated.Value
  browLiftAnim: Animated.Value
  smilePath: Animated.AnimatedInterpolation<string>
  archEyes: boolean
  /** Ink color for eyes, brows, and smile. Swapped per-theme. */
  ink: string
}

function EyesAndSmile({ cx, cy, s, eyeScaleAnim, eyeLiftAnim, browLiftAnim, smilePath, archEyes, ink }: EyesProps) {
  // Eye radius is interpolated from scale so transitions are smooth.
  const baseR = 2.8 * s
  const eyeR = eyeScaleAnim.interpolate({
    inputRange: [0, 0.25, 1, 1.2],
    outputRange: [0.35 * s, baseR * 0.6, baseR, baseR * 1.15],
  })
  const eyeY = Animated.add(
    new Animated.Value(cy - 4 * s),
    Animated.multiply(eyeLiftAnim, new Animated.Value(s)),
  )
  const browY = Animated.subtract(
    eyeY,
    Animated.multiply(browLiftAnim, new Animated.Value(2 * s)),
  )
  const browLx = cx - 9 * s
  const browRx = cx + 9 * s
  const browSpan = 6 * s

  // Arched "smiling eyes" paths — small upward crescents. Drawn as
  // static paths; only visible when archEyes is true. We animate the
  // crescents' opacity so transitions into/out of celebrating look smooth.
  const archLPath = `M ${cx - 10 * s} ${cy - 3 * s} Q ${cx - 8 * s} ${cy - 7 * s} ${cx - 6 * s} ${cy - 3 * s}`
  const archRPath = `M ${cx + 6 * s}  ${cy - 3 * s} Q ${cx + 8 * s} ${cy - 7 * s} ${cx + 10 * s} ${cy - 3 * s}`

  return (
    <>
      {/* Eye dots — hidden when arched. We keep them rendered so the
          transition is a fade, not a pop. */}
      <AnimatedCircle
        cx={cx - 8 * s}
        cy={eyeY as unknown as number}
        r={eyeR as unknown as number}
        fill={archEyes ? 'transparent' : ink}
      />
      <AnimatedCircle
        cx={cx + 8 * s}
        cy={eyeY as unknown as number}
        r={eyeR as unknown as number}
        fill={archEyes ? 'transparent' : ink}
      />

      {/* Arched "smiling eyes" — only visible on celebrating / proud. */}
      {archEyes && (
        <>
          <Path d={archLPath} stroke={ink} strokeWidth={2.2 * s} strokeLinecap="round" fill="none" />
          <Path d={archRPath} stroke={ink} strokeWidth={2.2 * s} strokeLinecap="round" fill="none" />
        </>
      )}

      {/* Subtle brows — only render when browLift > 0 (curious/thinking). */}
      <AnimatedPath
        d={`M ${browLx} 0 l ${browSpan} 0`}
        stroke={ink}
        strokeWidth={1.4 * s}
        strokeLinecap="round"
        transform={browY.interpolate({
          inputRange: [0, 200],
          outputRange: ['translate(0, 0)', 'translate(0, 200)'],
        }) as unknown as string}
        opacity={browLiftAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.6, 1] }) as unknown as number}
      />

      {/* Smile / frown */}
      <AnimatedPath
        d={smilePath}
        stroke={ink}
        strokeWidth={2.2 * s}
        strokeLinecap="round"
        fill="none"
      />
    </>
  )
}

// Animated Circle helper — react-native-svg's Circle isn't animatable
// for cy/r by default without createAnimatedComponent.
const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/* ─────────────────────────────────────────────────────────────── */
/* Accessories                                                      */
/* ─────────────────────────────────────────────────────────────── */

interface AccessoryProps {
  kind: DillyAccessory
  cx: number
  cy: number
  s: number
  color: string
  /** If non-null, drives a scribble stroke-dash animation (pencil only). */
  scribbleAnim: Animated.Value | null
}

function Accessory({ kind, cx, cy, s, color, scribbleAnim }: AccessoryProps) {
  switch (kind) {
    case 'pencil':     return <PencilAccessory cx={cx} cy={cy} s={s} color={color} scribbleAnim={scribbleAnim} />
    case 'magnifier':  return <MagnifierAccessory cx={cx} cy={cy} s={s} color={color} />
    case 'paintbrush': return <PaintbrushAccessory cx={cx} cy={cy} s={s} color={color} />
    default:           return null
  }
}

/** Pencil in the hand zone (bottom-right of face). Writing mood makes
 *  the tip scribble with a short animated under-line.
 *
 *  Colors are fixed (not themed) — readable against any accent:
 *    - Body: yellow (classic no.2)
 *    - Top / eraser: pink
 *    - Tip (bottom): black graphite
 *    - Scribble line: black
 *  Previously the pencil pulled from `color` (accent) which made it
 *  disappear on pale themes and didn't read as a pencil. */
function PencilAccessory({ cx, cy, s, scribbleAnim }: Omit<AccessoryProps, 'kind' | 'color'> & { color?: string }) {
  const PENCIL_BODY = '#FFD83D'   // yellow no.2 body
  const PENCIL_ERASER = '#FF7AA2' // classic pink eraser top
  const PENCIL_TIP = '#111111'    // black graphite
  const SCRIBBLE = '#111111'      // black scribble line

  // Tip at bottom-right, body angled up-right.
  const tipX = cx + 14 * s
  const tipY = cy + 14 * s
  const butX = cx + 20 * s
  const butY = cy + 8 * s
  const strokeW = 2.4 * s

  // Scribble: a short horizontal dash under the tip that animates
  // left-to-right then fades. Implemented as an Animated path.
  const dashOffset = scribbleAnim
    ? scribbleAnim.interpolate({ inputRange: [0, 1], outputRange: [8 * s, -8 * s] })
    : null

  return (
    <>
      {/* Yellow body */}
      <Line x1={tipX} y1={tipY} x2={butX} y2={butY} stroke={PENCIL_BODY} strokeWidth={strokeW} strokeLinecap="round" />
      {/* Black tip */}
      <Circle cx={tipX} cy={tipY} r={0.9 * s} fill={PENCIL_TIP} />
      {/* Pink eraser */}
      <Circle cx={butX} cy={butY} r={1.2 * s} fill={PENCIL_ERASER} />
      {/* Scribble line — only when writing */}
      {dashOffset && (
        <AnimatedPath
          d={`M ${tipX - 5 * s} ${tipY + 3 * s} l ${10 * s} 0`}
          stroke={SCRIBBLE}
          strokeWidth={1.4 * s}
          strokeLinecap="round"
          strokeDasharray={`${4 * s},${3 * s}`}
          strokeDashoffset={dashOffset as unknown as number}
          opacity={0.9}
        />
      )}
    </>
  )
}

/** Magnifying glass — circle lens + diagonal handle, hovering bottom-right. */
function MagnifierAccessory({ cx, cy, s, color }: Omit<AccessoryProps, 'kind' | 'scribbleAnim'>) {
  const lensX = cx + 13 * s
  const lensY = cy + 12 * s
  const lensR = 4 * s
  const handleX1 = lensX + Math.cos(Math.PI / 4) * lensR
  const handleY1 = lensY + Math.sin(Math.PI / 4) * lensR
  const handleX2 = handleX1 + 4 * s
  const handleY2 = handleY1 + 4 * s
  // Lens fill used to be a fixed indigo rgba, which looked off on
  // non-indigo accents. Derive it from the stroke color instead so
  // the magnifier tints with the rest of the face.
  const lensFill = hexWithAlpha(color, 0.08)
  return (
    <>
      <Circle cx={lensX} cy={lensY} r={lensR} stroke={color} strokeWidth={1.6 * s} fill={lensFill} />
      {/* Sparkle glint */}
      <Circle cx={lensX - lensR * 0.35} cy={lensY - lensR * 0.35} r={0.7 * s} fill="#FFFFFF" opacity={0.9} />
      <Line x1={handleX1} y1={handleY1} x2={handleX2} y2={handleY2} stroke={color} strokeWidth={2 * s} strokeLinecap="round" />
    </>
  )
}

// Small util: accept "#RRGGBB" hex, return "rgba(r,g,b,a)". Falls
// back to semi-transparent neutral if input isn't a clean hex.
function hexWithAlpha(hex: string, alpha: number): string {
  const m = typeof hex === 'string' && hex.match(/^#?([0-9a-fA-F]{6})$/)
  if (!m) return `rgba(43,58,142,${alpha})`
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  return `rgba(${r},${g},${b},${alpha})`
}

/** Paintbrush — wooden handle + colored tip. Tip color follows the
 *  user's theme accent when passed through accessoryColor. */
function PaintbrushAccessory({ cx, cy, s, color }: Omit<AccessoryProps, 'kind' | 'scribbleAnim'>) {
  const tipX = cx + 13 * s
  const tipY = cy + 14 * s
  const butX = cx + 21 * s
  const butY = cy + 6 * s
  // Handle
  return (
    <>
      <Line x1={tipX + 1.5 * s} y1={tipY - 1.5 * s} x2={butX} y2={butY} stroke="#8B5A2B" strokeWidth={2.2 * s} strokeLinecap="round" />
      {/* Ferrule */}
      <Rect
        x={tipX - 0.5 * s}
        y={tipY - 3 * s}
        width={3.5 * s}
        height={2 * s}
        fill="#9CA3AF"
        rx={0.4 * s}
        transform={`rotate(-45 ${tipX + 1.2 * s} ${tipY - 2 * s})`}
      />
      {/* Bristle tip — colored per theme */}
      <Path
        d={`M ${tipX - 1 * s} ${tipY} q ${2 * s} ${3 * s} ${-1 * s} ${4 * s} z`}
        fill={color}
      />
      {/* Paint dab — tiny splotch on the "canvas" showing the tip drew something */}
      <Circle cx={tipX - 3 * s} cy={tipY + 4 * s} r={1 * s} fill={color} opacity={0.7} />
    </>
  )
}
