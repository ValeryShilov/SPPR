import {
  ActionIcon,
  Box,
  Button,
  Group,
  NumberInput,
  Select,
  Table,
  Text,
  TextInput,
} from '@mantine/core'
import { ZONE_HEX } from '../utils/zoneColors'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Segment {
  _id: string
  seg_type: string
  zone: string
  duration_min: number | null  // null when distance-based
  distance_km: number | null   // null when time-based
  repeats: number
  note: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const mkSeg = (): Segment => ({
  _id: crypto.randomUUID(),
  seg_type: 'work',
  zone: 'Z3',
  duration_min: 5,
  distance_km: null,
  repeats: 1,
  note: '',
})

const segFlex = (seg: Segment | { duration_min: number | null; distance_km?: number | null; repeats: number }) =>
  seg.distance_km != null
    ? seg.distance_km * seg.repeats * 6   // ~6 мин/км для визуальных пропорций
    : (seg.duration_min ?? 0) * seg.repeats

// ─── Constants ────────────────────────────────────────────────────────────────

export const SEG_TYPE_OPTIONS = [
  { value: 'warmup',   label: 'Разминка' },
  { value: 'work',     label: 'Рабочий' },
  { value: 'rest_seg', label: 'Отдых' },
  { value: 'cooldown', label: 'Заминка' },
]

export const SEG_TYPE_LABELS: Record<string, string> = {
  warmup: 'Разм.', work: 'Раб.', rest_seg: 'Отд.', cooldown: 'Зам.',
}

const ZONE_OPTIONS = [
  { value: 'Z1', label: 'Z1' },
  { value: 'Z2', label: 'Z2' },
  { value: 'Z3', label: 'Z3' },
  { value: 'Z4', label: 'Z4' },
  { value: 'Z5', label: 'Z5' },
]

const UNIT_OPTIONS = [
  { value: 'min', label: 'мин' },
  { value: 'km',  label: 'км'  },
]

// ─── IntervalPreview ──────────────────────────────────────────────────────────

export function IntervalPreview({ segments }: { segments: Segment[] }) {
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
    <Box mt="xs">
      <div style={{ display: 'flex', height: 28, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
        {segments.map((seg) => {
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
            <div
              key={seg._id}
              title={tip}
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
                minWidth: 16,
                userSelect: 'none',
                cursor: 'default',
              }}
            >
              {label}
            </div>
          )
        })}
      </div>
      {parts.length > 0 && (
        <Text size="xs" c="dimmed" mt={4}>Суммарно: {parts.join(' + ')}</Text>
      )}
    </Box>
  )
}

// ─── IntervalBuilder ─────────────────────────────────────────────────────────

export default function IntervalBuilder({
  segments,
  onUpdate,
}: {
  segments: Segment[]
  onUpdate: (s: Segment[]) => void
}) {
  const upd = (id: string, patch: Partial<Segment>) =>
    onUpdate(segments.map((s) => (s._id === id ? { ...s, ...patch } : s)))
  const del = (id: string) => onUpdate(segments.filter((s) => s._id !== id))

  return (
    <Box>
      {segments.length > 0 && (
        <Table verticalSpacing={4} fz="xs" mb="xs" withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Тип</Table.Th>
              <Table.Th w={68}>Зона</Table.Th>
              <Table.Th w={160}>Объём</Table.Th>
              <Table.Th w={80}>Повтор.</Table.Th>
              <Table.Th>Заметка</Table.Th>
              <Table.Th w={32} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {segments.map((seg) => {
              const isKm = seg.distance_km != null
              return (
                <Table.Tr key={seg._id}>
                  <Table.Td>
                    <Select
                      data={SEG_TYPE_OPTIONS}
                      value={seg.seg_type}
                      onChange={(v) => upd(seg._id, { seg_type: v ?? 'work' })}
                      size="xs" allowDeselect={false} w={118}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Select
                      data={ZONE_OPTIONS}
                      value={seg.zone}
                      onChange={(v) => upd(seg._id, { zone: v ?? 'Z2' })}
                      size="xs" allowDeselect={false} w={64}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      <NumberInput
                        min={isKm ? 0.1 : 1}
                        max={isKm ? 100 : 180}
                        step={isKm ? 0.5 : 1}
                        decimalScale={isKm ? 1 : 0}
                        value={isKm ? (seg.distance_km ?? 1) : (seg.duration_min ?? 5)}
                        onChange={(v) =>
                          isKm
                            ? upd(seg._id, { distance_km: Number(v) || 0.5 })
                            : upd(seg._id, { duration_min: Number(v) || 1 })
                        }
                        size="xs" w={76}
                      />
                      <Select
                        data={UNIT_OPTIONS}
                        value={isKm ? 'km' : 'min'}
                        onChange={(v) => {
                          if (v === 'km') {
                            upd(seg._id, { distance_km: 1, duration_min: null })
                          } else {
                            upd(seg._id, { duration_min: 5, distance_km: null })
                          }
                        }}
                        size="xs" allowDeselect={false} w={68}
                      />
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      min={1} max={30}
                      value={seg.repeats}
                      onChange={(v) => upd(seg._id, { repeats: Number(v) || 1 })}
                      size="xs" w={60}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      value={seg.note}
                      placeholder="—"
                      onChange={(e) => upd(seg._id, { note: e.target.value })}
                      size="xs"
                    />
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon color="red" variant="subtle" size="sm" onClick={() => del(seg._id)}>
                      ×
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      )}
      <Button size="xs" variant="light" onClick={() => onUpdate([...segments, mkSeg()])}>
        + Добавить сегмент
      </Button>
      <IntervalPreview segments={segments} />
    </Box>
  )
}
