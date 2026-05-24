import { Badge, Button, Container, Group, Modal, NumberInput, Select, Stack, Text, Textarea, TextInput, Title } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { groupsApi } from '../api/groups'
import { plansApi } from '../api/plans'

interface TrainingGroup { id: string; name: string }

interface PlanTemplate {
  id: string
  name: string
  group_id: string
  start_date: string
  duration_days: number
  target_intensity_pct: number | null
  description: string | null
}

const DURATION_PRESETS = [
  { value: '7',   label: '7 дней — неделя' },
  { value: '14',  label: '14 дней — 2 недели' },
  { value: '28',  label: '28 дней — месяц' },
  { value: '42',  label: '42 дня — 6 недель' },
  { value: '84',  label: '84 дня — 3 месяца' },
  { value: '182', label: '182 дня — полугодие' },
]

export default function PlanningPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [open, setOpen]         = useState(false)
  const [name, setName]         = useState('')
  const [groupId, setGroupId]   = useState<string | null>(null)
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [days, setDays]         = useState<number | string>(28)
  const [descr, setDescr]       = useState('')

  const { data: templates = [], isLoading } = useQuery<PlanTemplate[]>({
    queryKey: ['templates'],
    queryFn: plansApi.listTemplates,
  })

  const { data: groups = [] } = useQuery<TrainingGroup[]>({
    queryKey: ['groups'],
    queryFn: groupsApi.list,
  })

  const createTemplate = useMutation({
    mutationFn: () =>
      plansApi.createTemplate({
        group_id: groupId,
        name,
        start_date: startDate,
        duration_days: Number(days),
        description: descr || null,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      closeModal()
      navigate(`/planning/${created.id}`)
    },
  })

  const adapt = useMutation({
    mutationFn: (id: string) => plansApi.adaptTemplate(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['matrix', id] })
    },
  })

  const closeModal = () => {
    setOpen(false)
    setName('')
    setGroupId(null)
    setStartDate(new Date().toISOString().slice(0, 10))
    setDays(28)
    setDescr('')
  }

  const groupOptions = groups.map((g) => ({ value: g.id, label: g.name }))

  return (
    <>
      <Modal opened={open} onClose={closeModal} title="Новый шаблон плана" size="sm">
        <Stack gap="sm">
          <TextInput
            label="Название"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
          <Select
            label="Группа"
            data={groupOptions}
            value={groupId}
            onChange={setGroupId}
            placeholder="Выберите группу"
            required
          />
          <TextInput
            label="Дата начала"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
          <Stack gap={4}>
            <NumberInput
              label="Длительность, дней"
              description="Например: 7, 28, 42, 84..."
              min={1}
              max={365}
              value={days}
              onChange={setDays}
            />
            <Group gap="xs" mt={4}>
              {DURATION_PRESETS.map((p) => (
                <Button
                  key={p.value}
                  size="compact-xs"
                  variant={String(days) === p.value ? 'filled' : 'light'}
                  onClick={() => setDays(Number(p.value))}
                >
                  {p.value} дн.
                </Button>
              ))}
            </Group>
          </Stack>
          <Textarea
            label="Описание"
            value={descr}
            onChange={(e) => setDescr(e.target.value)}
            autosize
            minRows={2}
          />
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={closeModal}>Отмена</Button>
            <Button
              loading={createTemplate.isPending}
              disabled={!name.trim() || !groupId}
              onClick={() => createTemplate.mutate()}
            >
              Создать и редактировать
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Container py="xl">
        <Group justify="space-between" mb="lg">
          <Title order={2}>Планирование</Title>
          <Button onClick={() => setOpen(true)}>+ Создать шаблон</Button>
        </Group>

        {isLoading && <Text>Загрузка...</Text>}

        <Stack gap="sm">
          {templates.map((t) => (
            <Group
              key={t.id}
              justify="space-between"
              p="md"
              style={{ border: '1px solid #dee2e6', borderRadius: 8 }}
            >
              <Stack gap={4}>
                <Group gap="xs">
                  <Text fw={600}>{t.name}</Text>
                  <Badge variant="outline" size="sm" color="gray">{t.duration_days} дн.</Badge>
                  {t.target_intensity_pct && (
                    <Badge variant="light">{t.target_intensity_pct}%</Badge>
                  )}
                </Group>
                <Text size="sm" c="dimmed">
                  Старт: {t.start_date}
                  {t.description && ` · ${t.description}`}
                </Text>
              </Stack>
              <Group gap="xs">
                <Button size="xs" variant="light" onClick={() => navigate(`/planning/${t.id}`)}>
                  Редактировать
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  color="teal"
                  loading={adapt.isPending}
                  onClick={() => adapt.mutate(t.id)}
                >
                  Адаптировать
                </Button>
                <Button size="xs" onClick={() => navigate(`/planning/${t.id}/matrix`)}>
                  Матрица
                </Button>
              </Group>
            </Group>
          ))}
        </Stack>

        {!isLoading && templates.length === 0 && (
          <Text c="dimmed" ta="center" mt="xl">
            Шаблонов нет. Нажмите «+ Создать шаблон».
          </Text>
        )}
      </Container>
    </>
  )
}
