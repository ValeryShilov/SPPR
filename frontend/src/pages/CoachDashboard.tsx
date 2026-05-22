import {
  Anchor,
  Badge,
  Box,
  Container,
  Group,
  Loader,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { analyticsApi } from '../api/analytics'
import { groupsApi } from '../api/groups'

// ─── Типы ────────────────────────────────────────────────────────────────────

interface TrainingGroup {
  id: string
  name: string
  description: string | null
}

interface GroupSummaryItem {
  athlete_id: string
  full_name: string
  active_alerts: number
  tsb: number | null
  last_workout_status: string | null
}

interface Alert {
  id: string
  athlete_id: string
  severity: 'critical' | 'warning' | 'info'
  rule_code: string
  message: string
  created_at: string
}

// ─── Константы ───────────────────────────────────────────────────────────────

const SEVERITY_META = {
  critical: { bg: '#C8102E', label: 'Критические' },
  warning:  { bg: '#FB8C00', label: 'Предупреждения' },
  info:     { bg: '#1976D2', label: 'Информационные' },
} as const

const TSB_COLOR = (tsb: number | null) => {
  if (tsb === null) return 'gray'
  if (tsb < -30) return 'red'
  if (tsb < -10) return 'orange'
  if (tsb > 15)  return 'blue'
  return 'green'
}

// ─── Компоненты ──────────────────────────────────────────────────────────────

function AlertCard({ alert, athleteName }: { alert: Alert; athleteName: string }) {
  const navigate = useNavigate()
  const { bg } = SEVERITY_META[alert.severity]

  return (
    <Paper
      p="sm"
      withBorder
      radius="md"
      style={{ cursor: 'pointer', borderLeft: `3px solid ${bg}` }}
      onClick={() => navigate(`/athletes/${alert.athlete_id}`)}
    >
      <Group justify="space-between" mb={4}>
        <Badge size="xs" style={{ backgroundColor: bg, color: '#fff' }}>
          {alert.rule_code}
        </Badge>
        <Text size="xs" c="dimmed">
          {new Date(alert.created_at).toLocaleDateString('ru-RU')}
        </Text>
      </Group>
      <Text size="sm" lineClamp={2}>{alert.message}</Text>
      <Text size="xs" c="dimmed" mt={4}>{athleteName}</Text>
    </Paper>
  )
}

function AlertColumn({
  severity,
  alerts,
  athleteNameMap,
}: {
  severity: keyof typeof SEVERITY_META
  alerts: Alert[]
  athleteNameMap: Record<string, string>
}) {
  const { bg, label } = SEVERITY_META[severity]

  return (
    <Stack gap="xs">
      <Group gap="xs">
        <Text fw={600} size="sm">{label}</Text>
        {alerts.length > 0 && (
          <Badge size="sm" circle style={{ backgroundColor: bg, color: '#fff' }}>
            {alerts.length}
          </Badge>
        )}
      </Group>
      <ScrollArea.Autosize mah={400}>
        <Stack gap="xs">
          {alerts.length === 0 ? (
            <Text size="sm" c="dimmed">Нет алертов</Text>
          ) : (
            alerts.map((a) => (
              <AlertCard
                key={a.id}
                alert={a}
                athleteName={athleteNameMap[a.athlete_id] ?? '—'}
              />
            ))
          )}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  )
}

// ─── Страница ─────────────────────────────────────────────────────────────────

export default function CoachDashboard() {
  const navigate = useNavigate()

  // 1. Все группы тренера
  const { data: groups = [], isLoading: groupsLoading } = useQuery<TrainingGroup[]>({
    queryKey: ['groups'],
    queryFn: groupsApi.list,
  })

  // 2. Сводка по каждой группе (параллельно)
  const summaryQueries = useQueries({
    queries: groups.map((g) => ({
      queryKey: ['group-summary', g.id],
      queryFn: () => analyticsApi.getGroupSummary(g.id),
    })),
  })

  const summariesLoading = summaryQueries.some((q) => q.isLoading)

  // Все атлеты из всех групп (плоский список)
  const allAthletes: GroupSummaryItem[] = summaryQueries.flatMap(
    (q) => (q.data as { athletes: GroupSummaryItem[] } | undefined)?.athletes ?? [],
  )

  // Словарь athlete_id → полное имя
  const athleteNameMap: Record<string, string> = Object.fromEntries(
    allAthletes.map((a) => [a.athlete_id, a.full_name]),
  )

  // Атлеты с активными алертами
  const athletesWithAlerts = allAthletes.filter((a) => a.active_alerts > 0)

  // Дедупликация: один атлет может быть в нескольких группах
  const uniqueAthleteIds = [...new Set(athletesWithAlerts.map((a) => a.athlete_id))]

  // 3. Алерты для каждого атлета, у кого есть активные (параллельно)
  const alertQueries = useQueries({
    queries: uniqueAthleteIds.map((id) => ({
      queryKey: ['alerts', id],
      queryFn: () => analyticsApi.getAlerts(id),
    })),
  })

  const alertsLoading = alertQueries.some((q) => q.isLoading)

  const allAlerts: Alert[] = alertQueries.flatMap((q) => (q.data as Alert[] | undefined) ?? [])

  const critical = allAlerts.filter((a) => a.severity === 'critical')
  const warning  = allAlerts.filter((a) => a.severity === 'warning')
  const info     = allAlerts.filter((a) => a.severity === 'info')

  // ─── Данные для таблицы групп ──────────────────────────────────────────────

  const groupRows = groups.map((g, i) => {
    const athletes: GroupSummaryItem[] =
      (summaryQueries[i]?.data as { athletes: GroupSummaryItem[] } | undefined)?.athletes ?? []

    const totalAlerts = athletes.reduce((s, a) => s + a.active_alerts, 0)

    const published  = athletes.filter((a) => a.last_workout_status === 'published').length
    const completed  = athletes.filter((a) => a.last_workout_status === 'completed').length
    const noWorkout  = athletes.filter((a) => a.last_workout_status === null).length

    const planStatus =
      athletes.length === 0 ? '—'
      : published > 0  ? `${published} в плане`
      : completed > 0  ? `${completed} завершено`
      : `${noWorkout} без плана`

    const avgTsb =
      athletes.length > 0
        ? athletes.reduce((s, a) => s + (a.tsb ?? 0), 0) / athletes.length
        : null

    return { g, athletes, totalAlerts, planStatus, avgTsb, loading: summaryQueries[i]?.isLoading }
  })

  // ─── Рендер ───────────────────────────────────────────────────────────────

  return (
    <Container size="xl" py="xl">
      {/* Заголовок */}
      <Group justify="space-between" mb="xl">
        <Title order={2}>Панель тренера</Title>
        <Group gap="md">
          <Anchor size="sm" onClick={() => navigate('/groups')}>Группы</Anchor>
          <Anchor size="sm" onClick={() => navigate('/planning')}>Планирование</Anchor>
        </Group>
      </Group>

      {/* ── Блок 1: Активные алерты ────────────────────────────────────────── */}
      <Box mb="xl">
        <Group mb="md" gap="xs">
          <Title order={3}>Активные алерты</Title>
          {alertsLoading && <Loader size="xs" />}
          {!alertsLoading && allAlerts.length === 0 && summaryQueries.length > 0 && (
            <Badge color="green" variant="light">Всё в порядке</Badge>
          )}
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <AlertColumn severity="critical" alerts={critical} athleteNameMap={athleteNameMap} />
          <AlertColumn severity="warning"  alerts={warning}  athleteNameMap={athleteNameMap} />
          <AlertColumn severity="info"     alerts={info}     athleteNameMap={athleteNameMap} />
        </SimpleGrid>
      </Box>

      {/* ── Блок 2: Состояние групп ─────────────────────────────────────────── */}
      <Box>
        <Group mb="md" gap="xs">
          <Title order={3}>Состояние групп</Title>
          {(groupsLoading || summariesLoading) && <Loader size="xs" />}
        </Group>

        {!groupsLoading && groups.length === 0 ? (
          <Text c="dimmed">Групп нет. <Anchor onClick={() => navigate('/groups')}>Создать группу</Anchor></Text>
        ) : (
          <Table striped highlightOnHover withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Группа</Table.Th>
                <Table.Th ta="center">Атлетов</Table.Th>
                <Table.Th ta="center">Алертов</Table.Th>
                <Table.Th ta="center">Средний TSB</Table.Th>
                <Table.Th>Статус плана</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {groupRows.map(({ g, athletes, totalAlerts, planStatus, avgTsb, loading }) => (
                <Table.Tr key={g.id}>
                  <Table.Td>
                    <Anchor fw={500} onClick={() => navigate(`/groups/${g.id}`)}>
                      {g.name}
                    </Anchor>
                  </Table.Td>
                  <Table.Td ta="center">
                    {loading ? <Loader size="xs" /> : athletes.length}
                  </Table.Td>
                  <Table.Td ta="center">
                    {loading ? (
                      <Loader size="xs" />
                    ) : totalAlerts > 0 ? (
                      <Badge color="red" size="sm">{totalAlerts}</Badge>
                    ) : (
                      <Text size="sm" c="dimmed">0</Text>
                    )}
                  </Table.Td>
                  <Table.Td ta="center">
                    {loading ? (
                      <Loader size="xs" />
                    ) : (
                      <Badge color={TSB_COLOR(avgTsb)} variant="light" size="sm">
                        {avgTsb !== null ? avgTsb.toFixed(1) : '—'}
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {loading ? <Loader size="xs" /> : (
                      <Text size="sm">{planStatus}</Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Box>
    </Container>
  )
}
