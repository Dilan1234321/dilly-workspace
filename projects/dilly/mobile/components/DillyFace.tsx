/**
 * DillyFace - the face of Dilly. One SVG character that carries
 * the product's personality across every surface.
 *
 * Layers:
 *   1. Eyes + smile (the face itself). Every mood is an interpolation
 *      between a few anchor paths, so transitions are always smooth.
 *   2. Optional accessory (pencil, magnifier, paintbrush). Rendered
 *      as a second SVG layer, positioned near the hand/mouth zone.
 *   3. Idle drift (the original random-gaze behavior). Only active
 *      when mood === 'idle' - other moods lock the gaze so the
 *      expression reads cleanly.
 *
 * Prefer the <OnboardingDilly> / <ChatDilly> wrappers in most cases
 * - they derive mood + accessory automatically. Use <DillyFace mood="x" />
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
  // Chapter V2 arc moods - returned by the backend per screen/message
  | 'warm'       // Screen 1: warm re-connection
  | 'attentive'  // Screen 1: focused listening
  | 'thoughtful' // Screen 2: observing, weighing
  | 'focused'    // Screen 3: data mode, synthesis
  | 'confident'  // Screen 3: assured analysis
  | 'direct'     // Screen 4: making the call
  | 'settled'    // Screen 5: session complete
  | 'open'       // Screen 0: intake, no-agenda welcome

export type DillyAccessory = 'none' | 'pencil' | 'magnifier' | 'paintbrush' | 'crown' | 'briefcase' | 'headphones' | 'glasses' | 'trophy' | 'compass'

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
  /** Hero "AI coach" treatment from the website: large circular
   *  container with light cool-lavender bg, soft navy border, and
   *  elevated drop shadow. Use for landing/hero contexts where
   *  Dilly is the centerpiece. Adds ~16% padding around the face
   *  inside the container. */
  circular?: boolean
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
    case 'happy':       return { smile:  0.85, eyeScale: 1,    eyeLift:  0,    archEyes: false, tilt:  0, lockGaze: true,  browLift: 0   }
    case 'celebrating': return { smile:  1,    eyeScale: 0.25, eyeLift: -0.5,  archEyes: true,  tilt:  0, lockGaze: true,  browLift: 0   }
    case 'thinking':    return { smile:  0.1,  eyeScale: 0.7,  eyeLift: -1,    archEyes: false, tilt:  4, lockGaze: true,  browLift: 0.3 }
    case 'curious':     return { smile:  0.4,  eyeScale: 1.1,  eyeLift:  0,    archEyes: false, tilt: -5, lockGaze: false, browLift: 0.8 }
    case 'concerned':   return { smile: -0.3,  eyeScale: 0.9,  eyeLift:  0.5,  archEyes: false, tilt:  0, lockGaze: true,  browLift: 0   }
    case 'sleeping':    return { smile:  0.2,  eyeScale: 0,    eyeLift:  1,    archEyes: false, tilt:  6, lockGaze: true,  browLift: 0   }
    case 'proud':       return { smile:  0.7,  eyeScale: 0.2,  eyeLift:  0,    archEyes: true,  tilt: -3, lockGaze: true,  browLift: 0   }
    case 'writing':     return { smile:  0.3,  eyeScale: 0.5,  eyeLift: -0.5,  archEyes: false, tilt:  2, lockGaze: true,  browLift: 0   }
    // Chapter V2 moods
    case 'warm':        return { smile:  0.85, eyeScale: 1.0,  eyeLift:  0,    archEyes: false, tilt: -2, lockGaze: true,  browLift: 0   }
    case 'attentive':   return { smile:  0.3,  eyeScale: 1.1,  eyeLift: -0.3,  archEyes: false, tilt:  0, lockGaze: true,  browLift: 0.2 }
    case 'thoughtful':  return { smile:  0.15, eyeScale: 0.8,  eyeLift: -0.8,  archEyes: false, tilt:  3, lockGaze: true,  browLift: 0.5 }
    case 'focused':     return { smile:  0.2,  eyeScale: 0.9,  eyeLift: -0.3,  archEyes: false, tilt:  0, lockGaze: true,  browLift: 0.1 }
    case 'confident':   return { smile:  0.55, eyeScale: 1.0,  eyeLift:  0,    archEyes: false, tilt: -2, lockGaze: true,  browLift: 0   }
    case 'direct':      return { smile:  0.35, eyeScale: 1.0,  eyeLift:  0,    archEyes: false, tilt:  0, lockGaze: true,  browLift: 0   }
    case 'settled':     return { smile:  0.65, eyeScale: 0.85, eyeLift:  0,    archEyes: false, tilt: -2, lockGaze: true,  browLift: 0   }
    case 'open':        return { smile:  0.5,  eyeScale: 1.2,  eyeLift: -0.2,  archEyes: false, tilt: -5, lockGaze: false, browLift: 0.6 }
    case 'idle':
    default:            return { smile:  0.3,  eyeScale: 1,    eyeLift:  0,    archEyes: false, tilt:  0, lockGaze: false, browLift: 0   }
  }
}

