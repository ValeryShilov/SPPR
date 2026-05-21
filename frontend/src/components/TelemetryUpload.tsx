import { Button, Stack, Text } from '@mantine/core'
import { useRef, useState } from 'react'
import { telemetryApi } from '../api/telemetry'

export default function TelemetryUpload() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [taskId, setTaskId] = useState<string | null>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // TODO: показать прогресс, опрашивать /telemetry/status/{task_id}
    const res = await telemetryApi.upload(file)
    setTaskId(res.task_id)
  }

  return (
    <Stack mt="md">
      <input ref={inputRef} type="file" accept=".fit,.gpx,.tcx,.csv" hidden onChange={handleUpload} />
      <Button onClick={() => inputRef.current?.click()}>Загрузить телеметрию</Button>
      {taskId && <Text size="sm">Задача: {taskId}</Text>}
    </Stack>
  )
}
