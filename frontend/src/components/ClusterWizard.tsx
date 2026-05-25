import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Radio,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { athletesApi } from '../api/athletes'
import { groupsApi } from '../api/groups'

// ─── Constants ────────────────────────────────────────────────────────────────

const GOAL_LABELS: Record<string, string> = {
  health:        'Оздоровление',
  fitness:       'Поддержание формы',
  performance:   'Рост результата',
  competition:   'Соревновательный сезон',
  target_event:  'Подготовка к старту',
  qualification: 'Выполнение разряда',
}

const GOAL_ORDER = ['health', 'fitness', 'performance', 'competition', 'target_event', 'qualification']

// ─── Types ────────────────────────────────────────────────────────────────────

interface AthleteItem {
  id: string
  first_name: string
  last_name: string
  birth_date: string
  qualification: string | null
  training_goal_type: string | null
}

interface ClusterGroup {
  name: string
  athletes: { id: string; full_name: string }[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcAge(birthDate: string) {
  return new Date().getFullYear() - new Date(birthDate).getFullYear()
}

function clusterByQualification(athletes: AthleteItem[]): ClusterGroup[] {
  const buckets = [
    { keys: ['МСМК', 'МС'],  label: 'Мастера спорта (МС/МСМК)' },
    { keys: ['КМС', 'I'],    label: 'КМС и I разряд' },
    { keys: ['II', 'III'],   label: 'II и III разряд' },
    { keys: [null, ''],      label: 'Без разряда' },
  ]
  const groups: ClusterGroup[] = buckets.map(b => ({ name: b.label, athletes: [] }))
  athletes.forEach(a => {
    const q = a.qualification ?? null
    const idx = buckets.findIndex(b => (b.keys as (string | null)[]).includes(q))
    if (idx !== -1) groups[idx].athletes.push({ id: a.id, full_name: `${a.last_name} ${a.first_name}` })
  })
  return groups.filter(g => g.athletes.length > 0)
}

function clusterByAge(athletes: AthleteItem[]): ClusterGroup[] {
  const buckets = [
    { label: 'Юниоры (до 18)',   min: 0,  max: 17  },
    { label: 'Молодёжь (18–22)', min: 18, max: 22  },
    { label: 'Взрослые (23–35)', min: 23, max: 35  },
    { label: 'Ветераны (36+)',   min: 36, max: 999 },
  ]
  const groups: ClusterGroup[] = buckets.map(b => ({ name: b.label, athletes: [] }))
  athletes.forEach(a => {
    const age = calcAge(a.birth_date)
    const idx = buckets.findIndex(b => age >= b.min && age <= b.max)
    if (idx !== -1) groups[idx].athletes.push({ id: a.id, full_name: `${a.last_name} ${a.first_name}` })
  })
  return groups.filter(g => g.athletes.length > 0)
}

function clusterByGoal(athletes: AthleteItem[]): ClusterGroup[] {
  const map = new Map<string, { id: string; full_name: string }[]>()
  athletes.forEach(a => {
    const key = a.training_goal_type ?? '__none__'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push({ id: a.id, full_name: `${a.last_name} ${a.first_name}` })
  })
  const groups: ClusterGroup[] = []
  ;[...GOAL_ORDER, '__none__'].forEach(key => {
    const list = map.get(key)
    if (list?.length) {
      groups.push({
        name: key === '__none__' ? 'Цель не указана' : (GOAL_LABELS[key] ?? key),
        athletes: list,
      })
    }
  })
  return groups
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClusterWizard({
  opened,
  onClose,
}: {
  opened: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [step,      setStep]      = useState<1 | 2>(1)
  const [criterion, setCriterion] = useState<string>('')
  const [groups,    setGroups]    = useState<ClusterGroup[]>([])
  const [progress,  setProgress]  = useState<string | null>(null)
  const [done,      setDone]      = useState(false)

  const { data: profiles = [], isLoading } = useQuery<AthleteItem[]>({
    queryKey: ['athletes-all'],
    queryFn:  athletesApi.list,
    enabled:  opened,
  })

  function buildClusters() {
    let result: ClusterGroup[] = []
    if (criterion === 'qualification') result = clusterByQualification(profiles)
    else if (criterion === 'age')      result = clusterByAge(profiles)
    else if (criterion === 'goal')     result = clusterByGoal(profiles)
    setGroups(result)
    setStep(2)
  }

  const apply = useMutation({
    mutationFn: async () => {
      for (const group of groups) {
        if (!group.athletes.length) continue
        setProgress(`Создание группы "${group.name}"...`)
        const created = await groupsApi.create({ name: group.name, description: null, target_event: null })
        for (const a of group.athletes) {
          await groupsApi.addMember(created.id, { athlete_id: a.id })
        }
      }
      setProgress(null)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['coach-athletes'] })
      setDone(true)
    },
  })

  function reset() {
    setStep(1)
    setCriterion('')
    setGroups([])
    setProgress(null)
    setDone(false)
    apply.reset()
  }

  function handleClose() {
    reset()
    onClose()
  }

  const totalAthletes = groups.reduce((s, g) => s + g.athletes.length, 0)

  return (
    <Modal opened={opened} onClose={handleClose} title="Распределение по группам" size="lg">
      {done ? (
        <Stack gap="sm">
          <Text c="green" size="sm">
            Создано {groups.length} групп, добавлено {totalAthletes} атлетов.
          </Text>
          <Group justify="flex-end">
            <Button onClick={handleClose}>Закрыть</Button>
          </Group>
        </Stack>

      ) : step === 1 ? (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Выберите критерий — система распределит атлетов по группам.
            На следующем шаге можно переименовать группы перед созданием.
          </Text>
          <Radio.Group value={criterion} onChange={setCriterion}>
            <Stack gap="xs">
              <Radio value="qualification" label="По квалификации (разряд / звание)" />
              <Radio value="age"           label="По возрасту" />
              <Radio value="goal"          label="По цели подготовки" />
            </Stack>
          </Radio.Group>
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={handleClose}>Отмена</Button>
            <Button disabled={!criterion || isLoading} loading={isLoading} onClick={buildClusters}>
              Предпросмотр →
            </Button>
          </Group>
        </Stack>

      ) : (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {groups.length} групп · {totalAthletes} атлетов.
            Переименуйте при необходимости и нажмите «Создать группы».
          </Text>
          <ScrollArea mah={380}>
            <Stack gap="xs">
              {groups.map((g, i) => (
                <Paper key={i} p="sm" withBorder radius="sm">
                  <Group mb={6} gap="sm" wrap="nowrap">
                    <TextInput
                      value={g.name}
                      onChange={e =>
                        setGroups(gs => gs.map((g2, j) => j === i ? { ...g2, name: e.target.value } : g2))
                      }
                      size="sm"
                      style={{ flex: 1 }}
                    />
                    <Badge color="blue" variant="light" style={{ flexShrink: 0 }}>
                      {g.athletes.length}
                    </Badge>
                  </Group>
                  <Text size="xs" c="dimmed" lineClamp={2}>
                    {g.athletes.map(a => a.full_name).join(' · ')}
                  </Text>
                </Paper>
              ))}
            </Stack>
          </ScrollArea>

          {progress && <Text size="xs" c="dimmed">{progress}</Text>}
          {apply.isError && <Text size="sm" c="red">Ошибка при создании групп</Text>}

          <Group justify="space-between">
            <Button variant="subtle" size="sm" onClick={() => setStep(1)}>← Назад</Button>
            <Group gap="sm">
              <Button variant="default" onClick={handleClose}>Отмена</Button>
              <Button
                loading={apply.isPending}
                disabled={groups.length === 0}
                onClick={() => apply.mutate()}
              >
                Создать группы ({groups.length})
              </Button>
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