/* ─────────────────────────────────────────────────────────────── */
/* DillyFace                                                       */
/* ─────────────────────────────────────────────────────────────── */

export function DillyFace({ size, mood = 'idle', accessory = 'none', accessoryColor, ring = true, circular: circularProp, eyeBoost: eyeBoostProp }: DillyFaceProps & { eyeBoost?: number }) {
  // ALL accessory variants now use the same "pencil-style" base:
  // circular hero treatment (lavender bg, soft border, drop shadow)
  // and the bigger eyes that match the website pencil DillyFace.
  // The accessory (glasses, crown, trophy, briefcase, etc.) renders
  // ON TOP of that consistent base. So crown = base + crown jewel,
  // glasses = base + lenses, etc. — every variant feels like the
  // same character, not a different illustration. Pass
  // circular={false} explicitly to opt out (used by inline-text
  // mini-faces like the "log a win" pill).
  // eyeBoost can be passed independently — used by the splash screen
  // to render the website-style bigger eyes WITHOUT the pencil
  // accessory or circular treatment.
  const hasAccessory = accessory && accessory !== 'none';
  // All DillyFace variants now get the circular hero treatment by default
  // (border + soft bg + drop shadow) so the face reads as a "Dilly chip"
  // everywhere it appears — branded, not just a floating illustration.
  // Pass circular={false} explicitly to opt out (used by inline-text
  // mini-faces and the splash screen which uses its own outer ring).
  const circular = circularProp !== undefined
    ? circularProp
    : true;
  // Pencil gets the biggest eyes (matches the website hero illustration);
  // other accessories use a slightly smaller boost. Plain face = 1.0.
  const resolvedEyeBoost = eyeBoostProp !== undefined
    ? eyeBoostProp
    : (accessory === 'pencil' ? 1.65 : (hasAccessory ? 1.4 : 1));
  const TRAVEL = size * 0.15
  const faceRadius = (size * 0.44) / 2
  const s = faceRadius / 19

  // Ink color follows the user's accent so the face adapts to
  // Customize Dilly - rose gets a rose face, teal gets a teal face,
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
  // Transitionable shape props - we animate these via Animated.timing
  // when mood changes so swaps feel smooth (no jump-cut).
  const eyeScaleAnim = useRef(new Animated.Value(shape.eyeScale)).current
  const eyeLiftAnim  = useRef(new Animated.Value(shape.eyeLift)).current
  const tiltAnim     = useRef(new Animated.Value(shape.tilt)).current
  const browLiftAnim = useRef(new Animated.Value(shape.browLift)).current
  // Accessory "writing" scribble. Only active for writing mood with pencil.
  const scribbleAnim = useRef(new Animated.Value(0)).current

  // Always-on accessory pulse. 0 -> 1 -> 0 over ~2.4s. Each accessory
  // (crown, briefcase, headphones, glasses, trophy, compass) reads
  // this and animates its own "signature" motion: a jewel twinkle, a
  // cushion pulse, a needle wobble, a glint sliding across the lens,
  // sparkle dots, a handle swing. The result: every Dilly variant
  // feels alive, not just the writing one.
  const pulseAnim = useRef(new Animated.Value(0)).current

  const cx = size / 2
  const cy = size / 2
  const mW = 8 * s

  function pickTarget() {
    // Writing: gaze settles down-right toward the pencil but with
    // slight jitter so Dilly looks alive - previously the target
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

  // React to mood changes - animate the transition. Runs whenever mood
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

  // Writing scribble - a dash-offset loop on the pencil tip stroke.
  // Linear easing so motion reads as continuous ink (no slow-fast-slow
  // wobble, no visible reverse). Animated.loop of a single 0→1 timing
  // restarts at 0 each cycle, so the scribble always moves in one
  // direction - it never reverses.
  useEffect(() => {
    scribbleAnim.setValue(0)
    if (mood !== 'writing') return
    const loop = Animated.loop(
      Animated.timing(scribbleAnim, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [mood, scribbleAnim])

  // Accessory pulse loop. Skipped entirely when no accessory is set —
  // earlier this ran on every DillyFace mount which churned the JS
  // thread (useNativeDriver: false because Svg props can't bridge to
  // native). With many DillyFace instances scattered through the app
  // the always-on cost added up to noticeable lag.
  useEffect(() => {
    if (!accessory) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0, duration: 1200, easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [accessory, pulseAnim])

  useEffect(() => {
    pickTarget()
    const moveInterval = setInterval(pickTarget, 2600)
    const smileInterval = setInterval(() => {
      // Every mood breathes — small ±0.10 wobble around the mood's
      // base smile value keeps the face feeling alive instead of
      // frozen. Idle + writing get larger wobble ranges since they
      // have nothing else animating; the rest get gentle breath.
      const base = shape.smile
      if (mood === 'idle') {
        smileTargetRef.current = 0.15 + Math.random() * 0.45
      } else if (mood === 'writing') {
        smileTargetRef.current = 0.25 + Math.random() * 0.20
      } else {
        // Gentle breath: base ±0.10, clamped to valid smile range.
        const wobble = (Math.random() - 0.5) * 0.20
        smileTargetRef.current = Math.max(-1, Math.min(1, base + wobble))
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
  // and didn't even address the real issue - the RING itself was
  // clipping at the edge of the parent screen, not Dilly's face
  // inside the ring. That gets fixed at the wrapper level below
  // with a margin. Here we keep the face coords unchanged so it
  // looks right.

  // Circular hero treatment matches the website's AI coach surface:
  // larger soft cool-lavender bg, thin navy border, elevated shadow.
  // Trumps the regular `ring` prop when set — they don't compose.
  // On dark surfaces (Midnight, OLED, Carbon, Cocoa, Dark Blue) the
  // hardcoded light lavender bg looked like a glaring white square
  // around the face. Use s2 (mid-elevation surface) on dark themes
  // so the chip sits on the page like every other card.
  const isDarkSurface = !!theme.surface?.dark
  const circularBg = isDarkSurface ? (theme.surface?.s2 || '#1A1F2E') : '#F5F6FF'
  const circularBorderColor = isDarkSurface
    ? 'rgba(255,255,255,0.08)'
    : 'rgba(43,58,142,0.12)'
  // Briefcase variant uses a thicker border to read as a confident,
  // job-ready chip — the default circular border was too thin to hold
  // its own at small sizes on the Jobs surfaces. ~2.5x the default.
  const circularBorder = circular
    ? (accessory === 'briefcase'
        ? Math.max(3, Math.round(size * 0.028))
        : Math.max(1.5, Math.round(size * 0.012)))
    : 0
  return (
    <View style={{
      width: outerW,
      height: outerH,
      ...(circular ? {
        shadowColor: '#001b44',
        shadowOpacity: 0.15,
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 22,
        elevation: 12,
      } : null),
    }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: circular ? circularBorder : (ring ? ringBorder : 0),
          borderColor: circular ? circularBorderColor : (ring ? theme.accent : 'transparent'),
          backgroundColor: circular ? circularBg : (ring ? theme.accentSoft : 'transparent'),
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
              eyeBoost={resolvedEyeBoost}
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
                pulseAnim={pulseAnim}
                mood={mood}
              />
            )}
          </Svg>
        </Animated.View>
      </View>

      {/* Pencil layer - OUTSIDE the ring. Rendered in its own Svg
          positioned so the pencil tip just touches the ring's
          bottom-right edge and the body extends into the padding
          area. Static: Dilly moves, pencil doesn't.
          Scaled up 1.8x from the default Accessory size because the
          old "face-hand-zone" pencil was tiny. The Accessory SVG
          coords don't change - we just pass a larger `s` value. */}
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
              isDark={!!theme.surface?.dark}
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
  /** Boost eye base radius — pencil/circular hero variant uses bigger
   *  eyes to match the website. */
  eyeBoost?: number
}

function EyesAndSmile({ cx, cy, s, eyeScaleAnim, eyeLiftAnim, browLiftAnim, smilePath, archEyes, ink, eyeBoost = 1 }: EyesProps) {
  // Eye radius is interpolated from scale so transitions are smooth.
  const baseR = 2.8 * s * eyeBoost
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

  // Arched "smiling eyes" paths - small upward crescents. Drawn as
  // static paths; only visible when archEyes is true. We animate the
  // crescents' opacity so transitions into/out of celebrating look smooth.
  const archLPath = `M ${cx - 10 * s} ${cy - 3 * s} Q ${cx - 8 * s} ${cy - 7 * s} ${cx - 6 * s} ${cy - 3 * s}`
  const archRPath = `M ${cx + 6 * s}  ${cy - 3 * s} Q ${cx + 8 * s} ${cy - 7 * s} ${cx + 10 * s} ${cy - 3 * s}`

  return (
    <>
      {/* Eye dots - hidden when arched. We keep them rendered so the
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

      {/* Arched "smiling eyes" - only visible on celebrating / proud. */}
      {archEyes && (
        <>
          <Path d={archLPath} stroke={ink} strokeWidth={Math.max(2, 2.2 * s)} strokeLinecap="round" fill="none" />
          <Path d={archRPath} stroke={ink} strokeWidth={Math.max(2, 2.2 * s)} strokeLinecap="round" fill="none" />
        </>
      )}

      {/* Subtle brows - only render when browLift > 0 (curious/thinking). */}
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

      {/* Smile / frown — enforce a minimum 2px stroke so the smile
          stays visible even when DillyFace is rendered tiny (widget
          chips, in-app pills, log-a-win button, etc.). 2.2*s falls
          below 1px once the face is shrunk past ~36pt, which made
          the smile disappear and Dilly look expressionless. */}
      <AnimatedPath
        d={smilePath}
        stroke={ink}
        strokeWidth={Math.max(2, 2.2 * s)}
        strokeLinecap="round"
        fill="none"
      />
    </>
  )
}

// Animated Circle helper - react-native-svg's Circle isn't animatable
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
  /** Always-on 0→1→0 pulse driver. Each accessory uses it differently
   *  (crown twinkle, briefcase swing, headphones cushion pulse, etc.). */
  pulseAnim?: Animated.Value
  /** True on dark surfaces (Midnight theme). Pencil tip + scribble
   *  flip from black → white so the pencil reads on dark mode. */
  isDark?: boolean
}

function Accessory({ kind, cx, cy, s, color, scribbleAnim, pulseAnim, isDark, mood }: AccessoryProps & { mood?: DillyMood }) {
  switch (kind) {
    case 'pencil':     return <PencilAccessory cx={cx} cy={cy} s={s} color={color} scribbleAnim={scribbleAnim} isDark={isDark} />
    case 'magnifier':  return <MagnifierAccessory cx={cx} cy={cy} s={s} color={color} />
    case 'paintbrush': return <PaintbrushAccessory cx={cx} cy={cy} s={s} color={color} />
    case 'crown':      return <CrownAccessory cx={cx} cy={cy} s={s} color={color} pulseAnim={pulseAnim} />
    case 'briefcase':  return <BriefcaseAccessory cx={cx} cy={cy} s={s} color={color} pulseAnim={pulseAnim} mood={mood} />
    case 'headphones': return <HeadphonesAccessory cx={cx} cy={cy} s={s} color={color} pulseAnim={pulseAnim} />
    case 'glasses':    return <GlassesAccessory cx={cx} cy={cy} s={s} color={color} pulseAnim={pulseAnim} />
    case 'trophy':     return <TrophyAccessory cx={cx} cy={cy} s={s} color={color} pulseAnim={pulseAnim} mood={mood} />
    case 'compass':    return <CompassAccessory cx={cx} cy={cy} s={s} color={color} pulseAnim={pulseAnim} />
    default:           return null
  }
}

// Mood → trophy palette + tilt. Reads at a glance: gold celebrating
// trophy reads "win," dimmed silver one reads "thinking about a win,"
// concerned tilts the trophy downward like it's slipping.
function trophyMoodStyle(mood?: DillyMood): { gold: string; goldDark: string; rotate: number; scale: number } {
  switch (mood) {
    case 'celebrating': return { gold: '#FFD24A', goldDark: '#C68A1A', rotate: -15, scale: 1.18 }
    case 'proud':       return { gold: '#F2C84B', goldDark: '#B88A1F', rotate: -10, scale: 1.12 }
    case 'happy':
    case 'warm':        return { gold: '#E5B143', goldDark: '#B88A1F', rotate:  -6, scale: 1.06 }
    case 'thinking':
    case 'thoughtful':  return { gold: '#A8A39A', goldDark: '#6E6A60', rotate:  10, scale: 0.90 }
    case 'concerned':   return { gold: '#8C8270', goldDark: '#544D3E', rotate:  18, scale: 0.85 }
    default:            return { gold: '#E5B143', goldDark: '#B88A1F', rotate:  0,  scale: 1.00 }
  }
}

// Mood → briefcase palette + tilt. Confident sits upright in rich
// leather; attentive leans forward like Dilly is presenting it;
// thoughtful tilts back like Dilly is reading from it; concerned
// dips the case as if heavy.
function briefcaseMoodStyle(mood?: DillyMood): { leather: string; leatherDark: string; rotate: number } {
  switch (mood) {
    case 'confident':
    case 'direct':
    case 'proud':       return { leather: '#3F2E1B', leatherDark: '#2A1F12', rotate: -8  }
    case 'attentive':
    case 'focused':     return { leather: '#3F2E1B', leatherDark: '#2A1F12', rotate:  12 }
    case 'curious':
    case 'open':        return { leather: '#4A3823', leatherDark: '#2F2415', rotate: -14 }
    case 'thinking':
    case 'thoughtful':  return { leather: '#7A6852', leatherDark: '#5A4938', rotate:  4  }
    case 'concerned':   return { leather: '#3F2E1B', leatherDark: '#2A1F12', rotate:  18 }
    default:            return { leather: '#3F2E1B', leatherDark: '#2A1F12', rotate:  0  }
  }
}

/** Royal crown for the "Dilly Pro" badge surface. Three gold peaks
 *  sitting on the forehead area inside the ring, with a center jewel
 *  that themes to the user's accent. */
function CrownAccessory({ cx, cy, s, pulseAnim }: Omit<AccessoryProps, 'kind' | 'scribbleAnim'>) {
  const GOLD = '#E5B143'
  const GOLD_DARK = '#B88A1F'
  // Center jewel — vivid blue diamond. Royal-sapphire palette so the
  // jewel reads luxe rather than novelty-blue. Side beads stay cream.
  const DIAMOND_BLUE = '#3A6BD9'
  const DIAMOND_BLUE_DARK = '#1F3F8E'
  const DIAMOND_HIGHLIGHT = '#9BB8F2'
  const baseY = cy - 12 * s
  const peakY = cy - 18 * s
  const valleyY = cy - 14.5 * s
  const half = 7 * s
  const crownPath = [
    `M ${cx - half} ${baseY}`,
    `L ${cx - half} ${valleyY + 1.5 * s}`,
    `L ${cx - 5 * s} ${peakY}`,
    `L ${cx - 2.5 * s} ${valleyY}`,
    `L ${cx} ${peakY - 1 * s}`,
    `L ${cx + 2.5 * s} ${valleyY}`,
    `L ${cx + 5 * s} ${peakY}`,
    `L ${cx + half} ${valleyY + 1.5 * s}`,
    `L ${cx + half} ${baseY}`,
    `Z`,
  ].join(' ')
  // Diamond (rhombus) at the center peak. Drawn as 4 lines via a
  // path so we can stroke + fill with a highlight facet.
  const dCx = cx
  const dCy = peakY + 0.4 * s
  const dW = 1.6 * s
  const dH = 2.0 * s
  const diamondPath = `M ${dCx} ${dCy - dH / 2} L ${dCx + dW / 2} ${dCy} L ${dCx} ${dCy + dH / 2} L ${dCx - dW / 2} ${dCy} Z`
  // Subtle pulse on the crown — gentle Y bob + jewel twinkle. Keeps
  // the Pro badge feeling alive without being twitchy.
  const bobTransform = pulseAnim
    ? (pulseAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [
          `translate(0 0)`,
          `translate(0 ${-0.7 * s})`,
          `translate(0 0)`,
        ],
      }) as any)
    : `translate(0 0)`
  const twinkleOpacity = pulseAnim
    ? (pulseAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 1, 0.5] }) as any)
    : 1
  return (
    <AnimatedG transform={bobTransform}>
      <Path d={crownPath} fill={GOLD} stroke={GOLD_DARK} strokeWidth={0.6 * s} strokeLinejoin="round" />
      {/* Center jewel — blue diamond. Stroked + fill + highlight
          facet for depth so it reads as a real cut stone. */}
      <Path d={diamondPath} fill={DIAMOND_BLUE} stroke={DIAMOND_BLUE_DARK} strokeWidth={0.4 * s} strokeLinejoin="round" />
      <Path
        d={`M ${dCx} ${dCy - dH / 2} L ${dCx + dW / 2} ${dCy} L ${dCx} ${dCy}`}
        fill={DIAMOND_HIGHLIGHT}
        opacity={0.6}
      />
      {/* Tiny sparkle dot on the diamond that pulses with pulseAnim */}
      <AnimatedCircle cx={dCx + 0.4 * s} cy={dCy - 0.4 * s} r={0.25 * s} fill="#FFFFFF" opacity={twinkleOpacity as any} />
      {/* Side cream beads */}
      <Circle cx={cx - 5 * s} cy={peakY + 1.2 * s} r={0.7 * s} fill="#FFF6D6" />
      <Circle cx={cx + 5 * s} cy={peakY + 1.2 * s} r={0.7 * s} fill="#FFF6D6" />
    </AnimatedG>
  )
}

/** Briefcase for Jobs / Internship Tracker surfaces. Sits in the
 *  bottom-right hand zone like the pencil. Leather-brown body with a
 *  brass clasp + arched handle. */
function BriefcaseAccessory({ cx, cy, s, pulseAnim, mood }: Omit<AccessoryProps, 'kind' | 'scribbleAnim' | 'color'> & { color?: string; mood?: DillyMood }) {
  const m = briefcaseMoodStyle(mood)
  const LEATHER = m.leather
  const LEATHER_DARK = m.leatherDark
  const BRASS = '#B88A1F'
  const HIGHLIGHT = '#5C4626'
  // Sized + placed to occupy the pencil's hand zone (cx+9..cx+24,
  // cy+5..cy+17). Bumped from 12x9 → 16x12 per product direction so
  // the briefcase reads as a confident accessory at glance, not a
  // small detail tucked into the corner.
  const bodyX = cx + 9 * s
  const bodyY = cy + 6 * s
  const bodyW = 16 * s
  const bodyH = 12 * s
  const cornerR = 1.3 * s
  const handleY = bodyY - 1.5 * s
  const handleLeftX = bodyX + 2.2 * s
  const handleRightX = bodyX + bodyW - 2.2 * s
  const handlePath = `M ${handleLeftX} ${bodyY} Q ${handleLeftX} ${handleY} ${(handleLeftX + handleRightX) / 2} ${handleY} Q ${handleRightX} ${handleY} ${handleRightX} ${bodyY}`
  const claspX = bodyX + bodyW / 2 - 1.2 * s
  const claspY = bodyY + 0.6 * s
  const claspW = 2.4 * s
  const claspH = 1.2 * s
  const stitchY = bodyY + bodyH * 0.45
  // Pivot rotation around the briefcase's own center so the tilt
  // looks intentional rather than spinning off the face center.
  const pivotX = bodyX + bodyW / 2
  const pivotY = bodyY + bodyH / 2
  // Live swing animation: pulseAnim drives an extra ±4° wobble on
  // top of the mood-base rotation. Reads as Dilly walking with the
  // case — gentle and continuous, not jittery.
  const swingTransform = pulseAnim
    ? (pulseAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [
          `rotate(${m.rotate - 4} ${pivotX} ${pivotY})`,
          `rotate(${m.rotate + 4} ${pivotX} ${pivotY})`,
          `rotate(${m.rotate - 4} ${pivotX} ${pivotY})`,
        ],
      }) as any)
    : `rotate(${m.rotate} ${pivotX} ${pivotY})`
  return (
    <AnimatedG transform={swingTransform}>
      <Rect x={bodyX} y={bodyY} width={bodyW} height={bodyH} rx={cornerR} ry={cornerR} fill={LEATHER} stroke={LEATHER_DARK} strokeWidth={0.5 * s} />
      <Path d={handlePath} stroke={LEATHER_DARK} strokeWidth={0.9 * s} fill="none" strokeLinecap="round" />
      <Line x1={bodyX + 0.5 * s} y1={stitchY} x2={bodyX + bodyW - 0.5 * s} y2={stitchY} stroke={HIGHLIGHT} strokeWidth={0.3 * s} />
      <Rect x={claspX} y={claspY} width={claspW} height={claspH} rx={0.2 * s} ry={0.2 * s} fill={BRASS} />
    </AnimatedG>
  )
}

/** Over-ear headphones for Voice mode. Arched band over the head,
 *  ear cups on each side. Cushion uses theme accent. */
function HeadphonesAccessory({ cx, cy, s, color }: Omit<AccessoryProps, 'kind' | 'scribbleAnim'>) {
  const BODY = '#2A2F3A'
  const BODY_DARK = '#15181F'
  const cupOuterX = 14 * s
  const cupInnerX = 11 * s
  const cupTopY = -3 * s
  const cupBottomY = 5 * s
  const cupW = cupOuterX - cupInnerX
  const cupH = cupBottomY - cupTopY
  const bandLeftX = cx - (cupInnerX + cupW / 2)
  const bandRightX = cx + (cupInnerX + cupW / 2)
  const bandLeftY = cy + cupTopY
  const bandPeakY = cy - 17 * s
  const bandPath = `M ${bandLeftX} ${bandLeftY} Q ${cx} ${bandPeakY} ${bandRightX} ${bandLeftY}`
  return (
    <>
      <Path d={bandPath} stroke={BODY} strokeWidth={1.6 * s} strokeLinecap="round" fill="none" />
      <Rect x={cx - cupOuterX} y={cy + cupTopY} width={cupW} height={cupH} rx={cupW / 2} ry={cupW / 2} fill={BODY} stroke={BODY_DARK} strokeWidth={0.4 * s} />
      <AnimatedRect x={cx - cupOuterX + 0.6 * s} y={cy + cupTopY + 0.8 * s} width={cupW - 1.2 * s} height={cupH - 1.6 * s} rx={(cupW - 1.2 * s) / 2} ry={(cupW - 1.2 * s) / 2} fill={color} opacity={pulseAnim ? (pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.0] }) as any) : 0.9} />
      <Rect x={cx + cupInnerX} y={cy + cupTopY} width={cupW} height={cupH} rx={cupW / 2} ry={cupW / 2} fill={BODY} stroke={BODY_DARK} strokeWidth={0.4 * s} />
      <AnimatedRect x={cx + cupInnerX + 0.6 * s} y={cy + cupTopY + 0.8 * s} width={cupW - 1.2 * s} height={cupH - 1.6 * s} rx={(cupW - 1.2 * s) / 2} ry={(cupW - 1.2 * s) / 2} fill={color} opacity={pulseAnim ? (pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.0] }) as any) : 0.9} />
    </>
  )
}

