import { ActionIcon, Anchor, Badge, Button, Container, Group, Modal, NumberInput, Select, Stack, Table, Tabs, Text, TextInput, Title, Tooltip } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { analyticsApi } from '../api/analytics'
import { athletesApi } from '../api/athletes'
import { groupsApi } from '../api/groups'
import { plansApi } from '../api/plans'

interface GroupSummaryItem {
  athlete_id: string
  full_name: string
  active_alerts: number
  tsb: number | null
  last_workout_status: string | null
}

interface PlanTemplate {
  id: string
  name: string
  start_date: string
  duration_days: number
}

interface AthleteProfile {
  id: string
  first_name: string
  last_name: string
}

const TSB_COLOR = (tsb: number | string | null) => {
  if (tsb === null) return 'gray'
  const n = Number(tsb)
  if (n < -30) return 'red'
  if (n < -10) return 'orange'
  if (n > 15) return 'blue'
  return 'green'
}

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // ── Create template modal ─────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10))
  const [newDays, setNewDays] = useState<number | string>(7)

  // ── Add athlete modal ─────────────────────────────────────────────────────
  const [addOpen,          setAddOpen]          = useState(false)
  const [addAthleteId,     setAddAthleteId]     = useState<string | null>(null)
  const [addError,         setAddError]         = useState<string | null>(null)

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: group, isLoading: groupLoading } = useQuery({
    queryKey: ['group', id],
    queryFn: () => groupsApi.get(id!),
    enabled: !!id,
  })

  const { data: summary, refetch: refetchSummary } = useQuery<{ athletes: GroupSummaryItem[] }>({
    queryKey: ['group-summary', id],
    queryFn: () => analyticsApi.getGroupSummary(id!),
    enabled: !!id,
  })

  const { data: allAthletes = [] } = useQuery<AthleteProfile[]>({
    queryKey: ['athletes-all'],
    queryFn: athletesApi.list,
  })

  const { data: templates = [] } = useQuery<PlanTemplate[]>({
    queryKey: ['templates'],
    queryFn: plansApi.listTemplates,
  })

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createTemplate = useMutation({
    mutationFn: () =>
      plansApi.createTemplate({
        group_id: id,
        name: newName,
        start_date: newDate,
        duration_days: Number(newDays),
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setCreateOpen(false)
      navigate(`/planning/${created.id}`)
    },
  })

  const addMember = useMutation({
    mutationFn: (athleteId: string) =>
      groupsApi.addMember(id!, { athlete_id: athleteId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-summary', id] })
      queryClient.invalidateQueries({ queryKey: ['coach-athletes'] })
      refetchSummary()
      setAddAthleteId(null)
      setAddError(null)
      setAddOpen(false)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setAddError(msg ?? 'Ошибка при добавлении атлета')
    },
  })

  const removeMember = useMutation({
    mutationFn: (athleteId: string) =>
      groupsApi.removeMember(id!, athleteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-summary', id] })
      queryClient.invalidateQueries({ queryKey: ['coach-athletes'] })
      refetchSummary()
    },
  })

  // ── Derived data ──────────────────────────────────────────────────────────
  const memberIds = new Set((summary?.athletes ?? []).map(a => a.athlete_id))

  const availableAthletes = allAthletes
    .filter(a => !memberIds.has(a.id))
    .map(a => ({ value: a.id, label: `${a.last_name} ${a.first_name}` }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'))

  const groupTemplates = templates.filter((t: PlanTemplate) => (t as { group_id?: string }).group_id === id)

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAddClose = () => {
    setAddAthleteId(null)
    setAddError(null)
    setAddOpen(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (groupLoading) return <Text p="xl">Загрузка...</Text>
  if (!group) return <Text p="xl" c="red">Группа не найдена</Text>

  return (
    <>
      {/* Create template modal */}
      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Новый шаблон плана">
        <Stack gap="sm">
          <TextInput
            label="Название"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required autoFocus
          />
          <TextInput
            label="Дата начала"
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            required
          />
          <NumberInput
            label="Длительность, дней"
            min={1} max={90}
            value={newDays}
            onChange={setNewDays}
          />
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button
              loading={createTemplate.isPending}
              disabled={!newName.trim()}
              onClick={() => createTemplate.mutate()}
            >
              Создать и редактировать
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Add athlete modal */}
      <Modal opened={addOpen} onClose={handleAddClose} title="Добавить атлета в группу">
        <Stack gap="sm">
          <Select
            label="Атлет"
            placeholder="Выберите атлета..."
            data={availableAthletes}
            value={addAthleteId}
            onChange={setAddAthleteId}
            searchable
            nothingFoundMessage={
              availableAthletes.length === 0
                ? 'Все доступные атлеты уже в группе'
                : 'Атлет не найден'
            }
          />
          {addError && <Text size="sm" c="red">{addError}</Text>}
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={handleAddClose}>Отмена</Button>
            <Button
              loading={addMember.isPending}
              disabled={!addAthleteId}
              onClick={() => addAthleteId && addMember.mutate(addAthleteId)}
            >
              Добавить
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Container py="xl">
        <Group justify="space-between" mb="lg">
          <Stack gap={2}>
            <Title order={2}>{group.name}</Title>
            {group.description && <Text c="dimmed">{group.description}</Text>}
          </Stack>
          <Button onClick={() => navigate('/planning')}>Планирование</Button>
        </Group>

        <Tabs defaultValue="athletes">
          <Tabs.List mb="md">
            <Tabs.Tab value="athletes">Спортсмены</Tabs.Tab>
            <Tabs.Tab value="plans">Планы</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="athletes">
            <Group justify="flex-end" mb="sm">
              <Button size="xs" onClick={() => { setAddError(null); setAddOpen(true) }}>
                + Добавить атлета
              </Button>
            </Group>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Спортсмен</Table.Th>
                  <Table.Th>TSB</Table.Th>
                  <Table.Th>Алерты</Table.Th>
                  <Table.Th>Последний статус</Table.Th>
                  <Table.Th style={{ width: 40 }} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(summary?.athletes ?? []).map((a) => (
                  <Table.Tr key={a.athlete_id}>
                    <Table.Td>
                      <Anchor onClick={() => navigate(`/athletes/${a.athlete_id}`)}>
                        {a.full_name}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={TSB_COLOR(a.tsb)}>
                        {a.tsb !== null ? Number(a.tsb).toFixed(1) : '—'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {a.active_alerts > 0
                        ? <Badge color="red">{a.active_alerts}</Badge>
                        : <Text size="sm" c="dimmed">0</Text>}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{a.last_workout_status ?? '—'}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Tooltip label="Удалить из группы" position="left">
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="sm"
                          loading={removeMember.isPending && removeMember.variables === a.athlete_id}
                          onClick={() => removeMember.mutate(a.athlete_id)}
                        >
                          ✕
                        </ActionIcon>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {!summary?.athletes.length && (
              <Text c="dimmed" ta="center" mt="md">В группе нет спортсменов</Text>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="plans">
            <Group justify="flex-end" mb="sm">
              <Button size="xs" onClick={() => setCreateOpen(true)}>+ Создать шаблон</Button>
            </Group>
            <Stack gap="sm">
              {groupTemplates.map((t) => (
                <Group key={t.id} justify="space-between" p="sm" style={{ border: '1px solid #eee', borderRadius: 8 }}>
                  <Stack gap={2}>
                    <Text fw={500}>{t.name}</Text>
                    <Text size="sm" c="dimmed">
                      {t.start_date} · {t.duration_days} дней
                    </Text>
                  </Stack>
                  <Group gap="xs">
                    <Button size="xs" variant="light" onClick={() => navigate(`/planning/${t.id}`)}>
                      Редактировать
                    </Button>
                    <Button size="xs" onClick={() => navigate(`/planning/${t.id}/matrix`)}>
                      Матрица
                    </Button>
                  </Group>
                </Group>
              ))}
              {groupTemplates.length === 0 && (
                <Text c="dimmed" ta="center" mt="md">Нет шаблонов для этой группы</Text>
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Container>
    </>
  )
}
