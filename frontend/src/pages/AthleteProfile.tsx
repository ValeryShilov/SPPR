import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Container,
  Grid,
  Group,
  Loader,
  Menu,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { athletesApi } from '../api/athletes'
import AlertsPanel from '../components/AlertsPanel'
import SportIcon, { SPORT_COLOR, SPORT_LABEL } from '../components/SportIcon'
import WorkoutDetailModal, { type WorkoutDetail } from '../components/WorkoutDetailModal'
import { ZONE_BADGE_COLOR } from '../utils/zoneColors'

// ─── Типы ────────────────────────────────────────────────────────────────────

interface Marker {
  id: string
  date_recorded: string
  resting_hr: number | null
  max_hr: number | null
  threshold_hr: number | null
  hrv_baseline: number | null
  source: 'measured' | 'formula'
  notes: string | null
}

interface HRZone {
  zone: string
  label: string
  hr_min: number
  hr_max: number
}

interface ZonesResponse {
  max_hr: number
  source: string
  zones: HRZone[]
}

interface WorkoutHistoryItem {
  id: string
  planned_date: string
  workout_type: string | null
  workout_subtype: string | null
  description: string | null
  planned_duration_min: number | null
  planned_tss: number | null
  actual_duration_min: number | null
  actual_tss: number | null
  actual_distance_km: number | null
  avg_hr: number | null
  max_hr: number | null
  hr_zone1_min: number | null
  hr_zone2_min: number | null
  hr_zone3_min: number | null
  hr_zone4_min: number | null
  hr_zone5_min: number | null
  target_zone: string | null
  status: string
}

type PeriodType = 'week' | 'month' | 'year' | 'custom'

interface AthleteData {
  id: string
  first_name: string
  last_name: string
  birth_date: string
  gender: string
  qualification: string | null
}

// ─── Вспомогательные компоненты ──────────────────────────────────────────────

const SOURCE_META = {
  measured: { color: 'green', label: 'Измерено' },
  formula:  { color: 'gray',  label: 'Формула'  },
} as const


function planFactColor(planned: number | null, actual: number | null): string | undefined {
  if (planned == null || actual == null) return undefined
  const ratio = actual / planned
  if (ratio >= 0.9) return 'var(--mantine-color-green-1)'
  if (ratio >= 0.6) return 'var(--mantine-color-yellow-1)'
  return 'var(--mantine-color-red-1)'
}

// ─── Модальное окно маркера ───────────────────────────────────────────────────

interface MarkerForm {
  date_recorded: string
  resting_hr: number | string
  max_hr: number | string
  threshold_hr: number | string
  hrv_baseline: number | string
  source: string
  notes: string
}

function emptyForm(marker?: Marker): MarkerForm {
  return {
    date_recorded: marker?.date_recorded ?? new Date().toISOString().slice(0, 10),
    resting_hr:    marker?.resting_hr    ?? '',
    max_hr:        marker?.max_hr        ?? '',
    threshold_hr:  marker?.threshold_hr  ?? '',
    hrv_baseline:  marker?.hrv_baseline  ?? '',
    source:        marker?.source        ?? 'measured',
    notes:         marker?.notes         ?? '',
  }
}

