/**
 * RoleRadarChart — scatter plot of role clusters by volume and AI demand.
 *
 * X axis: job volume (number of active listings for this role in your cohort)
 * Y axis: AI fluency % (share of those listings requiring AI/ML skills)
 * Bubble size: proportional to sqrt(vol) so large clusters don't dominate
 *
 * Quadrant logic:
 *   Top-right: high volume + high AI demand  → "AI-Required"
 *   Top-left:  low volume + high AI demand   → "Niche AI"
 *   Bottom-right: high volume + low AI demand → "Stable volume"
 *   Bottom-left: low volume + low AI demand  → "Safe harbor"
 */

import React, { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg'
import { useResolvedTheme } from '../../hooks/useTheme'

export interface RadarDot {
  role_cluster: string
  label: string
  vol: number
  ai_pct: number
}

interface Props {
  dots: RadarDot[]
  width: number
}

const PAD = { top: 12, right: 14, bottom: 32, left: 44 }
const CHART_H = 220
const MAX_BUBBLE = 18
const MIN_BUBBLE = 5

function bubbleColor(aiPct: number): string {
  if (aiPct >= 70) return '#FF453A'   // coral — high AI demand
  if (aiPct >= 45) return '#FF9F0A'   // amber — moderate
  if (aiPct >= 25) return '#34C759'   // green — low-moderate
  return '#8E8E93'                    // gray — minimal
}

export default function RoleRadarChart({ dots, width }: Props) {
  const theme = useResolvedTheme()

  const cw = width - PAD.left - PAD.right
  const ch = CHART_H - PAD.top - PAD.bottom

  const { positions, maxVol } = useMemo(() => {
    if (!dots.length) return { positions: [], maxVol: 0 }
    const maxVol = Math.max(...dots.map(d => d.vol))
    const positions = dots.map(d => {
      const x = PAD.left + (d.vol / maxVol) * cw
      const y = PAD.top + ch - (d.ai_pct / 100) * ch
      const r = Math.max(MIN_BUBBLE, Math.min(MAX_BUBBLE, Math.sqrt(d.vol / maxVol) * MAX_BUBBLE))
      return { ...d, x, y, r }
    })
    return { positions, maxVol }
  }, [dots, cw, ch])

  const axisColor = theme.surface.t3
  const gridColor = theme.surface.border

  // Y axis ticks: 0, 25, 50, 75, 100
  const yTicks = [0, 25, 50, 75, 100]
  // X axis ticks: 0, 50%, 100% of maxVol
  const xTicks = maxVol > 0 ? [0, Math.round(maxVol * 0.5), maxVol] : []

  if (!dots.length) {
    return (
      <View style={[s.empty, { borderColor: theme.surface.border }]}>
        <Text style={[s.emptyText, { color: theme.surface.t3 }]}>
          Not enough role data for your cohort yet.
        </Text>
      </View>
    )
  }

  return (
    <View>
      <Svg width={width} height={CHART_H}>
        {/* Grid lines + Y ticks */}
        {yTicks.map(tick => {
          const y = PAD.top + ch - (tick / 100) * ch
          return (
            <React.Fragment key={tick}>
              <Line
                x1={PAD.left} y1={y}
                x2={PAD.left + cw} y2={y}
                stroke={gridColor} strokeWidth={1} strokeDasharray={tick === 0 ? '' : '3,4'}
              />
              <SvgText
                x={PAD.left - 6} y={y + 4}
                textAnchor="end" fontSize={9} fill={axisColor} fontWeight="700"
              >
                {tick}%
              </SvgText>
            </React.Fragment>
          )
        })}

        {/* X axis ticks */}
        {xTicks.map((tick, i) => {
          const x = PAD.left + (maxVol > 0 ? (tick / maxVol) * cw : 0)
          const label = tick === 0 ? '0' : tick >= 1000 ? `${(tick / 1000).toFixed(1)}k` : String(tick)
          return (
            <React.Fragment key={i}>
              <Line
                x1={x} y1={PAD.top}
                x2={x} y2={PAD.top + ch}
                stroke={gridColor} strokeWidth={1} strokeDasharray={i === 0 ? '' : '3,4'}
              />
              <SvgText
                x={x} y={PAD.top + ch + 16}
                textAnchor="middle" fontSize={9} fill={axisColor} fontWeight="700"
              >
                {label}
              </SvgText>
            </React.Fragment>
          )
        })}

        {/* Axis border lines */}
        <Line
          x1={PAD.left} y1={PAD.top}
          x2={PAD.left} y2={PAD.top + ch}
          stroke={axisColor} strokeWidth={1.5}
        />
        <Line
          x1={PAD.left} y1={PAD.top + ch}
          x2={PAD.left + cw} y2={PAD.top + ch}
          stroke={axisColor} strokeWidth={1.5}
        />

        {/* Bubbles */}
        {positions.map((dot, i) => (
          <React.Fragment key={i}>
            <Circle
              cx={dot.x} cy={dot.y} r={dot.r}
              fill={bubbleColor(dot.ai_pct)}
              opacity={0.82}
            />
            {/* Label above bubble if space allows */}
            <SvgText
              x={dot.x} y={dot.y - dot.r - 3}
              textAnchor="middle" fontSize={8.5} fill={theme.surface.t2} fontWeight="700"
            >
              {dot.label.length > 12 ? dot.label.slice(0, 10) + '…' : dot.label}
            </SvgText>
          </React.Fragment>
        ))}
      </Svg>

      {/* Axis labels below chart */}
      <View style={s.axisLabels}>
        <Text style={[s.axisLabel, { color: theme.surface.t3 }]}>← fewer listings</Text>
        <Text style={[s.axisCenter, { color: theme.surface.t3 }]}>JOB VOLUME</Text>
        <Text style={[s.axisLabel, { color: theme.surface.t3 }]}>more listings →</Text>
      </View>

      {/* Legend */}
      <View style={s.legend}>
        {[
          { color: '#FF453A', label: '70%+ AI required' },
          { color: '#FF9F0A', label: '45-69%' },
          { color: '#34C759', label: '25-44%' },
          { color: '#8E8E93', label: '<25%' },
        ].map(({ color, label }) => (
          <View key={label} style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: color }]} />
            <Text style={[s.legendText, { color: theme.surface.t3 }]}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  empty: {
    marginHorizontal: 0,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyText: { fontSize: 13, textAlign: 'center' },
  axisLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: PAD.left,
    paddingRight: PAD.right,
    marginTop: -6,
  },
  axisLabel: { fontSize: 9, fontWeight: '700' },
  axisCenter: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingLeft: PAD.left,
    marginTop: 10,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, fontWeight: '700' },
})
