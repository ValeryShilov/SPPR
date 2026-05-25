import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Group,
  HoverCard,
  Modal,
  PasswordInput,
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyticsApi } from '../api/analytics'
import { athletesApi } from '../api/athletes'
import { authApi } from '../api/auth'
import { groupsApi } from '../api/groups'
import { useAuth } from '../hooks/useAuth'
import ClusterWizard from '../components/ClusterWizard'

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
  coach_user_id: string | null
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

// ─── Alert badge with hover details ──────────────────────────────────────────

const SEV_META: Record<string, { color: string; bg: string }> = {
  critical: { color: '#C8102E', bg: '#fff5f5' },
  warning:  { color: '#f76707', bg: '#fff4e6' },
  info:     { color: '#1c7ed6', bg: '#e7f5ff' },
}

interface AlertItem { id: string; severity: string; rule_code: string; message: string }

function AlertBadge({ athleteId, count, severity }: {
  athleteId: string
  count: number
  severity: string | null
}) {
  const [enabled, setEnabled] = useState(false)

  const { data: alerts = [], isLoading } = useQuery<AlertItem[]>({
    queryKey: ['alerts', athleteId],
    queryFn: () => analyticsApi.getAlerts(athleteId) as Promise<AlertItem[]>,
    enabled,
    staleTime: 60_000,
  })

  if (count === 0) return <Text size="sm" c="dimmed">—</Text>

  return (
    <HoverCard width={300} shadow="md" openDelay={150} closeDelay={100} withArrow>
      <HoverCard.Target>
        <Badge
          size="sm"
          color={SEV_COLOR[severity ?? ''] ?? 'gray'}
          variant="filled"
          style={{ cursor: 'default' }}
          onMouseEnter={() => setEnabled(true)}
        >
          {count}
        </Badge>
      </HoverCard.Target>

      <HoverCard.Dropdown p={10}>
        {isLoading ? (
          <Text size="xs" c="dimmed">Загрузка...</Text>
        ) : (
          <Stack gap={6}>
            {alerts.map((a) => {
              const s = SEV_META[a.severity] ?? SEV_META.info
              return (
                <Box key={a.id} style={{
                  padding: '6px 10px',
                  background: s.bg,
                  borderRadius: 6,
                  borderLeft: `3px solid ${s.color}`,
                }}>
                  <Group gap={6} mb={3} wrap="nowrap">
                    <Badge size="xs" style={{ background: s.color, color: '#fff', fontFamily: 'monospace' }}>
                      {a.rule_code}
                    </Badge>
                  </Group>
                  <Text size="xs" style={{ lineHeight: 1.4 }}>{a.message}</Text>
                </Box>
              )
            })}
          </Stack>
        )}
      </HoverCard.Dropdown>
    </HoverCard>
  )
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
  const navigate      = useNavigate()
  const queryClient   = useQueryClient()
  const { user }      = useAuth()

  const [tab, setTab]           = useState<string | null>('athletes')
  const [search, setSearch]     = useState('')
  const [groupFilter, setGroupFilter]   = useState<string | null>(null)
  const [myAthletesOnly, setMyAthletesOnly] = useState(false)
  const [sortField, setSortField]     = useState<'name' | 'tsb' | 'ctl' | 'alerts'>('name')
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('asc')

  // Create-group modal
  const [clusterOpen, setClusterOpen] = useState(false)

  const [createOpen,   setCreateOpen]   = useState(false)
  const [newName,      setNewName]      = useState('')
  const [newDesc,      setNewDesc]      = useState('')
  const [newEvent,     setNewEvent]     = useState('')

  const { data: athletes = [], isLoading } = useQuery<CoachAthlete[]>({
    queryKey: ['coach-athletes'],
    queryFn:  () => analyticsApi.getCoachAthletes(),
  })

  const { data: groupsList = [], isLoading: groupsLoading } = useQuery<{ id: string; name: string; description: string | null; target_event: string | null }[]>({
    queryKey: ['groups'],
    queryFn:  groupsApi.list,
  })

  const { data: coachesList = [] } = useQuery<{ id: string; full_name: string | null; email: string }[]>({
    queryKey: ['coaches-list'],
    queryFn:  authApi.listCoaches,
  })

  const coachById = useMemo(() => {
    const map = new Map<string, string>()
    coachesList.forEach(c => map.set(c.id, c.full_name ?? c.email))
    return map
  }, [coachesList])

  const createGroup = useMutation({
    mutationFn: () => groupsApi.create({
      name: newName.trim(),
      description: newDesc.trim() || null,
      target_event: newEvent.trim() || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['coach-athletes'] })
      setNewName(''); setNewDesc(''); setNewEvent('')
      setCreateOpen(false)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setCreateError(msg ?? 'Ошибка при создании группы')
    },
  })

  const [createError, setCreateError] = useState<string | null>(null)

  const handleCreateClose = () => {
    setNewName(''); setNewDesc(''); setNewEvent(''); setCreateError(null)
    setCreateOpen(false)
  }

  // ── New athlete modal ─────────────────────────────────────────────────────
  const [newAthleteOpen,    setNewAthleteOpen]    = useState(false)
  const [naEmail,           setNaEmail]           = useState('')
  const [naPassword,        setNaPassword]        = useState('')
  const [naFullName,        setNaFullName]        = useState('')
  const [naFirstName,       setNaFirstName]       = useState('')
  const [naLastName,        setNaLastName]        = useState('')
  const [naBirthDate,       setNaBirthDate]       = useState('')
  const [naGender,          setNaGender]          = useState<string | null>(null)
  const [naQualification,   setNaQualification]   = useState('')
  const [naError,           setNaError]           = useState<string | null>(null)
  const [naCreated,         setNaCreated]         = useState<{ email: string; password: string } | null>(null)

  const createAthlete = useMutation({
    mutationFn: () => authApi.createAthlete({
      email: naEmail,
      password: naPassword,
      full_name: naFullName || undefined,
      first_name: naFirstName,
      last_name: naLastName,
      birth_date: naBirthDate,
      gender: naGender!,
      qualification: naQualification || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coach-athletes'] })
      queryClient.invalidateQueries({ queryKey: ['athletes-all'] })
      setNaCreated({ email: naEmail, password: naPassword })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setNaError(msg ?? 'Ошибка при создании атлета')
    },
  })

  const handleNewAthleteClose = () => {
    setNaEmail(''); setNaPassword(''); setNaFullName('')
    setNaFirstName(''); setNaLastName(''); setNaBirthDate('')
    setNaGender(null); setNaQualification(''); setNaError(null); setNaCreated(null)
    setNewAthleteOpen(false)
  }

  const naCanSubmit = naEmail && naPassword && naFirstName && naLastName && naBirthDate && naGender

  // ── Bind / unbind coach ───────────────────────────────────────────────────
  const bindCoach = useMutation({
    mutationFn: ({ athleteProfileId, bind }: { athleteProfileId: string; bind: boolean }) =>
      bind ? athletesApi.bindCoach(athleteProfileId) : athletesApi.unbindCoach(athleteProfileId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coach-athletes'] }),
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

    if (myAthletesOnly) {
      list = list.filter((a) => a.coach_user_id === user?.id)
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
    <>
      {/* ── New athlete modal ── */}
      <Modal opened={newAthleteOpen} onClose={handleNewAthleteClose} title="Новый атлет">
        <Stack gap="sm">
          {naCreated ? (
            <>
              <Alert color="green" variant="light" title="Атлет создан">
                <Text size="sm">Email: <b>{naCreated.email}</b></Text>
                <Text size="sm">Пароль: <b>{naCreated.password}</b></Text>
                <Text size="xs" c="dimmed" mt={4}>Передайте эти данные атлету для первого входа</Text>
              </Alert>
              <Button onClick={handleNewAthleteClose}>Закрыть</Button>
            </>
          ) : (
            <>
              {naError && <Alert color="red" variant="light">{naError}</Alert>}
              <TextInput label="Email" type="email" value={naEmail} onChange={e => setNaEmail(e.target.value)} required autoFocus />
              <PasswordInput label="Пароль" value={naPassword} onChange={e => setNaPassword(e.target.value)} required />
              <TextInput label="Полное имя" placeholder="Необязательно" value={naFullName} onChange={e => setNaFullName(e.target.value)} />
              <Group grow>
                <TextInput label="Имя" value={naFirstName} onChange={e => setNaFirstName(e.target.value)} required />
                <TextInput label="Фамилия" value={naLastName} onChange={e => setNaLastName(e.target.value)} required />
              </Group>
              <TextInput label="Дата рождения" type="date" value={naBirthDate} onChange={e => setNaBirthDate(e.target.value)} required />
              <Select
                label="Пол"
                placeholder="Выберите..."
                data={[{ value: 'm', label: 'Мужской' }, { value: 'f', label: 'Женский' }]}
                value={naGender}
                onChange={setNaGender}
                required
              />
              <TextInput label="Квалификация" placeholder="КМС, МС — необязательно" value={naQualification} onChange={e => setNaQualification(e.target.value)} />
              <Group justify="flex-end" mt="xs">
                <Button variant="default" onClick={handleNewAthleteClose}>Отмена</Button>
                <Button
                  loading={createAthlete.isPending}
                  disabled={!naCanSubmit}
                  onClick={() => { setNaError(null); createAthlete.mutate() }}
                >
                  Создать
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>

      <ClusterWizard opened={clusterOpen} onClose={() => setClusterOpen(false)} />

      <Modal opened={createOpen} onClose={handleCreateClose} title="Новая группа">
        <Stack gap="sm">
          <TextInput
            label="Название"
            placeholder="Например: Лыжные гонки, юниоры"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            required autoFocus
          />
          <TextInput
            label="Описание"
            placeholder="Необязательно"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
          />
          <TextInput
            label="Дисциплина"
            placeholder="Например: Лыжные гонки"
            value={newEvent}
            onChange={e => setNewEvent(e.target.value)}
          />
          {createError && <Text size="sm" c="red">{createError}</Text>}
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={handleCreateClose}>Отмена</Button>
            <Button
              loading={createGroup.isPending}
              disabled={!newName.trim()}
              onClick={() => { setCreateError(null); createGroup.mutate() }}
            >
              Создать
            </Button>
          </Group>
        </Stack>
      </Modal>

    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <Text size="xl" fw={700} mb="lg">Атлеты и группы</Text>

      <Tabs value={tab} onChange={setTab}>
        <Tabs.List mb="md">
          <Tabs.Tab value="athletes">Атлеты ({athletes.length})</Tabs.Tab>
          <Tabs.Tab value="groups">Группы ({allGroups.length})</Tabs.Tab>
        </Tabs.List>

        {/* ── Tab: Athletes ─────────────────────────────────────────────────── */}
        <Tabs.Panel value="athletes">
          <Group mb="md" gap="sm" justify="space-between">
            <Group gap="sm">
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
              <Button
                size="sm"
                variant={myAthletesOnly ? 'filled' : 'light'}
                color="blue"
                onClick={() => setMyAthletesOnly(v => !v)}
              >
                Мои атлеты
              </Button>
            </Group>
            <Button size="sm" onClick={() => { setNaError(null); setNaCreated(null); setNewAthleteOpen(true) }}>
              + Новый атлет
            </Button>
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
                    <Table.Th style={{ width: 110 }} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filteredAthletes.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={7} style={{ textAlign: 'center', color: '#868e96', padding: '32px 0' }}>
                        Атлеты не найдены
                      </Table.Td>
                    </Table.Tr>
                  ) : filteredAthletes.map((a) => {
                    const isMyAthlete      = a.coach_user_id === user?.id
                    const isOtherCoach     = !!a.coach_user_id && !isMyAthlete
                    const isBusy = bindCoach.isPending && bindCoach.variables?.athleteProfileId === a.athlete_id
                    return (
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
                        <AlertBadge
                          athleteId={a.athlete_id}
                          count={a.active_alerts}
                          severity={a.alert_severity}
                        />
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
                      <Table.Td onClick={e => e.stopPropagation()}>
                        {isOtherCoach ? (
                          <Tooltip label={`Тренер: ${coachById.get(a.coach_user_id!) ?? '—'}`} withArrow>
                            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                              {coachById.get(a.coach_user_id!) ?? '—'}
                            </Text>
                          </Tooltip>
                        ) : (
                          <Tooltip label={isMyAthlete ? 'Отвязать от себя' : 'Привязать к себе'} withArrow>
                            <Button
                              size="xs"
                              variant={isMyAthlete ? 'filled' : 'light'}
                              color={isMyAthlete ? 'red' : 'blue'}
                              loading={isBusy}
                              onClick={() => bindCoach.mutate({
                                athleteProfileId: a.athlete_id,
                                bind: !isMyAthlete,
                              })}
                            >
                              {isMyAthlete ? 'Отвязать' : 'Привязать'}
                            </Button>
                          </Tooltip>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  )})}

                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}
        </Tabs.Panel>

        {/* ── Tab: Groups ───────────────────────────────────────────────────── */}
        <Tabs.Panel value="groups">
          <Group justify="flex-end" mb="md" gap="sm">
            <Button variant="light" color="teal" onClick={() => setClusterOpen(true)}>
              Распределить по группам
            </Button>
            <Button onClick={() => { setCreateError(null); setCreateOpen(true) }}>+ Создать группу</Button>
          </Group>
          {groupsLoading ? (
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
              {[...Array(4)].map((_, i) => <Skeleton key={i} height={200} radius="md" />)}
            </SimpleGrid>
          ) : groupsList.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">Групп пока нет. Создайте первую!</Text>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
              {groupsList.map((g) => (
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
    </>
  )
}
