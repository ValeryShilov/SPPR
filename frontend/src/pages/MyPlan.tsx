import { Badge, Container, Stack, Table, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { plansApi } from '../api/plans'
import TelemetryUpload from '../components/TelemetryUpload'
import { ZONE_BADGE_COLOR } from '../utils/zoneColors'

interface Workout {
  id: string
  planned_date: string
  planned_duration_min: number | null
  planned_tss: number | null
  target_zone: string | null
  status: string
}


export default function MyPlan() {
  const { data: workouts = [], isLoading } = useQuery<Workout[]>({
    queryKey: ['my-plan'],
    queryFn: plansApi.getMyPlan,
  })

  return (
    <Container py="xl">
      <Title order={2} mb="lg">Мой план</Title>

      {isLoading && <Text>Загрузка...</Text>}

      {workouts.length > 0 ? (
        <Table striped highlightOnHover mb="xl">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Дата</Table.Th>
              <Table.Th>Длительность, мин</Table.Th>
              <Table.Th>TSS</Table.Th>
              <Table.Th>Зона</Table.Th>
              <Table.Th>Загрузка</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {workouts.map((w) => (
              <Table.Tr key={w.id}>
                <Table.Td>{new Date(w.planned_date).toLocaleDateString('ru-RU')}</Table.Td>
                <Table.Td>{w.planned_duration_min ?? '—'}</Table.Td>
                <Table.Td>{w.planned_tss != null ? Number(w.planned_tss).toFixed(1) : '—'}</Table.Td>
                <Table.Td>
                  {w.target_zone
                    ? <Badge color={ZONE_BADGE_COLOR[w.target_zone] ?? 'gray'}>{w.target_zone}</Badge>
                    : '—'}
                </Table.Td>
                <Table.Td>
                  <TelemetryUpload workoutId={w.id} compact />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        !isLoading && (
          <Stack align="center" mt="xl" gap="xs">
            <Text c="dimmed">Запланированных тренировок нет</Text>
          </Stack>
        )
      )}
    </Container>
  )
}
