import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Collapse,
  Container,
  Divider,
  Group,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { athletesApi } from '../api/athletes'
import { plansApi } from '../api/plans'
import { telemetryApi } from '../api/telemetry'
import IntervalBar, { type IntervalSegment } from '../components/IntervalBar'
import TelemetryUpload from '../components/TelemetryUpload'
import WorkoutChartsModal, { type TimePoint } from '../components/WorkoutChartsModal'
import { calcPaceSpeed, PACE_TYPES } from '../utils/pace'
import { ZONE_BADGE_COLOR, ZONE_HEX } from '../utils/zoneColors'

// ─── Типы ────────────────────────────────────────────────────────────────────

interface Workout {
  id: string
  template_id: string | null
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

interface AthleteProfile {
  id: string
  first_name: string
  last_name: string
}

interface HRZone {
  zone: string
  label: string
  hr_min: number
  hr_max: number
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

// ─── Константы ───────────────────────────────────────────────────────────────

const WORKOUT_TYPE_LABEL: Record<string, string> = {
  run: 'Бег', ski: 'Лыжи', skiroll: 'Лыжероллеры', bike: 'Велосипед',
  strength: 'Силовая', recovery: 'Восстановление', rest: 'Отдых', other: 'Другое',
}

const SKI_STYLE_LABEL: Record<string, string> = {
  classic: 'Классический',
  skate: 'Коньковый',
}

const SKI_TYPES = new Set(['ski', 'skiroll'])

const SCALE_DATA = ['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }))
const todayStr = new Date().toISOString().split('T')[0]

// ─── Карточка одной тренировки ────────────────────────────────────────────────

function WorkoutCard({ workout, zones, onDeleted }: { workout: Workout; zones: HRZone[]; onDeleted?: () => void }) {
  const queryClient = useQueryClient()
  const [showUpload,  setShowUpload]  = useState(false)
  const [chartsOpen,  setChartsOpen]  = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(false)

  const deleteMut = useMutation({
    mutationFn: () => plansApi.deleteSelfWorkout(workout.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-plan'] })
      onDeleted?.()
    },
  })

  const { data: telemetry } = useQuery<ActualTelemetry | null>({
    queryKey: ['workout-telemetry', workout.id],
    queryFn: () => telemetryApi.getWorkoutTelemetry(workout.id) as Promise<ActualTelemetry | null>,
  })

  const targetHRZone = zones.find((z) => z.zone === workout.target_zone)
  const zoneHex = workout.target_zone ? ZONE_HEX[workout.target_zone] : null
  const zoneBg  = zoneHex ? zoneHex + '22' : '#f5f5f5'

  return (
    <Box>
      <Stack gap="md">

        {/* Тип / подтип + статус */}
        <Group justify="space-between" align="center">
          {workout.workout_type && (
            <Text size="sm" c="dimmed">
              {WORKOUT_TYPE_LABEL[workout.workout_type] ?? workout.workout_type}
              {workout.workout_subtype && ` · ${SKI_STYLE_LABEL[workout.workout_subtype] ?? workout.workout_subtype}`}
            </Text>
          )}
          {telemetry && (
            <Badge color="green" variant="filled" size="sm">Выполнено ✓</Badge>
          )}
        </Group>

        {telemetry ? (
          /* ── Фактические данные ───────────────────────────────────────── */
          <>
            <SimpleGrid cols={3} spacing="xs">
              <Box p="sm" style={{ borderRadius: 8, background: '#ebfbee', textAlign: 'center' }}>
                <Text size="xl" fw={700} lh={1}>{telemetry.actual_duration_min ?? '—'}</Text>
                <Text size="xs" c="dimmed" mt={4}>мин (факт.)</Text>
              </Box>
              <Box p="sm" style={{ borderRadius: 8, background: '#f5f5f5', textAlign: 'center' }}>
                <Text size="xl" fw={700} lh={1}>
                  {telemetry.distance_km != null ? Number(telemetry.distance_km).toFixed(1) : '—'}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>км</Text>
              </Box>
              <Box p="sm" style={{ borderRadius: 8, background: '#f5f5f5', textAlign: 'center' }}>
                <Text size="xl" fw={700} lh={1}>{telemetry.avg_hr ?? '—'}</Text>
                <Text size="xs" c="dimmed" mt={4}>ЧСС ср.</Text>
              </Box>
            </SimpleGrid>

            {/* Темп / скорость */}
            {workout.workout_type && PACE_TYPES.has(workout.workout_type) && (() => {
              const pace = calcPaceSpeed(
                telemetry.actual_duration_min ?? '',
                telemetry.distance_km ?? '',
                workout.workout_type!,
              )
              return pace ? (
                <Box p="xs" style={{ background: '#f1f3f5', borderRadius: 6 }}>
                  <Text size="xs" c="dimmed" mb={2}>
                    {workout.workout_type === 'run' ? 'Темп' : 'Скорость'}
                  </Text>
                  <Text size="sm" fw={600}>{pace}</Text>
                </Box>
              ) : null
            })()}

            {/* Доп. показатели */}
            <Group gap="lg">
              {telemetry.max_hr != null && (
                <Stack gap={0} align="center">
                  <Text fw={600}>{telemetry.max_hr}</Text>
                  <Text size="xs" c="dimmed">ЧСС макс.</Text>
                </Stack>
              )}
              {telemetry.actual_tss != null && (
                <Stack gap={0} align="center">
                  <Text fw={600}>{Math.round(Number(telemetry.actual_tss))}</Text>
                  <Text size="xs" c="dimmed">TSS</Text>
                </Stack>
              )}
              {telemetry.rpe != null && (
                <Stack gap={0} align="center">
                  <Text fw={600}>{telemetry.rpe}<Text span size="xs" c="dimmed">/10</Text></Text>
                  <Text size="xs" c="dimmed">Самочувствие</Text>
                </Stack>
              )}
            </Group>

            {/* Время в зонах */}
            {[telemetry.hr_zone1_min, telemetry.hr_zone2_min, telemetry.hr_zone3_min,
              telemetry.hr_zone4_min, telemetry.hr_zone5_min].some((v) => v != null && v > 0) && (
              <Box>
                <Text size="xs" c="dimmed" mb={4}>Время в зонах, мин</Text>
                <Group gap="xs">
                  {(['Z1','Z2','Z3','Z4','Z5'] as const).map((z, i) => {
                    const mins = [telemetry.hr_zone1_min, telemetry.hr_zone2_min,
                      telemetry.hr_zone3_min, telemetry.hr_zone4_min,
                      telemetry.hr_zone5_min][i]
                    if (!mins) return null
                    return (
                      <Box key={z} style={{ textAlign: 'center' }}>
                        <Badge size="xs" color={ZONE_BADGE_COLOR[z] ?? 'gray'} variant="light">{z}</Badge>
                        <Text size="xs" mt={2}>{mins}</Text>
                      </Box>
                    )
                  })}
                </Group>
              </Box>
            )}

            {/* Комментарий */}
            {telemetry.comment && (
              <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>
                {telemetry.comment}
              </Text>
            )}

            {/* Задание (компактно) */}
            <Box pt="xs" style={{ borderTop: '1px solid #f0f0f0' }}>
              <Text size="xs" c="dimmed">
                Задание:{workout.target_zone && ` ${workout.target_zone}`}
                {workout.planned_duration_min != null && ` · ${workout.planned_duration_min} мин`}
              </Text>
              {workout.description && (
                <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }} mt={2}>
                  {workout.description}
                </Text>
              )}
            </Box>

            {/* Редактирование / графики */}
            <Group gap="xs">
              <Button size="xs" variant="subtle" color="gray"
                onClick={() => setShowUpload((v) => !v)}>
                {showUpload ? 'Скрыть' : 'Изменить данные'}
              </Button>
              {telemetry.timeseries && telemetry.timeseries.length > 0 && (
                <Button size="xs" variant="subtle" color="blue"
                  onClick={() => setChartsOpen(true)}>
                  📈 Графики
                </Button>
              )}
            </Group>
            <Collapse in={showUpload}>
              <TelemetryUpload workoutId={workout.id} workoutType={workout.workout_type} />
            </Collapse>
          </>
        ) : (
          /* ── Плановые данные ──────────────────────────────────────────── */
          <>
            <SimpleGrid cols={3} spacing="xs">
              <Box p="sm" style={{ borderRadius: 8, backgroundColor: zoneBg, textAlign: 'center' }}>
                {workout.target_zone ? (
                  <>
                    <Badge color={ZONE_BADGE_COLOR[workout.target_zone] ?? 'gray'} size="lg" mb={4}>
                      {workout.target_zone}
                    </Badge>
                    {targetHRZone && (
                      <Text size="xs" c="dimmed" lh={1.2}>
                        {targetHRZone.hr_min}–{targetHRZone.hr_max}<br />уд/мин
                      </Text>
                    )}
                  </>
                ) : (
                  <Text size="sm" c="dimmed">—</Text>
                )}
                <Text size="xs" c="dimmed" mt={4}>Зона ЧСС</Text>
              </Box>
              <Box p="sm" style={{ borderRadius: 8, backgroundColor: '#f5f5f5', textAlign: 'center' }}>
                <Text size="xl" fw={700} lh={1}>{workout.planned_duration_min ?? '—'}</Text>
                <Text size="xs" c="dimmed" mt={4}>мин</Text>
              </Box>
              <Box p="sm" style={{ borderRadius: 8, backgroundColor: '#f5f5f5', textAlign: 'center' }}>
                <Text size="xl" fw={700} lh={1}>
                  {workout.planned_tss != null ? Math.round(Number(workout.planned_tss)) : '—'}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>TSS</Text>
              </Box>
            </SimpleGrid>

            {workout.description && (
              <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>
                {workout.description}
              </Text>
            )}

            {workout.interval_structure && workout.interval_structure.length > 0 && (
              <IntervalBar segments={workout.interval_structure} />
            )}

            <Button variant={showUpload ? 'filled' : 'light'} color="red"
              onClick={() => setShowUpload((v) => !v)}>
              {showUpload ? 'Скрыть' : 'Зарегистрировать тренировку'}
            </Button>
            <Collapse in={showUpload}>
              <TelemetryUpload workoutId={workout.id} workoutType={workout.workout_type} />
            </Collapse>
          </>
        )}

        {/* Удаление тренировки */}
        {confirmDel ? (
            <Group gap="xs" pt="xs" style={{ borderTop: '1px solid #ffe3e3' }}>
              <Text size="xs" c="dimmed">Удалить тренировку?</Text>
              <Button size="xs" color="red" loading={deleteMut.isPending}
                onClick={() => deleteMut.mutate()}>
                Да, удалить
              </Button>
              <Button size="xs" variant="subtle" color="gray"
                onClick={() => setConfirmDel(false)}>
                Отмена
              </Button>
            </Group>
          ) : (
            <Button size="xs" variant="subtle" color="red" mt="xs"
              onClick={() => setConfirmDel(true)}>
              Удалить тренировку
            </Button>
          )
        }
      </Stack>

      {telemetry?.timeseries && telemetry.timeseries.length > 0 && (
        <WorkoutChartsModal
          opened={chartsOpen}
          onClose={() => setChartsOpen(false)}
          timeseries={telemetry.timeseries}
          workoutType={workout.workout_type}
          title="Графики тренировки"
        />
      )}
    </Box>
  )
}

// ─── Страница ─────────────────────────────────────────────────────────────────

export default function AthleteCabinet() {
  const queryClient = useQueryClient()

  const [sleep,       setSleep]       = useState('3')
  const [fatigue,     setFatigue]     = useState('3')
  const [metricSaved, setMetricSaved] = useState(false)
  const [addOpen,     setAddOpen]     = useState(false)
  const [addType,     setAddType]     = useState<string | null>(null)
  const [addSubtype,  setAddSubtype]  = useState<string | null>(null)
  const [activeIdx,   setActiveIdx]   = useState(0)

  // ─── Запросы ──────────────────────────────────────────────────────────────

  const { data: plan = [] } = useQuery<Workout[]>({
    queryKey: ['my-plan'],
    queryFn: plansApi.getMyPlan,
  })

  const { data: todayMetric } = useQuery<{ sleep_quality: number | null; fatigue_level: number | null } | null>({
    queryKey: ['metrics-today'],
    queryFn: telemetryApi.getTodayMetric,
  })

  const { data: profile } = useQuery<AthleteProfile>({
    queryKey: ['athlete-me'],
    queryFn: athletesApi.me,
  })

  const { data: zonesData } = useQuery({
    queryKey: ['athlete-zones', profile?.id],
    queryFn: () => athletesApi.getZones(profile!.id),
    enabled: !!profile?.id,
  })

  useEffect(() => {
    if (todayMetric) {
      if (todayMetric.sleep_quality) setSleep(String(todayMetric.sleep_quality))
      if (todayMetric.fatigue_level) setFatigue(String(todayMetric.fatigue_level))
    }
  }, [todayMetric])

  const createAdHoc = useMutation({
    mutationFn: () => plansApi.createSelfWorkout({
      planned_date: todayStr,
      workout_type: addType,
      workout_subtype: addSubtype,
    }),
    onSuccess: () => {
      setAddOpen(false)
      setAddType(null)
      setAddSubtype(null)
      setActiveIdx(999)
      queryClient.invalidateQueries({ queryKey: ['my-plan'] })
    },
  })

  const saveMetric = useMutation({
    mutationFn: () =>
      telemetryApi.createMetric({ sleep_quality: Number(sleep), fatigue_level: Number(fatigue) }),
    onSuccess: () => {
      setMetricSaved(true)
      queryClient.invalidateQueries({ queryKey: ['metrics-today'] })
    },
  })

  // ─── Производные данные ───────────────────────────────────────────────────

  const todayWorkouts = plan.filter((w) => w.planned_date === todayStr)
  const displayIdx    = todayWorkouts.length === 0 ? 0 : Math.min(activeIdx, todayWorkouts.length - 1)
  const upcomingWorkouts = plan
    .filter((w) => w.planned_date > todayStr && w.workout_type !== 'rest')
    .slice(0, 10)
  const zones: HRZone[] = (zonesData as { zones: HRZone[] } | undefined)?.zones ?? []

  // ─── Рендер ───────────────────────────────────────────────────────────────

  return (
    <Container size="md" py="xl">
      <Title order={2} mb="xl">Кабинет спортсмена</Title>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">

        {/* ── Блок 1: Задание на сегодня ──────────────────────────────────── */}
        <Paper withBorder p="lg" radius="md">
          <Group justify="space-between" align="center" mb="md">
            <Title order={4}>Задание на сегодня</Title>
            {todayWorkouts.length >= 2 && (
              <Group gap={4} align="center">
                <ActionIcon
                  variant="subtle" color="gray" size="sm"
                  disabled={displayIdx === 0}
                  onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
                >‹</ActionIcon>
                <Text size="xs" c="dimmed" style={{ minWidth: 28, textAlign: 'center' }}>
                  {displayIdx + 1}/{todayWorkouts.length}
                </Text>
                <ActionIcon
                  variant="subtle" color="gray" size="sm"
                  disabled={displayIdx === todayWorkouts.length - 1}
                  onClick={() => setActiveIdx((i) => Math.min(todayWorkouts.length - 1, i + 1))}
                >›</ActionIcon>
              </Group>
            )}
          </Group>

          <Stack gap="lg">
            {todayWorkouts.length === 0 && (
              <Stack align="center" py="md" gap={4}>
                <Text size="2rem" c="dimmed">—</Text>
                <Text fw={500}>Сегодня отдых</Text>
                <Text size="xs" c="dimmed">Запланированных тренировок нет</Text>
              </Stack>
            )}

            {todayWorkouts.length > 0 && (
              <WorkoutCard
                key={todayWorkouts[displayIdx].id}
                workout={todayWorkouts[displayIdx]}
                zones={zones}
                onDeleted={() => setActiveIdx(0)}
              />
            )}

            {/* Добавить тренировку */}
            {addOpen ? (
              <Stack gap="sm" pt="xs">
                <Select
                  label="Вид тренировки"
                  placeholder="Выберите..."
                  data={Object.entries(WORKOUT_TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))}
                  value={addType}
                  onChange={(v) => { setAddType(v); setAddSubtype(null) }}
                />
                {addType && SKI_TYPES.has(addType) && (
                  <Select
                    label="Стиль"
                    placeholder="Выберите стиль..."
                    data={Object.entries(SKI_STYLE_LABEL).map(([v, l]) => ({ value: v, label: l }))}
                    value={addSubtype}
                    onChange={setAddSubtype}
                  />
                )}
                {createAdHoc.isError && (
                  <Text size="xs" c="red">Ошибка при создании тренировки</Text>
                )}
                <Group gap="xs">
                  <Button variant="default" size="sm"
                    onClick={() => { setAddOpen(false); setAddType(null); setAddSubtype(null) }}>
                    Отмена
                  </Button>
                  <Button size="sm" color="red"
                    loading={createAdHoc.isPending}
                    disabled={!addType}
                    onClick={() => createAdHoc.mutate()}>
                    Добавить →
                  </Button>
                </Group>
              </Stack>
            ) : (
              <Button variant="subtle" color="gray" size="sm"
                onClick={() => setAddOpen(true)}>
                Добавить тренировку
              </Button>
            )}
          </Stack>
        </Paper>

        {/* ── Блок 2: Ежедневный опросник ──────────────────────────────────── */}
        <Paper withBorder p="lg" radius="md">
          <Group justify="space-between" mb="md">
            <Title order={4}>Самочувствие</Title>
            {todayMetric && (
              <Badge color="green" variant="light" size="sm">Заполнено сегодня</Badge>
            )}
          </Group>

          <Stack gap="lg">
            <Box>
              <Text size="sm" fw={500} mb={6}>Качество сна</Text>
              <SegmentedControl
                fullWidth
                data={SCALE_DATA}
                value={sleep}
                onChange={setSleep}
                color="blue"
              />
              <Group justify="space-between" mt={4}>
                <Text size="xs" c="dimmed">Ужасно</Text>
                <Text size="xs" c="dimmed">Отлично</Text>
              </Group>
            </Box>

            <Box>
              <Text size="sm" fw={500} mb={6}>Уровень усталости</Text>
              <SegmentedControl
                fullWidth
                data={SCALE_DATA}
                value={fatigue}
                onChange={setFatigue}
                color="orange"
              />
              <Group justify="space-between" mt={4}>
                <Text size="xs" c="dimmed">Нет усталости</Text>
                <Text size="xs" c="dimmed">Предельная</Text>
              </Group>
            </Box>

            <Group justify="flex-end" align="center" gap="xs">
              {metricSaved && <Text size="sm" c="green">Сохранено!</Text>}
              {saveMetric.isError && <Text size="sm" c="red">Ошибка сохранения</Text>}
              <Button
                loading={saveMetric.isPending}
                onClick={() => { setMetricSaved(false); saveMetric.mutate() }}
              >
                Сохранить
              </Button>
            </Group>
          </Stack>
        </Paper>

      </SimpleGrid>

      {/* ── Ближайшие тренировки ──────────────────────────────────────────── */}
      {upcomingWorkouts.length > 0 && (
        <Paper withBorder p="lg" radius="md" mt="lg">
          <Title order={4} mb="md">Ближайшие тренировки</Title>
          <Stack gap={0}>
            {upcomingWorkouts.map((w, i) => (
              <Box key={w.id}>
                {i > 0 && <Divider my="sm" />}
                <Group gap="md" align="flex-start" wrap="nowrap">
                  <Box miw={80}>
                    <Text size="sm" fw={600}>
                      {new Date(w.planned_date + 'T00:00:00').toLocaleDateString('ru-RU', {
                        day: 'numeric', month: 'short',
                      })}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {new Date(w.planned_date + 'T00:00:00').toLocaleDateString('ru-RU', { weekday: 'short' })}
                    </Text>
                  </Box>

                  <Box miw={120}>
                    <Text size="sm">
                      {WORKOUT_TYPE_LABEL[w.workout_type ?? ''] ?? w.workout_type}
                      {w.workout_subtype && <Text span c="dimmed"> · {w.workout_subtype}</Text>}
                    </Text>
                    <Group gap="xs" mt={2}>
                      {w.target_zone && (
                        <Badge size="xs" color={ZONE_BADGE_COLOR[w.target_zone] ?? 'gray'} variant="light">
                          {w.target_zone}
                        </Badge>
                      )}
                      {w.planned_duration_min != null && (
                        <Text size="xs" c="dimmed">{w.planned_duration_min} мин</Text>
                      )}
                    </Group>
                  </Box>

                  <Box style={{ flex: 1 }}>
                    {w.description && (
                      <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }} mb={4}>
                        {w.description}
                      </Text>
                    )}
                    {w.interval_structure && w.interval_structure.length > 0 && (
                      <IntervalBar segments={w.interval_structure} height={20} />
                    )}
                    {!w.description && (!w.interval_structure || w.interval_structure.length === 0) && (
                      <Text size="xs" c="dimmed">—</Text>
                    )}
                  </Box>
                </Group>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}
    </Container>
  )
}
