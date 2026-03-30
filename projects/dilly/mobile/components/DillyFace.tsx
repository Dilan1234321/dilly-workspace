import { useEffect, useRef } from 'react'
import { Animated } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'

interface DillyFaceProps {
  size: number
}

const AnimatedPath = Animated.createAnimatedComponent(Path)

export function DillyFace({ size }: DillyFaceProps) {
  const TRAVEL = size * 0.15
  const faceRadius = (size * 0.44) / 2
  const s = faceRadius / 19

  // Spring physics via refs + rAF (no Reanimated needed)
  const posRef = useRef({ x: 0, y: 0 })
  const velRef = useRef({ x: 0, y: 0 })
  const targetRef = useRef({ x: 0, y: 0 })
  const smileRef = useRef(0.3)
  const smileTargetRef = useRef(0.3)
  const animFrame = useRef<ReturnType<typeof requestAnimationFrame>>()

  // Animated values for React re-render
  const posX = useRef(new Animated.Value(0)).current
  const posY = useRef(new Animated.Value(0)).current
  const smileAnim = useRef(new Animated.Value(0.3)).current

  // Derived path string from smile value
  const cx = size / 2
  const cy = size / 2
  const mW = 8 * s

  function pickTarget() {
    const angle = Math.random() * Math.PI * 2
    const dist = (0.72 + Math.random() * 0.28) * TRAVEL
    targetRef.current = { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist }
  }

  useEffect(() => {
    pickTarget()

    const moveInterval = setInterval(pickTarget, 2600)
    const smileInterval = setInterval(() => {
      smileTargetRef.current = 0.15 + Math.random() * 0.45
    }, 2200)

    function loop() {
      // Spring physics
      const dx = targetRef.current.x - posRef.current.x
      const dy = targetRef.current.y - posRef.current.y
      velRef.current.x = velRef.current.x + (dx * 0.06 - velRef.current.x) * 0.20
      velRef.current.y = velRef.current.y + (dy * 0.06 - velRef.current.y) * 0.20
      posRef.current.x += velRef.current.x
      posRef.current.y += velRef.current.y

      // Smile lerp
      smileRef.current += (smileTargetRef.current - smileRef.current) * 0.04

      // Push to Animated values (native driver not used — SVG not natively driven)
      posX.setValue(posRef.current.x)
      posY.setValue(posRef.current.y)
      smileAnim.setValue(smileRef.current)

      animFrame.current = requestAnimationFrame(loop)
    }

    animFrame.current = requestAnimationFrame(loop)

    return () => {
      clearInterval(moveInterval)
      clearInterval(smileInterval)
      if (animFrame.current) cancelAnimationFrame(animFrame.current)
    }
  }, [])

  // Build smile path string as Animated.Value interpolation
  const smilePath = smileAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [
      // flat smile (0)
      `M ${cx - mW} ${cy + 5 * s} Q ${cx} ${cy + 5 * s} ${cx + mW} ${cy + 5 * s}`,
      // full smile (1) — curve depth is 4.5*s*2 = 9s
      `M ${cx - mW} ${cy + 5 * s} Q ${cx} ${cy + 5 * s + 9 * s} ${cx + mW} ${cy + 5 * s}`,
    ],
  })

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        transform: [{ translateX: posX }, { translateY: posY }],
      }}
    >
      <Svg width={size} height={size}>
        {/* Left eye */}
        <Circle
          cx={cx - 8 * s}
          cy={cy - 4 * s}
          r={2.8 * s}
          fill="#2B3A8E"
        />
        {/* Right eye */}
        <Circle
          cx={cx + 8 * s}
          cy={cy - 4 * s}
          r={2.8 * s}
          fill="#2B3A8E"
        />
        {/* Smile — bezier arc */}
        <AnimatedPath
          d={smilePath}
          stroke="#2B3A8E"
          strokeWidth={2.2 * s}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  )
}
