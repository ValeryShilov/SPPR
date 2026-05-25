import {
  ActionIcon,
  Box,
  Group,
  Menu,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { analyticsApi } from '../api/analytics'
import AlertsPanel from './AlertsPanel'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LoadPoint {
  date: string; daily_tss: number; atl_7d: number; ctl_42d: number; tsb: number
}
interface PlanFactPoint {
  week_start: string; planned_tss: number; actual_tss: number
}
interface VolumeByType {
  workout_type: string; total_duration_min: number; total_distance_km: number | null; sessions: number
}
interface VolumeWeekEntry {
  workout_type: string; duration_min: number; distance_km: number | null
}
interface VolumeWeekPoint {
  week_start: string; entries: VolumeWeekEntry[]
}
interface VolumeResponse {
  athlete_id: string; by_type: VolumeByType[]; weekly: VolumeWeekPoint[]; daily: VolumeWeekPoint[]
}

export type PeriodType = 'week' | 'month' | 'year' | 'custom'

// ─── Constants ────────────────────────────────────────────────────────────────

const COLOR_ATL     = '#FB8C00'
const COLOR_CTL     = '#1976D2'
const COLOR_TSB     = '#6A1B9A'
const COLOR_TSB_POS = '#4CAF50'
const COLOR_TSB_NEG = '#E53935'
const COLOR_PLAN    = '#1976D2'
const COLOR_FACT    = '#43A047'

const SPORT_COLOR: Record<string, string> = {
  ski: '#228be6', skiroll: '#4dabf7', run: '#2f9e44', bike: '#0ca678',
  strength: '#e8590c', recovery: '#7048e8', rest: '#adb5bd', other: '#495057',
}
const SPORT_LABEL: Record<string, string> = {
  ski: 'Лыжи', skiroll: 'Лыжероллеры', run: 'Бег', bike: 'Велосипед',
  strength: 'Силовая', recovery: 'Восстановление', rest: 'Отдых', other: 'Прочее',
}
const MONTHS_RU     = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const MONTHS_GEN_RU = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']

// ─── Period helpers ───────────────────────────────────────────────────────────

export function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function isoToday()     { return toIso(new Date()) }
export function isoNDaysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return toIso(d)
}

export function getWeekBounds(offset: number): [string, string] {
  const now = new Date()
  const daysSinceMonday = (now.getDay() + 6) % 7
  const mon = new Date(now); mon.setDate(now.getDate() - daysSinceMonday + offset * 7); mon.setHours(0,0,0,0)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  return [toIso(mon), toIso(sun)]
}

export function getMonthBounds(offset: number): [string, string] {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const last  = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  return [toIso(first), toIso(last)]
}

export function getYearBounds(offset: number): [string, string] {
  const y = new Date().getFullYear() + offset
  return [`${y}-01-01`, `${y}-12-31`]
}

export function getPeriodBounds(type: PeriodType, offset: number, custom: [string, string]): [string, string] {
  if (type === 'week')   return getWeekBounds(offset)
  if (type === 'month')  return getMonthBounds(offset)
  if (type === 'year')   return getYearBounds(offset)
  return custom
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000)
}

export function getGranularity(type: PeriodType, from: string, to: string): 'daily' | 'weekly' {
  if (type === 'week') return 'daily'
  if (type === 'custom') return daysBetween(from, to) < 31 ? 'daily' : 'weekly'
  return 'weekly'
}

const PERIOD_MENU_LABELS: Record<PeriodType, string> = {
  week:   'Недельный отчет',
  month:  'Месячный отчет',
  year:   'Годовой отчет',
  custom: 'Настраиваемый период',
}

