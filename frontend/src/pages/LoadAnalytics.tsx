import {
  Box,
  Container,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { analyticsApi } from '../api/analytics'
import AlertsPanel from '../components/AlertsPanel'

// ─── Типы ────────────────────────────────────────────────────────────────────

interface LoadPoint {
  date: string
  daily_tss: number
  atl_7d: number
  ctl_42d: number
  tsb: number
}

interface PlanFactPoint {
  week_start: string
  planned_tss: number
  actual_tss: number
}

// ─── Константы ───────────────────────────────────────────────────────────────

const COLOR_ATL = '#FB8C00'
const COLOR_CTL = '#1976D2'
const COLOR_TSB = '#6A1B9A'
const COLOR_TSB_POS = '#4CAF50'
const COLOR_TSB_NEG = '#E53935'
const COLOR_PLAN = '#1976D2'
const COLOR_FACT = '#43A047'

// ─── Вспомогательные функции ──────────────────────────────────────────────────

function isoToday(): string {
  return new Date().toISOString().split('T')[0]
}

function isoNDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function fmtDayMonth(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ─── Кастомные тултипы ───────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean
  payload?: { name: string; value: number; color: string; dataKey: string }[]
  label?: string
}

function LoadTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length || !label) return null
  const visible = payload.filter((p) => !['tsb_pos', 'tsb_neg'].includes(p.dataKey))
  return (
    <Paper p="xs" withBorder shadow="sm" style={{ minWidth: 130 }}>
      <Text size="xs" fw={600} mb={4}>{fmtDayMonth(label)}</Text>
      {visible.map((p) => (
        <Text key={p.dataKey} size="xs" style={{ color: p.color }}>
          {p.name}: {Number(p.value).toFixed(1)}
        </Text>
      ))}
    </Paper>
  )
}

function PlanFactTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length || !label) return null
  return (
    <Paper p="xs" withBorder shadow="sm" style={{ minWidth: 140 }}>
      <Text size="xs" fw={600} mb={4}>Нед. с {fmtDayMonth(label)}</Text>
      {payload.map((p) => (
        <Text key={p.dataKey} size="xs" style={{ color: p.color }}>
          {p.name}: {Math.round(Number(p.value))}
        </Text>
      ))}
    </Paper>
  )
}

// ─── Легенда для ComposedChart ────────────────────────────────────────────────

function LoadLegend() {
  const items = [
    { color: COLOR_ATL,                     label: 'ATL (острая)',     type: 'line' },
    { color: COLOR_CTL,                     label: 'CTL (хроническая)', type: 'line' },
    { color: COLOR_TSB,                     label: 'TSB (форма)',       type: 'dash' },
    { color: COLOR_TSB_POS + '55',          label: 'TSB > 0 — свежесть', type: 'area' },
    { color: COLOR_TSB_NEG + '55',          label: 'TSB < 0 — усталость', type: 'area' },
  ]
  return (
    <Group gap="md" mb="sm" px={4} wrap="wrap">
      {items.map(({ color, label, type }) => (
        <Group key={label} gap={6} wrap="nowrap">
          {type === 'area' ? (
            <Box w={14} h={14} style={{ backgroundColor: color, borderRadius: 3 }} />
          ) : (
            <Box
              w={18}
              h={3}
              style={{
                backgroundColor: color,
                borderRadius: 2,
                backgroundImage: type === 'dash'
                  ? `repeating-linear-gradient(90deg, ${color} 0 5px, transparent 5px 8px)`
                  : 'none',
              }}
            />
          )}
          <Text size="xs" c="dimmed">{label}</Text>
        </Group>
      ))}
    </Group>
  )
}

// ─── Пустое состояние ─────────────────────────────────────────────────────────

function EmptyChart({ height, loading }: { height: number; loading: boolean }) {
  return (
    <Box
      h={height}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <Text c="dimmed" size="sm">{loading ? 'Загрузка…' : 'Нет данных за выбранный период'}</Text>
    </Box>
  )
}

// ─── Страница ─────────────────────────────────────────────────────────────────

