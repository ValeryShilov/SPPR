import {
  Badge,
  Box,
  Button,
  Container,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { plansApi } from '../api/plans'
import { telemetryApi } from '../api/telemetry'
import IntervalBar, { type IntervalSegment } from '../components/IntervalBar'
import PlanCalendar, { isoDate } from '../components/PlanCalendar'
import TelemetryUpload from '../components/TelemetryUpload'
import WorkoutChartsModal, { type TimePoint } from '../components/WorkoutChartsModal'
import SportIcon from '../components/SportIcon'
import { calcPaceSpeed, PACE_TYPES } from '../utils/pace'
import { ZONE_BADGE_COLOR } from '../utils/zoneColors'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Workout {
  id: string
  planned_date: string
  planned_duration_min: number | null
  planned_tss: number | null
  target_zone: string | null
  workout_type: string | null
  workout_subtype: string | null
  description: string | null
  interval_structure: IntervalSegment[] | null
  status: string
}

interface ActualTelemetry {
  source: string
  actual_duration_min: number | null
  distance_km: number | null
  avg_hr: number | null
  max_hr: number | null
  actual_tss: number | null
  hr_zone1_min: number | null
  hr_zone2_min: number | null
  hr_zone3_min: number | null
  hr_zone4_min: number | null
  hr_zone5_min: number | null
  rpe: number | null
  comment: string | null
  timeseries?: TimePoint[] | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  run: 'Бег', ski: 'Лыжи', skiroll: 'Лыжр', bike: 'Вел',
  strength: 'Сил', recovery: 'Восст', rest: 'Отдых', other: 'Проч',
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  completed: { label: 'Выполнено',    color: 'green' },
  published:  { label: 'Запланировано', color: 'blue'  },
  draft:      { label: 'Черновик',    color: 'gray'  },
}

// ─── Calendar cell pill ───────────────────────────────────────────────────────

function WorkoutPill({ w, compact }: { w: Workout; compact?: boolean }) {
  const zone = w.target_zone
  const done = w.status === 'completed'

  if (w.workout_type === 'rest') {
    return (
      <Box mt={compact ? 1 : 2}>
        <SportIcon type="rest" size={compact ? 22 : 28} color="#868e96" />
        <Text size="xs" c="dimmed" style={{ lineHeight: 1.2 }}>Отдых</Text>
      </Box>
    )
  }

  return (
    <Box mt={compact ? 1 : 2}>
      <Group gap={4} wrap="nowrap" align="center">
        <SportIcon type={w.workout_type ?? 'other'} size={compact ? 22 : 28} color="#343a40" />
        {done && <Text size="xs" style={{ color: '#2f9e44', lineHeight: 1 }}>✓</Text>}
      </Group>
      {zone && (
        <Badge size="xs" color={ZONE_BADGE_COLOR[zone] ?? 'gray'} variant="light" mt={1}>
          {zone}
        </Badge>
      )}
      {!compact && w.planned_duration_min != null && (
        <Text size="xs" c="dimmed">{w.planned_duration_min} мин</Text>
      )}
      {w.interval_structure && w.interval_structure.length > 0 && (
        <Text size="xs" c="orange" fw={600} style={{ fontSize: 9, lineHeight: 1.2 }}>Инт.</Text>
      )}
    </Box>
  )
}

// ─── Detail section for one workout ──────────────────────────────────────────

function WorkoutDetailSection({ workout }: { workout: Workout }) {
  const [chartsOpen, setChartsOpen] = useState(false)

  const { data: telemetry } = useQuery<ActualTelemetry | null>({
    queryKey: ['workout-telemetry', workout.id],
    queryFn: () => telemetryApi.getWorkoutTelemetry(workout.id) as Promise<ActualTelemetry | null>,
  })

  return (
    <Box>
      {/* Header row */}
      <Group gap="sm" mb="sm" align="center">
        {workout.workout_type && (
          <Text size="sm" c="dimmed">
            {TYPE_LABEL[workout.workout_type] ?? workout.workout_type}
            {workout.workout_subtype && ` · ${workout.workout_subtype}`}
          </Text>
        )}
        <Badge color={STATUS_META[workout.status]?.color ?? 'gray'} variant="light" size="sm">
          {STATUS_META[workout.status]?.label ?? workout.status}
        </Badge>
      </Group>

      {/* Plan stats */}
      <Group gap="xl" mb="sm">
        {workout.target_zone && (
          <Stack gap={0} align="center">
            <Badge color={ZONE_BADGE_COLOR[workout.target_zone] ?? 'gray'} size="lg">
              {workout.target_zone}
            </Badge>
            <Text size="xs" c="dimmed" mt={2}>зона</Text>
          </Stack>
        )}
        {workout.planned_duration_min != null && (
          <Stack gap={0} align="center">
            <Text fw={700} size="xl" lh={1}>{workout.planned_duration_min}</Text>
            <Text size="xs" c="dimmed">мин (план)</Text>
          </Stack>
        )}
        {workout.planned_tss != null && (
          <Stack gap={0} align="center">
            <Text fw={700} size="xl" lh={1}>{Number(workout.planned_tss).toFixed(0)}</Text>
            <Text size="xs" c="dimmed">TSS</Text>
          </Stack>
        )}
      </Group>

      {workout.description && (
        <Text size="sm" c="dimmed" mb="sm" style={{ fontStyle: 'italic' }}>
          {workout.description}
        </Text>
      )}

      {workout.interval_structure && workout.interval_structure.length > 0 && (
        <Box mb="sm">
          <IntervalBar segments={workout.interval_structure} />
        </Box>
      )}

      {/* Actual data */}
      {telemetry && (
        <Box mb="sm" p="sm" style={{ background: '#f8f9fa', borderRadius: 8 }}>
          <Group gap="xs" mb="xs">
            <Badge color="green" variant="filled" size="sm">Выполнено ✓</Badge>
            <Text size="xs" c="dimmed">
              {telemetry.source === 'imported' ? 'из файла' : 'вручную'}
            </Text>
          </Group>
          <Group gap="xl">
            {telemetry.actual_duration_min != null && (
              <Stack gap={0} align="center">
                <Text fw={700} size="lg" lh={1}>{telemetry.actual_duration_min}</Text>
                <Text size="xs" c="dimmed">мин (факт.)</Text>
              </Stack>
            )}
            {telemetry.distance_km != null && (
              <Stack gap={0} align="center">
                <Text fw={700} size="lg" lh={1}>{Number(telemetry.distance_km).toFixed(1)}</Text>
                <Text size="xs" c="dimmed">км</Text>
              </Stack>
            )}
            {telemetry.avg_hr != null && (
              <Stack gap={0} align="center">
                <Text fw={700} size="lg" lh={1}>{telemetry.avg_hr}</Text>
                <Text size="xs" c="dimmed">ЧСС ср.</Text>
              </Stack>
            )}
            {workout.workout_type && PACE_TYPES.has(workout.workout_type) && (() => {
              const pace = calcPaceSpeed(
                telemetry.actual_duration_min ?? '',
                telemetry.distance_km ?? '',
                workout.workout_type!,
              )
              return pace ? (
                <Stack gap={0} align="center">
                  <Text fw={700} size="lg" lh={1}>{pace}</Text>
                  <Text size="xs" c="dimmed">
                    {workout.workout_type === 'run' ? 'темп' : 'скорость'}
                  </Text>
                </Stack>
              ) : null
            })()}
            {telemetry.rpe != null && (
              <Stack gap={0} align="center">
                <Text fw={700} size="lg" lh={1}>
                  {telemetry.rpe}<Text span size="xs" c="dimmed">/10</Text>
                </Text>
                <Text size="xs" c="dimmed">самочувствие</Text>
              </Stack>
            )}
          </Group>
          {telemetry.comment && (
            <Text size="sm" c="dimmed" mt="xs" style={{ fontStyle: 'italic' }}>
              {telemetry.comment}
            </Text>
          )}
          {telemetry.timeseries && telemetry.timeseries.length > 0 && (
            <Button size="xs" variant="subtle" color="blue" mt="xs"
              onClick={() => setChartsOpen(true)}>
              📈 Показать графики
            </Button>
          )}
        </Box>
      )}

      <TelemetryUpload workoutId={workout.id} workoutType={workout.workout_type} />

      {telemetry?.timeseries && telemetry.timeseries.length > 0 && (
        <WorkoutChartsModal
          opened={chartsOpen}
          onClose={() => setChartsOpen(false)}
          timeseries={telemetry.timeseries}
          workoutType={workout.workout_type}
          title={`Графики — ${TYPE_LABEL[workout.workout_type ?? ''] ?? ''}, ${workout.planned_date}`}
        />
      )}
    </Box>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyPlan() {
  const [view, setView]               = useState<'month' | 'week'>('week')
  const [displayDate, setDisplayDate] = useState<Date>(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const { data: workouts = [], isLoading } = useQuery<Workout[]>({
    queryKey: ['my-plan'],
    queryFn: plansApi.getMyPlan,
  })

  // ── Build lookup map ───────────────────────────────────────────────────────
  const workoutByDate = new Map<string, Workout[]>()
  for (const w of workouts) {
    const arr = workoutByDate.get(w.planned_date) ?? []
    arr.push(w)
    workoutByDate.set(w.planned_date, arr)
  }

  const selectedWorkouts = selectedDate ? (workoutByDate.get(selectedDate) ?? []) : []

  // ── Navigation ────────────────────────────────────────────────────────────
  const navigate = (dir: -1 | 1) => {
    const d = new Date(displayDate)
    if (view === 'week') d.setDate(d.getDate() + dir * 7)
    else d.setMonth(d.getMonth() + dir)
    setDisplayDate(d)
  }

  const handleDayClick = (date: Date) => {
    const iso = isoDate(date)
    setSelectedDate((prev) => (prev === iso ? null : iso))
  }

  // ── Cell renderer ─────────────────────────────────────────────────────────
  const renderDay = (date: Date) => {
    const ws = workoutByDate.get(isoDate(date))
    if (!ws?.length) return null
    const compact = view === 'month' || ws.length > 1
    return (
      <Box>
        {ws.map((w) => <WorkoutPill key={w.id} w={w} compact={compact} />)}
      </Box>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Container size="xl" py="xl">
      <Title order={2} mb="lg">Мой план</Title>

      {isLoading && <Text c="dimmed">Загрузка...</Text>}
      {!isLoading && workouts.length === 0 && (
        <Text c="dimmed" ta="center" mt="xl">Запланированных тренировок нет</Text>
      )}

      {workouts.length > 0 && (
        <Stack gap="md">
          <PlanCalendar
            view={view}
            onViewChange={setView}
            displayDate={displayDate}
            onNavigate={navigate}
            renderDay={renderDay}
            onDayClick={handleDayClick}
            selectedDate={selectedDate}
          />

          {selectedWorkouts.length > 0 && (
            <Paper withBorder p="md" radius="md">
              <Group justify="space-between" mb="md">
                <Text fw={600}>
                  {new Date(selectedDate! + 'T00:00:00').toLocaleDateString('ru-RU', {
                    weekday: 'long', day: 'numeric', month: 'long',
                  })}
                </Text>
                <Button size="xs" variant="subtle" color="gray" onClick={() => setSelectedDate(null)}>
                  ✕
                </Button>
              </Group>

              {selectedWorkouts.map((w, i) => (
                <Box key={w.id}>
                  {i > 0 && <Divider my="md" />}
                  {selectedWorkouts.length > 1 && (
                    <Text size="xs" c="dimmed" fw={600} mb="xs">
                      Тренировка {i + 1} из {selectedWorkouts.length}
                    </Text>
                  )}
                  <WorkoutDetailSection workout={w} />
                </Box>
              ))}
            </Paper>
          )}
        </Stack>
      )}
    </Container>
  )
}
