import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Collapse,
  Container,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PlanCalendar, { isoDate } from '../components/PlanCalendar'
import SportIcon from '../components/SportIcon'
import { plansApi } from '../api/plans'
import { ZONE_HEX } from '../utils/zoneColors'

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

const SEG_TYPE_OPTIONS = [
  { value: 'warmup',   label: 'Разминка' },
  { value: 'work',     label: 'Рабочий' },
  { value: 'rest_seg', label: 'Отдых' },
  { value: 'cooldown', label: 'Заминка' },
]

const SEG_TYPE_LABELS: Record<string, string> = {
  warmup: 'Разм.', work: 'Раб.', rest_seg: 'Отд.', cooldown: 'Зам.',
}

const ZONE_BAR = ZONE_HEX

const TYPE_COLOR: Record<string, string> = {
  ski: 'blue', skiroll: 'cyan', run: 'teal', bike: 'green',
  strength: 'violet', recovery: 'indigo', rest: 'gray', other: 'dark',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Segment {
  _id: string
  seg_type: string
  zone: string
  duration_min: number
  repeats: number
  note: string
}

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
  name: string
  start_date: string
  duration_days: number
  description: string | null
  week_schedule: Record<string, unknown>[] | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mkSeg = (): Segment => ({
  _id: crypto.randomUUID(),
  seg_type: 'work',
  zone: 'Z3',
  duration_min: 5,
  repeats: 1,
  note: '',
})


const makeEmptySchedule = (n: number): DayConfig[] =>
  Array.from({ length: n }, (): DayConfig => ({
    workout_type: 'rest', workout_subtype: null, zone: 'Z1',
    duration_min: 0, description: '', is_interval: false, segments: [],
  }))

function fromBackend(saved: Record<string, unknown>[]): DayConfig[] {
  return saved.map((d) => {
    const segs = ((d.interval_structure as Record<string, unknown>[] | null) ?? []).map((s) => ({
      ...(s as object),
      _id: crypto.randomUUID(),
    })) as Segment[]
    return {
      workout_type:    (d.workout_type as string)    ?? 'run',
      workout_subtype: (d.workout_subtype as string | null) ?? null,
      zone:            (d.zone as string)            ?? 'Z2',
      duration_min:    (d.duration_min as number)    ?? 60,
      description:     (d.description as string)     ?? '',
      is_interval:     segs.length > 0,
      segments:        segs,
    }
  })
}

function toBackend(schedule: DayConfig[]) {
  return schedule.map((d) => {
    const isInterval = d.is_interval && d.segments.length > 0
    const dur = isInterval
      ? d.segments.reduce((s, seg) => s + seg.duration_min * seg.repeats, 0)
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
}

// ─── IntervalPreview ──────────────────────────────────────────────────────────

function IntervalPreview({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((s, seg) => s + seg.duration_min * seg.repeats, 0)
  if (!segments.length || total === 0) return null

  return (
    <Box mt="xs">
      <div style={{ display: 'flex', height: 28, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
        {segments.map((seg) => {
          const label = seg.repeats > 1
            ? `${seg.zone}×${seg.repeats}`
            : `${seg.zone} ${seg.duration_min}м`
          const tip = `${SEG_TYPE_LABELS[seg.seg_type] ?? seg.seg_type}: ${seg.zone}, ${seg.duration_min}мин × ${seg.repeats}${seg.note ? ` — ${seg.note}` : ''}`
          return (
            <Tooltip key={seg._id} label={tip} withArrow>
              <Box
                style={{
                  flex: seg.duration_min * seg.repeats,
                  background: ZONE_BAR[seg.zone] ?? '#aaa',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  fontSize: 10,
                  fontWeight: 700,
                  color: seg.zone === 'Z3' ? '#333' : '#fff',
                  minWidth: 16,
                  userSelect: 'none',
                  cursor: 'default',
                }}
              >
                {label}
              </Box>
            </Tooltip>
          )
        })}
      </div>
      <Text size="xs" c="dimmed" mt={4}>Суммарно: {total} мин</Text>
    </Box>
  )
}

// ─── IntervalBuilder ─────────────────────────────────────────────────────────

function IntervalBuilder({ segments, onUpdate }: { segments: Segment[]; onUpdate: (s: Segment[]) => void }) {
  const upd = (id: string, patch: Partial<Segment>) =>
    onUpdate(segments.map((s) => (s._id === id ? { ...s, ...patch } : s)))
  const del = (id: string) => onUpdate(segments.filter((s) => s._id !== id))

  return (
    <Box>
      {segments.length > 0 && (
        <Table verticalSpacing={4} fz="xs" mb="xs" withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Тип сегмента</Table.Th>
              <Table.Th w={68}>Зона</Table.Th>
              <Table.Th w={88}>Длит., мин</Table.Th>
              <Table.Th w={80}>Повтор.</Table.Th>
              <Table.Th>Заметка</Table.Th>
              <Table.Th w={32} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {segments.map((seg) => (
              <Table.Tr key={seg._id}>
                <Table.Td>
                  <Select data={SEG_TYPE_OPTIONS} value={seg.seg_type}
                    onChange={(v) => upd(seg._id, { seg_type: v ?? 'work' })}
                    size="xs" allowDeselect={false} w={118} />
                </Table.Td>
                <Table.Td>
                  <Select data={ZONE_OPTIONS} value={seg.zone}
                    onChange={(v) => upd(seg._id, { zone: v ?? 'Z2' })}
                    size="xs" allowDeselect={false} w={64} />
                </Table.Td>
                <Table.Td>
                  <NumberInput min={1} max={180} value={seg.duration_min}
                    onChange={(v) => upd(seg._id, { duration_min: Number(v) || 1 })}
                    size="xs" w={76} />
                </Table.Td>
                <Table.Td>
                  <NumberInput min={1} max={30} value={seg.repeats}
                    onChange={(v) => upd(seg._id, { repeats: Number(v) || 1 })}
                    size="xs" w={60} />
                </Table.Td>
                <Table.Td>
                  <TextInput value={seg.note} placeholder="—"
                    onChange={(e) => upd(seg._id, { note: e.target.value })}
                    size="xs" />
                </Table.Td>
                <Table.Td>
                  <ActionIcon color="red" variant="subtle" size="sm" onClick={() => del(seg._id)}>×</ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <Button size="xs" variant="light" onClick={() => onUpdate([...segments, mkSeg()])}>
        + Добавить сегмент
      </Button>
      <IntervalPreview segments={segments} />
    </Box>
  )
}

// ─── DayCard ─────────────────────────────────────────────────────────────────

function DayCard({ idx, day, onChange, label }: {
  idx: number
  day: DayConfig
  onChange: (idx: number, patch: Partial<DayConfig>) => void
  label: string
}) {
  const isCyclic  = CYCLIC_TYPES.has(day.workout_type)
  const isRest    = day.workout_type === 'rest'
  const hasSubtype = day.workout_type === 'ski' || day.workout_type === 'skiroll'
  const set = (patch: Partial<DayConfig>) => onChange(idx, patch)

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
              <IntervalBuilder segments={day.segments}
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

  const [name, setName]             = useState('')
  const [startDate, setStartDate]   = useState('')
  const [durationDays, setDurationDays] = useState<number | string>(7)
  const [descr, setDescr]           = useState('')
  const [schedule, setSchedule]     = useState<DayConfig[]>([])

  const [showCalendar, setShowCalendar] = useState(true)
  const [calView, setCalView]           = useState<'month' | 'week'>('month')
  const [calDisplay, setCalDisplay]     = useState<Date>(new Date())
  const [selDayStr, setSelDayStr]       = useState<string | null>(null)

  useEffect(() => {
    if (template) {
      setName(template.name)
      setStartDate(template.start_date)
      setDurationDays(template.duration_days)
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
    const day = schedule[idx]
    if (day.workout_type === 'rest') {
      return (
        <Box mt={2}>
          <SportIcon type="rest" size={26} color="#868e96" />
          <Text size="xs" c="dimmed" style={{ lineHeight: 1.2 }}>Отдых</Text>
        </Box>
      )
    }
    return (
      <Box mt={2}>
        <SportIcon type={day.workout_type} size={26} color="#343a40" />
        <Text size="xs" c="dimmed" style={{ lineHeight: 1.2 }}>
          {day.zone} · {day.duration_min}м
        </Text>
        {day.is_interval && day.segments.length > 0 && (
          <Text size="xs" c="blue" style={{ fontSize: 10 }}>интервал</Text>
        )}
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
      return [...prev, ...Array.from({ length: n - prev.length }, (): DayConfig => ({
        workout_type: 'rest', workout_subtype: null, zone: 'Z1',
        duration_min: 0, description: '', is_interval: false, segments: [],
      }))]
    })
  }

  const updateDay = (idx: number, patch: Partial<DayConfig>) =>
    setSchedule((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)))

  // ─── Summary stats ─────────────────────────────────────────────────────────
  let totalMin = 0
  const zoneMins: Record<string, number> = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0 }
  for (const d of schedule) {
    if (d.workout_type === 'rest') continue
    if (CYCLIC_TYPES.has(d.workout_type)) {
      if (d.is_interval && d.segments.length) {
        for (const seg of d.segments) {
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
      // нециклические: добавляем только к общему объёму
      totalMin += d.duration_min || 0
    }
  }
  const hiMin  = (zoneMins.Z4 ?? 0) + (zoneMins.Z5 ?? 0)
  const loMin  = (zoneMins.Z1 ?? 0) + (zoneMins.Z2 ?? 0)
  const hiPct  = totalMin > 0 ? Math.round((hiMin / totalMin) * 100) : 0
  const loPct  = totalMin > 0 ? Math.round((loMin / totalMin) * 100) : 0
  const active = schedule.filter((d) => d.workout_type !== 'rest').length

  // ─── Mutations ─────────────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: () =>
      plansApi.updateTemplate(templateId!, {
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
    mutationFn: () => plansApi.adaptTemplate(templateId!),
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
              <Text size="sm" c="dimmed">{schedule.length} дн. · {Math.ceil(schedule.length / 7)} нед.</Text>
            </Group>
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
                    <Button size="xs" variant="subtle" color="gray" onClick={() => setSelDayStr(null)}>✕</Button>
                  </Group>
                  <DayCard
                    idx={selIdx}
                    day={schedule[selIdx]}
                    onChange={updateDay}
                    label={getDayLabel(selIdx, startDate)}
                  />
                </Paper>
              )}
            </Stack>
          ) : (
            <Stack gap="sm">
              {schedule.map((day, idx) => (
                <Fragment key={idx}>
                  {idx % 7 === 0 && (
                    <Text size="xs" fw={600} c="dimmed" tt="uppercase" mt={idx > 0 ? 'xs' : 0}>
                      Неделя {Math.floor(idx / 7) + 1}
                    </Text>
                  )}
                  <DayCard idx={idx} day={day} onChange={updateDay} label={getDayLabel(idx, startDate)} />
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
