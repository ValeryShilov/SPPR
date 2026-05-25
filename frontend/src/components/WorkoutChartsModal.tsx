import { Box, Group, Modal, Stack, Text } from '@mantine/core'
import { ZONE_HEX } from '../utils/zoneColors'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TimePoint {
  s: number        // seconds from start
  hr?: number      // heart rate bpm
  z?: string       // HR zone label: Z1-Z5
  spd?: number     // speed m/s
}

interface Props {
  opened: boolean
  onClose: () => void
  timeseries: TimePoint[]
  workoutType?: string | null
  title?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────


const ZONE_LABELS: Record<string, string> = {
  Z1: 'Z1', Z2: 'Z2', Z3: 'Z3', Z4: 'Z4', Z5: 'Z5',
}

const PACE_TYPES = new Set(['run', 'ski', 'skiroll'])

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const h = Math.floor(m / 60)
  const mm = m % 60
  return h > 0 ? `${h}:${String(mm).padStart(2, '0')}` : `${m}м`
}

function fmtPace(spd: number, workoutType: string | null | undefined): string {
  if (!spd || spd <= 0) return '—'
  if (!workoutType || !PACE_TYPES.has(workoutType)) {
    return `${(spd * 3.6).toFixed(1)} км/ч`
  }
  const paceMinKm = 1000 / spd / 60
  const mins = Math.floor(paceMinKm)
  const secs = Math.round((paceMinKm - mins) * 60)
  return `${mins}:${String(secs).padStart(2, '0')} мин/км`
}

/** Вычисляет min/max HR для каждой зоны на основе реальных данных. */
function computeZoneBands(data: TimePoint[]): Record<string, { min: number; max: number }> {
  const bands: Record<string, { min: number; max: number }> = {}
  for (const p of data) {
    if (p.hr == null || !p.z) continue
    const cur = bands[p.z]
    if (!cur) bands[p.z] = { min: p.hr, max: p.hr }
    else {
      if (p.hr < cur.min) cur.min = p.hr
      if (p.hr > cur.max) cur.max = p.hr
    }
  }
  // Расширяем каждую зону на 1 bpm чтобы не было зазоров между полосами
  if (bands.Z1 && bands.Z2) { bands.Z1.max = bands.Z2.min - 1 }
  if (bands.Z2 && bands.Z3) { bands.Z2.max = bands.Z3.min - 1 }
  if (bands.Z3 && bands.Z4) { bands.Z3.max = bands.Z4.min - 1 }
  if (bands.Z4 && bands.Z5) { bands.Z4.max = bands.Z5.min - 1 }
  return bands
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function HrTooltip({ active, payload }: { active?: boolean; payload?: { payload: TimePoint }[] }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const zone = p.z ? ZONE_LABELS[p.z] : null
  return (
    <Box p="xs" style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 6, fontSize: 12 }}>
      <Text size="xs" c="dimmed">{fmtTime(p.s)}</Text>
      {p.hr != null && (
        <Group gap={4}>
          <Text size="xs" fw={600}>{p.hr} уд/мин</Text>
          {zone && <Text size="xs" style={{ color: ZONE_HEX[p.z!] ?? '#adb5bd' }}>({zone})</Text>}
        </Group>
      )}
    </Box>
  )
}

function PaceTooltip({
  active, payload, workoutType,
}: {
  active?: boolean
  payload?: { payload: TimePoint }[]
  workoutType?: string | null
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <Box p="xs" style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 6, fontSize: 12 }}>
      <Text size="xs" c="dimmed">{fmtTime(p.s)}</Text>
      {p.spd != null && (
        <Text size="xs" fw={600}>{fmtPace(p.spd, workoutType)}</Text>
      )}
    </Box>
  )
}

// ─── Sub-charts ───────────────────────────────────────────────────────────────

