import { Container, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { groupsApi } from '../api/groups'

export default function CoachDashboard() {
  const { data: groups } = useQuery({ queryKey: ['groups'], queryFn: groupsApi.list })

  return (
    <Container>
      <Title order={2} mb="md">Панель тренера</Title>
      {/* TODO: список групп, быстрые действия, сводка алертов */}
    </Container>
  )
}
