import {
  Badge,
  Box,
  Button,
  Container,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { plansApi } from '../api/plans'
import PlanCalendar, { isoDate } from '../components/PlanCalendar'
import TelemetryUpload from '../components/TelemetryUpload'
import SportIcon from '../components/SportIcon'
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
  status: string
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

// ─── Calendar cell content ────────────────────────────────────────────────────

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
    </Box>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyPlan() {
  const [view, setView]               = useState<'month' | 'week'>('month')
  const [displayDate, setDisplayDate] = useState<Date>(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const { data: workouts = [], isLoading } = useQuery<Workout[]>({
    queryKey: ['my-plan'],
    queryFn: plansApi.getMyPlan,
  })

  // ── Build lookup map ───────────────────────────────────────────────────────
  const workoutByDate = new Map<string, Workout>()
  for (const w of workouts) workoutByDate.set(w.planned_date, w)

  // ── Navigation ────────────────────────────────────────────────────────────
  const navigate = (dir: -1 | 1) => {
    const d = new Date(displayDate)
    if (view === 'week') d.setDate(d.getDate() + dir * 7)
    else d.setMonth(d.getMonth() + dir)
    setDisplayDate(d)
  }

  // ── Day click ─────────────────────────────────────────────────────────────
  const handleDayClick = (date: Date) => {
    const iso = isoDate(date)
    setSelectedDate((prev) => (prev === iso ? null : iso))
  }

  // ── Cell renderer ─────────────────────────────────────────────────────────
  const renderDay = (date: Date) => {
    const w = workoutByDate.get(isoDate(date))
    if (!w) return null
    return <WorkoutPill w={w} compact={view === 'month'} />
  }

  const selectedWorkout = selectedDate ? workoutByDate.get(selectedDate) : undefined

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
          {/* Calendar */}
          <PlanCalendar
            view={view}
            onViewChange={setView}
            displayDate={displayDate}
            onNavigate={navigate}
            renderDay={renderDay}
            onDayClick={handleDayClick}
            selectedDate={selectedDate}
          />

          {/* Selected day panel */}
          {selectedWorkout && (
            <Paper withBorder p="md" radius="md">
              <Group justify="space-between" mb="sm">
                <Stack gap={2}>
                  <Text fw={600}>
                    {new Date(selectedDate! + 'T00:00:00').toLocaleDateString('ru-RU', {
                      weekday: 'long', day: 'numeric', month: 'long',
                    })}
                  </Text>
                  {selectedWorkout.workout_type && (
                    <Text size="sm" c="dimmed">
                      {TYPE_LABEL[selectedWorkout.workout_type] ?? selectedWorkout.workout_type}
                      {selectedWorkout.workout_subtype && ` · ${selectedWorkout.workout_subtype}`}
                    </Text>
                  )}
                </Stack>
                <Button size="xs" variant="subtle" color="gray" onClick={() => setSelectedDate(null)}>
                  ✕
                </Button>
              </Group>

              {/* Stats */}
              <Group gap="xl" mb="sm">
                {selectedWorkout.target_zone && (
                  <Stack gap={0} align="center">
                    <Badge
                      color={ZONE_BADGE_COLOR[selectedWorkout.target_zone] ?? 'gray'}
                      size="lg"
                    >
                      {selectedWorkout.target_zone}
                    </Badge>
                    <Text size="xs" c="dimmed" mt={2}>зона</Text>
                  </Stack>
                )}
                {selectedWorkout.planned_duration_min != null && (
                  <Stack gap={0} align="center">
                    <Text fw={700} size="xl" lh={1}>{selectedWorkout.planned_duration_min}</Text>
                    <Text size="xs" c="dimmed">мин</Text>
                  </Stack>
                )}
                {selectedWorkout.planned_tss != null && (
                  <Stack gap={0} align="center">
                    <Text fw={700} size="xl" lh={1}>{Number(selectedWorkout.planned_tss).toFixed(0)}</Text>
                    <Text size="xs" c="dimmed">TSS</Text>
                  </Stack>
                )}
                <Badge
                  color={STATUS_META[selectedWorkout.status]?.color ?? 'gray'}
                  variant="light"
                >
                  {STATUS_META[selectedWorkout.status]?.label ?? selectedWorkout.status}
                </Badge>
              </Group>

              {selectedWorkout.description && (
                <Text size="sm" c="dimmed" mb="sm" style={{ fontStyle: 'italic' }}>
                  {selectedWorkout.description}
                </Text>
              )}

              <TelemetryUpload workoutId={selectedWorkout.id} />
            </Paper>
          )}
        </Stack>
      )}
    </Container>
  )
}
