import { Anchor, Badge, Button, Container, Group, Modal, NumberInput, Stack, Table, Tabs, Text, TextInput, Title } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { analyticsApi } from '../api/analytics'
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

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10))
  const [newDays, setNewDays] = useState<number | string>(7)

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

  const { data: group, isLoading: groupLoading } = useQuery({
    queryKey: ['group', id],
    queryFn: () => groupsApi.get(id!),
    enabled: !!id,
  })

  const { data: summary } = useQuery<{ athletes: GroupSummaryItem[] }>({
    queryKey: ['group-summary', id],
    queryFn: () => analyticsApi.getGroupSummary(id!),
    enabled: !!id,
  })

  const { data: templates = [] } = useQuery<PlanTemplate[]>({
    queryKey: ['templates'],
    queryFn: plansApi.listTemplates,
  })

  const groupTemplates = templates.filter((t: PlanTemplate) => (t as any).group_id === id)

  if (groupLoading) return <Text p="xl">Загрузка...</Text>
  if (!group) return <Text p="xl" c="red">Группа не найдена</Text>

  return (
    <>
      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Новый шаблон плана">
      <Stack gap="sm">
        <TextInput
          label="Название"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          required
          autoFocus
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
          min={1}
          max={90}
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
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Спортсмен</Table.Th>
                <Table.Th>TSB</Table.Th>
                <Table.Th>Алерты</Table.Th>
                <Table.Th>Последний статус</Table.Th>
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
