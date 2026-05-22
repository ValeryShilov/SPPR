import {
  Badge,
  Button,
  Container,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { athletesApi } from '../api/athletes'
import { plansApi } from '../api/plans'
import { ZONE_BADGE_COLOR } from '../utils/zoneColors'

// ─── Типы ────────────────────────────────────────────────────────────────────

interface Workout {
  id: string
  athlete_id: string
  planned_date: string
  planned_duration_min: number | null
  planned_tss: number | null
  k_qual: number | null
  k_form: number | null
  target_zone: string | null
  workout_type: string | null
  workout_subtype: string | null
  description: string | null
  interval_structure: unknown[] | null
  status: string
}

interface AthleteProfile {
  id: string
  first_name: string
  last_name: string
}

// ─── Константы ───────────────────────────────────────────────────────────────

const WORKOUT_TYPE_LABEL: Record<string, string> = {
  run: 'Бег',
  ski: 'Лыжи',
  skiroll: 'Лыжероллеры',
  bike: 'Велосипед',
  gym: 'Силовая',
  pool: 'Бассейн',
  rest: 'Отдых',
  other: 'Другое',
}

const WORKOUT_TYPE_COLOR: Record<string, string> = {
  run: 'teal',
  ski: 'blue',
  skiroll: 'indigo',
  bike: 'lime',
  gym: 'orange',
  pool: 'cyan',
  rest: 'gray',
  other: 'gray',
}

const STATUS_COLOR: Record<string, string> = {
  draft: 'gray',
  published: 'green',
  completed: 'blue',
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Черновик',
  published: 'Утверждён',
  completed: 'Выполнен',
}

const DAY_NAMES = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = DAY_NAMES[d.getDay()]
  const locale = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  return `${day}, ${locale}`
}

// ─── Страница ─────────────────────────────────────────────────────────────────