/** Round reading glasses for the insights / "Dilly read this" surfaces.
 *  Thin circular frames over the eye area, joined by a bridge. */
function GlassesAccessory({ cx, cy, s, color, pulseAnim }: Omit<AccessoryProps, 'kind' | 'scribbleAnim'>) {
  const eyeY = cy - 4 * s
  const lensR = 5.5 * s
  const leftCx = cx - 8 * s
  const rightCx = cx + 8 * s
  const frameW = 1 * s
  return (
    <>
      <Line x1={leftCx + lensR - 0.3 * s} y1={eyeY} x2={rightCx - lensR + 0.3 * s} y2={eyeY} stroke={color} strokeWidth={frameW} strokeLinecap="round" />
      <Circle cx={leftCx} cy={eyeY} r={lensR} stroke={color} strokeWidth={frameW} fill="none" />
      <Circle cx={rightCx} cy={eyeY} r={lensR} stroke={color} strokeWidth={frameW} fill="none" />
      <Line x1={leftCx - lensR + 0.2 * s} y1={eyeY - 0.3 * s} x2={leftCx - lensR - 1.8 * s} y2={eyeY - 1 * s} stroke={color} strokeWidth={frameW} strokeLinecap="round" />
      <Line x1={rightCx + lensR - 0.2 * s} y1={eyeY - 0.3 * s} x2={rightCx + lensR + 1.8 * s} y2={eyeY - 1 * s} stroke={color} strokeWidth={frameW} strokeLinecap="round" />
      {/* Animated glint — small bright dots slide L→R across both
          lenses. Reads as light catching the glasses; very subtle but
          makes them feel like real glass instead of a wireframe. */}
      {pulseAnim && (
        <AnimatedG transform={pulseAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [`translate(${-lensR * 0.7} 0)`, `translate(${lensR * 0.7} 0)`],
        }) as any}>
          <Circle cx={leftCx} cy={eyeY - lensR * 0.4} r={0.6 * s} fill="#FFFFFF" opacity={0.55} />
          <Circle cx={rightCx} cy={eyeY - lensR * 0.4} r={0.6 * s} fill="#FFFFFF" opacity={0.55} />
        </AnimatedG>
      )}
    </>
  )
}

