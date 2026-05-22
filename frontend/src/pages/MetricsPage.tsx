import { Button, Container, Group, NumberInput, Stack, Text, Title } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { telemetryApi } from '../api/telemetry'

interface SubjectiveMetric {
  id: string
  date_recorded: string
  sleep_quality: number | null
  sleep_hours: number | null
  fatigue_level: number | null
  hrv_value: number | null
}

export default function MetricsPage() {
  const queryClient = useQueryClient()

  const { data: today } = useQuery<SubjectiveMetric | null>({
    queryKey: ['metrics-today'],
    queryFn: telemetryApi.getTodayMetric,
  })

  const [sleepQuality, setSleepQuality] = useState<number | string>('')
  const [sleepHours, setSleepHours] = useState<number | string>('')
  const [fatigue, setFatigue] = useState<number | string>('')
  const [hrv, setHrv] = useState<number | string>('')

  const save = useMutation({
    mutationFn: () =>
      telemetryApi.createMetric({
        sleep_quality: sleepQuality !== '' ? Number(sleepQuality) : null,
        sleep_hours: sleepHours !== '' ? Number(sleepHours) : null,
        fatigue_level: fatigue !== '' ? Number(fatigue) : null,
        hrv_value: hrv !== '' ? Number(hrv) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metrics-today'] })
    },
  })

  return (
    <Container size="xs" py="xl">
      <Title order={2} mb="lg">Самочувствие</Title>

      {today && (
        <Stack
          gap={4}
          mb="lg"
          p="md"
          style={{ background: '#f8f9fa', borderRadius: 8 }}
        >
          <Text fw={500} size="sm">Сегодня уже введено:</Text>
          <Text size="sm">Качество сна: {today.sleep_quality ?? '—'} / Часов сна: {today.sleep_hours ?? '—'}</Text>
          <Text size="sm">Усталость: {today.fatigue_level ?? '—'} / ЧСС покоя (HRV): {today.hrv_value ?? '—'}</Text>
        </Stack>
      )}

      <Stack gap="md">
        <NumberInput
          label="Качество сна (1–5)"
          description="1 — очень плохое, 5 — отличное"
          min={1}
          max={5}
          value={sleepQuality}
          onChange={setSleepQuality}
        />
        <NumberInput
          label="Часов сна"
          min={0}
          max={24}
          step={0.5}
          decimalScale={1}
          value={sleepHours}
          onChange={setSleepHours}
        />
        <NumberInput
          label="Уровень усталости (1–5)"
          description="1 — нет усталости, 5 — очень устал"
          min={1}
          max={5}
          value={fatigue}
          onChange={setFatigue}
        />
        <NumberInput
          label="HRV / ЧСС покоя, уд/мин"
          min={20}
          max={220}
          value={hrv}
          onChange={setHrv}
        />
        <Group justify="flex-end">
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Сохранить
          </Button>
        </Group>
        {save.isSuccess && <Text c="green" size="sm">Сохранено!</Text>}
        {save.isError && <Text c="red" size="sm">Ошибка при сохранении</Text>}
      </Stack>
    </Container>
  )
}
