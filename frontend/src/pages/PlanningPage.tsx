import {
  Badge,
  Box,
  Button,
  Container,
  Group,
  Modal,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { groupsApi } from '../api/groups'
import { plansApi } from '../api/plans'
import { templateStatus } from '../utils/templateStatus'

interface TrainingGroup { id: string; name: string }

interface PlanTemplateSummary {
  id: string
  group_id: string
  group_name: string
  name: string
  start_date: string
  duration_days: number
  target_intensity_pct: number | null
  description: string | null
  total_workouts: number
  draft_count: number
  published_count: number
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlanningPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: templates = [], isLoading } = useQuery<PlanTemplateSummary[]>({
    queryKey: ['templates'],
    queryFn: plansApi.listTemplates,
  })

  const { data: groups = [] } = useQuery<TrainingGroup[]>({
    queryKey: ['groups'],
    queryFn: groupsApi.list,
  })

  const createTemplate = useMutation({
    mutationFn: (firstGroupId: string) =>
      plansApi.createTemplate({
        group_id: firstGroupId,
        name: '',
        start_date: new Date().toISOString().slice(0, 10),
        duration_days: 0,
      }),
    onSuccess: (created: { id: string }) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      navigate(`/planning/${created.id}`)
    },
  })

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => plansApi.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setDeleteId(null)
    },
  })


  return (
    <>
      {/* ── Delete confirmation ───────────────────────────────────────────── */}
      <Modal
        opened={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Удалить шаблон?"
        size="sm"
      >
        <Text size="sm" mb="md">
          Будут удалены все черновики тренировок, созданных из этого шаблона.
          Утверждённые (опубликованные) тренировки останутся у атлетов.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setDeleteId(null)}>Отмена</Button>
          <Button
            color="red"
            loading={deleteTemplate.isPending}
            onClick={() => deleteTemplate.mutate(deleteId!)}
          >
            Удалить
          </Button>
        </Group>
      </Modal>

      {/* ── Main page ─────────────────────────────────────────────────────── */}
      <Container py="xl">
        <Group justify="space-between" mb="lg">
          <Title order={2}>Планирование</Title>
          <Button
            loading={createTemplate.isPending}
            disabled={groups.length === 0}
            onClick={() => createTemplate.mutate(groups[0].id)}
          >
            Создать шаблон
          </Button>
        </Group>

        {isLoading && <Text c="dimmed">Загрузка...</Text>}

        <Stack gap="sm">
          {templates.map((t) => {
            const st = templateStatus(t)
            return (
              <Box
                key={t.id}
                p="md"
                style={{ border: '1px solid #dee2e6', borderRadius: 8, background: '#fff' }}
              >
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  {/* Left: info */}
                  <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                    <Group gap="xs" wrap="nowrap">
                      <Text fw={700} size="md" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.name}
                      </Text>
                      <Badge color={st.color} variant="light" size="sm" style={{ flexShrink: 0 }}>
                        {st.label}
                      </Badge>
                    </Group>
                    <Group gap="xs" wrap="wrap">
                      <Text size="xs" c="dimmed">Группа: <b>{t.group_name}</b></Text>
                      <Text size="xs" c="dimmed">·</Text>
                      <Text size="xs" c="dimmed">
                        {t.start_date} · {t.duration_days} дн.
                        {t.duration_days >= 7 ? ` (${Math.ceil(t.duration_days / 7)} нед.)` : ''}
                      </Text>
                      {t.description && (
                        <>
                          <Text size="xs" c="dimmed">·</Text>
                          <Text size="xs" c="dimmed">{t.description}</Text>
                        </>
                      )}
                    </Group>
                    {st.color !== 'green' && (
                      <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>{st.hint}</Text>
                    )}
                  </Stack>

                  {/* Right: actions */}
                  <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                    <Button size="xs" variant="light" onClick={() => navigate(`/planning/${t.id}`)}>
                      Редактировать
                    </Button>
                    {t.total_workouts > 0 && (
                      <Button size="xs" variant="light" color="teal" onClick={() => navigate(`/planning/${t.id}/matrix`)}>
                        Матрица
                      </Button>
                    )}
                    <Button size="xs" variant="subtle" color="red" onClick={() => setDeleteId(t.id)}>
                      ✕
                    </Button>
                  </Group>
                </Group>
              </Box>
            )
          })}
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
