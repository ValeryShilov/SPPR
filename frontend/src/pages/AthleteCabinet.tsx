import { Container, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { plansApi } from '../api/plans'
import TelemetryUpload from '../components/TelemetryUpload'
import { useAuth } from '../hooks/useAuth'

export default function AthleteCabinet() {
  const { user } = useAuth()
  const { data: plan } = useQuery({ queryKey: ['my-plan'], queryFn: plansApi.getMyPlan })

  return (
    <Container>
      <Title order={2} mb="md">Кабинет спортсмена</Title>
      {/* TODO: план на неделю, форма субъективных метрик */}
      <TelemetryUpload />
    </Container>
  )
}
