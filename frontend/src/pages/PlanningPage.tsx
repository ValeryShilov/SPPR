import { Badge, Button, Container, Group, Stack, Text, Title } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { plansApi } from '../api/plans'

interface PlanTemplate {
  id: string
  name: string
  group_id: string
  start_date: string
  duration_days: number
  target_intensity_pct: number | null
  description: string | null
}

export default function PlanningPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: templates = [], isLoading } = useQuery<PlanTemplate[]>({
    queryKey: ['templates'],
    queryFn: plansApi.listTemplates,
  })

  const adapt = useMutation({
    mutationFn: (id: string) => plansApi.adaptTemplate(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['matrix', id] })
    },
  })

  return (
    <Container py="xl">
      <Group justify="space-between" mb="lg">
        <Title order={2}>Планирование</Title>
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
              <Group gap="sm">
                <Text fw={600}>{t.name}</Text>
                {t.target_intensity_pct && (
                  <Badge variant="light">{t.target_intensity_pct}%</Badge>
                )}
              </Group>
              <Text size="sm" c="dimmed">
                Старт: {t.start_date} · {t.duration_days} дн.
              </Text>
              {t.description && (
                <Text size="sm" c="dimmed" lineClamp={1}>{t.description}</Text>
              )}
            </Stack>
            <Group gap="xs">
              <Button
                size="xs"
                variant="light"
                onClick={() => navigate(`/planning/${t.id}`)}
              >
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
              <Button
                size="xs"
                onClick={() => navigate(`/planning/${t.id}/matrix`)}
              >
                Матрица
              </Button>
            </Group>
          </Group>
        ))}
      </Stack>

      {!isLoading && templates.length === 0 && (
        <Text c="dimmed" ta="center" mt="xl">Шаблонов нет. Создайте шаблон в группе.</Text>
      )}
    </Container>
  )
}
