import {
  Avatar,
  Badge,
  Button,
  Card,
  Group,
  ScrollArea,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '../api/analytics'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AthleteGroup {
  id: string
  name: string
}

interface CoachAthlete {
  athlete_id: string
  full_name: string
  groups: AthleteGroup[]
  tsb: number | null
  atl: number | null
  ctl: number | null
  active_alerts: number
  alert_severity: string | null
  last_workout_status: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  published:  'Запланирована',
  completed:  'Выполнена',
  missed:     'Пропущена',
  cancelled:  'Отменена',
}

const STATUS_COLOR: Record<string, string> = {
  published:  'blue',
  completed:  'green',
  missed:     'red',
  cancelled:  'gray',
}

const SEV_COLOR: Record<string, string> = {
  critical: 'red',
  warning:  'orange',
  info:     'blue',
}

function tsbColor(tsb: number | null): string {
  if (tsb === null) return '#868e96'
  if (tsb > 5)  return '#2f9e44'
  if (tsb < -20) return '#e03131'
  if (tsb < -10) return '#f08c00'
  return '#1971c2'
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0] ?? '').join('').toUpperCase().slice(0, 2)
}

function fmtMetric(v: number | null) {
  return v !== null ? v.toFixed(1) : '—'
}

// ─── Group card ───────────────────────────────────────────────────────────────

