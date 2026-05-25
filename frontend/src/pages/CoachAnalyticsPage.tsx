import {
  Container,
  Group,
  Paper,
  Select,
  Skeleton,
  Text,
  Title,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyticsApi } from '../api/analytics'
import AthleteAnalytics from '../components/AthleteAnalyticsBlock'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AthleteGroup {
  id: string
  name: string
}

interface AthleteOption {
  athlete_id: string
  full_name: string
  groups: AthleteGroup[]
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CoachAnalyticsPage() {
  const navigate = useNavigate()
  const [selectedGroupId,   setSelectedGroupId]   = useState<string | null>(null)
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null)

  const { data: athletes = [], isLoading: athletesLoading } = useQuery<AthleteOption[]>({
    queryKey: ['coach-athletes'],
    queryFn:  () => analyticsApi.getCoachAthletes(),
  })

  const groupSelectData = useMemo(() => {
    const seen = new Map<string, string>()
    for (const a of athletes) {
      for (const g of a.groups) {
        if (!seen.has(g.id)) seen.set(g.id, g.name)
      }
    }
    return Array.from(seen.entries())
      .sort((a, b) => a[1].localeCompare(b[1], 'ru'))
      .map(([id, name]) => ({ value: id, label: name }))
  }, [athletes])

  const filteredAthletes = useMemo(() => {
    if (!selectedGroupId) return athletes
    return athletes.filter(a => a.groups.some(g => g.id === selectedGroupId))
  }, [athletes, selectedGroupId])

  const athleteSelectData = useMemo(
    () => filteredAthletes.map(a => ({ value: a.athlete_id, label: a.full_name })),
    [filteredAthletes]
  )

  const selectedAthlete = athletes.find(a => a.athlete_id === selectedAthleteId)

  const handleGroupChange = (groupId: string | null) => {
    setSelectedGroupId(groupId)
    if (groupId && selectedAthleteId) {
      const stillInGroup = athletes
        .find(a => a.athlete_id === selectedAthleteId)
        ?.groups.some(g => g.id === groupId)
      if (!stillInGroup) setSelectedAthleteId(null)
    }
  }

  return (
    <Container size="xl" py="xl">
      <Title order={2} mb="xl">Аналитика</Title>

      <Paper withBorder p="md" radius="md" mb="xl">
        {athletesLoading ? (
          <Group gap="md">
            <Skeleton height={36} width={220} radius="sm" />
            <Skeleton height={36} width={280} radius="sm" />
          </Group>
        ) : (
          <Group gap="md" align="flex-end" wrap="wrap">
            <Select
              label="Группа"
              placeholder="Все группы"
              data={groupSelectData}
              value={selectedGroupId}
              onChange={handleGroupChange}
              clearable
              style={{ width: 220 }}
            />
            <Select
              label="Атлет"
              placeholder="Выберите атлета..."
              data={athleteSelectData}
              value={selectedAthleteId}
              onChange={setSelectedAthleteId}
              searchable clearable
              style={{ width: 280 }}
              disabled={athleteSelectData.length === 0}
            />
          </Group>
        )}
      </Paper>

      {!selectedAthleteId ? (
        <Paper withBorder p={48} radius="md" style={{ textAlign: 'center' }}>
          <Text size="lg" c="dimmed" mb={4}>Выберите атлета</Text>
          <Text size="sm" c="dimmed">
            {selectedGroupId
              ? 'Выберите атлета из выбранной группы'
              : 'Выберите группу (необязательно) и атлета для просмотра аналитики'}
          </Text>
        </Paper>
      ) : (
        <>
          <Group mb="lg" gap="xs">
            <Title order={3}>{selectedAthlete?.full_name}</Title>
            {selectedAthlete && selectedAthlete.groups.length > 0 && (
              <Text size="sm" c="dimmed" style={{ alignSelf: 'flex-end', paddingBottom: 2 }}>
                {selectedAthlete.groups.map(g => g.name).join(', ')}
              </Text>
            )}
            <Text size="sm" c="blue"
              style={{ cursor: 'pointer', textDecoration: 'underline', alignSelf: 'flex-end', paddingBottom: 2 }}
              onClick={() => navigate(`/athletes/${selectedAthleteId}`)}>
              Профиль →
            </Text>
          </Group>
          <AthleteAnalytics athleteId={selectedAthleteId} />
        </>
      )}
    </Container>
  )
}
