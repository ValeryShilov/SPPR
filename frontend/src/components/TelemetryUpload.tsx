import { Badge, Box, Button, Group, Loader, Paper, Stack, Text } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { telemetryApi } from '../api/telemetry'

// ─── Типы и константы ────────────────────────────────────────────────────────

type UploadStatus = 'idle' | 'uploading' | 'queued' | 'processing' | 'done' | 'error'

const STATUS_META: Record<UploadStatus, { label: string; color: string }> = {
  idle:       { label: '',                color: 'gray'   },
  uploading:  { label: 'Загружается…',    color: 'blue'   },
  queued:     { label: 'В очереди…',      color: 'yellow' },
  processing: { label: 'Обрабатывается',  color: 'blue'   },
  done:       { label: 'Обработан',       color: 'green'  },
  error:      { label: 'Ошибка',          color: 'red'    },
}

const ACCEPTED = ['fit', 'gpx', 'tcx', 'csv']
const FINAL = new Set(['done', 'error'])

interface Props {
  workoutId?: string
  compact?: boolean
}

// ─── Компонент ───────────────────────────────────────────────────────────────

export default function TelemetryUpload({ workoutId, compact = false }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging]       = useState(false)
  const [selectedFile, setSelectedFile]   = useState<File | null>(null)
  const [status, setStatus]               = useState<UploadStatus>('idle')
  const [taskId, setTaskId]               = useState<string | null>(null)
  const [errorMsg, setErrorMsg]           = useState('')

  // Ref для чтения актуального статуса внутри setInterval без перезапуска эффекта
  const statusRef = useRef(status)
  statusRef.current = status

  // Опрос статуса задачи Celery
  useEffect(() => {
    if (!taskId) return
    const id = setInterval(async () => {
      if (FINAL.has(statusRef.current)) { clearInterval(id); return }
      try {
        const res = await telemetryApi.getStatus(taskId)
        if (res.status === 'SUCCESS')       setStatus('done')
        else if (res.status === 'FAILURE')  { setStatus('error'); setErrorMsg(res.result?.error ?? 'Ошибка обработки') }
        else if (res.status === 'STARTED')  setStatus('processing')
        // PENDING → остаётся 'queued'
      } catch { /* игнорируем ошибки опроса */ }
    }, 2000)
    return () => clearInterval(id)
  }, [taskId])

  const handleFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ACCEPTED.includes(ext)) {
      setErrorMsg(`Формат .${ext} не поддерживается. Допустимы: FIT, GPX, TCX, CSV`)
      return
    }
    setSelectedFile(file)
    setStatus('idle')
    setTaskId(null)
    setErrorMsg('')
  }

  const handleUpload = async () => {
    if (!selectedFile || !workoutId) return
    setStatus('uploading')
    setErrorMsg('')
    try {
      const res = await telemetryApi.upload(selectedFile, workoutId)
      setTaskId(res.task_id)
      setStatus('queued')
    } catch (err: unknown) {
      setStatus('error')
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setErrorMsg(detail ?? 'Ошибка при загрузке файла')
    }
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) { handleFile(f); e.target.value = '' }
  }

  const meta = STATUS_META[status]
  const isInProgress = !FINAL.has(status) && status !== 'idle'

  // ── Компактный режим (в таблице плана) ──────────────────────────────────────
  if (compact) {
    return (
      <Group gap={6} wrap="nowrap">
        <input ref={fileInputRef} type="file" accept=".fit,.gpx,.tcx,.csv" hidden onChange={onInputChange} />

        {selectedFile && status === 'idle' ? (
          <Button size="xs" color="teal" variant="light" onClick={handleUpload}>
            Отправить
          </Button>
        ) : (
          <Button
            size="xs"
            variant="light"
            disabled={isInProgress}
            onClick={() => fileInputRef.current?.click()}
          >
            {selectedFile ? selectedFile.name.slice(0, 10) + '…' : 'Загрузить'}
          </Button>
        )}

        {status !== 'idle' && (
          <Group gap={4} wrap="nowrap">
            {isInProgress && <Loader size="xs" />}
            <Badge size="xs" color={meta.color}>{meta.label}</Badge>
          </Group>
        )}
      </Group>
    )
  }

  // ── Полный режим с Dropzone ──────────────────────────────────────────────────
  return (
    <Stack gap="sm">
      <input ref={fileInputRef} type="file" accept=".fit,.gpx,.tcx,.csv" hidden onChange={onInputChange} />

      {/* Зона перетаскивания */}
      <Paper
        withBorder
        p="xl"
        radius="md"
        style={{
          borderStyle: 'dashed',
          borderWidth: 2,
          borderColor: isDragging ? '#C8102E' : '#ced4da',
          backgroundColor: isDragging ? '#fff5f5' : '#fafafa',
          cursor: 'pointer',
          textAlign: 'center',
          transition: 'border-color 0.15s, background-color 0.15s',
          userSelect: 'none',
        }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          const f = e.dataTransfer.files[0]
          if (f) handleFile(f)
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        {isDragging ? (
          <Text size="sm" c="red" fw={500}>Отпустите файл</Text>
        ) : (
          <>
            <Text size="sm" c="dimmed" mb={4}>Перетащите файл сюда или нажмите для выбора</Text>
            <Text size="xs" c="dimmed">FIT · GPX · TCX · CSV</Text>
          </>
        )}
      </Paper>

      {/* Выбранный файл + кнопка загрузки */}
      {selectedFile && (
        <Group
          justify="space-between"
          align="center"
          p="xs"
          style={{ borderRadius: 8, backgroundColor: '#f5f5f5' }}
        >
          <Box>
            <Text size="sm" fw={500}>{selectedFile.name}</Text>
            <Text size="xs" c="dimmed">{(selectedFile.size / 1024).toFixed(1)} КБ</Text>
          </Box>
          {status === 'idle' && (
            workoutId
              ? <Button size="sm" color="teal" onClick={handleUpload}>Загрузить</Button>
              : <Text size="xs" c="dimmed">ID тренировки не указан</Text>
          )}
        </Group>
      )}

      {/* Статус обработки */}
      {status !== 'idle' && (
        <Group gap="xs">
          {isInProgress && <Loader size="xs" />}
          <Badge color={meta.color} variant="light" size="sm">{meta.label}</Badge>
          {errorMsg && <Text size="xs" c="red">{errorMsg}</Text>}
        </Group>
      )}
    </Stack>
  )
}
