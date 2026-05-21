import { Container, Title } from '@mantine/core'
import { useParams } from 'react-router-dom'
import LoadChart from '../components/LoadChart'
import AlertsPanel from '../components/AlertsPanel'

export default function LoadAnalytics() {
  const { athleteId } = useParams<{ athleteId: string }>()

  return (
    <Container>
      <Title order={2} mb="md">Аналитика нагрузки</Title>
      {athleteId && <LoadChart athleteId={athleteId} />}
      {athleteId && <AlertsPanel athleteId={athleteId} />}
    </Container>
  )
}
