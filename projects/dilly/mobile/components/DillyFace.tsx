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
}

const AnimatedPath = Animated.createAnimatedComponent(Path)
const AnimatedG = Animated.createAnimatedComponent(G)

const FACE_INK_LIGHT = '#2B3A8E'
// On Midnight (dark) surfaces the dark-indigo ink disappears into the bg.
// Light sky blue makes Dilly's face pop against black.
const FACE_INK_DARK = '#8AB4FF'

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

export function DillyFace({ size, mood = 'idle', accessory = 'none', accessoryColor }: DillyFaceProps) {
  const TRAVEL = size * 0.15
  const faceRadius = (size * 0.44) / 2
  const s = faceRadius / 19

  // Ink color tracks the active theme surface: dark-indigo on light
  // surfaces, light sky-blue on Midnight so the face pops against black.
  const theme = useResolvedTheme()
  const faceInk = theme.surface.dark ? FACE_INK_DARK : FACE_INK_LIGHT

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
    // Writing: lock gaze DOWN-RIGHT toward the pencil tip (which the
    // Accessory renders at cx+14s, cy+14s). This makes it look like
    // Dilly is watching her own pencil as she writes, which is what
    // users expect from a "thinking / typing" animation. Override
    // takes precedence over the generic lockGaze-to-center branch.
    if (mood === 'writing') {
      targetRef.current = { x: TRAVEL * 0.9, y: TRAVEL * 0.9 }
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
      // Only roam the smile if we're idle; other moods keep the
      // expression rock-steady.
      if (mood === 'idle') {
        smileTargetRef.current = 0.15 + Math.random() * 0.45
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

  // Accent-colored perimeter ring behind Dilly. The ring + fill must
  // stay STATIC — only the face (eyes/smile/tilt) inside should move.
  // So the ring goes on an outer View with no transforms, and the
  // face SVG sits inside an Animated.View that carries the drift
  // and tilt. Reading from theme so the ring follows Customize.
  // Stroke width scales with size: 1.5px min, ~3px on hero.
  const ringBorder = Math.max(1.5, Math.round(size * 0.025))

  // When Dilly is "writing" with a pencil, we render the pencil OUTSIDE
  // the perimeter ring — bigger, static, poking in from the bottom-right.
  // The face's gaze-lock-to-corner makes it read like Dilly is watching
  // her own pencil. Other accessories (magnifier, paintbrush) continue
  // to render inside the SVG near her mouth.
  const externalPencil = mood === 'writing' && accessory === 'pencil'
  const pencilSize = Math.round(size * 0.65)
  const pencilColor = accessoryColor || faceInk
  // Outer wrapper is bigger than the ring so the pencil has room to
  // extend past the ring edge without being clipped. Extra padding
  // goes bottom-right only, where the pencil sits.
  const outerW = size + (externalPencil ? pencilSize * 0.55 : 0)
  const outerH = size + (externalPencil ? pencilSize * 0.55 : 0)

  return (
    <View style={{ width: outerW, height: outerH }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ringBorder,
          borderColor: theme.accent,
          backgroundColor: theme.accentSoft,
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
            {accessory !== 'none' && !externalPencil && (
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

      {/* External pencil. Rendered OUTSIDE the ring so it sits
          against the bottom-right of the perimeter and reads like
          something Dilly is holding just outside her face. Static:
          no scribble animation, no movement. Only Dilly's gaze
          drifts toward it. */}
      {externalPencil && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: pencilSize,
            height: pencilSize,
          }}
        >
          <Svg width={pencilSize} height={pencilSize} viewBox="0 0 100 100">
            {/* Pencil body — angled down-right toward the ring edge.
                Tip at the top-left (touching the ring), eraser at
                the bottom-right (far corner). */}
            <Line x1={18} y1={18} x2={78} y2={78} stroke={pencilColor} strokeWidth={11} strokeLinecap="round" />
            {/* Wood collar at the tip end: darker band across the
                pencil near the tip to give it dimension. */}
            <Line x1={26} y1={26} x2={34} y2={34} stroke={pencilColor} strokeWidth={14} strokeLinecap="butt" opacity={0.35} />
            {/* Tip point — small filled circle where the pencil writes. */}
            <Circle cx={14} cy={14} r={5} fill={pencilColor} />
            {/* Metal ferrule band where the eraser meets the body. */}
            <Line x1={68} y1={68} x2={78} y2={78} stroke="#C9A84C" strokeWidth={12} strokeLinecap="butt" />
            {/* Eraser */}
            <Circle cx={84} cy={84} r={8} fill="#FF9F0A" />
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
 *  the tip scribble with a short animated under-line. */
function PencilAccessory({ cx, cy, s, color, scribbleAnim }: Omit<AccessoryProps, 'kind'>) {
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
      {/* Body */}
      <Line x1={tipX} y1={tipY} x2={butX} y2={butY} stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
      {/* Tip highlight */}
      <Circle cx={tipX} cy={tipY} r={0.9 * s} fill={color} />
      {/* Eraser */}
      <Circle cx={butX} cy={butY} r={1.2 * s} fill="#FF9F0A" />
      {/* Scribble line — only when writing */}
      {dashOffset && (
        <AnimatedPath
          d={`M ${tipX - 5 * s} ${tipY + 3 * s} l ${10 * s} 0`}
          stroke={color}
          strokeWidth={1.4 * s}
          strokeLinecap="round"
          strokeDasharray={`${4 * s},${3 * s}`}
          strokeDashoffset={dashOffset as unknown as number}
          opacity={0.75}
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
  return (
    <>
      <Circle cx={lensX} cy={lensY} r={lensR} stroke={color} strokeWidth={1.6 * s} fill="rgba(43,58,142,0.08)" />
      {/* Sparkle glint */}
      <Circle cx={lensX - lensR * 0.35} cy={lensY - lensR * 0.35} r={0.7 * s} fill="#FFFFFF" opacity={0.9} />
      <Line x1={handleX1} y1={handleY1} x2={handleX2} y2={handleY2} stroke={color} strokeWidth={2 * s} strokeLinecap="round" />
    </>
  )
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
