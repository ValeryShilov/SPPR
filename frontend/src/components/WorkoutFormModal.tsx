import {
  Box,
  Button,
  Checkbox,
  Collapse,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
} from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { plansApi } from '../api/plans'
import IntervalBuilderComponent, { type Segment, mkSeg } from './IntervalBuilder'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkoutFormData {
  id: string
  planned_date: string
  workout_type: string | null
  workout_subtype: string | null
  target_zone: string | null
  planned_duration_min: number | null
  planned_tss: number | null
  description: string | null
  interval_structure?: unknown[] | null
  status: string
}

interface Props {
  mode: 'create' | 'edit'
  athleteId?: string
  athleteName?: string
  initialDate?: string
  workout?: WorkoutFormData
  onSave: () => void
  onClose: () => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CYCLIC_TYPES = new Set(['ski', 'skiroll', 'run', 'bike'])

const TYPE_OPTIONS = [
  { value: 'ski',      label: 'Лыжи' },
  { value: 'skiroll',  label: 'Лыжероллеры' },
  { value: 'run',      label: 'Бег' },
  { value: 'bike',     label: 'Велосипед' },
  { value: 'strength', label: 'Силовая' },
  { value: 'recovery', label: 'Восстановление' },
  { value: 'rest',     label: 'Отдых' },
  { value: 'other',    label: 'Другое' },
]

const SUBTYPE_OPTIONS = [
  { value: 'skate',        label: 'Коньковый' },
  { value: 'classic',      label: 'Классический' },
  { value: 'doublepoling', label: 'Даблполинг' },
]

const ZONE_OPTIONS = [
  { value: 'Z1', label: 'Z1 — базовая выносливость' },
  { value: 'Z2', label: 'Z2 — аэробная' },
  { value: 'Z3', label: 'Z3 — пороговая' },
  { value: 'Z4', label: 'Z4 — субмаксимальная' },
  { value: 'Z5', label: 'Z5 — максимальная' },
]


// ─── Component ────────────────────────────────────────────────────────────────

export default function WorkoutFormModal({
  mode, athleteId, athleteName, initialDate, workout, onSave, onClose,
}: Props) {
  const isEdit = mode === 'edit'

  const initSegments = (): Segment[] => {
    const raw = workout?.interval_structure
    if (!raw || !Array.isArray(raw) || raw.length === 0) return []
    return (raw as Record<string, unknown>[]).map((s) => ({ ...(s as object), _id: crypto.randomUUID() } as Segment))
  }

  const [date, setDate]         = useState(workout?.planned_date ?? initialDate ?? '')
  const [wType, setWType]       = useState(workout?.workout_type ?? 'run')
  const [subtype, setSubtype]   = useState<string | null>(workout?.workout_subtype ?? null)
  const [zone, setZone]         = useState<string | null>(workout?.target_zone ?? 'Z2')
  const [dur, setDur]           = useState<number | string>(workout?.planned_duration_min ?? '')
  const [tss, setTss]           = useState<number | string>(workout?.planned_tss ?? '')
  const [descr, setDescr]       = useState(workout?.description ?? '')
  const [wStatus, setWStatus]   = useState(workout?.status === 'draft' ? 'draft' : 'published')
  const [error, setError]       = useState<string | null>(null)
  const [segments, setSegments] = useState<Segment[]>(initSegments)
  const [isInterval, setIsInterval] = useState(() => (workout?.interval_structure?.length ?? 0) > 0)

  const isRest    = wType === 'rest'
  const isCyclic  = CYCLIC_TYPES.has(wType)
  const hasSubski = wType === 'ski' || wType === 'skiroll'

  const intervalDur = segments.reduce((s, seg) => s + (seg.duration_min ?? 0) * seg.repeats, 0)
  const derivedZone = segments.find((s) => s.seg_type === 'work')?.zone ?? null

  const createMut = useMutation({
    mutationFn: (payload: unknown) => plansApi.createWorkout(payload),
    onSuccess: () => { onSave(); onClose() },
    onError: (e: unknown) => setError((e as { message?: string }).message ?? 'Ошибка сохранения'),
  })

  const updateMut = useMutation({
    mutationFn: (payload: unknown) => plansApi.updateWorkout(workout!.id, payload),
    onSuccess: () => { onSave(); onClose() },
    onError: (e: unknown) => setError((e as { message?: string }).message ?? 'Ошибка сохранения'),
  })

  const isPending = createMut.isPending || updateMut.isPending

  const submit = () => {
    setError(null)
    if (!date) { setError('Укажите дату'); return }
    const useInterval = isCyclic && isInterval && segments.length > 0
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const stripId = ({ _id, ...rest }: Segment) => rest
    const payload = {
      ...(isEdit ? {} : { athlete_id: athleteId }),
      planned_date:         date,
      workout_type:         wType,
      workout_subtype:      hasSubski ? subtype : null,
      target_zone:          isRest ? null : (useInterval ? derivedZone : zone),
      planned_duration_min: isRest ? null : (useInterval ? intervalDur || null : (dur !== '' ? Number(dur) : null)),
      planned_tss:          isRest ? null : (tss !== '' ? Number(tss) : null),
      description:          isRest ? null : (descr || null),
      interval_structure:   useInterval ? segments.map(stripId) : null,
      status:               wStatus,
    }
    if (isEdit) updateMut.mutate(payload)
    else createMut.mutate(payload)
  }

  const title = isEdit
    ? `Редактировать · ${new Date(workout!.planned_date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`
    : `Новая тренировка${athleteName ? ` — ${athleteName}` : ''}`

  return (
    <Modal opened onClose={onClose} title={title} size="lg">
      <Stack gap="xs">

        {/* Date */}
        <Box>
          <Text size="xs" c="dimmed" mb={4}>Дата</Text>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #ced4da', fontSize: 14 }}
          />
        </Box>

        {/* Type */}
        <Select
          label="Тип тренировки"
          data={TYPE_OPTIONS}
          value={wType}
          onChange={(v) => {
            const t = v ?? 'run'
            setWType(t)
            setSubtype(null)
            if (!CYCLIC_TYPES.has(t)) { setIsInterval(false); setSegments([]) }
          }}
          size="sm"
        />

        {/* Subtype — only ski/skiroll */}
        {hasSubski && (
          <Select
            label="Стиль"
            data={SUBTYPE_OPTIONS}
            value={subtype}
            onChange={setSubtype}
            clearable
            placeholder="Не указан"
            size="sm"
          />
        )}

        {/* Interval checkbox — cyclic types only */}
        {isCyclic && !isRest && (
          <Checkbox
            label="Интервальная тренировка"
            checked={isInterval}
            onChange={(e) => {
              setIsInterval(e.currentTarget.checked)
              if (e.currentTarget.checked && segments.length === 0) setSegments([mkSeg()])
            }}
            size="sm"
          />
        )}

        {/* Interval builder */}
        {isCyclic && !isRest && (
          <Collapse in={isInterval}>
            <Paper withBorder p="xs" radius="xs" bg="gray.0">
              <IntervalBuilderComponent segments={segments} onUpdate={setSegments} />
              {intervalDur > 0 && (
                <Text size="xs" c="dimmed" mt={4}>
                  Зона: {derivedZone ?? '—'} · Длительность: {intervalDur} мин
                </Text>
              )}
            </Paper>
          </Collapse>
        )}

        {/* Zone + Duration + TSS — not for rest, not when interval */}
        {!isRest && (
          <>
            {!(isCyclic && isInterval) && (
              <Select
                label="Целевая зона"
                data={ZONE_OPTIONS}
                value={zone}
                onChange={setZone}
                size="sm"
              />
            )}
            <Group gap="xs" grow>
              {!(isCyclic && isInterval) && (
                <NumberInput
                  label="Длительность, мин"
                  value={dur}
                  onChange={setDur}
                  min={1} max={600}
                  size="sm"
                />
              )}
              <NumberInput
                label="TSS (план)"
                value={tss}
                onChange={setTss}
                min={0} max={999}
                decimalScale={1}
                size="sm"
              />
            </Group>
            <Textarea
              label="Описание задания"
              value={descr}
              onChange={(e) => setDescr(e.target.value)}
              autosize minRows={1} maxRows={4}
              size="sm"
            />
          </>
        )}

        {/* Status */}
        <Box>
          <Text size="xs" c="dimmed" mb={4}>Статус</Text>
          <SegmentedControl
            fullWidth
            size="xs"
            data={[
              { value: 'published', label: 'Опубликовано' },
              { value: 'draft',     label: 'Черновик' },
            ]}
            value={wStatus}
            onChange={setWStatus}
          />
        </Box>

        {error && <Text size="xs" c="red">{error}</Text>}

        <Group justify="flex-end" gap="xs" mt="xs">
          <Button variant="subtle" color="gray" onClick={onClose} size="sm">Отмена</Button>
          <Button onClick={submit} loading={isPending} size="sm">
            {isEdit ? 'Сохранить' : 'Создать'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