export default function Matrix() {
  const { templateId } = useParams<{ templateId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [dayIdx, setDayIdx] = useState(0)

  const { data: workouts = [], isLoading: workoutsLoading } = useQuery<Workout[]>({
    queryKey: ['matrix', templateId],
    queryFn: () => plansApi.getMatrix(templateId!),
    enabled: !!templateId,
  })

  const { data: athletes = [], isLoading: athletesLoading } = useQuery<AthleteProfile[]>({
    queryKey: ['athletes'],
    queryFn: () => athletesApi.list(),
  })

  const approveAll = useMutation({
    mutationFn: () => plansApi.approveAll(templateId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matrix', templateId] })
    },
  })

  // Уникальные отсортированные даты
  const dates = [...new Set(workouts.map((w) => w.planned_date))].sort()
  const clampedIdx = Math.min(dayIdx, Math.max(0, dates.length - 1))
  const currentDate = dates[clampedIdx]

  // Словарь athlete_id → "Фамилия Имя"
  const nameMap: Record<string, string> = Object.fromEntries(
    (athletes as AthleteProfile[]).map((a) => [a.id, `${a.last_name} ${a.first_name}`]),
  )

  const dayWorkouts = workouts.filter((w) => w.planned_date === currentDate)
  const draftCount = workouts.filter((w) => w.status === 'draft').length
  const isLoading = workoutsLoading || athletesLoading

  return (
    <Container py="xl" size="xl">
      {/* Заголовок */}
      <Group justify="space-between" mb="lg" align="flex-start">
        <Stack gap={2}>
          <Title order={2}>Расчётная матрица</Title>
          <Text size="sm" c="dimmed">
            {isLoading
              ? 'Загрузка...'
              : `${workouts.length} тренировок · ${draftCount} черновиков`}
          </Text>
        </Stack>
        <Group gap="xs">
          <Button variant="light" onClick={() => navigate(`/planning/${templateId}`)}>
            ← Шаблон
          </Button>
          <Button
            color="green"
            loading={approveAll.isPending}
            disabled={draftCount === 0}
            onClick={() => approveAll.mutate()}
          >
            Утвердить неделю
          </Button>
        </Group>
      </Group>

      {isLoading && (
        <Group justify="center" mt="xl">
          <Loader />
        </Group>
      )}

      {!isLoading && dates.length === 0 && (
        <Text c="dimmed" ta="center" mt="xl">
          Черновиков нет. Запустите адаптацию шаблона.
        </Text>
      )}

      {!isLoading && dates.length > 0 && (
        <>
          {/* Навигация по дням */}
          <Group justify="space-between" mb="md" align="center">
            <Button
              variant="subtle"
              size="sm"
              disabled={clampedIdx === 0}
              onClick={() => setDayIdx(clampedIdx - 1)}
            >
              ← Назад
            </Button>

            <Stack gap={0} align="center">
              <Text fw={600} size="lg">{formatDate(currentDate)}</Text>
              <Text size="xs" c="dimmed">
                День {clampedIdx + 1} из {dates.length} · {dayWorkouts.length} атл.
              </Text>
            </Stack>

            <Button
              variant="subtle"
              size="sm"
              disabled={clampedIdx === dates.length - 1}
              onClick={() => setDayIdx(clampedIdx + 1)}
            >
              Вперёд →
            </Button>
          </Group>

          {/* Таблица тренировок дня */}
          {dayWorkouts.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">Тренировок в этот день нет</Text>
          ) : (
            <Table striped highlightOnHover withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Атлет</Table.Th>
                  <Table.Th>Тип</Table.Th>
                  <Table.Th ta="center">Зона ЧСС</Table.Th>
                  <Table.Th ta="center">Длит., мин</Table.Th>
                  <Table.Th ta="center">TSS прогноз</Table.Th>
                  <Table.Th ta="center">k_qual</Table.Th>
                  <Table.Th ta="center">k_form</Table.Th>
                  <Table.Th>Флаги</Table.Th>
                  <Table.Th ta="center">Статус</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {dayWorkouts.map((w) => (
                  <Table.Tr key={w.id}>
                    {/* Атлет */}
                    <Table.Td>
                      <Text
                        size="sm"
                        fw={500}
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/athletes/${w.athlete_id}`)}
                      >
                        {nameMap[w.athlete_id] ?? w.athlete_id.slice(0, 8) + '…'}
                      </Text>
                    </Table.Td>

                    {/* Тип тренировки */}
                    <Table.Td>
                      {w.workout_type ? (
                        <Badge
                          size="sm"
                          variant="light"
                          color={WORKOUT_TYPE_COLOR[w.workout_type] ?? 'gray'}
                        >
                          {WORKOUT_TYPE_LABEL[w.workout_type] ?? w.workout_type}
                        </Badge>
                      ) : (
                        <Text size="sm" c="dimmed">—</Text>
                      )}
                    </Table.Td>

                    {/* Зона ЧСС */}
                    <Table.Td ta="center">
                      {w.target_zone ? (
                        <Badge size="sm" color={ZONE_BADGE_COLOR[w.target_zone] ?? 'gray'}>
                          {w.target_zone}
                        </Badge>
                      ) : (
                        <Text size="sm" c="dimmed">—</Text>
                      )}
                    </Table.Td>

                    {/* Длительность */}
                    <Table.Td ta="center">
                      <Text size="sm">{w.planned_duration_min ?? '—'}</Text>
                    </Table.Td>

                    {/* TSS прогноз */}
                    <Table.Td ta="center">
                      <Text size="sm">
                        {w.planned_tss != null ? Number(w.planned_tss).toFixed(1) : '—'}
                      </Text>
                    </Table.Td>

                    {/* k_qual */}
                    <Table.Td ta="center">
                      <Text
                        size="sm"
                        c={w.k_qual != null && w.k_qual < 0.9 ? 'orange' : undefined}
                      >
                        {w.k_qual != null ? Number(w.k_qual).toFixed(2) : '—'}
                      </Text>
                    </Table.Td>

                    {/* k_form */}
                    <Table.Td ta="center">
                      <Text
                        size="sm"
                        c={w.k_form != null && w.k_form < 0.9 ? 'red' : undefined}
                      >
                        {w.k_form != null ? Number(w.k_form).toFixed(2) : '—'}
                      </Text>
                    </Table.Td>

                    {/* Флаги */}
                    <Table.Td>
                      <Group gap={4}>
                        {w.interval_structure &&
                          (w.interval_structure as unknown[]).length > 0 && (
                            <Badge size="xs" color="orange" variant="light">Инт.</Badge>
                          )}
                        {w.workout_subtype && (
                          <Badge size="xs" color="grape" variant="light">
                            {w.workout_subtype}
                          </Badge>
                        )}
                        {w.description && (
                          <Badge size="xs" color="gray" variant="light">Заметка</Badge>
                        )}
                      </Group>
                    </Table.Td>

                    {/* Статус */}
                    <Table.Td ta="center">
                      <Badge
                        size="sm"
                        color={STATUS_COLOR[w.status] ?? 'gray'}
                        variant={w.status === 'published' ? 'filled' : 'light'}
                      >
                        {STATUS_LABEL[w.status] ?? w.status}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </>
      )}
    </Container>
  )
}
