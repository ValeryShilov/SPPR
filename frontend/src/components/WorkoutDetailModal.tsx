import { Badge, Box, Button, Divider, Group, Modal, SimpleGrid, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { telemetryApi } from '../api/telemetry'
import SportIcon, { SPORT_COLOR, SPORT_LABEL } from './SportIcon'
import IntervalBar from './IntervalBar'
import WorkoutChartsModal, { type TimePoint } from './WorkoutChartsModal'
import { ZONE_BADGE_COLOR, ZONE_HEX } from '../utils/zoneColors'
import { calcPaceSpeed, PACE_TYPES } from '../utils/pace'

// ─── Unified workout data interface ──────────────────────────────────────────

export type { IntervalSegment } from './IntervalBar'
import type { IntervalSegment } from './IntervalBar'

export interface WorkoutDetail {
  id: string
  planned_date: string
  workout_type?: string | null
  workout_subtype?: string | null
  description?: string | null
  target_zone?: string | null
  status: string
  planned_duration_min?: number | null
  planned_tss?: number | null
  actual_duration_min?: number | null
  actual_tss?: number | null
  actual_distance_km?: number | null
  avg_hr?: number | null
  max_hr?: number | null
  hr_zone1_min?: number | null
  hr_zone2_min?: number | null
  hr_zone3_min?: number | null
  hr_zone4_min?: number | null
  hr_zone5_min?: number | null
  interval_structure?: IntervalSegment[] | null
  athlete_name?: string
}

// ─── Telemetry from API ───────────────────────────────────────────────────────

interface TelemetryData {
  actual_duration_min?: number | null
  distance_km?: number | null
  avg_hr?: number | null
  max_hr?: number | null
  actual_tss?: number | null
  hr_zone1_min?: number | null
  hr_zone2_min?: number | null
  hr_zone3_min?: number | null
  hr_zone4_min?: number | null
  hr_zone5_min?: number | null
  rpe?: number | null
  comment?: string | null
  timeseries?: TimePoint[] | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ZONE_NAMES = ['З1', 'З2', 'З3', 'З4', 'З5']
const ZONE_BAR_COLORS = [ZONE_HEX.Z1, ZONE_HEX.Z2, ZONE_HEX.Z3, ZONE_HEX.Z4, ZONE_HEX.Z5]

const STATUS_META: Record<string, { label: string; color: string }> = {
  draft:     { label: 'Черновик',     color: '#adb5bd' },
  published: { label: 'Запланировано', color: '#228be6' },
  completed: { label: 'Выполнено',    color: '#2f9e44' },
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  workout: WorkoutDetail | null
  onClose: () => void
  onEdit?: () => void
}

export default function WorkoutDetailModal({ workout, onClose, onEdit }: Props) {
  const [chartsOpen, setChartsOpen] = useState(false)

  const { data: telemetry } = useQuery<TelemetryData | null>({
    queryKey: ['workout-telemetry', workout?.id],
    queryFn: () => telemetryApi.getWorkoutTelemetry(workout!.id) as Promise<TelemetryData | null>,
    enabled: !!workout?.id && workout.status === 'completed',
  })

  if (!workout) return null

  const stype    = workout.workout_type ?? 'other'
  const status   = STATUS_META[workout.status] ?? STATUS_META.published
  const today    = new Date().toISOString().slice(0, 10)
  const editable = onEdit && workout.status !== 'completed' && workout.planned_date >= today

  // Фактические данные: приоритет на свежие данные из telemetry endpoint
  const tel = telemetry ?? workout
  const zoneMins = [
    tel.hr_zone1_min ?? 0,
    tel.hr_zone2_min ?? 0,
    tel.hr_zone3_min ?? 0,
    tel.hr_zone4_min ?? 0,
    tel.hr_zone5_min ?? 0,
  ]
  const totalZoneMins = zoneMins.reduce((s, v) => s + v, 0)

  const distKm = workout.actual_distance_km ?? telemetry?.distance_km ?? null

  const hasFact = tel.actual_duration_min != null
    || tel.actual_tss != null
    || tel.avg_hr != null
    || distKm != null
  const actualTss = tel.actual_tss ?? workout.actual_tss

  const pct = workout.planned_tss && actualTss
    ? Math.round((Number(actualTss) / Number(workout.planned_tss)) * 100)
    : null

  const timeseries = telemetry?.timeseries ?? null
  const hasTimeseries = Array.isArray(timeseries) && timeseries.length > 0

  return (
    <>
      <Modal
        opened
        onClose={onClose}
        size="md"
        title={
          <Group gap="sm" wrap="nowrap">
            <SportIcon type={stype} size={28} color={SPORT_COLOR[stype]} />
            <Stack gap={0}>
              <Text fw={600} size="md" style={{ lineHeight: 1.3 }}>
                {SPORT_LABEL[stype] ?? stype}
                {workout.workout_subtype ? ` · ${workout.workout_subtype}` : ''}
              </Text>
              <Text size="xs" c="dimmed">
                {new Date(workout.planned_date + 'T00:00:00').toLocaleDateString('ru-RU', {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                })}
              </Text>
            </Stack>
            <Group gap="xs" ml="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
              {workout.target_zone && (
                <Badge color={ZONE_BADGE_COLOR[workout.target_zone] ?? 'gray'} variant="light">
                  {workout.target_zone}
                </Badge>
              )}
              <Group gap={5} wrap="nowrap">
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: status.color, flexShrink: 0 }} />
                <Text size="xs" c="dimmed">{status.label}</Text>
              </Group>
              {editable && (
                <Tooltip label="Редактировать" withArrow>
                  <UnstyledButton
                    onClick={() => { onClose(); onEdit!() }}
                    style={{
                      fontSize: 16,
                      lineHeight: 1,
                      color: '#868e96',
                      padding: '2px 4px',
                      borderRadius: 4,
                      border: '1px solid #dee2e6',
                      background: '#f8f9fa',
                    }}
                  >
                    ✎
                  </UnstyledButton>
                </Tooltip>
              )}
            </Group>
          </Group>
        }
      >
        {/* Athlete name (dashboard context) */}
        {workout.athlete_name && (
          <Text size="sm" c="dimmed" mb="sm">{workout.athlete_name}</Text>
        )}

        {/* Plan */}
        <Divider label="Плановые показатели" labelPosition="left" mb="xs" />
        <SimpleGrid cols={3} mb="sm">
          <Box>
            <Text size="xs" c="dimmed">Длительность</Text>
            <Text size="sm">{workout.planned_duration_min != null ? `${workout.planned_duration_min} мин` : '—'}</Text>
          </Box>
          <Box>
            <Text size="xs" c="dimmed">TSS</Text>
            <Text size="sm">{workout.planned_tss != null ? Number(workout.planned_tss).toFixed(1) : '—'}</Text>
          </Box>
          <Box>
            <Text size="xs" c="dimmed">Зона</Text>
            <Text size="sm">{workout.target_zone ?? '—'}</Text>
          </Box>
        </SimpleGrid>
        {workout.description && (
          <Box p="xs" mb="sm" style={{ background: '#f8f9fa', borderRadius: 6 }}>
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{workout.description}</Text>
          </Box>
        )}

        {/* Interval structure */}
        {workout.interval_structure && workout.interval_structure.length > 0 && (
          <>
            <Divider label="Интервальная структура" labelPosition="left" mb="xs" mt="sm" />
            <IntervalBar segments={workout.interval_structure} />
          </>
        )}

        {/* Fact */}
        {hasFact && (
          <>
            <Divider label="Фактические показатели" labelPosition="left" mb="xs" mt="sm" />
            <SimpleGrid cols={3} mb="sm">
              <Box>
                <Text size="xs" c="dimmed">Длительность</Text>
                <Text size="sm">{tel.actual_duration_min != null ? `${tel.actual_duration_min} мин` : '—'}</Text>
              </Box>
              <Box>
                <Text size="xs" c="dimmed">TSS</Text>
                <Text size="sm"
                  fw={pct != null ? 600 : 400}
                  c={pct != null && pct >= 90 ? 'green' : pct != null && pct < 60 ? 'red' : undefined}>
                  {actualTss != null ? Number(actualTss).toFixed(1) : '—'}
                  {pct != null ? ` (${pct}%)` : ''}
                </Text>
              </Box>
              <Box>
                <Text size="xs" c="dimmed">Дистанция</Text>
                <Text size="sm">{distKm != null ? `${Number(distKm).toFixed(1)} км` : '—'}</Text>
              </Box>
              {tel.avg_hr != null && (
                <Box>
                  <Text size="xs" c="dimmed">ЧСС ср.</Text>
                  <Text size="sm">{tel.avg_hr}</Text>
                </Box>
              )}
              {tel.max_hr != null && (
                <Box>
                  <Text size="xs" c="dimmed">ЧСС макс.</Text>
                  <Text size="sm">{tel.max_hr}</Text>
                </Box>
              )}
              {workout.workout_type && PACE_TYPES.has(workout.workout_type) && (() => {
                const pace = calcPaceSpeed(
                  tel.actual_duration_min ?? '',
                  distKm ?? '',
                  workout.workout_type!,
                )
                return pace ? (
                  <Box>
                    <Text size="xs" c="dimmed">{workout.workout_type === 'run' ? 'Темп' : 'Скорость'}</Text>
                    <Text size="sm">{pace}</Text>
                  </Box>
                ) : null
              })()}
            </SimpleGrid>

            {/* RPE + Comment */}
            {((telemetry?.rpe != null) || telemetry?.comment) && (
              <SimpleGrid cols={telemetry.rpe != null && telemetry.comment ? 2 : 1} mb="sm">
                {telemetry.rpe != null && (
                  <Box>
                    <Text size="xs" c="dimmed">Самочувствие</Text>
                    <Text size="sm" fw={600}>{telemetry.rpe}<Text span size="xs" c="dimmed">/10</Text></Text>
                  </Box>
                )}
                {telemetry.comment && (
                  <Box>
                    <Text size="xs" c="dimmed">Комментарий</Text>
                    <Text size="sm" style={{ fontStyle: 'italic' }}>{telemetry.comment}</Text>
                  </Box>
                )}
              </SimpleGrid>
            )}
          </>
        )}

        {/* HR zones */}
        {totalZoneMins > 0 && (
          <>
            <Divider label="Время в зонах" labelPosition="left" mb="xs" mt="sm" />
            <Box style={{ display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden' }} mb="xs">
              {zoneMins.map((m, i) =>
                m > 0 ? (
                  <Tooltip key={i} label={`${ZONE_NAMES[i]}: ${m} мин`} withArrow>
                    <Box style={{ width: `${(m / totalZoneMins) * 100}%`, background: ZONE_BAR_COLORS[i] }} />
                  </Tooltip>
                ) : null
              )}
            </Box>
            <Group gap="md">
              {zoneMins.map((m, i) =>
                m > 0 ? (
                  <Group key={i} gap={4}>
                    <Box w={10} h={10} style={{ background: ZONE_BAR_COLORS[i], borderRadius: 2 }} />
                    <Text size="xs">{ZONE_NAMES[i]}: {m} мин</Text>
                  </Group>
                ) : null
              )}
            </Group>
          </>
        )}

        {/* Charts button */}
        {hasTimeseries && (
          <Box mt="md">
            <Button
              variant="light"
              size="sm"
              leftSection={<span>📈</span>}
              onClick={() => setChartsOpen(true)}
              fullWidth
            >
              Показать графики
            </Button>
          </Box>
        )}
      </Modal>

      {hasTimeseries && (
        <WorkoutChartsModal
          opened={chartsOpen}
          onClose={() => setChartsOpen(false)}
          timeseries={timeseries!}
          workoutType={workout.workout_type}
          title={`Графики — ${SPORT_LABEL[stype] ?? stype}, ${new Date(workout.planned_date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`}
        />
      )}
    </>
  )
}
