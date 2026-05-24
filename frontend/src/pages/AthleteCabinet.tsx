import {
  Badge,
  Box,
  Button,
  Collapse,
  Container,
  Group,
  Paper,
  SegmentedControl,
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
import TelemetryUpload from '../components/TelemetryUpload'
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

  const [showUpload, setShowUpload] = useState(false)
  const [sleep, setSleep]           = useState('3')
  const [fatigue, setFatigue]       = useState('3')
  const [metricSaved, setMetricSaved] = useState(false)

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

  const saveMetric = useMutation({
    mutationFn: () =>
      telemetryApi.createMetric({ sleep_quality: Number(sleep), fatigue_level: Number(fatigue) }),
    onSuccess: () => {
      setMetricSaved(true)
      queryClient.invalidateQueries({ queryKey: ['metrics-today'] })
    },
  })

  // ─── Производные данные ───────────────────────────────────────────────────

  const todayWorkout  = plan.find((w) => w.planned_date === todayStr) ?? null
  const zones: HRZone[] = (zonesData as { zones: HRZone[] } | undefined)?.zones ?? []
  const targetHRZone  = zones.find((z) => z.zone === todayWorkout?.target_zone)

  const zoneHex   = todayWorkout?.target_zone ? ZONE_HEX[todayWorkout.target_zone] : null
  const zoneBg    = zoneHex ? zoneHex + '22' : '#f5f5f5'

  // ─── Рендер ───────────────────────────────────────────────────────────────

  return (
    <Container size="md" py="xl">
      <Title order={2} mb="xl">Кабинет спортсмена</Title>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">

        {/* ── Блок 1: Задание на сегодня ──────────────────────────────────── */}
        <Paper withBorder p="lg" radius="md">
          <Title order={4} mb="md">Задание на сегодня</Title>

          {todayWorkout ? (
            <Stack gap="md">
              {/* Тип / подтип */}
              {todayWorkout.workout_type && (
                <Text size="sm" c="dimmed">
                  {WORKOUT_TYPE_LABEL[todayWorkout.workout_type] ?? todayWorkout.workout_type}
                  {todayWorkout.workout_subtype && ` · ${todayWorkout.workout_subtype}`}
                </Text>
              )}

              {/* Три метрические плитки */}
              <SimpleGrid cols={3} spacing="xs">
                {/* Зона ЧСС */}
                <Box
                  p="sm"
                  style={{ borderRadius: 8, backgroundColor: zoneBg, textAlign: 'center' }}
                >
                  {todayWorkout.target_zone ? (
                    <>
                      <Badge
                        color={ZONE_BADGE_COLOR[todayWorkout.target_zone] ?? 'gray'}
                        size="lg"
                        mb={4}
                      >
                        {todayWorkout.target_zone}
                      </Badge>
                      {targetHRZone && (
                        <Text size="xs" c="dimmed" lh={1.2}>
                          {targetHRZone.hr_min}–{targetHRZone.hr_max}
                          <br />уд/мин
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text size="sm" c="dimmed">—</Text>
                  )}
                  <Text size="xs" c="dimmed" mt={4}>Зона ЧСС</Text>
                </Box>

                {/* Длительность */}
                <Box p="sm" style={{ borderRadius: 8, backgroundColor: '#f5f5f5', textAlign: 'center' }}>
                  <Text size="xl" fw={700} lh={1}>
                    {todayWorkout.planned_duration_min ?? '—'}
                  </Text>
                  <Text size="xs" c="dimmed" mt={4}>мин</Text>
                </Box>

                {/* TSS */}
                <Box p="sm" style={{ borderRadius: 8, backgroundColor: '#f5f5f5', textAlign: 'center' }}>
                  <Text size="xl" fw={700} lh={1}>
                    {todayWorkout.planned_tss != null
                      ? Math.round(Number(todayWorkout.planned_tss))
                      : '—'}
                  </Text>
                  <Text size="xs" c="dimmed" mt={4}>TSS</Text>
                </Box>
              </SimpleGrid>

              {/* Описание задания */}
              {todayWorkout.description && (
                <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>
                  {todayWorkout.description}
                </Text>
              )}

              {/* Кнопка регистрации + Dropzone */}
              <Button
                variant={showUpload ? 'filled' : 'light'}
                color="red"
                onClick={() => setShowUpload((v) => !v)}
              >
                {showUpload ? 'Скрыть' : 'Зарегистрировать тренировку'}
              </Button>

              <Collapse in={showUpload}>
                <TelemetryUpload workoutId={todayWorkout.id} />
              </Collapse>
            </Stack>
          ) : (
            <Stack align="center" justify="center" py="xl" gap="xs">
              <Text size="2rem" c="dimmed">—</Text>
              <Text fw={500}>Сегодня отдых</Text>
              <Text size="xs" c="dimmed">Запланированных тренировок нет</Text>
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
    </Container>
  )
}