function MarkerModal({
  athleteId,
  marker,
  opened,
  onClose,
}: {
  athleteId: string
  marker: Marker | null
  opened: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<MarkerForm>(() => emptyForm(marker ?? undefined))

  const set = (field: keyof MarkerForm) => (val: number | string) =>
    setForm((f) => ({ ...f, [field]: val }))

  const payload = () => ({
    date_recorded:  form.date_recorded,
    resting_hr:     form.resting_hr    !== '' ? Number(form.resting_hr)    : null,
    max_hr:         form.max_hr        !== '' ? Number(form.max_hr)        : null,
    threshold_hr:   form.threshold_hr  !== '' ? Number(form.threshold_hr)  : null,
    hrv_baseline:   form.hrv_baseline  !== '' ? Number(form.hrv_baseline)  : null,
    source:         form.source,
    notes:          form.notes || null,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['markers', athleteId] })
    queryClient.invalidateQueries({ queryKey: ['zones', athleteId] })
    onClose()
  }

  const update = useMutation({
    mutationFn: () => athletesApi.updateMarker(marker!.id, payload()),
    onSuccess: invalidate,
  })
  const create = useMutation({
    mutationFn: () => athletesApi.addMarker(athleteId, payload()),
    onSuccess: invalidate,
  })

  const isEdit = marker !== null
  const isPending = update.isPending || create.isPending

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? 'Редактировать маркер' : 'Добавить маркер'}
      size="sm"
    >
      <Stack gap="sm">
        <input
          type="date"
          value={form.date_recorded}
          onChange={(e) => setForm((f) => ({ ...f, date_recorded: e.target.value }))}
          style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ced4da', fontSize: 14 }}
        />
        <NumberInput label="ЧСС покоя"   value={form.resting_hr}   onChange={set('resting_hr')}   min={30} max={120} />
        <NumberInput label="ЧСС макс"    value={form.max_hr}       onChange={set('max_hr')}       min={100} max={230} />
        <NumberInput label="ПАНО (ЧСС)"  value={form.threshold_hr} onChange={set('threshold_hr')} min={80} max={220} />
        <NumberInput label="ВСР (HRV)"   value={form.hrv_baseline} onChange={set('hrv_baseline')} min={0} max={300} />
        <Select
          label="Источник"
          value={form.source}
          onChange={(v) => setForm((f) => ({ ...f, source: v ?? 'measured' }))}
          data={[
            { value: 'measured', label: 'Измерено' },
            { value: 'formula',  label: 'Формула'  },
          ]}
        />
        <Textarea
          label="Примечания"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={2}
        />
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>Отмена</Button>
          <Button
            loading={isPending}
            onClick={() => isEdit ? update.mutate() : create.mutate()}
          >
            Сохранить
          </Button>
        </Group>
        {(update.isError || create.isError) && (
          <Text c="red" size="sm">Ошибка при сохранении</Text>
        )}
      </Stack>
    </Modal>
  )
}

// ─── Таблица маркеров ────────────────────────────────────────────────────────