function GroupCard({
  groupId,
  groupName,
  athletes,
}: {
  groupId: string
  groupName: string
  athletes: CoachAthlete[]
}) {
  const navigate = useNavigate()

  const avgTsb = useMemo(() => {
    const vals = athletes.map((a) => a.tsb).filter((v): v is number => v !== null)
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
  }, [athletes])

  const topSeverity: string | null = useMemo(() => {
    const order: Record<string, number> = { critical: 3, warning: 2, info: 1 }
    return athletes.reduce<string | null>((best, a) => {
      if (!a.alert_severity) return best
      return !best || (order[a.alert_severity] ?? 0) > (order[best] ?? 0) ? a.alert_severity : best
    }, null)
  }, [athletes])

  const preview = athletes.slice(0, 5)

  return (
    <Card radius="md" withBorder padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Group justify="space-between" align="flex-start">
        <div>
          <Text fw={600} size="md" lineClamp={1}>{groupName}</Text>
          <Text size="xs" c="dimmed">{athletes.length} атлетов</Text>
        </div>
        {topSeverity && (
          <Badge color={SEV_COLOR[topSeverity] ?? 'gray'} size="sm" variant="light">
            {topSeverity === 'critical' ? 'Критично' : topSeverity === 'warning' ? 'Внимание' : 'Инфо'}
          </Badge>
        )}
      </Group>

      {/* avatar strip */}
      <Group gap={4}>
        {preview.map((a) => (
          <Tooltip key={a.athlete_id} label={a.full_name} withArrow>
            <Avatar size={32} radius="xl"
              style={{ background: '#C8102E', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
              onClick={() => navigate(`/athletes/${a.athlete_id}`)}
            >
              {initials(a.full_name)}
            </Avatar>
          </Tooltip>
        ))}
        {athletes.length > 5 && (
          <Avatar size={32} radius="xl" style={{ background: '#868e96', color: '#fff', fontSize: 11 }}>
            +{athletes.length - 5}
          </Avatar>
        )}
      </Group>

      {/* avg TSB */}
      <Group gap={24}>
        <div>
          <Text size="xs" c="dimmed">Ср. TSB</Text>
          <Text size="sm" fw={600} style={{ color: tsbColor(avgTsb) }}>
            {avgTsb !== null ? avgTsb.toFixed(1) : '—'}
          </Text>
        </div>
      </Group>

      <Group gap={8} mt="auto">
        <Button
          size="xs"
          variant="light"
          color="blue"
          onClick={() => navigate(`/groups/${groupId}`)}
          style={{ flex: 1 }}
        >
          Матрица
        </Button>
        <Button
          size="xs"
          variant="subtle"
          color="gray"
          onClick={() => navigate(`/groups/${groupId}`)}
          style={{ flex: 1 }}
        >
          Управление
        </Button>
      </Group>
    </Card>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AthletesPage() {
  const navigate = useNavigate()
  const [tab, setTab]           = useState<string | null>('athletes')
  const [search, setSearch]     = useState('')
  const [groupFilter, setGroupFilter] = useState<string | null>(null)
  const [sortField, setSortField]     = useState<'name' | 'tsb' | 'ctl' | 'alerts'>('name')
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('asc')

  const { data: athletes = [], isLoading } = useQuery<CoachAthlete[]>({
    queryKey: ['coach-athletes'],
    queryFn:  () => analyticsApi.getCoachAthletes(),
  })

  // All unique groups from athletes list
  const allGroups = useMemo(() => {
    const map = new Map<string, string>()
    athletes.forEach((a) => a.groups.forEach((g) => map.set(g.id, g.name)))
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [athletes])

  // Athletes grouped by group id (for group cards)
  const athletesByGroup = useMemo(() => {
    const map = new Map<string, CoachAthlete[]>()
    allGroups.forEach((g) => map.set(g.id, []))
    athletes.forEach((a) =>
      a.groups.forEach((g) => map.get(g.id)?.push(a))
    )
    return map
  }, [athletes, allGroups])

  // Filtered + sorted athletes for the table
  const filteredAthletes = useMemo(() => {
    let list = athletes

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((a) => a.full_name.toLowerCase().includes(q))
    }

    if (groupFilter) {
      list = list.filter((a) => a.groups.some((g) => g.id === groupFilter))
    }

    list = [...list].sort((a, b) => {
      let cmp = 0
      if (sortField === 'name')   cmp = a.full_name.localeCompare(b.full_name)
      if (sortField === 'tsb')    cmp = (a.tsb ?? -999) - (b.tsb ?? -999)
      if (sortField === 'ctl')    cmp = (a.ctl ?? 0) - (b.ctl ?? 0)
      if (sortField === 'alerts') cmp = a.active_alerts - b.active_alerts
      return sortDir === 'asc' ? cmp : -cmp
    })

    return list
  }, [athletes, search, groupFilter, sortField, sortDir])

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(field); setSortDir('asc') }
  }

  function SortIndicator({ field }: { field: typeof sortField }) {
    if (sortField !== field) return <span style={{ color: '#ccc', marginLeft: 4 }}>↕</span>
    return <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const groupSelectData = [
    { value: '', label: 'Все группы' },
    ...allGroups.map((g) => ({ value: g.id, label: g.name })),
  ]

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <Text size="xl" fw={700} mb="lg">Атлеты и группы</Text>

      <Tabs value={tab} onChange={setTab}>
        <Tabs.List mb="md">
          <Tabs.Tab value="athletes">Атлеты ({athletes.length})</Tabs.Tab>
          <Tabs.Tab value="groups">Группы ({allGroups.length})</Tabs.Tab>
        </Tabs.List>

        {/* ── Tab: Athletes ─────────────────────────────────────────────────── */}
        <Tabs.Panel value="athletes">
          <Group mb="md" gap="sm">
            <TextInput
              placeholder="Поиск по имени..."
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ width: 240 }}
            />
            <Select
              data={groupSelectData}
              value={groupFilter ?? ''}
              onChange={(v) => setGroupFilter(v || null)}
              placeholder="Все группы"
              style={{ width: 200 }}
              clearable
            />
          </Group>

          {isLoading ? (
            <Stack gap="xs">
              {[...Array(5)].map((_, i) => <Skeleton key={i} height={44} radius="sm" />)}
            </Stack>
          ) : (
            <ScrollArea>
              <Table striped highlightOnHover withTableBorder withColumnBorders
                styles={{ th: { whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' } }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th onClick={() => toggleSort('name')} style={{ minWidth: 200 }}>
                      Атлет <SortIndicator field="name" />
                    </Table.Th>
                    <Table.Th style={{ minWidth: 180 }}>Группы</Table.Th>
                    <Table.Th onClick={() => toggleSort('tsb')} style={{ minWidth: 70 }}>
                      TSB <SortIndicator field="tsb" />
                    </Table.Th>
                    <Table.Th style={{ minWidth: 60 }}>ATL</Table.Th>
                    <Table.Th onClick={() => toggleSort('ctl')} style={{ minWidth: 60 }}>
                      CTL <SortIndicator field="ctl" />
                    </Table.Th>
                    <Table.Th onClick={() => toggleSort('alerts')} style={{ minWidth: 90 }}>
                      Алерты <SortIndicator field="alerts" />
                    </Table.Th>
                    <Table.Th style={{ minWidth: 140 }}>Последняя тренировка</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filteredAthletes.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={7} style={{ textAlign: 'center', color: '#868e96', padding: '32px 0' }}>
                        Атлеты не найдены
                      </Table.Td>
                    </Table.Tr>
                  ) : filteredAthletes.map((a) => (
                    <Table.Tr
                      key={a.athlete_id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/athletes/${a.athlete_id}`)}
                    >
                      <Table.Td>
                        <Group gap={8}>
                          <Avatar size={28} radius="xl"
                            style={{ background: '#C8102E', color: '#fff', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
                            {initials(a.full_name)}
                          </Avatar>
                          <Text size="sm" fw={500}>{a.full_name}</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4} wrap="wrap">
                          {a.groups.map((g) => (
                            <Badge
                              key={g.id}
                              size="xs"
                              variant="light"
                              color="blue"
                              style={{ cursor: 'pointer' }}
                              onClick={(e) => { e.stopPropagation(); navigate(`/groups/${g.id}`) }}
                            >
                              {g.name}
                            </Badge>
                          ))}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={600} style={{ color: tsbColor(a.tsb) }}>
                          {fmtMetric(a.tsb)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">{fmtMetric(a.atl)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">{fmtMetric(a.ctl)}</Text>
                      </Table.Td>
                      <Table.Td>
                        {a.active_alerts > 0 ? (
                          <Badge
                            size="sm"
                            color={SEV_COLOR[a.alert_severity ?? ''] ?? 'gray'}
                            variant="filled"
                          >
                            {a.active_alerts}
                          </Badge>
                        ) : (
                          <Text size="sm" c="dimmed">—</Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {a.last_workout_status ? (
                          <Badge
                            size="xs"
                            variant="light"
                            color={STATUS_COLOR[a.last_workout_status] ?? 'gray'}
                          >
                            {STATUS_LABEL[a.last_workout_status] ?? a.last_workout_status}
                          </Badge>
                        ) : (
                          <Text size="sm" c="dimmed">—</Text>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}
        </Tabs.Panel>

        {/* ── Tab: Groups ───────────────────────────────────────────────────── */}
        <Tabs.Panel value="groups">
          {isLoading ? (
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
              {[...Array(4)].map((_, i) => <Skeleton key={i} height={200} radius="md" />)}
            </SimpleGrid>
          ) : allGroups.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">Групп не найдено</Text>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
              {allGroups.map((g) => (
                <GroupCard
                  key={g.id}
                  groupId={g.id}
                  groupName={g.name}
                  athletes={athletesByGroup.get(g.id) ?? []}
                />
              ))}
            </SimpleGrid>
          )}
        </Tabs.Panel>
      </Tabs>
    </div>
  )
}
