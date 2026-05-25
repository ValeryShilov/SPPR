import { Box, Text, Tooltip } from '@mantine/core'
import { ZONE_HEX } from '../utils/zoneColors'

export interface IntervalSegment {
  seg_type: string
  zone: string
  duration_min: number | null
  distance_km?: number | null
  repeats: number
  note?: string | null
}

const SEG_TYPE_LABELS: Record<string, string> = {
  warmup: 'Разм.', work: 'Раб.', rest_seg: 'Отд.', cooldown: 'Зам.',
}

const segFlex = (seg: IntervalSegment) =>
  seg.distance_km != null
    ? seg.distance_km * seg.repeats * 6
    : (seg.duration_min ?? 0) * seg.repeats

interface Props {
  segments: IntervalSegment[]
  height?: number
}

export default function IntervalBar({ segments, height = 28 }: Props) {
  const totalFlex = segments.reduce((s, seg) => s + segFlex(seg), 0)
  if (!segments.length || totalFlex === 0) return null

  const totalMins = segments.reduce(
    (s, seg) => seg.duration_min != null ? s + seg.duration_min * seg.repeats : s, 0,
  )
  const totalKm = segments.reduce(
    (s, seg) => seg.distance_km != null ? s + seg.distance_km * seg.repeats : s, 0,
  )
  const parts: string[] = []
  if (totalMins > 0) parts.push(`${totalMins} мин`)
  if (totalKm > 0)   parts.push(`${totalKm % 1 === 0 ? totalKm : totalKm.toFixed(1)} км`)

  return (
    <Box>
      <div style={{ display: 'flex', height, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
        {segments.map((seg, i) => {
          const flex = segFlex(seg)
          if (flex === 0) return null
          const label = seg.repeats > 1
            ? `${seg.zone}×${seg.repeats}`
            : seg.distance_km != null
              ? `${seg.zone} ${seg.distance_km}км`
              : `${seg.zone} ${seg.duration_min}м`
          const tip = `${SEG_TYPE_LABELS[seg.seg_type] ?? seg.seg_type}: ${seg.zone}, ${
            seg.distance_km != null
              ? `${seg.distance_km}км`
              : `${seg.duration_min}мин`
          } × ${seg.repeats}${seg.note ? ` — ${seg.note}` : ''}`
          return (
            <Tooltip key={i} label={tip} withArrow>
              <Box
                style={{
                  flex,
                  background: ZONE_HEX[seg.zone as keyof typeof ZONE_HEX] ?? '#aaa',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  fontSize: 10,
                  fontWeight: 700,
                  color: seg.zone === 'Z3' ? '#333' : '#fff',
                  minWidth: 18,
                  userSelect: 'none',
                  cursor: 'default',
                }}
              >
                {label}
              </Box>
            </Tooltip>
          )
        })}
      </div>
      {parts.length > 0 && (
        <Text size="xs" c="dimmed" mt={4}>Суммарно: {parts.join(' + ')}</Text>
      )}
    </Box>
  )
}
