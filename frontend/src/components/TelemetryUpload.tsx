import {
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  NumberInput,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { telemetryApi } from '../api/telemetry'
import { calcPaceSpeed, PACE_TYPES } from '../utils/pace'

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
  workoutType?: string | null
  compact?: boolean
}

// ─── Форма ручного ввода ─────────────────────────────────────────────────────


// ─── PostUploadForm ───────────────────────────────────────────────────────────

function PostUploadForm({ workoutId, workoutType }: { workoutId?: string; workoutType?: string | null }) {
  const queryClient = useQueryClient()

  const { data: telemetry } = useQuery({
    queryKey: ['workout-telemetry', workoutId],
    queryFn: () => telemetryApi.getWorkoutTelemetry(workoutId!),
    enabled: !!workoutId,
  })

  const [rpe,     setRpe]     = useState<number | string>('')
  const [comment, setComment] = useState('')

  useEffect(() => {
    const t = telemetry as Record<string, unknown> | null | undefined
    setRpe(t?.rpe != null ? t.rpe as number : '')
    setComment((t?.comment as string | null) ?? '')
  }, [telemetry])

  const pace = (workoutType && PACE_TYPES.has(workoutType) && telemetry)
    ? calcPaceSpeed(
        (telemetry.actual_duration_min as number | string) ?? '',
        (telemetry.distance_km        as number | string) ?? '',
        workoutType,
      )
    : null

  const mut = useMutation({
    mutationFn: () =>
      telemetryApi.updateTelemetryNotes(workoutId!, {
        rpe:     rpe !== '' ? Number(rpe) : null,
        comment: comment || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-plan'] })
      queryClient.invalidateQueries({ queryKey: ['workout-telemetry', workoutId] })
    },
  })

  return (
    <Stack gap="sm" mt="xs">
      <Divider label="Дополните тренировку" labelPosition="left" />

      {pace && (
        <Box p="xs" style={{ background: '#f1f3f5', borderRadius: 6 }}>
          <Text size="xs" c="dimmed" mb={2}>{workoutType === 'run' ? 'Темп' : 'Скорость'}</Text>
          <Text size="sm" fw={600}>{pace}</Text>
        </Box>
      )}

      <NumberInput
        label="Самочувствие на тренировке (1–10)"
        description="1 — очень тяжело, 10 — легко"
        value={rpe} onChange={setRpe}
        min={1} max={10} size="sm"
      />

      <Textarea
        label="Комментарий"
        placeholder="Как прошла тренировка..."
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        autosize minRows={2} maxRows={4}
        size="sm"
      />

      {mut.isError && (
        <Text size="xs" c="red">
          {((mut.error as { message?: string })?.message) ?? 'Ошибка сохранения'}
        </Text>
      )}

      <Group justify="flex-end" align="center" gap="xs">
        {mut.isSuccess && <Text size="xs" c="green">Сохранено ✓</Text>}
        <Button size="sm" color="teal" loading={mut.isPending} disabled={!workoutId} onClick={() => mut.mutate()}>
          {mut.isSuccess ? 'Обновить' : 'Сохранить и завершить'}
        </Button>
      </Group>
    </Stack>
  )
}

function ManualForm({ workoutId, workoutType }: { workoutId?: string; workoutType?: string | null }) {
  const queryClient = useQueryClient()

  const { data: existing } = useQuery({
    queryKey: ['workout-telemetry', workoutId],
    queryFn: () => telemetryApi.getWorkoutTelemetry(workoutId!),
    enabled: !!workoutId,
  })

  const [dur,   setDur]   = useState<number | string>('')
  const [dist,  setDist]  = useState<number | string>('')
  const [avgHr, setAvgHr] = useState<number | string>('')
  const [maxHr, setMaxHr] = useState<number | string>('')
  const [z1, setZ1] = useState<number | string>('')
  const [z2, setZ2] = useState<number | string>('')
  const [z3, setZ3] = useState<number | string>('')
  const [z4, setZ4] = useState<number | string>('')
  const [z5, setZ5] = useState<number | string>('')
  const [rpe,     setRpe]     = useState<number | string>('')
  const [comment, setComment] = useState('')

  // Предзаполняем форму при загрузке существующих данных; сбрасываем если данных нет
  useEffect(() => {
    const e = existing as Record<string, unknown> | null | undefined
    const v = (k: string) => (e?.[k] != null ? e[k] as number : '')
    setDur(v('actual_duration_min'))
    setDist(v('distance_km'))
    setAvgHr(v('avg_hr'))
    setMaxHr(v('max_hr'))
    setZ1(v('hr_zone1_min'))
    setZ2(v('hr_zone2_min'))
    setZ3(v('hr_zone3_min'))
    setZ4(v('hr_zone4_min'))
    setZ5(v('hr_zone5_min'))
    setRpe(v('rpe'))
    setComment((e?.['comment'] as string | null) ?? '')
  }, [existing])

  const num = (v: number | string) => (v !== '' ? Number(v) : null)

  const mut = useMutation({
    mutationFn: () =>
      telemetryApi.manualTelemetry({
        workout_id:          workoutId,
        actual_duration_min: num(dur),
        distance_km:         num(dist),
        avg_hr:              num(avgHr),
        max_hr:              num(maxHr),
        hr_zone1_min:        num(z1),
        hr_zone2_min:        num(z2),
        hr_zone3_min:        num(z3),
        hr_zone4_min:        num(z4),
        hr_zone5_min:        num(z5),
        rpe:                 num(rpe),
        comment:             comment || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-plan'] })
      queryClient.invalidateQueries({ queryKey: ['workout-telemetry', workoutId] })
    },
  })

  const isUpdate = !!existing

  return (
    <Stack gap="sm">
      <SimpleGrid cols={2} spacing="xs">
        <NumberInput label="Длительность, мин" value={dur}   onChange={setDur}   min={1}  max={600} size="sm" />
        <NumberInput label="Дистанция, км"     value={dist}  onChange={setDist}  min={0}  decimalScale={2} size="sm" />
        <NumberInput label="ЧСС средний"       value={avgHr} onChange={setAvgHr} min={30} max={230} size="sm" />
        <NumberInput label="ЧСС макс."         value={maxHr} onChange={setMaxHr} min={30} max={230} size="sm" />
      </SimpleGrid>

      {workoutType && PACE_TYPES.has(workoutType) && (() => {
        const pace = calcPaceSpeed(dur, dist, workoutType)
        return (
          <Box p="xs" style={{ background: '#f1f3f5', borderRadius: 6 }}>
            <Text size="xs" c="dimmed" mb={2}>{workoutType === 'run' ? 'Темп' : 'Скорость'}</Text>
            <Text size="sm" fw={600}>{pace ?? '—'}</Text>
          </Box>
        )
      })()}

      <Text size="xs" c="dimmed" fw={500}>Время в зонах, мин (необязательно)</Text>
      <SimpleGrid cols={5} spacing="xs">
        {([['Z1', z1, setZ1], ['Z2', z2, setZ2], ['Z3', z3, setZ3], ['Z4', z4, setZ4], ['Z5', z5, setZ5]] as const).map(
          ([label, val, setter]) => (
            <NumberInput key={label} label={label} value={val} onChange={setter} min={0} max={600} size="xs" />
          ),
        )}
      </SimpleGrid>

      <NumberInput
        label="Самочувствие на тренировке (1–10)"
        description="1 — очень тяжело, 10 — легко"
        value={rpe} onChange={setRpe}
        min={1} max={10} size="sm"
      />

      <Textarea
        label="Комментарий"
        placeholder="Как прошла тренировка..."
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        autosize minRows={2} maxRows={4}
        size="sm"
      />

      {mut.isError && (
        <Text size="xs" c="red">
          {((mut.error as { message?: string })?.message) ?? 'Ошибка сохранения'}
        </Text>
      )}

      <Group justify="flex-end" align="center" gap="xs">
        {mut.isSuccess && <Text size="xs" c="green">Сохранено ✓</Text>}
        <Button size="sm" color="teal" loading={mut.isPending} disabled={!workoutId} onClick={() => mut.mutate()}>
          {isUpdate ? 'Обновить' : 'Сохранить'}
        </Button>
      </Group>
    </Stack>
  )
}

// ─── Компонент ───────────────────────────────────────────────────────────────

export default function TelemetryUpload({ workoutId, workoutType, compact = false }: Props) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tab, setTab]                     = useState<'file' | 'manual'>('file')
  const [isDragging, setIsDragging]       = useState(false)
  const [selectedFile, setSelectedFile]   = useState<File | null>(null)
  const [status, setStatus]               = useState<UploadStatus>('idle')
  const [taskId, setTaskId]               = useState<string | null>(null)
  const [errorMsg, setErrorMsg]           = useState('')

  const { data: existingTelemetry } = useQuery({
    queryKey: ['workout-telemetry', workoutId],
    queryFn: () => telemetryApi.getWorkoutTelemetry(workoutId!),
    enabled: !!workoutId,
  })

  const statusRef = useRef(status)
  statusRef.current = status

  useEffect(() => {
    if (!taskId) return
    const id = setInterval(async () => {
      if (FINAL.has(statusRef.current)) { clearInterval(id); return }
      try {
        const res = await telemetryApi.getStatus(taskId)
        if (res.status === 'SUCCESS') {
          setStatus('done')
          queryClient.invalidateQueries({ queryKey: ['my-plan'] })
          queryClient.invalidateQueries({ queryKey: ['workout-telemetry', workoutId] })
        } else if (res.status === 'FAILURE') {
          setStatus('error')
          setErrorMsg(res.result?.error ?? 'Ошибка обработки')
        } else if (res.status === 'STARTED') {
          setStatus('processing')
        }
      } catch { /* игнорируем */ }
    }, 2000)
    return () => clearInterval(id)
  }, [taskId, workoutId, queryClient])

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

  // ── Компактный режим ────────────────────────────────────────────────────────
  if (compact) {
    return (
      <Group gap={6} wrap="nowrap">
        <input ref={fileInputRef} type="file" accept=".fit,.gpx,.tcx,.csv" hidden onChange={onInputChange} />
        {selectedFile && status === 'idle' ? (
          <Button size="xs" color="teal" variant="light" onClick={handleUpload}>Отправить</Button>
        ) : (
          <Button size="xs" variant="light" disabled={isInProgress} onClick={() => fileInputRef.current?.click()}>
            {selectedFile ? selectedFile.name.slice(0, 10) + '…' : 'Загрузить файл'}
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

  // ── Полный режим ────────────────────────────────────────────────────────────
  return (
    <Stack gap="sm">
      <SegmentedControl
        size="xs"
        value={tab}
        onChange={(v) => setTab(v as 'file' | 'manual')}
        data={[
          { value: 'file',   label: 'Загрузить файл' },
          { value: 'manual', label: 'Ввести вручную'  },
        ]}
      />

      <Stack gap="sm" style={{ display: tab === 'file' ? undefined : 'none' }}>
          <input ref={fileInputRef} type="file" accept=".fit,.gpx,.tcx,.csv" hidden onChange={onInputChange} />

          <Paper
            withBorder p="xl" radius="md"
            style={{
              borderStyle: 'dashed', borderWidth: 2,
              borderColor: isDragging ? '#C8102E' : '#ced4da',
              backgroundColor: isDragging ? '#fff5f5' : '#fafafa',
              cursor: 'pointer', textAlign: 'center',
              transition: 'border-color 0.15s, background-color 0.15s',
              userSelect: 'none',
            }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false) }}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
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

          {selectedFile && (
            <Group justify="space-between" align="center" p="xs" style={{ borderRadius: 8, backgroundColor: '#f5f5f5' }}>
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

          {status !== 'idle' && (
            <Group gap="xs">
              {isInProgress && <Loader size="xs" />}
              <Badge color={meta.color} variant="light" size="sm">{meta.label}</Badge>
              {errorMsg && <Text size="xs" c="red">{errorMsg}</Text>}
            </Group>
          )}

          {(status === 'done' || (existingTelemetry as {source?: string} | null)?.source === 'imported') && (
            <PostUploadForm key={workoutId} workoutId={workoutId} workoutType={workoutType} />
          )}
      </Stack>

      <Box style={{ display: tab === 'manual' ? undefined : 'none' }}>
        <ManualForm key={workoutId} workoutId={workoutId} workoutType={workoutType} />
      </Box>
    </Stack>
  )
}