/** Gold trophy held up in the bottom-right hand zone. Tapered cup with
 *  side handles, stem, and base. Same gold family as the crown. */
function TrophyAccessory({ cx, cy, s, color, pulseAnim, mood }: Omit<AccessoryProps, 'kind' | 'scribbleAnim'> & { mood?: DillyMood }) {
  const m = trophyMoodStyle(mood)
  const GOLD = m.gold
  const GOLD_DARK = m.goldDark
  // Sized + placed to occupy the pencil's hand zone. Cup spans
  // cx+11..cx+22 horizontally, cy+5..cy+16 vertically.
  const cupTopY = cy + 5 * s
  const cupMidY = cy + 9 * s
  const cupBottomY = cy + 11 * s
  const stemBottomY = cy + 13.5 * s
  const baseTopY = stemBottomY
  const baseBottomY = cy + 16 * s
  const cupTopL = cx + 11 * s
  const cupTopR = cx + 22 * s
  const cupBotL = cx + 13.5 * s
  const cupBotR = cx + 19.5 * s
  const stemL = cx + 15 * s
  const stemR = cx + 18 * s
  const baseL = cx + 13 * s
  const baseR = cx + 20 * s
  const cupPath = `M ${cupTopL} ${cupTopY} L ${cupTopR} ${cupTopY} L ${cupBotR} ${cupBottomY} L ${cupBotL} ${cupBottomY} Z`
  const handleLPath = `M ${cupTopL} ${cupTopY + 0.5 * s} Q ${cupTopL - 1.8 * s} ${(cupTopY + cupMidY) / 2} ${cupTopL + 0.4 * s} ${cupMidY}`
  const handleRPath = `M ${cupTopR} ${cupTopY + 0.5 * s} Q ${cupTopR + 1.8 * s} ${(cupTopY + cupMidY) / 2} ${cupTopR - 0.4 * s} ${cupMidY}`
  // Pivot rotation around the trophy's center so happy moods give a
  // subtle "raise the trophy" tilt + pop, while thoughtful/concerned
  // moods dim it and tilt it down.
  const pivotX = (cupTopL + cupTopR) / 2
  const pivotY = (cupTopY + baseBottomY) / 2
  // Live bounce animation: pulseAnim drives a small Y translation +
  // scale wobble on top of the mood-base transform. Reads as a real
  // celebratory bounce, not a static decal.
  const bounceTransform = pulseAnim
    ? (pulseAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [
          `translate(${pivotX} ${pivotY + 0.8 * s}) scale(${m.scale * 0.97}) rotate(${m.rotate}) translate(${-pivotX} ${-pivotY})`,
          `translate(${pivotX} ${pivotY - 1.2 * s}) scale(${m.scale * 1.03}) rotate(${m.rotate - 2}) translate(${-pivotX} ${-pivotY})`,
          `translate(${pivotX} ${pivotY + 0.8 * s}) scale(${m.scale * 0.97}) rotate(${m.rotate}) translate(${-pivotX} ${-pivotY})`,
        ],
      }) as any)
    : `translate(${pivotX} ${pivotY}) scale(${m.scale}) rotate(${m.rotate}) translate(${-pivotX} ${-pivotY})`
  return (
    <AnimatedG transform={bounceTransform}>
      <Path d={handleLPath} stroke={GOLD} strokeWidth={0.9 * s} fill="none" strokeLinecap="round" />
      <Path d={handleRPath} stroke={GOLD} strokeWidth={0.9 * s} fill="none" strokeLinecap="round" />
      <Path d={cupPath} fill={GOLD} stroke={GOLD_DARK} strokeWidth={0.4 * s} strokeLinejoin="round" />
      <Circle cx={(cupTopL + cupTopR) / 2} cy={(cupTopY + cupBottomY) / 2 - 0.2 * s} r={1 * s} fill={color} />
      <Rect x={stemL} y={cupBottomY} width={stemR - stemL} height={stemBottomY - cupBottomY} fill={GOLD} stroke={GOLD_DARK} strokeWidth={0.3 * s} />
      <Rect x={baseL} y={baseTopY} width={baseR - baseL} height={baseBottomY - baseTopY} rx={0.3 * s} ry={0.3 * s} fill={GOLD} stroke={GOLD_DARK} strokeWidth={0.4 * s} />
      {/* Sparkle wave — three white pinprick dots around the cup that
          fade in and out in sequence. Reads as "this just got won." */}
      {pulseAnim && (
        <>
          <AnimatedCircle cx={cupTopL - 0.5 * s} cy={cupTopY + 0.5 * s} r={0.5 * s} fill="#FFFFFF"
            opacity={pulseAnim.interpolate({ inputRange: [0, 0.33, 0.66, 1], outputRange: [0, 1, 0, 0] }) as any} />
          <AnimatedCircle cx={cupTopR + 0.3 * s} cy={cupTopY + 1.5 * s} r={0.5 * s} fill="#FFFFFF"
            opacity={pulseAnim.interpolate({ inputRange: [0, 0.33, 0.66, 1], outputRange: [0, 0, 1, 0] }) as any} />
          <AnimatedCircle cx={(cupTopL + cupTopR) / 2} cy={cupTopY - 0.8 * s} r={0.45 * s} fill="#FFFFFF"
            opacity={pulseAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.2, 1, 0.2] }) as any} />
        </>
      )}
    </AnimatedG>
  )
}

