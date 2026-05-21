import { Container, Title } from '@mantine/core'
import { useParams } from 'react-router-dom'
import ZonesTable from '../components/ZonesTable'
import AlertsPanel from '../components/AlertsPanel'

export default function AthleteProfile() {
  const { id } = useParams<{ id: string }>()

  return (
    <Container>
      <Title order={2} mb="md">Профиль атлета</Title>
      {/* TODO: карточка профиля, антропометрия, маркеры */}
      {id && <ZonesTable athleteId={id} />}
      {id && <AlertsPanel athleteId={id} />}
    </Container>
  )
}