function HrChart({ data }: { data: TimePoint[] }) {
  const hrData = data.filter((p) => p.hr != null)
  if (hrData.length === 0) return <Text size="sm" c="dimmed" ta="center">Нет данных ЧСС</Text>

  const zoneBands = computeZoneBands(hrData)
  const hrs = hrData.map((p) => p.hr!)
  const yMin = Math.max(0, Math.min(...hrs) - 10)
  const yMax = Math.max(...hrs) + 10

  return (
    <Box>
      <Text size="xs" fw={600} c="dimmed" mb={4}>Пульс (уд/мин)</Text>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={hrData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f3f5" />
          <XAxis
            dataKey="s"
            tickFormatter={fmtTime}
            tick={{ fontSize: 10 }}
            interval="preserveStartEnd"
          />
          <YAxis domain={[yMin, yMax]} tick={{ fontSize: 10 }} width={36} />
          <Tooltip content={<HrTooltip />} />

          {/* Цветные полосы зон на фоне */}
          {(['Z1', 'Z2', 'Z3', 'Z4', 'Z5'] as const).map((zone) => {
            const band = zoneBands[zone]
            if (!band) return null
            return (
              <ReferenceArea
                key={zone}
                y1={band.min}
                y2={band.max}
                fill={ZONE_HEX[zone]}
                fillOpacity={0.18}
                ifOverflow="extendDomain"
              />
            )
          })}

          <Line
            dataKey="hr"
            stroke="#e03131"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Легенда зон */}
      <Group gap={10} mt={4} wrap="wrap">
        {(['Z1', 'Z2', 'Z3', 'Z4', 'Z5'] as const).filter((z) => zoneBands[z]).map((z) => (
          <Group key={z} gap={4} wrap="nowrap">
            <Box w={10} h={10} style={{ background: ZONE_HEX[z], borderRadius: 2, opacity: 0.7 }} />
            <Text size="xs" c="dimmed">{ZONE_LABELS[z]}</Text>
          </Group>
        ))}
      </Group>
    </Box>
  )
}

function PaceChart({ data, workoutType }: { data: TimePoint[]; workoutType?: string | null }) {
  const paceData = data.filter((p) => p.spd != null && p.spd > 0)
  if (paceData.length === 0) return null

  const isPace = PACE_TYPES.has(workoutType ?? '')
  const label = isPace ? 'Темп (мин/км)' : 'Скорость (км/ч)'

  // Convert spd for display on Y axis
  const converted = paceData.map((p) => ({
    ...p,
    display: isPace
      ? parseFloat((1000 / p.spd! / 60).toFixed(2))   // min/km
      : parseFloat((p.spd! * 3.6).toFixed(2)),          // km/h
  }))

  const vals = converted.map((p) => p.display)
  const rawMin = Math.min(...vals)
  const rawMax = Math.max(...vals)
  const margin = (rawMax - rawMin) * 0.1 || 0.5

  // Для темпа ось инвертирована (меньше = быстрее)
  const yDomain: [number, number] = isPace
    ? [rawMin - margin, rawMax + margin]
    : [rawMin - margin, rawMax + margin]

  const tickFormatter = (v: number) => {
    if (isPace) {
      const m = Math.floor(v)
      const s = Math.round((v - m) * 60)
      return `${m}:${String(s).padStart(2, '0')}`
    }
    return v.toFixed(1)
  }

  return (
    <Box mt="md">
      <Text size="xs" fw={600} c="dimmed" mb={4}>{label}</Text>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={converted} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f3f5" />
          <XAxis
            dataKey="s"
            tickFormatter={fmtTime}
            tick={{ fontSize: 10 }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={yDomain}
            reversed={isPace}
            tickFormatter={tickFormatter}
            tick={{ fontSize: 10 }}
            width={42}
          />
          <Tooltip
            content={
              <PaceTooltip workoutType={workoutType} />
            }
          />
          <Line
            dataKey="display"
            stroke="#2f9e44"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Box>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WorkoutChartsModal({ opened, onClose, timeseries, workoutType, title }: Props) {
  const hasHr    = timeseries.some((p) => p.hr != null)
  const hasPace  = timeseries.some((p) => p.spd != null && p.spd > 0)

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="xl"
      title={title ?? 'Графики тренировки'}
    >
      {timeseries.length === 0 ? (
        <Text c="dimmed" ta="center">Нет данных временного ряда</Text>
      ) : (
        <Stack gap="sm">
          {hasHr  && <HrChart data={timeseries} />}
          {hasPace && <PaceChart data={timeseries} workoutType={workoutType} />}
          {!hasHr && !hasPace && (
            <Text c="dimmed" ta="center">Нет данных для отображения</Text>
          )}
        </Stack>
      )}
    </Modal>
  )
}