/** Open compass for direction-finding surfaces (mode switch, Next
 *  Role). Brass body, cream face, two-color needle pointing north.
 *  The north arm uses the theme accent. */
function CompassAccessory({ cx, cy, s, color, pulseAnim }: Omit<AccessoryProps, 'kind' | 'scribbleAnim'>) {
  const BRASS = '#B88A1F'
  const BRASS_DARK = '#7A5A0F'
  const FACE = '#FFF6D6'
  const NEEDLE_DOWN = '#FFFFFF'
  const PIVOT = '#1A1A1A'
  const ccx = cx + 13 * s
  const ccy = cy + 13 * s
  const outerR = 3.6 * s
  const faceR = 3 * s
  const needleHalfH = 2.6 * s
  const needleHalfW = 0.8 * s
  const needleUpPath = `M ${ccx} ${ccy - needleHalfH} L ${ccx - needleHalfW} ${ccy} L ${ccx + needleHalfW} ${ccy} Z`
  const needleDownPath = `M ${ccx} ${ccy + needleHalfH} L ${ccx - needleHalfW} ${ccy} L ${ccx + needleHalfW} ${ccy} Z`
  return (
    <>
      <Circle cx={ccx} cy={ccy} r={outerR} fill={BRASS} stroke={BRASS_DARK} strokeWidth={0.4 * s} />
      <Circle cx={ccx} cy={ccy} r={faceR} fill={FACE} />
      <Circle cx={ccx} cy={ccy - faceR + 0.4 * s} r={0.3 * s} fill={BRASS_DARK} />
      <Circle cx={ccx + faceR - 0.4 * s} cy={ccy} r={0.3 * s} fill={BRASS_DARK} />
      <Circle cx={ccx} cy={ccy + faceR - 0.4 * s} r={0.3 * s} fill={BRASS_DARK} />
      <Circle cx={ccx - faceR + 0.4 * s} cy={ccy} r={0.3 * s} fill={BRASS_DARK} />
      {/* Needle wobbles ±6° around the pivot — reads as "settling
          on north," not just static. Cardinal markers stay still. */}
      <AnimatedG transform={pulseAnim
        ? (pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [`rotate(-6 ${ccx} ${ccy})`, `rotate(6 ${ccx} ${ccy})`] }) as any)
        : undefined}>
        <Path d={needleDownPath} fill={NEEDLE_DOWN} stroke={BRASS_DARK} strokeWidth={0.2 * s} strokeLinejoin="round" />
        <Path d={needleUpPath} fill={color} stroke={BRASS_DARK} strokeWidth={0.2 * s} strokeLinejoin="round" />
      </AnimatedG>
      <Circle cx={ccx} cy={ccy} r={0.5 * s} fill={PIVOT} />
    </>
  )
}

