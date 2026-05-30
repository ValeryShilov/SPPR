import {
  Badge,
  Box,
  Button,
  Checkbox,
  Collapse,
  Container,
  Divider,
  Group,
  Menu,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PlanCalendar, { isoDate } from '../components/PlanCalendar'
import SportIcon from '../components/SportIcon'
import IntervalBuilderComponent, { type Segment } from '../components/IntervalBuilder'
import { groupsApi } from '../api/groups'
import { plansApi } from '../api/plans'

// ─── Constants ────────────────────────────────────────────────────────────────

const RU_WEEKDAY = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const RU_MONTH   = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

function getDayLabel(idx: number, startDate: string): string {
  if (startDate) {
    const d = new Date(startDate + 'T00:00:00')
    if (!isNaN(d.getTime())) {
      d.setDate(d.getDate() + idx)
      return `${RU_WEEKDAY[d.getDay()]} ${d.getDate()} ${RU_MONTH[d.getMonth()]}`
    }
  }
  return `День ${idx + 1}`
}

const CYCLIC_TYPES = new Set(['ski', 'skiroll', 'run', 'bike'])

const WORKOUT_TYPE_OPTIONS = [
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
  { value: 'Z1', label: 'Z1' },
  { value: 'Z2', label: 'Z2' },
  { value: 'Z3', label: 'Z3' },
  { value: 'Z4', label: 'Z4' },
  { value: 'Z5', label: 'Z5' },
]

const TYPE_COLOR: Record<string, string> = {
  ski: 'blue', skiroll: 'cyan', run: 'teal', bike: 'green',
  strength: 'violet', recovery: 'indigo', rest: 'gray', other: 'dark',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DayConfig {
  workout_type: string
  workout_subtype: string | null
  zone: string
  duration_min: number
  description: string
  is_interval: boolean
  segments: Segment[]
}

interface Template {
  id: string
  group_id: string
  name: string
  start_date: string
  duration_days: number
  description: string | null
  week_schedule: unknown[] | null
}

interface TrainingGroup { id: string; name: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const emptyDayWorkout = (): DayConfig => ({
  workout_type: 'rest', workout_subtype: null, zone: 'Z1',
  duration_min: 0, description: '', is_interval: false, segments: [],
})

const emptyDay = (): DayConfig[] => [emptyDayWorkout()]

const makeEmptySchedule = (n: number): DayConfig[][] =>
  Array.from({ length: n }, emptyDay)

// Глубокое клонирование дня с новыми _id сегментов (иначе коллизия React-ключей)
const cloneSegments = (segs: Segment[]): Segment[] =>
  segs.map((s) => ({ ...s, _id: crypto.randomUUID() }))

const cloneDayWorkouts = (day: DayConfig[]): DayConfig[] =>
  day.map((w) => ({ ...w, segments: cloneSegments(w.segments) }))

function parseSingleWorkout(d: Record<string, unknown>): DayConfig {
  const segs = ((d.interval_structure as Record<string, unknown>[] | null) ?? []).map((s) => ({
    duration_min: null,
    distance_km:  null,
    ...(s as object),
    _id: crypto.randomUUID(),
  })) as Segment[]
  return {
    workout_type:    (d.workout_type as string)         ?? 'run',
    workout_subtype: (d.workout_subtype as string|null) ?? null,
    zone:            (d.zone as string)                 ?? 'Z2',
    duration_min:    (d.duration_min as number)         ?? 60,
    description:     (d.description as string)          ?? '',
    is_interval:     segs.length > 0,
    segments:        segs,
  }
}

function fromBackend(saved: unknown[]): DayConfig[][] {
  return saved.map((entry) => {
    if (Array.isArray(entry)) {
      return (entry as Record<string, unknown>[]).map(parseSingleWorkout)
    }
    return [parseSingleWorkout(entry as Record<string, unknown>)]
  })
}

function toBackend(schedule: DayConfig[][]): unknown[][] {
  return schedule.map((dayWorkouts) =>
    dayWorkouts.map((d) => {
      const isInterval = d.is_interval && d.segments.length > 0
      const dur = isInterval
        ? d.segments.reduce((s, seg) =>
            seg.duration_min != null ? s + seg.duration_min * seg.repeats : s, 0)
        : d.duration_min
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const stripId = ({ _id, ...rest }: Segment) => rest
      return {
        workout_type:       d.workout_type,
        workout_subtype:    d.workout_subtype ?? null,
        zone:               d.zone,
        duration_min:       dur,
        description:        d.description || null,
        interval_structure: isInterval ? d.segments.map(stripId) : null,
      }
    })
  )
}

// ─── DayCard ─────────────────────────────────────────────────────────────────

function DayCard({ dayIdx, workoutIdx, day, onChange, onRemove, canRemove, label }: {
  dayIdx: number
  workoutIdx: number
  day: DayConfig
  onChange: (dayIdx: number, workoutIdx: number, patch: Partial<DayConfig>) => void
  onRemove?: () => void
  canRemove?: boolean
  label: string
}) {
  const isCyclic   = CYCLIC_TYPES.has(day.workout_type)
  const isRest     = day.workout_type === 'rest'
  const hasSubtype = day.workout_type === 'ski' || day.workout_type === 'skiroll'
  const set = (patch: Partial<DayConfig>) => onChange(dayIdx, workoutIdx, patch)

  const handleTypeChange = (v: string | null) => {
    const t = v ?? 'rest'
    set({
      workout_type:    t,
      workout_subtype: null,
      is_interval:     CYCLIC_TYPES.has(t) ? day.is_interval : false,
      segments:        CYCLIC_TYPES.has(t) ? day.segments : [],
    })
  }

  return (
    <Paper withBorder p="sm" radius="sm">
      <Stack gap="xs">
        {/* Row 1: controls */}
        <Group gap="xs" wrap="wrap" align="flex-end">
          <Badge color={TYPE_COLOR[day.workout_type] ?? 'gray'} variant="light" miw={130}>
            {label}
          </Badge>

          <Select data={WORKOUT_TYPE_OPTIONS} value={day.workout_type}
            onChange={handleTypeChange} size="xs" allowDeselect={false} w={150} />

          {hasSubtype && (
            <Select data={SUBTYPE_OPTIONS} value={day.workout_subtype ?? ''}
              onChange={(v) => set({ workout_subtype: v || null })}
              placeholder="Подтип" size="xs" allowDeselect={false} w={145} />
          )}

          {isCyclic && !day.is_interval && (
            <>
              <Select data={ZONE_OPTIONS} value={day.zone}
                onChange={(v) => set({ zone: v ?? 'Z2' })}
                size="xs" allowDeselect={false} w={68} label="Зона" />
              <NumberInput min={5} max={300} step={5} value={day.duration_min}
                onChange={(v) => set({ duration_min: Number(v) || 0 })}
                rightSection={<Text size="xs" c="dimmed" pr={4}>мин</Text>}
                size="xs" w={108} label="Длительность" />
            </>
          )}

          {!isCyclic && !isRest && (
            <NumberInput min={5} max={300} step={5} value={day.duration_min}
              onChange={(v) => set({ duration_min: Number(v) || 0 })}
              rightSection={<Text size="xs" c="dimmed" pr={4}>мин</Text>}
              size="xs" w={108} label="Длительность" />
          )}

          {isCyclic && (
            <Box pt={day.is_interval ? 0 : 20}>
              <Checkbox label="Интервальная" checked={day.is_interval}
                onChange={(e) => set({ is_interval: e.currentTarget.checked })} size="xs" />
            </Box>
          )}

          {canRemove && onRemove && (
            <Box pt={20} ml="auto">
              <Button size="xs" variant="subtle" color="red" onClick={onRemove}>
                Удалить
              </Button>
            </Box>
          )}
        </Group>

        {/* Row 2: description */}
        {!isRest && (
          <Textarea placeholder="Описание задания" value={day.description}
            onChange={(e) => set({ description: e.target.value })}
            size="xs" autosize minRows={1} maxRows={3} />
        )}

        {/* Row 3: interval builder */}
        {isCyclic && (
          <Collapse in={day.is_interval}>
            <Paper withBorder p="xs" radius="xs" bg="gray.0">
              <IntervalBuilderComponent segments={day.segments}
                onUpdate={(segs) => set({ segments: segs })} />
            </Paper>
          </Collapse>
        )}
      </Stack>
    </Paper>
  )
}

// ─── TemplateEditor ───────────────────────────────────────────────────────────

export default function TemplateEditor() {
  const { templateId } = useParams<{ templateId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: template, isLoading } = useQuery<Template>({
    queryKey: ['template', templateId],
    queryFn: () => plansApi.getTemplate(templateId!),
    enabled: !!templateId,
  })

  const { data: groups = [] } = useQuery<TrainingGroup[]>({
    queryKey: ['groups'],
    queryFn: groupsApi.list,
  })

  const [groupId, setGroupId]       = useState('')
  const [name, setName]             = useState('')
  const [startDate, setStartDate]   = useState('')
  const [durationDays, setDurationDays] = useState<number | string>(7)
  const [descr, setDescr]           = useState('')
  const [schedule, setSchedule]     = useState<DayConfig[][]>([])

  const [showCalendar, setShowCalendar] = useState(true)
  const [calView, setCalView]           = useState<'month' | 'week'>('month')
  const [calDisplay, setCalDisplay]     = useState<Date>(new Date())
  const [selDayStr, setSelDayStr]       = useState<string | null>(null)

  useEffect(() => {
    if (template) {
      setGroupId(template.group_id)
      setName(template.name)
      setStartDate(template.start_date)
      setDurationDays(template.duration_days === 0 ? '' : template.duration_days)
      setDescr(template.description ?? '')
      const n = template.duration_days
      setSchedule(template.week_schedule ? fromBackend(template.week_schedule) : makeEmptySchedule(n))
      setCalView(n <= 7 ? 'week' : 'month')
      if (template.start_date) {
        const d = new Date(template.start_date + 'T00:00:00')
        if (!isNaN(d.getTime())) setCalDisplay(d)
      }
    }
  }, [template])

  // Sync calendar to start date when user edits it
  useEffect(() => {
    if (startDate) {
      const d = new Date(startDate + 'T00:00:00')
      if (!isNaN(d.getTime())) setCalDisplay(d)
    }
  }, [startDate])

  // ── Calendar helpers ────────────────────────────────────────────────────────

  const getScheduleIdx = (date: Date): number => {
    if (!startDate) return -1
    const start = new Date(startDate + 'T00:00:00')
    if (isNaN(start.getTime())) return -1
    return Math.round((date.getTime() - start.getTime()) / 86400000)
  }

  const planEndDate = (startDate && schedule.length > 0)
    ? (() => {
        const d = new Date(startDate + 'T00:00:00')
        d.setDate(d.getDate() + schedule.length - 1)
        return isoDate(d)
      })()
    : undefined

  const renderTemplateDay = (date: Date) => {
    const idx = getScheduleIdx(date)
    if (idx < 0 || idx >= schedule.length) return null
    const dayWorkouts = schedule[idx]
    const compact = dayWorkouts.length > 1
    return (
      <Box mt={2}>
        {dayWorkouts.map((day, wi) => {
          if (day.workout_type === 'rest') {
            return (
              <Box key={wi} mt={wi > 0 ? 1 : 0}>
                <SportIcon type="rest" size={compact ? 20 : 26} color="#868e96" />
                {!compact && <Text size="xs" c="dimmed" style={{ lineHeight: 1.2 }}>Отдых</Text>}
              </Box>
            )
          }
          return (
            <Box key={wi} mt={wi > 0 ? 1 : 0}>
              <SportIcon type={day.workout_type} size={compact ? 20 : 26} color="#343a40" />
              {compact ? (
                <Text size="xs" c="dimmed" style={{ fontSize: 9, lineHeight: 1.2 }}>{day.zone}</Text>
              ) : (
                <>
                  <Text size="xs" c="dimmed" style={{ lineHeight: 1.2 }}>
                    {day.zone} · {day.duration_min}м
                  </Text>
                  {day.is_interval && day.segments.length > 0 && (
                    <Text size="xs" c="blue" style={{ fontSize: 10 }}>интервал</Text>
                  )}
                </>
              )}
            </Box>
          )
        })}
      </Box>
    )
  }

  const navigateCal = (dir: -1 | 1) => {
    const d = new Date(calDisplay)
    if (calView === 'week') d.setDate(d.getDate() + dir * 7)
    else d.setMonth(d.getMonth() + dir)
    setCalDisplay(d)
  }

  const handleCalClick = (date: Date) => {
    const idx = getScheduleIdx(date)
    if (idx >= 0 && idx < schedule.length) {
      const iso = isoDate(date)
      setSelDayStr((prev) => (prev === iso ? null : iso))
    }
  }

  const selIdx = selDayStr ? getScheduleIdx(new Date(selDayStr + 'T00:00:00')) : -1

  const applyDuration = () => {
    const n = Math.max(1, Math.min(365, Number(durationDays) || 1))
    setDurationDays(n)
    setCalView(n <= 7 ? 'week' : 'month')
    setSchedule((prev) => {
      if (n === prev.length) return prev
      if (n < prev.length) return prev.slice(0, n)
      return [...prev, ...Array.from({ length: n - prev.length }, emptyDay)]
    })
  }

  const updateDay = (dayIdx: number, workoutIdx: number, patch: Partial<DayConfig>) =>
    setSchedule((prev) => prev.map((dayWorkouts, i) =>
      i === dayIdx
        ? dayWorkouts.map((w, j) => (j === workoutIdx ? { ...w, ...patch } : w))
        : dayWorkouts
    ))

  const addWorkoutToDay = (dayIdx: number) =>
    setSchedule((prev) => prev.map((dayWorkouts, i) =>
      i === dayIdx
        ? [...dayWorkouts, { workout_type: 'run', workout_subtype: null, zone: 'Z2', duration_min: 60, description: '', is_interval: false, segments: [] }]
        : dayWorkouts
    ))

  const removeWorkoutFromDay = (dayIdx: number, workoutIdx: number) =>
    setSchedule((prev) => prev.map((dayWorkouts, i) =>
      i === dayIdx && dayWorkouts.length > 1
        ? dayWorkouts.filter((_, j) => j !== workoutIdx)
        : dayWorkouts
    ))

  // ─── Копирование дней / недель ───────────────────────────────────────────────
  const [copyOpen, setCopyOpen]       = useState(false)
  const [copyMode, setCopyMode]       = useState<'week' | 'range'>('week')
  const [copySrcWeek, setCopySrcWeek] = useState(0)
  const [copyDstWeek, setCopyDstWeek] = useState<string>('end')   // индекс недели или 'end'
  const [copyFrom, setCopyFrom]       = useState<number | string>(1)
  const [copyTo, setCopyTo]           = useState<number | string>(1)
  const [copyDstDay, setCopyDstDay]   = useState<number | string>(1)
  const [copyToEnd, setCopyToEnd]     = useState(true)

  const weekCount = Math.ceil(schedule.length / 7)

  /**
   * Копирует srcCount дней начиная с srcStart в позицию targetStart.
   * При нехватке длины расписание расширяется днями отдыха.
   * Целевые дни перезаписываются. Длительность синхронизируется.
   */
  const copyDays = (srcStart: number, srcCount: number, targetStart: number) => {
    if (srcCount <= 0 || srcStart < 0) return
    setSchedule((prev) => {
      const srcSlice = prev.slice(srcStart, srcStart + srcCount).map(cloneDayWorkouts)
      const needLen  = Math.max(prev.length, targetStart + srcSlice.length)
      const next     = [...prev]
      while (next.length < needLen) next.push(emptyDay())
      srcSlice.forEach((d, i) => { next[targetStart + i] = d })
      return next
    })
    const newLen = Math.max(schedule.length, targetStart + srcCount)
    if (newLen !== schedule.length) {
      setDurationDays(newLen)
      setCalView(newLen <= 7 ? 'week' : 'month')
    }
  }

  const handleCopy = () => {
    if (copyMode === 'week') {
      const srcStart    = copySrcWeek * 7
      const srcCount    = Math.min(7, schedule.length - srcStart)
      const targetStart = copyDstWeek === 'end' ? schedule.length : Number(copyDstWeek) * 7
      copyDays(srcStart, srcCount, targetStart)
    } else {
      const from = Math.max(1, Math.min(schedule.length, Number(copyFrom) || 1))
      const to   = Math.max(from, Math.min(schedule.length, Number(copyTo) || from))
      const targetStart = copyToEnd ? schedule.length : Math.max(0, (Number(copyDstDay) || 1) - 1)
      copyDays(from - 1, to - from + 1, targetStart)
    }
  }

  // ─── Summary stats ─────────────────────────────────────────────────────────
  let totalMin = 0
  const zoneMins: Record<string, number> = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0 }
  for (const d of schedule.flat()) {
    if (d.workout_type === 'rest') continue
    if (CYCLIC_TYPES.has(d.workout_type)) {
      if (d.is_interval && d.segments.length) {
        for (const seg of d.segments) {
          if (seg.duration_min == null) continue
          const m = seg.duration_min * seg.repeats
          zoneMins[seg.zone] = (zoneMins[seg.zone] ?? 0) + m
          totalMin += m
        }
      } else {
        const m = d.duration_min || 0
        zoneMins[d.zone] = (zoneMins[d.zone] ?? 0) + m
        totalMin += m
      }
    } else {
      totalMin += d.duration_min || 0
    }
  }
  const hiMin  = (zoneMins.Z4 ?? 0) + (zoneMins.Z5 ?? 0)
  const loMin  = (zoneMins.Z1 ?? 0) + (zoneMins.Z2 ?? 0)
  const hiPct  = totalMin > 0 ? Math.round((hiMin / totalMin) * 100) : 0
  const loPct  = totalMin > 0 ? Math.round((loMin / totalMin) * 100) : 0
  const active = schedule.filter((dayWorkouts) => dayWorkouts.some(d => d.workout_type !== 'rest')).length

  // ─── Mutations ─────────────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: () =>
      plansApi.updateTemplate(templateId!, {
        group_id: groupId,
        name,
        start_date: startDate,
        duration_days: Number(durationDays),
        description: descr || null,
        week_schedule: toBackend(schedule),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template', templateId] })
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })

  const adapt = useMutation({
    mutationFn: () => plansApi.adaptTemplateSync(templateId!),
    onSuccess: () => navigate(`/planning/${templateId}/matrix`),
  })

  if (isLoading) return <Text p="xl">Загрузка...</Text>
  if (!template)  return <Text p="xl" c="red">Шаблон не найден</Text>

  return (
    <Container size="xl" py="sm">
      <Group justify="space-between" mb="lg">
        <Title order={2}>Редактор шаблона</Title>
        <Button variant="light" onClick={() => navigate('/planning')}>← Назад</Button>
      </Group>

      <Stack gap="lg">
        {/* Meta */}
        <Paper withBorder p="md" radius="md">
          <Group grow align="flex-end">
            <Select
              label="Группа"
              data={groups.map((g) => ({ value: g.id, label: g.name }))}
              value={groupId}
              onChange={(v) => setGroupId(v ?? '')}
              allowDeselect={false}
              required
            />
            <TextInput label="Название" value={name}
              onChange={(e) => setName(e.target.value)} required />
            <TextInput label="Дата начала" type="date" value={startDate}
              onChange={(e) => setStartDate(e.target.value)} required />
            <Group align="flex-end" gap="xs" style={{ flex: 1 }}>
              <NumberInput
                label="Длительность, дней"
                description={`Сейчас: ${schedule.length} дн.`}
                min={1} max={365}
                value={durationDays}
                onChange={setDurationDays}
                style={{ flex: 1 }}
              />
              <Button size="sm" variant="light" mb={1} onClick={applyDuration}>
                Применить
              </Button>
            </Group>
            <TextInput label="Описание" value={descr}
              onChange={(e) => setDescr(e.target.value)} />
          </Group>
        </Paper>

        {/* Schedule */}
        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" mb="sm">
            <Group gap="sm">
              <Title order={4}>Расписание тренировок</Title>
              <Text size="sm" c="dimmed">{schedule.length} дн. · {weekCount} нед.</Text>
            </Group>
            <Group gap="sm">
              {schedule.length > 0 && (
                <Button
                  size="xs"
                  variant={copyOpen ? 'filled' : 'light'}
                  onClick={() => setCopyOpen((o) => !o)}
                >
                  Копировать дни/недели
                </Button>
              )}
              <SegmentedControl
                size="xs"
                value={showCalendar ? 'cal' : 'list'}
                onChange={(v) => { setShowCalendar(v === 'cal'); setSelDayStr(null) }}
                data={[
                  { value: 'cal',  label: 'Календарь' },
                  { value: 'list', label: 'Список'    },
                ]}
              />
            </Group>
          </Group>

          {/* Панель копирования */}
          <Collapse in={copyOpen && schedule.length > 0}>
            <Paper withBorder p="sm" radius="sm" mb="sm" bg="blue.0">
              <Group align="flex-end" gap="sm" wrap="wrap">
                <SegmentedControl
                  size="xs"
                  value={copyMode}
                  onChange={(v) => setCopyMode(v as 'week' | 'range')}
                  data={[
                    { value: 'week',  label: 'Неделю' },
                    { value: 'range', label: 'Дни'    },
                  ]}
                />

                {copyMode === 'week' ? (
                  <>
                    <Select
                      size="xs" label="Источник" w={130} allowDeselect={false}
                      data={Array.from({ length: weekCount }, (_, i) => ({
                        value: String(i), label: `Неделя ${i + 1}`,
                      }))}
                      value={String(Math.min(copySrcWeek, Math.max(0, weekCount - 1)))}
                      onChange={(v) => setCopySrcWeek(Number(v) || 0)}
                    />
                    <Text size="xs" c="dimmed" mb={6}>→</Text>
                    <Select
                      size="xs" label="Куда" w={190} allowDeselect={false}
                      data={[
                        ...Array.from({ length: weekCount }, (_, i) => ({
                          value: String(i), label: `Заменить неделю ${i + 1}`,
                        })),
                        { value: 'end', label: 'Новая неделя в конце' },
                      ]}
                      value={copyDstWeek}
                      onChange={(v) => setCopyDstWeek(v ?? 'end')}
                    />
                  </>
                ) : (
                  <>
                    <NumberInput
                      size="xs" label="С дня" w={85} min={1} max={schedule.length}
                      value={copyFrom} onChange={setCopyFrom}
                    />
                    <NumberInput
                      size="xs" label="По день" w={85} min={1} max={schedule.length}
                      value={copyTo} onChange={setCopyTo}
                    />
                    <Text size="xs" c="dimmed" mb={6}>→</Text>
                    <Checkbox
                      label="В конец" checked={copyToEnd} size="xs" mb={8}
                      onChange={(e) => setCopyToEnd(e.currentTarget.checked)}
                    />
                    {!copyToEnd && (
                      <NumberInput
                        size="xs" label="Вставить с дня" w={120} min={1}
                        value={copyDstDay} onChange={setCopyDstDay}
                      />
                    )}
                  </>
                )}

                <Button size="xs" onClick={handleCopy}>Скопировать</Button>
              </Group>
              <Text size="xs" c="dimmed" mt={6}>
                Тренировки в целевых днях будут заменены. Изменения вступят в силу
                после сохранения шаблона.
              </Text>
            </Paper>
          </Collapse>

          {showCalendar ? (
            <Stack gap="sm">
              <PlanCalendar
                view={calView}
                onViewChange={setCalView}
                displayDate={calDisplay}
                onNavigate={navigateCal}
                renderDay={renderTemplateDay}
                onDayClick={handleCalClick}
                selectedDate={selDayStr}
                planStart={startDate || undefined}
                planEnd={planEndDate}
                monthCellHeight={130}
                weekCellHeight={220}
              />
              {selIdx >= 0 && selIdx < schedule.length && (
                <Paper withBorder p="sm" radius="sm">
                  <Group justify="space-between" mb="xs">
                    <Text fw={600}>{getDayLabel(selIdx, startDate)}</Text>
                    <Group gap="xs">
                      <Menu shadow="md" position="bottom-end" withinPortal>
                        <Menu.Target>
                          <Button size="xs" variant="light">Копировать день →</Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Label>Скопировать этот день</Menu.Label>
                          <Menu.Item onClick={() => copyDays(selIdx, 1, selIdx + 7)}>
                            На следующую неделю ({getDayLabel(selIdx + 7, startDate)})
                          </Menu.Item>
                          <Menu.Item
                            disabled={selIdx + 1 >= schedule.length}
                            onClick={() => copyDays(selIdx, 1, selIdx + 1)}
                          >
                            На следующий день
                          </Menu.Item>
                          <Menu.Item onClick={() => copyDays(selIdx, 1, schedule.length)}>
                            В конец плана (новый день)
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                      <Button size="xs" variant="subtle" color="gray" onClick={() => setSelDayStr(null)}>✕</Button>
                    </Group>
                  </Group>
                  <Stack gap="sm">
                    {schedule[selIdx].map((day, wi) => (
                      <Box key={wi}>
                        {schedule[selIdx].length > 1 && (
                          <Text size="xs" c="dimmed" fw={600} mb={4}>
                            Тренировка {wi + 1} из {schedule[selIdx].length}
                          </Text>
                        )}
                        <DayCard
                          dayIdx={selIdx}
                          workoutIdx={wi}
                          day={day}
                          onChange={updateDay}
                          onRemove={() => removeWorkoutFromDay(selIdx, wi)}
                          canRemove={schedule[selIdx].length > 1}
                          label={getDayLabel(selIdx, startDate)}
                        />
                        {wi < schedule[selIdx].length - 1 && <Divider mt="xs" />}
                      </Box>
                    ))}
                    <Button size="xs" variant="light" onClick={() => addWorkoutToDay(selIdx)}>
                      Добавить тренировку
                    </Button>
                  </Stack>
                </Paper>
              )}
            </Stack>
          ) : (
            <Stack gap="sm">
              {schedule.map((dayWorkouts, idx) => (
                <Fragment key={idx}>
                  {idx % 7 === 0 && (
                    <Group justify="space-between" mt={idx > 0 ? 'xs' : 0}>
                      <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                        Неделя {Math.floor(idx / 7) + 1}
                      </Text>
                      <Menu shadow="md" position="bottom-end" withinPortal>
                        <Menu.Target>
                          <Button size="compact-xs" variant="subtle">Копировать неделю →</Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Label>Скопировать неделю {Math.floor(idx / 7) + 1}</Menu.Label>
                          {Array.from({ length: weekCount }, (_, w) => w)
                            .filter((w) => w !== Math.floor(idx / 7))
                            .map((w) => (
                              <Menu.Item
                                key={w}
                                onClick={() => copyDays(Math.floor(idx / 7) * 7, Math.min(7, schedule.length - Math.floor(idx / 7) * 7), w * 7)}
                              >
                                Заменить неделю {w + 1}
                              </Menu.Item>
                            ))}
                          <Menu.Divider />
                          <Menu.Item
                            onClick={() => copyDays(Math.floor(idx / 7) * 7, Math.min(7, schedule.length - Math.floor(idx / 7) * 7), schedule.length)}
                          >
                            Новая неделя в конце
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Group>
                  )}
                  <Paper withBorder p="xs" radius="sm">
                    <Stack gap="xs">
                      {dayWorkouts.map((day, wi) => (
                        <Box key={wi}>
                          {dayWorkouts.length > 1 && (
                            <Text size="xs" c="dimmed" fw={600} mb={4}>
                              Тренировка {wi + 1} из {dayWorkouts.length}
                            </Text>
                          )}
                          <DayCard
                            dayIdx={idx}
                            workoutIdx={wi}
                            day={day}
                            onChange={updateDay}
                            onRemove={() => removeWorkoutFromDay(idx, wi)}
                            canRemove={dayWorkouts.length > 1}
                            label={getDayLabel(idx, startDate)}
                          />
                          {wi < dayWorkouts.length - 1 && <Divider mt="xs" />}
                        </Box>
                      ))}
                      <Button size="xs" variant="light" onClick={() => addWorkoutToDay(idx)}>
                        Добавить тренировку
                      </Button>
                    </Stack>
                  </Paper>
                </Fragment>
              ))}
            </Stack>
          )}
        </Paper>

        {/* Summary */}
        <Paper withBorder p="md" radius="md">
          <Title order={4} mb="sm">Сводный объём недели</Title>
          <Group gap="xl">
            <Stack gap={2} align="center">
              <Text size="xl" fw={700}>{totalMin}</Text>
              <Text size="xs" c="dimmed">мин всего (цикл.)</Text>
            </Stack>
            <Stack gap={2} align="center">
              <Text size="xl" fw={700} c={hiPct > 20 ? 'red' : hiPct > 15 ? 'orange' : 'green'}>
                {hiPct}%
              </Text>
              <Text size="xs" c="dimmed">Z4+Z5 (высокая)</Text>
            </Stack>
            <Stack gap={2} align="center">
              <Text size="xl" fw={700} c={loPct < 60 ? 'orange' : 'green'}>
                {loPct}%
              </Text>
              <Text size="xs" c="dimmed">Z1+Z2 (базовая)</Text>
            </Stack>
            <Stack gap={2} align="center">
              <Text size="xl" fw={700}>{active}</Text>
              <Text size="xs" c="dimmed">тренировочных дней</Text>
            </Stack>
          </Group>
        </Paper>

        {/* Actions */}
        <Group justify="space-between">
          <Group gap="xs">
            {save.isSuccess && <Text c="green" size="sm">Сохранено!</Text>}
            {save.isError   && <Text c="red"   size="sm">Ошибка при сохранении</Text>}
            {adapt.isError  && <Text c="red"   size="sm">Ошибка при запуске расчёта</Text>}
          </Group>
          <Group gap="xs">
            <Button variant="light" loading={save.isPending} onClick={() => save.mutate()}>
              Сохранить шаблон
            </Button>
            <Button color="teal" loading={adapt.isPending} onClick={() => adapt.mutate()}>
              Запустить расчёт →
            </Button>
          </Group>
        </Group>
      </Stack>
    </Container>
  )
}
