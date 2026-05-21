import { Container, Title } from '@mantine/core'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { plansApi } from '../api/plans'

export default function Matrix() {
  const { id } = useParams<{ id: string }>()
  const { data: workouts } = useQuery({
    queryKey: ['matrix', id],
    queryFn: () => plansApi.getMatrix(id!),
    enabled: !!id,
  })

  return (
    <Container>
      <Title order={2} mb="md">Расчётная матрица</Title>
      {/* TODO: таблица черновиков по атлетам × дням, утверждение */}
    </Container>
  )
}
