import { Box, Text, Tooltip } from '@mantine/core'
import { ZONE_HEX } from '../utils/zoneColors'

export interface IntervalSegment {
  seg_type: string
  zone: string
  duration_min: number
  repeats: number
  note?: string | null
}

const SEG_TYPE_LABELS: Record<string, string> = {
  warmup: 'Разм.', work: 'Раб.', rest_seg: 'Отд.', cooldown: 'Зам.',
}

interface Props {
  segments: IntervalSegment[]
  height?: number
}

export default function IntervalBar({ segments, height = 28 }: Props) {
  const total = segments.reduce((s, seg) => s + seg.duration_min * seg.repeats, 0)
  if (!segments.length || total === 0) return null

  return (
    <Box>
      <div style={{ display: 'flex', height, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
        {segments.map((seg, i) => {
          const label = seg.repeats > 1
            ? `${seg.zone}×${seg.repeats}`
            : `${seg.zone} ${seg.duration_min}м`
          const tip = `${SEG_TYPE_LABELS[seg.seg_type] ?? seg.seg_type}: ${seg.zone}, ${seg.duration_min}мин × ${seg.repeats}${seg.note ? ` — ${seg.note}` : ''}`
          return (
            <Tooltip key={i} label={tip} withArrow>
              <Box
                style={{
                  flex: seg.duration_min * seg.repeats,
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
      <Text size="xs" c="dimmed" mt={4}>Суммарно: {total} мин</Text>
    </Box>
  )
}
