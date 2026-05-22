import { Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { useRef, useState } from 'react'
import { telemetryApi } from '../api/telemetry'

interface Props {
  workoutId?: string
  compact?: boolean
}

export default function TelemetryUpload({ workoutId: propWorkoutId, compact = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [manualId, setManualId] = useState('')

  const effectiveWorkoutId = propWorkoutId ?? manualId

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !effectiveWorkoutId) return
    setStatus('uploading')
    try {
      const res = await telemetryApi.upload(file, effectiveWorkoutId)
      setTaskId(res.task_id)
      setStatus('done')
    } catch {
      setStatus('error')
    }
    e.target.value = ''
  }

  if (compact) {
    return (
      <Group gap="xs">
        <input
          ref={inputRef}
          type="file"
          accept=".fit,.gpx,.tcx,.csv"
          hidden
          onChange={handleUpload}
        />
        <Button
          size="xs"
          variant="light"
          disabled={!effectiveWorkoutId}
          loading={status === 'uploading'}
          onClick={() => inputRef.current?.click()}
        >
          Загрузить
        </Button>
        {status === 'done' && <Text size="xs" c="green">✓</Text>}
        {status === 'error' && <Text size="xs" c="red">!</Text>}
      </Group>
    )
  }

  return (
    <Stack mt="md" gap="xs">
      {!propWorkoutId && (
        <TextInput
          label="ID тренировки"
          placeholder="UUID тренировки"
          value={manualId}
          onChange={(e) => setManualId(e.target.value)}
          size="sm"
        />
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".fit,.gpx,.tcx,.csv"
        hidden
        onChange={handleUpload}
      />
      <Button
        disabled={!effectiveWorkoutId}
        loading={status === 'uploading'}
        onClick={() => inputRef.current?.click()}
      >
        Загрузить телеметрию
      </Button>
      {taskId && <Text size="sm" c="dimmed">Задача: {taskId}</Text>}
      {status === 'error' && <Text size="sm" c="red">Ошибка загрузки</Text>}
    </Stack>
  )
}