/** Pencil in the hand zone (bottom-right of face). Writing mood makes
 *  the tip scribble with a short animated under-line.
 *
 *  Colors are fixed (not themed) - readable against any accent:
 *    - Body: yellow (classic no.2)
 *    - Top / eraser: pink
 *    - Tip (bottom): black graphite
 *    - Scribble line: black
 *  Previously the pencil pulled from `color` (accent) which made it
 *  disappear on pale themes and didn't read as a pencil. */
function PencilAccessory({ cx, cy, s, scribbleAnim, isDark }: Omit<AccessoryProps, 'kind' | 'color'> & { color?: string }) {
  const PENCIL_BODY = '#FFD83D'                         // yellow no.2 body (both modes)
  const PENCIL_ERASER = '#FF7AA2'                       // classic pink eraser top (both modes)
  // Tip + scribble ink flips on dark surfaces so the pencil stays
  // readable on Midnight. Graphite on light, chalk-white on dark.
  const PENCIL_TIP = isDark ? '#F2F3F5' : '#111111'
  const SCRIBBLE = isDark ? '#F2F3F5' : '#111111'

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
      {/* Scribble line - only when writing */}
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

/** Magnifying glass - circle lens + diagonal handle, hovering bottom-right. */
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

/** Paintbrush - wooden handle + colored tip. Tip color follows the
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
      {/* Bristle tip - colored per theme */}
      <Path
        d={`M ${tipX - 1 * s} ${tipY} q ${2 * s} ${3 * s} ${-1 * s} ${4 * s} z`}
        fill={color}
      />
      {/* Paint dab - tiny splotch on the "canvas" showing the tip drew something */}
      <Circle cx={tipX - 3 * s} cy={tipY + 4 * s} r={1 * s} fill={color} opacity={0.7} />
    </>
  )
}
