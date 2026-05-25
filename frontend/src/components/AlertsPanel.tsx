import { ActionIcon, Badge, Box, Button, Group, Stack, Text } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
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

const SEV: Record<string, { color: string; bg: string; label: string }> = {
  critical: { color: '#C8102E', bg: '#fff5f5', label: 'Критический' },
  warning:  { color: '#f76707', bg: '#fff4e6', label: 'Предупреждение' },
  info:     { color: '#1c7ed6', bg: '#e7f5ff', label: 'Информация' },
}

const SEV_ORDER: Record<string, number> = { critical: 3, warning: 2, info: 1 }
const PREVIEW_COUNT = 3

export default function AlertsPanel({ athleteId }: { athleteId: string }) {
  const queryClient = useQueryClient()
  const [showAll, setShowAll] = useState(false)

  const { data: rawAlerts = [], isLoading } = useAlerts(athleteId)
  const alerts = (rawAlerts as Alert[])
    .slice()
    .sort((a, b) => (SEV_ORDER[b.severity] ?? 0) - (SEV_ORDER[a.severity] ?? 0))

  const resolve = useMutation({
    mutationFn: (id: string) => analyticsApi.resolveAlert(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts', athleteId] }),
  })

  if (isLoading || !alerts.length) return null

  const topSeverity = alerts[0].severity
  const headerColor = SEV[topSeverity]?.color ?? '#1c7ed6'
  const badgeColor  = topSeverity === 'critical' ? 'red' : topSeverity === 'warning' ? 'orange' : 'blue'

  const visible = showAll ? alerts : alerts.slice(0, PREVIEW_COUNT)
  const hidden  = alerts.length - PREVIEW_COUNT

  return (
    <Stack gap="xs">
      <Group gap="xs" mb={2}>
        <Text size="sm" fw={700} style={{ color: headerColor }}>
          ⚠ Диагностические алерты
        </Text>
        <Badge size="sm" color={badgeColor} variant="filled">{alerts.length}</Badge>
      </Group>

      {visible.map((a) => {
        const s = SEV[a.severity] ?? SEV.info
        return (
          <Box
            key={a.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '10px 14px',
              background: s.bg,
              borderRadius: 8,
              borderLeft: `3px solid ${s.color}`,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Group gap={6} mb={4} wrap="nowrap">
                <Badge
                  size="xs"
                  style={{ background: s.color, color: '#fff', fontFamily: 'monospace', letterSpacing: 0 }}
                >
                  {a.rule_code}
                </Badge>
                <Text size="xs" fw={600} style={{ color: s.color }}>{s.label}</Text>
              </Group>
              <Text size="sm" style={{ lineHeight: 1.4 }}>{a.message}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {new Date(a.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
              </Text>
            </div>
            <ActionIcon
              variant="subtle"
              size="sm"
              color="gray"
              loading={resolve.isPending}
              onClick={() => resolve.mutate(a.id)}
              title="Закрыть"
              style={{ flexShrink: 0, marginTop: 2, opacity: 0.6 }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6' }}
            >
              ✕
            </ActionIcon>
          </Box>
        )
      })}

      {!showAll && hidden > 0 && (
        <Button size="xs" variant="subtle" color="gray" onClick={() => setShowAll(true)}>
          Показать ещё {hidden} {hidden === 1 ? 'алерт' : hidden < 5 ? 'алерта' : 'алертов'}
        </Button>
      )}
    </Stack>
  )
}
