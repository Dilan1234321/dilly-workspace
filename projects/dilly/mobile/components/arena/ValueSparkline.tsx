/**
 * ValueSparkline — a dep-free sparkline built from a list of numbers.
 *
 * Uses react-native-svg (already in the bundle) to draw:
 *   - a stroked path connecting the normalized points
 *   - a soft filled polygon beneath the stroke
 *   - start and end dots
 *
 * Width/height are flexible; accent color comes from the theme.
 */

import { View } from 'react-native'
import Svg, { Path, Circle } from 'react-native-svg'

interface Props {
  values: number[]
  width: number
  height: number
  stroke: string
  fill?: string
}

export default function ValueSparkline({ values, width, height, stroke, fill }: Props) {
  const clean = values.filter(v => Number.isFinite(v))
  if (clean.length < 2) {
    // Draw a flat line at center so the card never looks empty.
    return (
      <View style={{ width, height }}>
        <Svg width={width} height={height}>
          <Path d={`M 0 ${height / 2} L ${width} ${height / 2}`} stroke={stroke} strokeWidth={2} strokeLinecap="round" opacity={0.35} />
        </Svg>
      </View>
    )
  }
  const min = Math.min(...clean)
  const max = Math.max(...clean)
  const span = Math.max(1, max - min)
  const pad = 6
  const innerH = height - pad * 2
  const stepX = width / Math.max(1, clean.length - 1)

  const pts = clean.map((v, i) => {
    const x = Math.round(i * stepX)
    const y = Math.round(pad + innerH - ((v - min) / span) * innerH)
    return { x, y }
  })

  const strokePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const fillPath = `${strokePath} L ${width} ${height} L 0 ${height} Z`

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Path d={fillPath} fill={fill || stroke} opacity={0.12} />
        <Path d={strokePath} stroke={stroke} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {pts.length > 0 ? (
          <>
            <Circle cx={pts[0].x} cy={pts[0].y} r={2.5} fill={stroke} opacity={0.4} />
            <Circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={3.5} fill={stroke} />
          </>
        ) : null}
      </Svg>
    </View>
  )
}
