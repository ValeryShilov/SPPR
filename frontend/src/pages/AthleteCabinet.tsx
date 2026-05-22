import { Anchor, Badge, Container, Group, Stack, Table, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { plansApi } from '../api/plans'
import { telemetryApi } from '../api/telemetry'
import { ZONE_BADGE_COLOR } from '../utils/zoneColors'

interface Workout {
  id: string
  planned_date: string
  planned_duration_min: number | null
  planned_tss: number | null
  target_zone: string | null
  status: string
}

interface TodayMetric {
  fatigue_level: number | null
  sleep_quality: number | null
}


export default function AthleteCabinet() {
  const navigate = useNavigate()

  const { data: plan = [] } = useQuery<Workout[]>({
    queryKey: ['my-plan'],
    queryFn: plansApi.getMyPlan,
  })

  const { data: todayMetric } = useQuery<TodayMetric | null>({
    queryKey: ['metrics-today'],
    queryFn: telemetryApi.getTodayMetric,
  })

  const upcoming = plan.slice(0, 7)

  return (
    <Container py="xl">
      <Title order={2} mb="lg">Кабинет спортсмена</Title>

      <Group justify="space-between" mb="md">
        <Text fw={500}>Ближайшие тренировки</Text>
        <Anchor size="sm" onClick={() => navigate('/my-plan')}>Весь план →</Anchor>
      </Group>

      {upcoming.length > 0 ? (
        <Table striped mb="xl">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Дата</Table.Th>
              <Table.Th>Длит., мин</Table.Th>
              <Table.Th>TSS</Table.Th>
              <Table.Th>Зона</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {upcoming.map((w) => (
              <Table.Tr key={w.id}>
                <Table.Td>{new Date(w.planned_date).toLocaleDateString('ru-RU')}</Table.Td>
                <Table.Td>{w.planned_duration_min ?? '—'}</Table.Td>
                <Table.Td>{w.planned_tss != null ? Number(w.planned_tss).toFixed(1) : '—'}</Table.Td>
                <Table.Td>
                  {w.target_zone
                    ? <Badge color={ZONE_BADGE_COLOR[w.target_zone] ?? 'gray'} size="sm">{w.target_zone}</Badge>
                    : '—'}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <Text c="dimmed" mb="xl">Запланированных тренировок нет</Text>
      )}

      <Group justify="space-between" mb="xs">
        <Text fw={500}>Самочувствие сегодня</Text>
        <Anchor size="sm" onClick={() => navigate('/metrics')}>Ввести →</Anchor>
      </Group>

      {todayMetric ? (
        <Stack gap={2}>
          <Text size="sm">Усталость: {todayMetric.fatigue_level ?? '—'} / 5</Text>
          <Text size="sm">Качество сна: {todayMetric.sleep_quality ?? '—'} / 5</Text>
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">Данные за сегодня не введены</Text>
      )}
    </Container>
  )
}