export default function LoadAnalytics() {
  const { athleteId } = useParams<{ athleteId: string }>()

  const [dateFrom, setDateFrom] = useState(isoNDaysAgo(89))
  const [dateTo,   setDateTo]   = useState(isoToday())

  const params = { date_from: dateFrom, date_to: dateTo }

  const { data: loadResp, isLoading: loadLoading } = useQuery({
    queryKey: ['load', athleteId, dateFrom, dateTo],
    queryFn: () => analyticsApi.getLoad(athleteId!, params),
    enabled: !!athleteId,
  })

  const { data: pfResp, isLoading: pfLoading } = useQuery({
    queryKey: ['plan-fact', athleteId, dateFrom, dateTo],
    queryFn: () => analyticsApi.getPlanFact(athleteId!, params),
    enabled: !!athleteId,
  })

  // Данные для графика нагрузки: добавляем tsb_pos / tsb_neg для заливки
  const loadData = (loadResp?.data ?? [] as LoadPoint[]).map((p: LoadPoint) => ({
    date:    p.date,
    ATL:     Number(p.atl_7d),
    CTL:     Number(p.ctl_42d),
    TSB:     Number(p.tsb),
    tsb_pos: Math.max(0, Number(p.tsb)),
    tsb_neg: Math.min(0, Number(p.tsb)),
  }))

  const pfData: PlanFactPoint[] = pfResp?.data ?? []

  // Шаг меток по оси X: ~10 меток на диапазон
  const loadTickStep = Math.max(1, Math.floor(loadData.length / 10))

  return (
    <Container size="xl" py="xl">

      {/* Заголовок + выбор периода */}
      <Group justify="space-between" mb="xl" align="flex-end" wrap="wrap" gap="md">
        <Title order={2}>Аналитика нагрузки</Title>
        <Group gap="xs" align="flex-end">
          <TextInput
            type="date"
            label="С"
            size="sm"
            w={160}
            value={dateFrom}
            max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <TextInput
            type="date"
            label="По"
            size="sm"
            w={160}
            value={dateTo}
            min={dateFrom}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </Group>
      </Group>

      <Stack gap="xl">

        {/* ── График 1: ATL / CTL / TSB ────────────────────────────────────── */}
        <Paper withBorder p="md" radius="md">
          <Title order={4} mb="xs">Динамика нагрузки: ATL / CTL / TSB</Title>
          <Text size="xs" c="dimmed" mb="md">
            ATL — острая нагрузка (7д), CTL — хроническая (42д), TSB = CTL − ATL
          </Text>

          {loadData.length === 0 ? (
            <EmptyChart height={320} loading={loadLoading} />
          ) : (
            <>
              <LoadLegend />
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={loadData} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDayMonth}
                    interval={loadTickStep}
                    tick={{ fontSize: 11, fill: '#757575' }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#757575' }}
                    width={38}
                  />
                  <Tooltip content={<LoadTooltip />} />
                  <ReferenceLine y={0} stroke="#bdbdbd" strokeDasharray="4 2" />

                  {/* Заливка TSB: зелёная выше нуля, красная ниже нуля */}
                  <Area
                    dataKey="tsb_pos"
                    fill={COLOR_TSB_POS}
                    fillOpacity={0.2}
                    stroke="none"
                    legendType="none"
                    isAnimationActive={false}
                    name="tsb_pos"
                  />
                  <Area
                    dataKey="tsb_neg"
                    fill={COLOR_TSB_NEG}
                    fillOpacity={0.25}
                    stroke="none"
                    legendType="none"
                    isAnimationActive={false}
                    name="tsb_neg"
                  />

                  {/* Линии — поверх заливки */}
                  <Area
                    dataKey="ATL"
                    stroke={COLOR_ATL}
                    strokeWidth={2}
                    fill="none"
                    dot={false}
                    legendType="none"
                    isAnimationActive={false}
                    name="ATL"
                  />
                  <Area
                    dataKey="CTL"
                    stroke={COLOR_CTL}
                    strokeWidth={2}
                    fill="none"
                    dot={false}
                    legendType="none"
                    isAnimationActive={false}
                    name="CTL"
                  />
                  <Area
                    dataKey="TSB"
                    stroke={COLOR_TSB}
                    strokeWidth={1.5}
                    strokeDasharray="6 3"
                    fill="none"
                    dot={false}
                    legendType="none"
                    isAnimationActive={false}
                    name="TSB"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </>
          )}
        </Paper>

        {/* ── График 2: план / факт TSS ────────────────────────────────────── */}
        <Paper withBorder p="md" radius="md">
          <Title order={4} mb="xs">Недельная нагрузка: план / факт TSS</Title>
          <Text size="xs" c="dimmed" mb="md">
            Агрегация по неделям (понедельник — начало недели)
          </Text>

          {pfData.length === 0 ? (
            <EmptyChart height={260} loading={pfLoading} />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={pfData}
                margin={{ top: 4, right: 20, left: 0, bottom: 0 }}
                barCategoryGap="35%"
                barGap={3}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" vertical={false} />
                <XAxis
                  dataKey="week_start"
                  tickFormatter={fmtDayMonth}
                  tick={{ fontSize: 11, fill: '#757575' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#757575' }}
                  width={38}
                />
                <Tooltip content={<PlanFactTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(v) => v}
                />
                <Bar
                  dataKey="planned_tss"
                  name="План"
                  fill={COLOR_PLAN}
                  fillOpacity={0.65}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="actual_tss"
                  name="Факт"
                  fill={COLOR_FACT}
                  fillOpacity={0.85}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Paper>

        {/* ── Активные алерты ──────────────────────────────────────────────── */}
        {athleteId && <AlertsPanel athleteId={athleteId} />}

      </Stack>
    </Container>
  )
}