function MarkersBlock({ athleteId }: { athleteId: string }) {
  const [modalMarker, setModalMarker] = useState<Marker | null | false>(false)

  const { data: markers = [], isLoading } = useQuery<Marker[]>({
    queryKey: ['markers', athleteId],
    queryFn: () => athletesApi.getMarkers(athleteId),
  })

  return (
    <Paper p="md" withBorder radius="md" h="100%">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Физиологические маркеры</Title>
        <Button size="xs" variant="light" onClick={() => setModalMarker(null)}>
          + Добавить
        </Button>
      </Group>

      {isLoading && <Loader size="sm" />}

      {!isLoading && markers.length === 0 && (
        <Text size="sm" c="dimmed">Маркеры не добавлены</Text>
      )}

      {markers.length > 0 && (
        <Table withTableBorder withColumnBorders fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Дата</Table.Th>
              <Table.Th>ЧСС пок.</Table.Th>
              <Table.Th>ЧСС макс</Table.Th>
              <Table.Th>ПАНО</Table.Th>
              <Table.Th>ВСР</Table.Th>
              <Table.Th>Источник</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {markers.map((m) => (
              <Table.Tr key={m.id}>
                <Table.Td>{m.date_recorded}</Table.Td>
                <Table.Td>{m.resting_hr ?? '—'}</Table.Td>
                <Table.Td>{m.max_hr ?? '—'}</Table.Td>
                <Table.Td>{m.threshold_hr ?? '—'}</Table.Td>
                <Table.Td>{m.hrv_baseline ?? '—'}</Table.Td>
                <Table.Td>
                  <Tooltip label={m.notes ?? ''} disabled={!m.notes} withArrow>
                    <Badge
                      color={SOURCE_META[m.source]?.color ?? 'gray'}
                      variant="light"
                      size="sm"
                    >
                      {SOURCE_META[m.source]?.label ?? m.source}
                    </Badge>
                  </Tooltip>
                </Table.Td>
                <Table.Td>
                  <Button
                    size="xs"
                    variant="subtle"
                    onClick={() => setModalMarker(m)}
                  >
                    ✎
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <MarkerModal
        athleteId={athleteId}
        marker={modalMarker === false ? null : modalMarker}
        opened={modalMarker !== false}
        onClose={() => setModalMarker(false)}
      />
    </Paper>
  )
}

// ─── Таблица зон ─────────────────────────────────────────────────────────────

function ZonesBlock({ athleteId }: { athleteId: string }) {
  const { data, isLoading, isError } = useQuery<ZonesResponse>({
    queryKey: ['zones', athleteId],
    queryFn: () => athletesApi.getZones(athleteId),
    retry: false,
  })

  return (
    <Paper p="md" withBorder radius="md" h="100%">
      <Title order={4} mb="sm">
        Пульсовые зоны
        {data && (
          <Text span size="sm" c="dimmed" fw={400} ml="xs">
            ЧССmax: {data.max_hr} · {data.source === 'measured' ? 'измерено' : 'формула'}
          </Text>
        )}
      </Title>

      {isLoading && <Loader size="sm" />}
      {isError && <Text size="sm" c="dimmed">Нет данных — добавьте маркер с ЧССmax</Text>}

      {data && (
        <Table withTableBorder withColumnBorders fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Зона</Table.Th>
              <Table.Th>Название</Table.Th>
              <Table.Th>ЧСС мин</Table.Th>
              <Table.Th>ЧСС макс</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.zones.map((z) => (
              <Table.Tr key={z.zone}>
                <Table.Td>
                  <Badge color={ZONE_BADGE_COLOR[z.zone] ?? 'gray'} variant="light" size="sm">
                    {z.zone}
                  </Badge>
                </Table.Td>
                <Table.Td>{z.label}</Table.Td>
                <Table.Td>{z.hr_min}</Table.Td>
                <Table.Td>{z.hr_max}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Paper>
  )
}

// ─── Период для истории ───────────────────────────────────────────────────────

const MONTHS_GEN_RU = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']
const MONTHS_RU     = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

function toIso(d: Date) { return d.toISOString().split('T')[0] }

function getWeekBounds(offset: number): [string, string] {
  const now = new Date()
  const daysSinceMonday = (now.getDay() + 6) % 7
  const mon = new Date(now); mon.setDate(now.getDate() - daysSinceMonday + offset * 7); mon.setHours(0,0,0,0)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  return [toIso(mon), toIso(sun)]
}

function getMonthBounds(offset: number): [string, string] {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const last  = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  return [toIso(first), toIso(last)]
}

function getYearBounds(offset: number): [string, string] {
  const y = new Date().getFullYear() + offset
  return [`${y}-01-01`, `${y}-12-31`]
}

function getPeriodBounds(type: PeriodType, offset: number, custom: [string, string]): [string, string] {
  if (type === 'week')  return getWeekBounds(offset)
  if (type === 'month') return getMonthBounds(offset)
  if (type === 'year')  return getYearBounds(offset)
  return custom
}

function getPeriodLabel(type: PeriodType, offset: number): string {
  if (type === 'week') {
    const [from, to] = getWeekBounds(offset)
    const d1 = new Date(from + 'T00:00:00')
    const d2 = new Date(to   + 'T00:00:00')
    if (d1.getMonth() === d2.getMonth())
      return `${d1.getDate()}–${d2.getDate()} ${MONTHS_GEN_RU[d1.getMonth()]} ${d1.getFullYear()}`
    return `${d1.getDate()} ${MONTHS_GEN_RU[d1.getMonth()]} – ${d2.getDate()} ${MONTHS_GEN_RU[d2.getMonth()]} ${d2.getFullYear()}`
  }
  if (type === 'month') {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() + offset, 1)
    return `${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}`
  }
  if (type === 'year') return `${new Date().getFullYear() + offset}`
  return ''
}

const PERIOD_MENU_LABELS: Record<PeriodType, string> = {
  week:   'Недельный отчет',
  month:  'Месячный отчет',
  year:   'Годовой отчет',
  custom: 'Настраиваемый период',
}

// ─── История тренировок ───────────────────────────────────────────────────────

function HistoryBlock({ athleteId }: { athleteId: string }) {
  const [periodType, setPeriodType]         = useState<PeriodType>('month')
  const [offset, setOffset]                 = useState(0)
  const [customFrom, setCustomFrom]         = useState('')
  const [customTo, setCustomTo]             = useState('')
  const [menuOpen, setMenuOpen]             = useState(false)
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutDetail | null>(null)

  const today = toIso(new Date())
  const effectiveCustom: [string, string] = [
    customFrom || today,
    customTo   || today,
  ]
  const [dateFrom, dateTo] = getPeriodBounds(periodType, offset, effectiveCustom)

  const { data: history = [], isLoading } = useQuery<WorkoutHistoryItem[]>({
    queryKey: ['history', athleteId, dateFrom, dateTo],
    queryFn: () => athletesApi.getHistory(athleteId, { date_from: dateFrom, date_to: dateTo }),
  })

  const canGoNext = periodType !== 'custom' && offset < 0

  return (
    <Paper p="md" withBorder radius="md">
      {/* Header row */}
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Title order={4}>История тренировок</Title>

        <Group gap={4} wrap="nowrap">
          <ActionIcon variant="subtle" size="sm" onClick={() => setOffset((o) => o - 1)} disabled={periodType === 'custom'}>
            ◄
          </ActionIcon>

          <Menu opened={menuOpen} onClose={() => setMenuOpen(false)} position="bottom-end">
            <Menu.Target>
              <UnstyledButton onClick={() => setMenuOpen((v) => !v)}>
                <Box
                  px="sm"
                  py={4}
                  style={{
                    border: '1px solid #dee2e6',
                    borderRadius: 6,
                    cursor: 'pointer',
                    minWidth: 190,
                    textAlign: 'center',
                  }}
                >
                  <Text size="sm" fw={500}>{PERIOD_MENU_LABELS[periodType]}</Text>
                  {periodType !== 'custom' && (
                    <Text size="xs" c="dimmed">{getPeriodLabel(periodType, offset)}</Text>
                  )}
                </Box>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              {(Object.keys(PERIOD_MENU_LABELS) as PeriodType[]).map((t) => (
                <Menu.Item
                  key={t}
                  onClick={() => { setPeriodType(t); setOffset(0); setMenuOpen(false) }}
                  style={{ backgroundColor: periodType === t ? '#C8102E' : undefined, color: periodType === t ? '#fff' : undefined }}
                >
                  {PERIOD_MENU_LABELS[t]}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>

          <ActionIcon variant="subtle" size="sm" onClick={() => setOffset((o) => o + 1)} disabled={periodType === 'custom' || !canGoNext}>
            ►
          </ActionIcon>
        </Group>
      </Group>

      {/* Custom date pickers */}
      {periodType === 'custom' && (
        <Group mb="sm" gap="xs">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ced4da', fontSize: 13 }}
          />
          <Text size="sm" c="dimmed">—</Text>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ced4da', fontSize: 13 }}
          />
        </Group>
      )}

      {isLoading && <Loader size="sm" />}

      {!isLoading && history.length === 0 && (
        <Text size="sm" c="dimmed">Тренировок за период нет</Text>
      )}

      {history.length > 0 && (
        <ScrollArea h={360}>
          <Table withTableBorder withColumnBorders fz="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Дата</Table.Th>
                <Table.Th>Тип</Table.Th>
                <Table.Th>Зона</Table.Th>
                <Table.Th ta="right">План, мин</Table.Th>
                <Table.Th ta="right">Факт, мин</Table.Th>
                <Table.Th ta="right">TSS пл.</Table.Th>
                <Table.Th ta="right">TSS ф.</Table.Th>
                <Table.Th ta="right">Откл.</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {history.map((w) => {
                const pct =
                  w.planned_tss && w.actual_tss
                    ? Math.round((w.actual_tss / w.planned_tss) * 100)
                    : null
                const rowBg = planFactColor(w.planned_tss, w.actual_tss)
                const stype = w.workout_type ?? 'other'
                return (
                  <Table.Tr
                    key={w.id}
                    style={{ background: rowBg, cursor: 'pointer' }}
                    onClick={() => setSelectedWorkout({ ...w })}
                  >
                    <Table.Td>{new Date(w.planned_date).toLocaleDateString('ru-RU')}</Table.Td>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        <SportIcon type={stype} size={18} color={SPORT_COLOR[stype]} />
                        <Text size="xs">{SPORT_LABEL[stype] ?? stype}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      {w.target_zone
                        ? <Badge color={ZONE_BADGE_COLOR[w.target_zone] ?? 'gray'} size="xs" variant="light">{w.target_zone}</Badge>
                        : '—'}
                    </Table.Td>
                    <Table.Td ta="right">{w.planned_duration_min ?? '—'}</Table.Td>
                    <Table.Td ta="right">{w.actual_duration_min ?? '—'}</Table.Td>
                    <Table.Td ta="right">{w.planned_tss?.toFixed(1) ?? '—'}</Table.Td>
                    <Table.Td ta="right">{w.actual_tss?.toFixed(1) ?? '—'}</Table.Td>
                    <Table.Td ta="right" fw={pct != null ? 600 : 400}>
                      {pct != null ? `${pct}%` : '—'}
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}

      {selectedWorkout && (
        <WorkoutDetailModal
          workout={selectedWorkout}
          onClose={() => setSelectedWorkout(null)}
        />
      )}
    </Paper>
  )
}

// ─── Страница ─────────────────────────────────────────────────────────────────

const QUAL_LABELS: Record<string, string> = {
  'МСМК': 'МСМК', 'МС': 'МС', 'КМС': 'КМС', 'I': 'I разряд',
  'II': 'II разряд', 'III': 'III разряд',
}

export default function AthleteProfile() {
  const { id } = useParams<{ id: string }>()

  const { data: athlete, isLoading } = useQuery<AthleteData>({
    queryKey: ['athlete', id],
    queryFn: () => athletesApi.get(id!),
    enabled: !!id,
  })

  if (isLoading) return <Container py="xl"><Loader /></Container>
  if (!athlete || !id) return <Container py="xl"><Text c="red">Атлет не найден</Text></Container>

  const age = new Date().getFullYear() - new Date(athlete.birth_date).getFullYear()

  return (
    <Container size="xl" py="xl">
      {/* Шапка профиля */}
      <Paper p="md" withBorder radius="md" mb="lg">
        <Group>
          <Stack gap={2}>
            <Title order={2}>{athlete.last_name} {athlete.first_name}</Title>
            <Group gap="xs">
              <Text size="sm" c="dimmed">{age} лет · {athlete.gender === 'm' ? 'муж.' : 'жен.'}</Text>
              {athlete.qualification && (
                <Badge color="blue" variant="light">
                  {QUAL_LABELS[athlete.qualification] ?? athlete.qualification}
                </Badge>
              )}
            </Group>
          </Stack>
        </Group>
      </Paper>

      {/* Маркеры + Зоны — две колонки */}
      <Grid mb="lg" gutter="md">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <MarkersBlock athleteId={id} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <ZonesBlock athleteId={id} />
        </Grid.Col>
      </Grid>

      {/* Активные алерты */}
      <Paper p="md" withBorder radius="md" mb="lg">
        <AlertsPanel athleteId={id} />
      </Paper>

      {/* История тренировок */}
      <HistoryBlock athleteId={id} />
    </Container>
  )
}
