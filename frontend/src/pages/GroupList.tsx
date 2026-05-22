import { Button, Card, Container, Group, SimpleGrid, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { groupsApi } from '../api/groups'

interface TrainingGroup {
  id: string
  name: string
  description: string | null
  target_event: string | null
}

export default function GroupList() {
  const navigate = useNavigate()
  const { data: groups = [], isLoading } = useQuery<TrainingGroup[]>({
    queryKey: ['groups'],
    queryFn: groupsApi.list,
  })

  return (
    <Container py="xl">
      <Group justify="space-between" mb="lg">
        <Title order={2}>Группы</Title>
        <Button onClick={() => navigate('/groups/new')}>+ Создать группу</Button>
      </Group>

      {isLoading && <Text>Загрузка...</Text>}

      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        {groups.map((g) => (
          <Card
            key={g.id}
            shadow="sm"
            padding="lg"
            radius="md"
            withBorder
            style={{ cursor: 'pointer' }}
            onClick={() => navigate(`/groups/${g.id}`)}
          >
            <Text fw={600} size="lg" mb="xs">{g.name}</Text>
            {g.description && <Text size="sm" c="dimmed" lineClamp={2}>{g.description}</Text>}
            {g.target_event && <Text size="sm" mt="xs">Дисциплина: {g.target_event}</Text>}
          </Card>
        ))}
      </SimpleGrid>

      {!isLoading && groups.length === 0 && (
        <Text c="dimmed" ta="center" mt="xl">Групп пока нет. Создайте первую!</Text>
      )}
    </Container>
  )
}
