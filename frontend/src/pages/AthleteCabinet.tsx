import {
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

const SCALE_DATA = ['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }))

const todayStr = new Date().toISOString().split('T')[0]

// ─── Страница ─────────────────────────────────────────────────────────────────

export default function AthleteCabinet() {
  const queryClient = useQueryClient()

  const [showUpload,  setShowUpload]  = useState(false)
  const [chartsOpen,  setChartsOpen]  = useState(false)
  const [sleep,       setSleep]       = useState('3')
  const [fatigue,     setFatigue]     = useState('3')
  const [metricSaved, setMetricSaved] = useState(false)
  const [adHocOpen,    setAdHocOpen]    = useState(false)
  const [adHocType,    setAdHocType]    = useState<string | null>(null)
  const [adHocWorkout, setAdHocWorkout] = useState<Workout | null>(null)

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

  // Предзаполнение опросника из сохранённых данных
  useEffect(() => {
    if (todayMetric) {
      if (todayMetric.sleep_quality)  setSleep(String(todayMetric.sleep_quality))
      if (todayMetric.fatigue_level)  setFatigue(String(todayMetric.fatigue_level))
    }
  }, [todayMetric])

  const createAdHoc = useMutation({
    mutationFn: () => plansApi.createSelfWorkout({
      planned_date: todayStr,
      workout_type: adHocType,
    }),
    onSuccess: (created: Workout) => {
      setAdHocWorkout(created)
      setAdHocOpen(false)
      setShowUpload(true)
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

  const todayWorkout     = plan.find((w) => w.planned_date === todayStr) ?? null
  const effectiveWorkout = todayWorkout ?? adHocWorkout
  const upcomingWorkouts = plan
    .filter((w) => w.planned_date > todayStr && w.workout_type !== 'rest')
    .slice(0, 10)
  const zones: HRZone[] = (zonesData as { zones: HRZone[] } | undefined)?.zones ?? []
  const targetHRZone  = zones.find((z) => z.zone === effectiveWorkout?.target_zone)

  const zoneHex   = effectiveWorkout?.target_zone ? ZONE_HEX[effectiveWorkout.target_zone] : null
  const zoneBg    = zoneHex ? zoneHex + '22' : '#f5f5f5'

  const { data: todayTelemetry } = useQuery<ActualTelemetry | null>({
    queryKey: ['workout-telemetry', effectiveWorkout?.id],
    queryFn: () => telemetryApi.getWorkoutTelemetry(effectiveWorkout!.id) as Promise<ActualTelemetry | null>,
    enabled: !!effectiveWorkout?.id,
  })

  // ─── Рендер ───────────────────────────────────────────────────────────────

  return (
    <Container size="md" py="xl">
      <Title order={2} mb="xl">Кабинет спортсмена</Title>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">

        {/* ── Блок 1: Задание на сегодня ──────────────────────────────────── */}
        <Paper withBorder p="lg" radius="md">
          <Title order={4} mb="md">Задание на сегодня</Title>

          {effectiveWorkout ? (
            <Stack gap="md">
              {/* Тип / подтип + статус */}
              <Group justify="space-between" align="center">
                {effectiveWorkout.workout_type && (
                  <Text size="sm" c="dimmed">
                    {WORKOUT_TYPE_LABEL[effectiveWorkout.workout_type] ?? effectiveWorkout.workout_type}
                    {effectiveWorkout.workout_subtype && ` · ${effectiveWorkout.workout_subtype}`}
                  </Text>
                )}
                {todayTelemetry && (
                  <Badge color="green" variant="filled" size="sm">Выполнено ✓</Badge>
                )}
              </Group>

              {todayTelemetry ? (
                /* ── Фактические данные ─────────────────────────────────── */
                <>
                  <SimpleGrid cols={3} spacing="xs">
                    <Box p="sm" style={{ borderRadius: 8, background: '#ebfbee', textAlign: 'center' }}>
                      <Text size="xl" fw={700} lh={1}>{todayTelemetry.actual_duration_min ?? '—'}</Text>
                      <Text size="xs" c="dimmed" mt={4}>мин (факт.)</Text>
                    </Box>
                    <Box p="sm" style={{ borderRadius: 8, background: '#f5f5f5', textAlign: 'center' }}>
                      <Text size="xl" fw={700} lh={1}>
                        {todayTelemetry.distance_km != null ? Number(todayTelemetry.distance_km).toFixed(1) : '—'}
                      </Text>
                      <Text size="xs" c="dimmed" mt={4}>км</Text>
                    </Box>
                    <Box p="sm" style={{ borderRadius: 8, background: '#f5f5f5', textAlign: 'center' }}>
                      <Text size="xl" fw={700} lh={1}>{todayTelemetry.avg_hr ?? '—'}</Text>
                      <Text size="xs" c="dimmed" mt={4}>ЧСС ср.</Text>
                    </Box>
                  </SimpleGrid>

                  {/* Темп / скорость */}
                  {effectiveWorkout.workout_type && PACE_TYPES.has(effectiveWorkout.workout_type) && (() => {
                    const pace = calcPaceSpeed(
                      todayTelemetry.actual_duration_min ?? '',
                      todayTelemetry.distance_km ?? '',
                      effectiveWorkout.workout_type!,
                    )
                    return pace ? (
                      <Box p="xs" style={{ background: '#f1f3f5', borderRadius: 6 }}>
                        <Text size="xs" c="dimmed" mb={2}>
                          {effectiveWorkout.workout_type === 'run' ? 'Темп' : 'Скорость'}
                        </Text>
                        <Text size="sm" fw={600}>{pace}</Text>
                      </Box>
                    ) : null
                  })()}

                  {/* Доп. показатели */}
                  <Group gap="lg">
                    {todayTelemetry.max_hr != null && (
                      <Stack gap={0} align="center">
                        <Text fw={600}>{todayTelemetry.max_hr}</Text>
                        <Text size="xs" c="dimmed">ЧСС макс.</Text>
                      </Stack>
                    )}
                    {todayTelemetry.actual_tss != null && (
                      <Stack gap={0} align="center">
                        <Text fw={600}>{Math.round(Number(todayTelemetry.actual_tss))}</Text>
                        <Text size="xs" c="dimmed">TSS</Text>
                      </Stack>
                    )}
                    {todayTelemetry.rpe != null && (
                      <Stack gap={0} align="center">
                        <Text fw={600}>{todayTelemetry.rpe}<Text span size="xs" c="dimmed">/10</Text></Text>
                        <Text size="xs" c="dimmed">Самочувствие</Text>
                      </Stack>
                    )}
                  </Group>

                  {/* Время в зонах */}
                  {[todayTelemetry.hr_zone1_min, todayTelemetry.hr_zone2_min, todayTelemetry.hr_zone3_min,
                    todayTelemetry.hr_zone4_min, todayTelemetry.hr_zone5_min].some((v) => v != null && v > 0) && (
                    <Box>
                      <Text size="xs" c="dimmed" mb={4}>Время в зонах, мин</Text>
                      <Group gap="xs">
                        {(['Z1','Z2','Z3','Z4','Z5'] as const).map((z, i) => {
                          const mins = [todayTelemetry.hr_zone1_min, todayTelemetry.hr_zone2_min,
                            todayTelemetry.hr_zone3_min, todayTelemetry.hr_zone4_min,
                            todayTelemetry.hr_zone5_min][i]
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
                  {todayTelemetry.comment && (
                    <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>
                      {todayTelemetry.comment}
                    </Text>
                  )}

                  {/* Задание (компактно) */}
                  <Box pt="xs" style={{ borderTop: '1px solid #f0f0f0' }}>
                    <Text size="xs" c="dimmed">
                      Задание:{effectiveWorkout.target_zone && ` ${effectiveWorkout.target_zone}`}
                      {effectiveWorkout.planned_duration_min != null && ` · ${effectiveWorkout.planned_duration_min} мин`}
                    </Text>
                    {effectiveWorkout.description && (
                      <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }} mt={2}>
                        {effectiveWorkout.description}
                      </Text>
                    )}
                  </Box>

                  {/* Редактирование данных / графики */}
                  <Group gap="xs">
                    <Button size="xs" variant="subtle" color="gray"
                      onClick={() => setShowUpload((v) => !v)}>
                      {showUpload ? 'Скрыть' : 'Изменить данные'}
                    </Button>
                    {todayTelemetry.timeseries && todayTelemetry.timeseries.length > 0 && (
                      <Button size="xs" variant="subtle" color="blue"
                        onClick={() => setChartsOpen(true)}>
                        📈 Графики
                      </Button>
                    )}
                  </Group>
                  <Collapse in={showUpload}>
                    <TelemetryUpload workoutId={effectiveWorkout.id} workoutType={effectiveWorkout.workout_type} />
                  </Collapse>
                </>
              ) : (
                /* ── Плановые данные ────────────────────────────────────── */
                <>
                  <SimpleGrid cols={3} spacing="xs">
                    <Box p="sm" style={{ borderRadius: 8, backgroundColor: zoneBg, textAlign: 'center' }}>
                      {effectiveWorkout.target_zone ? (
                        <>
                          <Badge color={ZONE_BADGE_COLOR[effectiveWorkout.target_zone] ?? 'gray'} size="lg" mb={4}>
                            {effectiveWorkout.target_zone}
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
                      <Text size="xl" fw={700} lh={1}>{effectiveWorkout.planned_duration_min ?? '—'}</Text>
                      <Text size="xs" c="dimmed" mt={4}>мин</Text>
                    </Box>
                    <Box p="sm" style={{ borderRadius: 8, backgroundColor: '#f5f5f5', textAlign: 'center' }}>
                      <Text size="xl" fw={700} lh={1}>
                        {effectiveWorkout.planned_tss != null ? Math.round(Number(effectiveWorkout.planned_tss)) : '—'}
                      </Text>
                      <Text size="xs" c="dimmed" mt={4}>TSS</Text>
                    </Box>
                  </SimpleGrid>

                  {effectiveWorkout.description && (
                    <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>
                      {effectiveWorkout.description}
                    </Text>
                  )}

                  {effectiveWorkout.interval_structure && effectiveWorkout.interval_structure.length > 0 && (
                    <IntervalBar segments={effectiveWorkout.interval_structure} />
                  )}

                  <Button variant={showUpload ? 'filled' : 'light'} color="red"
                    onClick={() => setShowUpload((v) => !v)}>
                    {showUpload ? 'Скрыть' : 'Зарегистрировать тренировку'}
                  </Button>
                  <Collapse in={showUpload}>
                    <TelemetryUpload workoutId={effectiveWorkout.id} workoutType={effectiveWorkout.workout_type} />
                  </Collapse>
                </>
              )}
            </Stack>
          ) : (
            <Stack gap="md">
              <Stack align="center" py="lg" gap={4}>
                <Text size="2rem" c="dimmed">—</Text>
                <Text fw={500}>Сегодня отдых</Text>
                <Text size="xs" c="dimmed">Запланированных тренировок нет</Text>
              </Stack>

              {adHocOpen ? (
                <Stack gap="sm">
                  <Select
                    label="Вид тренировки"
                    placeholder="Выберите..."
                    data={Object.entries(WORKOUT_TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))}
                    value={adHocType}
                    onChange={setAdHocType}
                  />
                  {createAdHoc.isError && (
                    <Text size="xs" c="red">Ошибка при создании тренировки</Text>
                  )}
                  <Group gap="xs">
                    <Button variant="default" size="sm"
                      onClick={() => { setAdHocOpen(false); setAdHocType(null) }}>
                      Отмена
                    </Button>
                    <Button size="sm" color="red"
                      loading={createAdHoc.isPending}
                      disabled={!adHocType}
                      onClick={() => createAdHoc.mutate()}>
                      Продолжить →
                    </Button>
                  </Group>
                </Stack>
              ) : (
                <Button variant="light" color="red"
                  onClick={() => setAdHocOpen(true)}>
                  Зарегистрировать тренировку
                </Button>
              )}
            </Stack>
          )}
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
            {/* Качество сна */}
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

            {/* Уровень усталости */}
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

            {/* Сохранение */}
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
                  {/* Дата */}
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

                  {/* Тип + зона + объём */}
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

                  {/* Описание + интервалы */}
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
      {todayTelemetry?.timeseries && todayTelemetry.timeseries.length > 0 && (
        <WorkoutChartsModal
          opened={chartsOpen}
          onClose={() => setChartsOpen(false)}
          timeseries={todayTelemetry.timeseries}
          workoutType={effectiveWorkout?.workout_type}
          title="Графики тренировки"
        />
      )}
    </Container>
  )
}