export function getPeriodLabel(type: PeriodType, offset: number): string {
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
  if (type === 'year')  return `${new Date().getFullYear() + offset}`
  return ''
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtDayMonth(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}`
}
function fmtDuration(totalMin: number) {
  const h = Math.floor(totalMin / 60); const m = totalMin % 60
  return m === 0 ? `${h}ч` : `${h}ч ${m}м`
}
function sportColor(t: string) { return SPORT_COLOR[t] ?? '#868e96' }
function sportLabel(t: string) { return SPORT_LABEL[t] ?? t }

// ─── Tooltips ─────────────────────────────────────────────────────────────────

interface TipProps {
  active?: boolean
  payload?: { name: string; value: number; color: string; dataKey: string }[]
  label?: string
}

function LoadTooltip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length || !label) return null
  return (
    <Paper p="xs" withBorder shadow="sm" style={{ minWidth: 130 }}>
      <Text size="xs" fw={600} mb={4}>{fmtDayMonth(label)}</Text>
      {payload.filter(p => !['tsb_pos','tsb_neg'].includes(p.dataKey)).map(p => (
        <Text key={p.dataKey} size="xs" style={{ color: p.color }}>{p.name}: {Number(p.value).toFixed(1)}</Text>
      ))}
    </Paper>
  )
}
function PlanFactTooltip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length || !label) return null
  return (
    <Paper p="xs" withBorder shadow="sm" style={{ minWidth: 140 }}>
      <Text size="xs" fw={600} mb={4}>Нед. с {fmtDayMonth(label)}</Text>
      {payload.map(p => (
        <Text key={p.dataKey} size="xs" style={{ color: p.color }}>{p.name}: {Math.round(Number(p.value))}</Text>
      ))}
    </Paper>
  )
}
function WeeklyVolumeTip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length || !label) return null
  const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0)
  return (
    <Paper p="xs" withBorder shadow="sm" style={{ minWidth: 160 }}>
      <Text size="xs" fw={600} mb={4}>Нед. с {fmtDayMonth(label)}</Text>
      {payload.map(p => (
        <Text key={p.dataKey} size="xs" style={{ color: p.color }}>{sportLabel(p.name)}: {Number(p.value).toFixed(1)}ч</Text>
      ))}
      <Text size="xs" fw={600} mt={4}>Итого: {total.toFixed(1)}ч</Text>
    </Paper>
  )
}

function LoadLegend() {
  const items = [
    { color: COLOR_ATL,            label: 'ATL (острая)',        type: 'line' },
    { color: COLOR_CTL,            label: 'CTL (хроническая)',   type: 'line' },
    { color: COLOR_TSB,            label: 'TSB (форма)',          type: 'dash' },
    { color: COLOR_TSB_POS + '55', label: 'TSB > 0 — свежесть', type: 'area' },
    { color: COLOR_TSB_NEG + '55', label: 'TSB < 0 — усталость', type: 'area' },
  ]
  return (
    <Group gap="md" mb="sm" px={4} wrap="wrap">
      {items.map(({ color, label, type }) => (
        <Group key={label} gap={6} wrap="nowrap">
          {type === 'area'
            ? <Box w={14} h={14} style={{ backgroundColor: color, borderRadius: 3 }} />
            : <Box w={18} h={3} style={{ backgroundColor: color, borderRadius: 2,
                backgroundImage: type === 'dash'
                  ? `repeating-linear-gradient(90deg,${color} 0 5px,transparent 5px 8px)` : 'none' }} />}
          <Text size="xs" c="dimmed">{label}</Text>
        </Group>
      ))}
    </Group>
  )
}

function EmptyChart({ height, loading }: { height: number; loading: boolean }) {
  return (
    <Box h={height} style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
      <Text c="dimmed" size="sm">{loading ? 'Загрузка…' : 'Нет данных за выбранный период'}</Text>
    </Box>
  )
}

// ─── Period selector ──────────────────────────────────────────────────────────

interface PeriodSelectorProps {
  type: PeriodType
  offset: number
  customFrom: string
  customTo: string
  onChangeType: (t: PeriodType) => void
  onChangeOffset: (newOffset: number) => void
  onChangeCustomFrom: (v: string) => void
  onChangeCustomTo:   (v: string) => void
}

export function VolumePeriodSelector(props: PeriodSelectorProps) {
  const { type, offset, customFrom, customTo,
          onChangeType, onChangeOffset, onChangeCustomFrom, onChangeCustomTo } = props

  const periodLabel = type !== 'custom' ? getPeriodLabel(type, offset) : 'Период'

  return (
    <div style={{ marginBottom: 16 }}>
      <Group gap={0} align="center" wrap="nowrap">
        {type !== 'custom' && (
          <>
            <ActionIcon
              variant="subtle" color="dark" size="md"
              onClick={() => onChangeOffset(offset - 1)}
              style={{ borderRadius: '4px 0 0 4px', border: '1px solid #dee2e6', borderRight: 'none' }}
            >
              ◄
            </ActionIcon>
            <ActionIcon
              variant="subtle" color="dark" size="md"
              onClick={() => onChangeOffset(offset + 1)}
              style={{ borderRadius: 0, border: '1px solid #dee2e6', borderRight: 'none' }}
            >
              ►
            </ActionIcon>
          </>
        )}

        <Menu position="bottom-start" offset={2}>
          <Menu.Target>
            <UnstyledButton style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px',
              border: '1px solid #dee2e6',
              borderRadius: type !== 'custom' ? '0 4px 4px 0' : 4,
              fontSize: 14, fontWeight: 500, color: '#212529',
              background: '#fff',
              cursor: 'pointer',
              userSelect: 'none',
            }}>
              {periodLabel}
              <span style={{ fontSize: 10, color: '#868e96' }}>▼</span>
            </UnstyledButton>
          </Menu.Target>

          <Menu.Dropdown style={{ minWidth: 200 }}>
            {(['week', 'month', 'year', 'custom'] as PeriodType[]).map(t => (
              <Menu.Item
                key={t}
                onClick={() => onChangeType(t)}
                style={{
                  backgroundColor: type === t ? '#C8102E' : undefined,
                  color: type === t ? '#fff' : undefined,
                  fontWeight: type === t ? 600 : 400,
                }}
              >
                {PERIOD_MENU_LABELS[t]}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      </Group>

      {type === 'custom' && (
        <Group gap={6} align="flex-end" mt="sm" wrap="wrap">
          <TextInput type="date" size="sm" label="С" w={160}
            value={customFrom} max={customTo}
            onChange={e => onChangeCustomFrom(e.target.value)} />
          <Text size="sm" pb={6}>—</Text>
          <TextInput type="date" size="sm" label="По" w={160}
            value={customTo} min={customFrom}
            onChange={e => onChangeCustomTo(e.target.value)} />
        </Group>
      )}
    </div>
  )
}

// ─── Volume section ───────────────────────────────────────────────────────────

function VolumeSection({ data, granularity }: { data: VolumeResponse; granularity: 'daily' | 'weekly' }) {
  const { by_type, weekly, daily } = data
  const chartPoints = granularity === 'daily' ? daily : weekly

  if (by_type.length === 0)
    return <Text c="dimmed" size="sm" py="md" ta="center">Нет данных о выполненных тренировках за выбранный период</Text>

  const totalMin      = by_type.reduce((s, b) => s + Number(b.total_duration_min), 0)
  const totalKm       = by_type.reduce((s, b) => s + Number(b.total_distance_km ?? 0), 0)
  const totalSessions = by_type.reduce((s, b) => s + b.sessions, 0)
  const hasDistance   = totalKm > 0

  const pieHours = by_type.map(b => ({
    name: sportLabel(b.workout_type), type: b.workout_type,
    value: parseFloat((b.total_duration_min / 60).toFixed(2)),
  }))
  const pieKm = by_type.filter(b => (b.total_distance_km ?? 0) > 0).map(b => ({
    name: sportLabel(b.workout_type), type: b.workout_type,
    value: parseFloat(Number(b.total_distance_km).toFixed(1)),
  }))

  const allTypes  = Array.from(new Set(by_type.map(b => b.workout_type)))
  const chartFlat = chartPoints.map(wp => {
    const obj: Record<string, string | number> = { period: wp.week_start }
    wp.entries.forEach(e => { obj[e.workout_type] = parseFloat((e.duration_min / 60).toFixed(2)) })
    return obj
  })
  const chartTitle = granularity === 'daily' ? 'Объёмы по дням (часы)' : 'Недельные объёмы (часы)'

  const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: {
    cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; percent: number
  }) => {
    if (percent < 0.06) return null
    const RADIAN = Math.PI / 180
    const r = innerRadius + (outerRadius - innerRadius) * 0.6
    return (
      <text x={cx + r * Math.cos(-midAngle * RADIAN)} y={cy + r * Math.sin(-midAngle * RADIAN)}
        fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    )
  }

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" mb={4}>Общий объём</Text>
          <Text size="xl" fw={700}>{fmtDuration(totalMin)}</Text>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" mb={4}>Дистанция</Text>
          <Text size="xl" fw={700}>{hasDistance ? `${totalKm.toFixed(1)} км` : '—'}</Text>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" mb={4}>Тренировок</Text>
          <Text size="xl" fw={700}>{totalSessions}</Text>
        </Paper>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, sm: hasDistance ? 2 : 1 }} spacing="md">
        <Paper withBorder p="md" radius="md">
          <Title order={5} mb="xs">По видам — часы</Title>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieHours} dataKey="value" cx="50%" cy="50%"
                outerRadius={85} labelLine={false} label={renderPieLabel}>
                {pieHours.map(e => <Cell key={e.type} fill={sportColor(e.type)} />)}
              </Pie>
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as { name: string; value: number }
                return <Paper p="xs" withBorder shadow="sm"><Text size="xs" fw={600}>{p.name}</Text><Text size="xs">{p.value}ч</Text></Paper>
              }} />
            </PieChart>
          </ResponsiveContainer>
          <Group gap={8} justify="center" wrap="wrap" px={8} mt={4}>
            {pieHours.map(e => (
              <Group key={e.type} gap={4} wrap="nowrap">
                <Box w={10} h={10} style={{ borderRadius: 2, backgroundColor: sportColor(e.type), flexShrink: 0 }} />
                <Text size="xs" c="dimmed">{e.name} {e.value}ч</Text>
              </Group>
            ))}
          </Group>
        </Paper>

        {hasDistance && (
          <Paper withBorder p="md" radius="md">
            <Title order={5} mb="xs">По видам — километры</Title>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieKm} dataKey="value" cx="50%" cy="50%"
                  outerRadius={85} labelLine={false} label={renderPieLabel}>
                  {pieKm.map(e => <Cell key={e.type} fill={sportColor(e.type)} />)}
                </Pie>
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const p = payload[0].payload as { name: string; value: number }
                  return <Paper p="xs" withBorder shadow="sm"><Text size="xs" fw={600}>{p.name}</Text><Text size="xs">{p.value} км</Text></Paper>
                }} />
              </PieChart>
            </ResponsiveContainer>
            <Group gap={8} justify="center" wrap="wrap" px={8} mt={4}>
              {pieKm.map(e => (
                <Group key={e.type} gap={4} wrap="nowrap">
                  <Box w={10} h={10} style={{ borderRadius: 2, backgroundColor: sportColor(e.type), flexShrink: 0 }} />
                  <Text size="xs" c="dimmed">{e.name} {e.value}км</Text>
                </Group>
              ))}
            </Group>
          </Paper>
        )}
      </SimpleGrid>

      {chartFlat.length > 0 && (
        <Paper withBorder p="md" radius="md">
          <Title order={5} mb={4}>{chartTitle}</Title>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartFlat} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" vertical={false} />
              <XAxis dataKey="period" tickFormatter={fmtDayMonth}
                interval={Math.max(0, Math.floor(chartFlat.length / 12) - 1)}
                tick={{ fontSize: 11, fill: '#757575' }} />
              <YAxis tick={{ fontSize: 11, fill: '#757575' }} width={38} tickFormatter={v => `${v}ч`} />
              <Tooltip content={<WeeklyVolumeTip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={v => sportLabel(v as string)} />
              {allTypes.map((t, i) => (
                <Bar key={t} dataKey={t} name={t} stackId="vol" fill={sportColor(t)}
                  isAnimationActive={false}
                  radius={i === allTypes.length - 1 ? [3,3,0,0] : [0,0,0,0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Paper>
      )}

      <Paper withBorder p="md" radius="md">
        <Title order={5} mb="sm">Разбивка по видам</Title>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e9ecef' }}>
                <th style={{ textAlign:'left', padding:'6px 12px', fontWeight:600, color:'#495057' }}>Вид</th>
                <th style={{ textAlign:'right', padding:'6px 12px', fontWeight:600, color:'#495057' }}>Тренировок</th>
                <th style={{ textAlign:'right', padding:'6px 12px', fontWeight:600, color:'#495057' }}>Объём</th>
                <th style={{ textAlign:'right', padding:'6px 12px', fontWeight:600, color:'#495057' }}>Км</th>
                <th style={{ padding:'6px 12px' }}></th>
              </tr>
            </thead>
            <tbody>
              {by_type.map(b => (
                <tr key={b.workout_type} style={{ borderBottom: '1px solid #f1f3f5' }}>
                  <td style={{ padding:'8px 12px' }}>
                    <Group gap={8} wrap="nowrap">
                      <Box w={10} h={10} style={{ borderRadius:2, backgroundColor:sportColor(b.workout_type), flexShrink:0 }} />
                      <Text size="sm">{sportLabel(b.workout_type)}</Text>
                    </Group>
                  </td>
                  <td style={{ textAlign:'right', padding:'8px 12px', color:'#868e96' }}>{b.sessions}</td>
                  <td style={{ textAlign:'right', padding:'8px 12px', fontWeight:500 }}>{fmtDuration(b.total_duration_min)}</td>
                  <td style={{ textAlign:'right', padding:'8px 12px', color:'#868e96' }}>
                    {b.total_distance_km ? Number(b.total_distance_km).toFixed(1) : '—'}
                  </td>
                  <td style={{ padding:'8px 12px', minWidth: 100 }}>
                    <div style={{ height:6, borderRadius:3, backgroundColor:'#f1f3f5', overflow:'hidden' }}>
                      <div style={{ height:'100%', borderRadius:3, backgroundColor:sportColor(b.workout_type),
                        width:`${Math.round((b.total_duration_min / totalMin) * 100)}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Paper>
    </Stack>
  )
}

