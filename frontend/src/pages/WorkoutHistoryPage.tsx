import {
  Badge,
  Box,
  Collapse,
  Container,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { athletesApi } from '../api/athletes'
import { telemetryApi } from '../api/telemetry'
import SportIcon from '../components/SportIcon'
import WorkoutChartsModal, { type TimePoint } from '../components/WorkoutChartsModal'
import {
  isoNDaysAgo,
  isoToday,
  toIso,
  VolumePeriodSelector,
  getPeriodBounds,
  type PeriodType,
} from '../components/AthleteAnalyticsBlock'
import { calcPaceSpeed, PACE_TYPES } from '../utils/pace'
import { ZONE_BADGE_COLOR, ZONE_HEX } from '../utils/zoneColors'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AthleteProfile {
  id: string
  first_name: string
  last_name: string
}

interface HistoryItem {
  id: string
  planned_date: string
  workout_type: string | null
  workout_subtype: string | null
  description: string | null
  planned_duration_min: number | null
  planned_tss: number | null
  actual_duration_min: number | null
  actual_tss: number | null
  actual_distance_km: number | null
  avg_hr: number | null
  max_hr: number | null
  hr_zone1_min: number | null
  hr_zone2_min: number | null
  hr_zone3_min: number | null
  hr_zone4_min: number | null
  hr_zone5_min: number | null
  target_zone: string | null
  status: string
}

interface TelemetryData {
  timeseries?: TimePoint[] | null
  rpe?: number | null
  comment?: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WORKOUT_TYPE_LABEL: Record<string, string> = {
  run: 'Бег', ski: 'Лыжи', skiroll: 'Лыжероллеры', bike: 'Велосипед',
  strength: 'Силовая', recovery: 'Восстановление', rest: 'Отдых', other: 'Другое',
}

const ZONE_KEYS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'] as const

// ─── Row component ────────────────────────────────────────────────────────────

function HistoryRow({ item }: { item: HistoryItem }) {
  const [open, setOpen] = useState(false)
  const [chartsOpen, setChartsOpen] = useState(false)

  const { data: telemetry } = useQuery<TelemetryData | null>({
    queryKey: ['workout-telemetry', item.id],
    queryFn: () => telemetryApi.getWorkoutTelemetry(item.id) as Promise<TelemetryData | null>,
    enabled: open,
  })

  const zoneMins: (number | null)[] = [
    item.hr_zone1_min, item.hr_zone2_min, item.hr_zone3_min,
    item.hr_zone4_min, item.hr_zone5_min,
  ]
  const totalZoneMin: number = zoneMins.reduce((s: number, v) => s + (v ?? 0), 0)
  const hasZones = totalZoneMin > 0

  const pace = item.workout_type && PACE_TYPES.has(item.workout_type) && item.actual_duration_min && item.actual_distance_km
    ? calcPaceSpeed(item.actual_duration_min, item.actual_distance_km, item.workout_type)
    : null

  const d = new Date(item.planned_date + 'T00:00:00')
  const dateLabel = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
  const weekday = d.toLocaleDateString('ru-RU', { weekday: 'short' })

  const timeseries = telemetry?.timeseries ?? null

  return (
    <>
      <UnstyledButton
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', textAlign: 'left' }}
      >
        <Box px="md" py="sm" style={{
          borderBottom: open ? 'none' : '1px solid #f1f3f5',
          borderRadius: open ? '8px 8px 0 0' : undefined,
          background: open ? '#f8f9fa' : undefined,
          transition: 'background 0.1s',
        }}>
          <Group gap="md" wrap="nowrap" align="center">
            {/* Date */}
            <Box miw={80} style={{ flexShrink: 0 }}>
              <Text size="sm" fw={600} lh={1.2}>{dateLabel}</Text>
              <Text size="xs" c="dimmed">{weekday}</Text>
            </Box>

            {/* Sport icon + type */}
            <Group gap={6} wrap="nowrap" miw={120} style={{ flexShrink: 0 }}>
              <SportIcon type={item.workout_type ?? 'other'} size={24} color="#343a40" />
              <Box>
                <Text size="sm" lh={1.2}>
                  {WORKOUT_TYPE_LABEL[item.workout_type ?? ''] ?? item.workout_type ?? '—'}
                </Text>
                {item.workout_subtype && (
                  <Text size="xs" c="dimmed">{item.workout_subtype}</Text>
                )}
              </Box>
            </Group>

            {/* Zone badge */}
            <Box miw={36} style={{ flexShrink: 0 }}>
              {item.target_zone && (
                <Badge size="xs" color={ZONE_BADGE_COLOR[item.target_zone] ?? 'gray'} variant="light">
                  {item.target_zone}
                </Badge>
              )}
            </Box>

            {/* Metrics row */}
            <Group gap="xl" wrap="wrap" style={{ flex: 1 }}>
              {item.actual_duration_min != null && (
                <Stack gap={0} align="center">
                  <Text size="sm" fw={600} lh={1}>{item.actual_duration_min} мин</Text>
                  {item.planned_duration_min != null && item.planned_duration_min !== item.actual_duration_min && (
                    <Text size="xs" c="dimmed">план {item.planned_duration_min}</Text>
                  )}
                </Stack>
              )}
              {item.actual_distance_km != null && (
                <Stack gap={0} align="center">
                  <Text size="sm" fw={600} lh={1}>{Number(item.actual_distance_km).toFixed(1)} км</Text>
                  <Text size="xs" c="dimmed">дист.</Text>
                </Stack>
              )}
              {pace && (
                <Stack gap={0} align="center">
                  <Text size="sm" fw={600} lh={1}>{pace}</Text>
                  <Text size="xs" c="dimmed">{item.workout_type === 'run' ? 'темп' : 'скорость'}</Text>
                </Stack>
              )}
              {item.avg_hr != null && (
                <Stack gap={0} align="center">
                  <Text size="sm" fw={600} lh={1}>{item.avg_hr}</Text>
                  <Text size="xs" c="dimmed">ЧСС ср.</Text>
                </Stack>
              )}
              {item.actual_tss != null && (
                <Stack gap={0} align="center">
                  <Text size="sm" fw={600} lh={1}>{Math.round(item.actual_tss)}</Text>
                  <Text size="xs" c="dimmed">TSS</Text>
                </Stack>
              )}
            </Group>

            <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>{open ? '▲' : '▼'}</Text>
          </Group>
        </Box>
      </UnstyledButton>

      <Collapse in={open}>
        <Box px="md" pb="md" style={{
          background: '#f8f9fa',
          borderBottom: '1px solid #f1f3f5',
          borderRadius: '0 0 8px 8px',
        }}>
          <Stack gap="sm">
            {/* Zone breakdown */}
            {hasZones && (
              <Box>
                <Text size="xs" c="dimmed" mb={6}>Время в зонах</Text>
                {/* Stacked bar */}
                <Box style={{ display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden', width: '100%' }}>
                  {ZONE_KEYS.map((z, i) => {
                    const mins = zoneMins[i] ?? 0
                    if (!mins) return null
                    const pct = (mins / totalZoneMin) * 100
                    return (
                      <Box
                        key={z}
                        title={`${z}: ${mins} мин`}
                        style={{ width: `${pct}%`, background: ZONE_HEX[z], flexShrink: 0 }}
                      />
                    )
                  })}
                </Box>
                <Group gap="sm" mt={4} wrap="wrap">
                  {ZONE_KEYS.map((z, i) => {
                    const mins = zoneMins[i] ?? 0
                    if (!mins) return null
                    return (
                      <Group key={z} gap={4} wrap="nowrap">
                        <Box w={10} h={10} style={{ borderRadius: 2, background: ZONE_HEX[z], flexShrink: 0 }} />
                        <Text size="xs" c="dimmed">{z}: {mins} мин</Text>
                      </Group>
                    )
                  })}
                </Group>
              </Box>
            )}

            {/* Description */}
            {item.description && (
              <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>{item.description}</Text>
            )}

            {/* RPE / comment from telemetry */}
            {telemetry && (
              <Group gap="lg" wrap="wrap">
                {telemetry.rpe != null && (
                  <Stack gap={0}>
                    <Text size="sm" fw={600}>{telemetry.rpe}<Text span size="xs" c="dimmed">/10</Text></Text>
                    <Text size="xs" c="dimmed">самочувствие</Text>
                  </Stack>
                )}
                {telemetry.comment && (
                  <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>{telemetry.comment}</Text>
                )}
              </Group>
            )}

            {/* Max HR */}
            {item.max_hr != null && (
              <Text size="xs" c="dimmed">ЧСС макс.: {item.max_hr} уд/мин</Text>
            )}

            {/* Charts button */}
            {timeseries && timeseries.length > 0 && (
              <Box>
                <UnstyledButton
                  onClick={() => setChartsOpen(true)}
                  style={{
                    fontSize: 13, color: '#1971c2',
                    textDecoration: 'underline', cursor: 'pointer',
                  }}
                >
                  📈 Показать графики
                </UnstyledButton>
              </Box>
            )}
          </Stack>
        </Box>
      </Collapse>

      {timeseries && timeseries.length > 0 && (
        <WorkoutChartsModal
          opened={chartsOpen}
          onClose={() => setChartsOpen(false)}
          timeseries={timeseries}
          workoutType={item.workout_type}
          title={`${WORKOUT_TYPE_LABEL[item.workout_type ?? ''] ?? ''} · ${dateLabel}`}
        />
      )}
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkoutHistoryPage() {
  const [periodType,   setPeriodType]   = useState<PeriodType>('month')
  const [periodOffset, setPeriodOffset] = useState(0)
  const [customFrom,   setCustomFrom]   = useState(isoNDaysAgo(29))
  const [customTo,     setCustomTo]     = useState(isoToday())

  const [dateFrom, dateTo] = getPeriodBounds(periodType, periodOffset, [customFrom, customTo])

  function handleChangeType(t: PeriodType) { setPeriodType(t); setPeriodOffset(0) }

  const { data: profile } = useQuery<AthleteProfile>({
    queryKey: ['athlete-me'],
    queryFn: athletesApi.me,
  })

  const { data: history = [], isLoading } = useQuery<HistoryItem[]>({
    queryKey: ['workout-history', profile?.id, dateFrom, dateTo],
    queryFn: () => athletesApi.getHistory(profile!.id, { date_from: dateFrom, date_to: dateTo }),
    enabled: !!profile?.id,
  })

  const totalMin  = history.reduce((s, w) => s + (w.actual_duration_min ?? 0), 0)
  const totalKm   = history.reduce((s, w) => s + (w.actual_distance_km ?? 0), 0)
  const totalTSS  = history.reduce((s, w) => s + (w.actual_tss ?? 0), 0)

  const fmtDuration = (min: number) => {
    const h = Math.floor(min / 60); const m = min % 60
    return m === 0 ? `${h}ч` : `${h}ч ${m}м`
  }

  const today = toIso(new Date())

  return (
    <Container size="xl" py="xl">
      <Title order={2} mb="xl">История тренировок</Title>

      <Paper withBorder p="md" radius="md" mb="md">
        <VolumePeriodSelector
          type={periodType}
          offset={periodOffset}
          customFrom={customFrom}
          customTo={customTo}
          onChangeType={handleChangeType}
          onChangeOffset={n => setPeriodOffset(n)}
          onChangeCustomFrom={setCustomFrom}
          onChangeCustomTo={setCustomTo}
        />

        {/* Summary row */}
        {!isLoading && history.length > 0 && (
          <Group gap="xl" wrap="wrap">
            <Stack gap={0}>
              <Text size="xs" c="dimmed">Тренировок</Text>
              <Text fw={700} size="lg" lh={1}>{history.length}</Text>
            </Stack>
            {totalMin > 0 && (
              <Stack gap={0}>
                <Text size="xs" c="dimmed">Объём</Text>
                <Text fw={700} size="lg" lh={1}>{fmtDuration(totalMin)}</Text>
              </Stack>
            )}
            {totalKm > 0 && (
              <Stack gap={0}>
                <Text size="xs" c="dimmed">Дистанция</Text>
                <Text fw={700} size="lg" lh={1}>{totalKm.toFixed(1)} км</Text>
              </Stack>
            )}
            {totalTSS > 0 && (
              <Stack gap={0}>
                <Text size="xs" c="dimmed">Итого TSS</Text>
                <Text fw={700} size="lg" lh={1}>{Math.round(totalTSS)}</Text>
              </Stack>
            )}
          </Group>
        )}
      </Paper>

      {isLoading ? (
        <Stack gap="xs">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} height={60} radius="md" />)}
        </Stack>
      ) : history.length === 0 ? (
        <Paper withBorder p={48} radius="md" style={{ textAlign: 'center' }}>
          <Text size="lg" c="dimmed">Выполненных тренировок нет за выбранный период</Text>
        </Paper>
      ) : (
        <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
          {history.map((item) => {
            const isToday = item.planned_date === today
            return (
              <Box key={item.id} style={isToday ? { background: '#f0fff4' } : undefined}>
                <HistoryRow item={item} />
              </Box>
            )
          })}
        </Paper>
      )}
    </Container>
  )
}
