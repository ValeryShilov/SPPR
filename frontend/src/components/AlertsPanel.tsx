import { Stack, Text, Title } from '@mantine/core'
import { useAlerts } from '../hooks/useAlerts'

interface Props {
  athleteId: string
}

export default function AlertsPanel({ athleteId }: Props) {
  const { data: alerts, isLoading } = useAlerts(athleteId)

  if (isLoading) return <Text>Загрузка алертов...</Text>

  return (
    <Stack mt="md">
      <Title order={4}>Диагностические алерты</Title>
      {/* TODO: отобразить алерты с цветовой индикацией severity */}
    </Stack>
  )
}