// ─── Fitness charts ───────────────────────────────────────────────────────────

function FitnessCharts({ athleteId, dateFrom, dateTo }: { athleteId: string; dateFrom: string; dateTo: string }) {
  const params = { date_from: dateFrom, date_to: dateTo }

  const { data: loadResp, isLoading: loadLoading } = useQuery({
    queryKey: ['load', athleteId, dateFrom, dateTo],
    queryFn:  () => analyticsApi.getLoad(athleteId, params),
  })
  const { data: pfResp, isLoading: pfLoading } = useQuery({
    queryKey: ['plan-fact', athleteId, dateFrom, dateTo],
    queryFn:  () => analyticsApi.getPlanFact(athleteId, params),
  })

  const loadData = (loadResp?.data ?? [] as LoadPoint[]).map((p: LoadPoint) => ({
    date: p.date, ATL: Number(p.atl_7d), CTL: Number(p.ctl_42d), TSB: Number(p.tsb),
    tsb_pos: Math.max(0, Number(p.tsb)), tsb_neg: Math.min(0, Number(p.tsb)),
  }))
  const pfData: PlanFactPoint[] = pfResp?.data ?? []
  const loadTickStep = Math.max(1, Math.floor(loadData.length / 10))

  return (
    <Stack gap="md">
      <Paper withBorder p="md" radius="md">
        <Title order={4} mb={4}>Динамика нагрузки: ATL / CTL / TSB</Title>
        <Text size="xs" c="dimmed" mb="md">ATL — острая (7д), CTL — хроническая (42д), TSB = CTL − ATL</Text>
        {loadData.length === 0 ? <EmptyChart height={300} loading={loadLoading} /> : (
          <>
            <LoadLegend />
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={loadData} margin={{ top:4, right:20, left:0, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" />
                <XAxis dataKey="date" tickFormatter={fmtDayMonth} interval={loadTickStep} tick={{ fontSize:11, fill:'#757575' }} />
                <YAxis tick={{ fontSize:11, fill:'#757575' }} width={38} />
                <Tooltip content={<LoadTooltip />} />
                <ReferenceLine y={0} stroke="#bdbdbd" strokeDasharray="4 2" />
                <Area dataKey="tsb_pos" fill={COLOR_TSB_POS} fillOpacity={0.2} stroke="none" legendType="none" isAnimationActive={false} name="tsb_pos" />
                <Area dataKey="tsb_neg" fill={COLOR_TSB_NEG} fillOpacity={0.25} stroke="none" legendType="none" isAnimationActive={false} name="tsb_neg" />
                <Area dataKey="ATL" stroke={COLOR_ATL} strokeWidth={2} fill="none" dot={false} legendType="none" isAnimationActive={false} name="ATL" />
                <Area dataKey="CTL" stroke={COLOR_CTL} strokeWidth={2} fill="none" dot={false} legendType="none" isAnimationActive={false} name="CTL" />
                <Area dataKey="TSB" stroke={COLOR_TSB} strokeWidth={1.5} strokeDasharray="6 3" fill="none" dot={false} legendType="none" isAnimationActive={false} name="TSB" />
              </ComposedChart>
            </ResponsiveContainer>
          </>
        )}
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Title order={4} mb={4}>Недельная нагрузка: план / факт TSS</Title>
        <Text size="xs" c="dimmed" mb="md">Агрегация по неделям (понедельник — начало)</Text>
        {pfData.length === 0 ? <EmptyChart height={220} loading={pfLoading} /> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={pfData} margin={{ top:4, right:20, left:0, bottom:0 }} barCategoryGap="35%" barGap={3}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" vertical={false} />
              <XAxis dataKey="week_start" tickFormatter={fmtDayMonth} tick={{ fontSize:11, fill:'#757575' }} />
              <YAxis tick={{ fontSize:11, fill:'#757575' }} width={38} />
              <Tooltip content={<PlanFactTooltip />} />
              <Legend wrapperStyle={{ fontSize:12 }} formatter={v => v} />
              <Bar dataKey="planned_tss" name="План" fill={COLOR_PLAN} fillOpacity={0.65} radius={[3,3,0,0]} isAnimationActive={false} />
              <Bar dataKey="actual_tss"  name="Факт" fill={COLOR_FACT} fillOpacity={0.85} radius={[3,3,0,0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Paper>
    </Stack>
  )
}

// ─── Main exported block ──────────────────────────────────────────────────────

export default function AthleteAnalytics({ athleteId }: { athleteId: string }) {
  const [periodType,   setPeriodType]   = useState<PeriodType>('month')
  const [periodOffset, setPeriodOffset] = useState(0)
  const [customFrom,   setCustomFrom]   = useState(isoNDaysAgo(29))
  const [customTo,     setCustomTo]     = useState(isoToday())
  const [fitnessFrom,  setFitnessFrom]  = useState(isoNDaysAgo(89))
  const [fitnessTo,    setFitnessTo]    = useState(isoToday())

  const [volFrom, volTo] = useMemo(
    () => getPeriodBounds(periodType, periodOffset, [customFrom, customTo]),
    [periodType, periodOffset, customFrom, customTo]
  )

  const granularity = useMemo(
    () => getGranularity(periodType, volFrom, volTo),
    [periodType, volFrom, volTo]
  )

  const { data: volumeData, isLoading: volLoading } = useQuery<VolumeResponse>({
    queryKey: ['volume', athleteId, volFrom, volTo],
    queryFn:  () => analyticsApi.getVolume(athleteId, { date_from: volFrom, date_to: volTo }),
  })

  function handleChangeType(t: PeriodType) { setPeriodType(t); setPeriodOffset(0) }

  return (
    <Stack gap="xl">
      <div>
        <Title order={3} mb="sm">Отчет по тренировке</Title>
        <Paper withBorder p="md" radius="md">
          <VolumePeriodSelector
            type={periodType}
            offset={periodOffset}
            customFrom={customFrom}
            customTo={customTo}
            onChangeType={handleChangeType}
            onChangeOffset={(n) => setPeriodOffset(n)}
            onChangeCustomFrom={setCustomFrom}
            onChangeCustomTo={setCustomTo}
          />
          {volLoading || !volumeData ? (
            <Stack gap="sm">
              <SimpleGrid cols={{ base:2, sm:3 }} spacing="sm">
                {[1,2,3].map(i => <Skeleton key={i} height={76} radius="md" />)}
              </SimpleGrid>
              <Skeleton height={260} radius="md" />
            </Stack>
          ) : (
            <VolumeSection data={volumeData} granularity={granularity} />
          )}
        </Paper>
      </div>

      <div>
        <Group justify="space-between" align="center" mb="sm" wrap="wrap" gap="sm">
          <Title order={3}>Показатели готовности</Title>
          <Group gap={6} align="flex-end" wrap="wrap">
            <TextInput type="date" label="С" size="xs" w={148}
              value={fitnessFrom} max={fitnessTo}
              onChange={e => setFitnessFrom(e.target.value)} />
            <TextInput type="date" label="По" size="xs" w={148}
              value={fitnessTo} min={fitnessFrom}
              onChange={e => setFitnessTo(e.target.value)} />
          </Group>
        </Group>
        <FitnessCharts athleteId={athleteId} dateFrom={fitnessFrom} dateTo={fitnessTo} />
      </div>

      <div>
        <Title order={3} mb="sm">Алерты</Title>
        <AlertsPanel athleteId={athleteId} />
      </div>
    </Stack>
  )
}
