import { Container, Skeleton, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { athletesApi } from '../api/athletes'
import AthleteAnalytics from '../components/AthleteAnalyticsBlock'

interface AthleteProfile {
  id: string
  first_name: string
  last_name: string
}

export default function AthleteAnalyticsPage() {
  const { data: profile, isLoading } = useQuery<AthleteProfile>({
    queryKey: ['athlete-me'],
    queryFn: athletesApi.me,
  })

  return (
    <Container size="xl" py="xl">
      <Title order={2} mb="xl">Моя аналитика</Title>
      {isLoading || !profile?.id
        ? <Skeleton height={400} radius="md" />
        : <AthleteAnalytics athleteId={profile.id} />
      }
    </Container>
  )
}
