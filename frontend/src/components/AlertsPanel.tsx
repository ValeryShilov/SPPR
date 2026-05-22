import { Badge, Button, Group, Stack, Text, Title } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { analyticsApi } from '../api/analytics'
import { useAlerts } from '../hooks/useAlerts'

interface Alert {
  id: string
  severity: string
  rule_code: string
  message: string
  is_resolved: boolean
  created_at: string
}

const SEVERITY_BG: Record<string, string> = {
  critical: '#C8102E',
  warning:  '#FB8C00',
  info:     '#1976D2',
}

interface Props {
  athleteId: string
}

export default function AlertsPanel({ athleteId }: Props) {
  const queryClient = useQueryClient()
  const { data: alerts = [], isLoading } = useAlerts(athleteId)

  const resolve = useMutation({
    mutationFn: (id: string) => analyticsApi.resolveAlert(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts', athleteId] }),
  })

  if (isLoading) return <Text size="sm">Загрузка алертов...</Text>
  if (!(alerts as Alert[]).length) return null

  return (
    <Stack mt="md" gap="xs">
      <Title order={4}>Диагностические алерты</Title>
      {(alerts as Alert[]).map((a) => (
        <Group
          key={a.id}
          justify="space-between"
          p="sm"
          style={{
            border: `1px solid ${SEVERITY_BG[a.severity] ?? '#E0E0E0'}`,
            borderRadius: 8,
            backgroundColor: '#fff',
          }}
        >
          <Stack gap={2}>
            <Group gap="xs">
              <Badge
                size="sm"
                style={{
                  backgroundColor: SEVERITY_BG[a.severity] ?? '#757575',
                  color: '#fff',
                }}
              >
                {a.rule_code}
              </Badge>
              <Text size="sm">{a.message}</Text>
            </Group>
            <Text size="xs" c="dimmed">
              {new Date(a.created_at).toLocaleDateString('ru-RU')}
            </Text>
          </Stack>
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            loading={resolve.isPending}
            onClick={() => resolve.mutate(a.id)}
          >
            Закрыть
          </Button>
        </Group>
      ))}
    </Stack>
  )
}
