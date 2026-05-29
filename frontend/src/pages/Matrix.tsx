import {
  Alert,
  Badge,
  Box,
  Button,
  Collapse,
  Divider,
  Group,
  HoverCard,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { plansApi } from '../api/plans'
import SportIcon, { SPORT_COLOR } from '../components/SportIcon'
import WorkoutDetailModal from '../components/WorkoutDetailModal'
import WorkoutFormModal, { type WorkoutFormData } from '../components/WorkoutFormModal'
import type { WorkoutDetail } from '../components/WorkoutDetailModal'
import type { IntervalSegment, HRZoneRange } from '../components/IntervalBar'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MatrixWorkout {
  id: string
  athlete_id: string
  athlete_first_name: string
  athlete_last_name: string
  planned_date: string
  planned_duration_min: number | null
  planned_tss: number | null
  k_qual: number | null
  k_form: number | null
  target_zone: string | null
  workout_type: string | null
  workout_subtype: string | null
  description: string | null
  interval_structure: IntervalSegment[] | null
  status: string
}

interface Template {
  id: string
  name: string
  start_date: string
  duration_days: number
  group_id: string
}

interface HRZoneEntry {
  athlete_id: string
  zones: { zone: string; hr_min: number; hr_max: number }[]
}

interface MatrixAlert {
  id: string
  workout_id: string | null
  athlete_id: string
  severity: 'info' | 'warning' | 'critical'
  rule_code: string
  message: string
  is_resolved: boolean
}

interface WeekConflict {
  athlete_id: string
  first_name: string
  last_name: string
  planned_date: string
  workout_count: number
}

interface GroupMember {
  athlete_id: string
  first_name: string
  last_name: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']
const DAY_SHORT   = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб']

const STATUS_DOT: Record<string, string> = {
  draft:     '#adb5bd',
  published: '#228be6',
  completed: '#2f9e44',
}
const STATUS_BG: Record<string, string> = {
  draft:     '#f1f3f5',
  published: '#e7f5ff',
  completed: '#ebfbee',
}
const STATUS_LABEL: Record<string, string> = {
  draft:     'Черновик',
  published: 'Опубликовано',
  completed: 'Выполнено',
}

const ALERT_META: Record<string, { color: string; bg: string; label: string }> = {
  critical: { color: '#C8102E', bg: '#fff5f5', label: 'Критический' },
  warning:  { color: '#f76707', bg: '#fff4e6', label: 'Предупреждение' },
  info:     { color: '#1c7ed6', bg: '#e7f5ff', label: 'Информация' },
}
const ALERT_SEV_ORDER: Record<string, number> = { critical: 3, warning: 2, info: 1 }

// Keep for pill border colors
const ALERT_COLOR: Record<string, string> = {
  critical: '#C8102E',
  warning:  '#f76707',
  info:     '#1c7ed6',
}

const ATHLETE_COL = 180
const TOTALS_COL  = 130
const GRID = `${ATHLETE_COL}px repeat(7, minmax(120px, 1fr)) ${TOTALS_COL}px`

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function addDays(dateStr: string, n: number): Date {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d
}

function getWeekDates(startDateStr: string, weekOffset: number): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(startDateStr, weekOffset * 7 + i))
}

function formatDateHeader(d: Date): string {
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`
}

function formatWeekRange(dates: Date[]): string {
  const s = dates[0], e = dates[6]
  if (s.getMonth() === e.getMonth())
    return `${s.getDate()}–${e.getDate()} ${MONTH_SHORT[e.getMonth()]} ${e.getFullYear()}`
  return `${s.getDate()} ${MONTH_SHORT[s.getMonth()]} – ${e.getDate()} ${MONTH_SHORT[e.getMonth()]} ${e.getFullYear()}`
}

// ─── Workout pill ─────────────────────────────────────────────────────────────

function WorkoutPill({
  w,
  onClick,
  alerts,
}: {
  w: MatrixWorkout
  onClick: () => void
  alerts: MatrixAlert[]
}) {
  const color  = SPORT_COLOR[w.workout_type ?? 'other'] ?? '#adb5bd'
  const dot    = STATUS_DOT[w.status] ?? '#adb5bd'
  const bg     = STATUS_BG[w.status] ?? '#f8f9fa'
  const isRest = w.workout_type === 'rest'

  const worstAlert = alerts.find((a) => a.severity === 'critical')
    ?? alerts.find((a) => a.severity === 'warning')
    ?? alerts[0] ?? null

  return (
    <Box
      onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{
        border: worstAlert ? `1px solid ${ALERT_COLOR[worstAlert.severity]}60` : '1px solid #dee2e6',
        borderLeft: `3px solid ${worstAlert ? ALERT_COLOR[worstAlert.severity] : color}`,
        borderRadius: 4,
        padding: '4px 6px',
        cursor: 'pointer',
        background: bg,
        transition: 'box-shadow 0.12s',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.12)' }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
    >
      {isRest ? (
        <Group gap={4} wrap="nowrap" align="center">
          <SportIcon type="rest" size={12} color="#adb5bd" />
          <Text size="xs" c="dimmed" style={{ lineHeight: 1 }}>Отдых</Text>
        </Group>
      ) : (
        <Stack gap={2}>
          {/* Line 1: icon + zone + status dot + alert */}
          <Group gap={4} wrap="nowrap" align="center">
            <SportIcon type={w.workout_type ?? 'other'} size={12} color={color} />
            {w.target_zone && (
              <Text size="xs" fw={700} style={{ color, lineHeight: 1, whiteSpace: 'nowrap' }}>
                {w.target_zone}
              </Text>
            )}
            {w.interval_structure && w.interval_structure.length > 0 && (
              <Text size="xs" c="orange" fw={700} style={{ lineHeight: 1, fontSize: 9 }}>И</Text>
            )}
            <Tooltip label={STATUS_LABEL[w.status] ?? w.status} withArrow>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
            </Tooltip>
            {worstAlert && (
              <Tooltip
                label={alerts.map((a) => `${a.rule_code}: ${a.message}`).join('\n')}
                withArrow
                multiline
                maw={280}
              >
                <Text
                  size="xs"
                  fw={700}
                  style={{ color: ALERT_COLOR[worstAlert.severity], lineHeight: 1, fontSize: 11, flexShrink: 0 }}
                >
                  {worstAlert.severity === 'info' ? 'ℹ' : '⚠'}
                  {alerts.length > 1 ? alerts.length : ''}
                </Text>
              </Tooltip>
            )}
          </Group>
          {/* Line 2: duration + TSS */}
          <Group gap={4} wrap="nowrap" align="center">
            {w.planned_duration_min != null && (
              <Text size="xs" c="dimmed" style={{ lineHeight: 1, whiteSpace: 'nowrap' }}>
                {w.planned_duration_min}м
              </Text>
            )}
            {w.planned_tss != null && (
              <Text size="xs" c="dimmed" style={{ lineHeight: 1, whiteSpace: 'nowrap', opacity: 0.7 }}>
                {Math.round(w.planned_tss)} TSS
              </Text>
            )}
          </Group>
        </Stack>
      )}
    </Box>
  )
}

// ─── Alert hover pill ─────────────────────────────────────────────────────────

function MatrixAlertPill({
  name,
  alerts,
}: {
  name: string
  alerts: MatrixAlert[]
}) {
  const worst = alerts.reduce((best, cur) =>
    (ALERT_SEV_ORDER[cur.severity] ?? 0) > (ALERT_SEV_ORDER[best.severity] ?? 0) ? cur : best
  )
  const s = ALERT_META[worst.severity] ?? ALERT_META.info

  return (
    <HoverCard width={300} shadow="md" openDelay={150} closeDelay={100} withArrow>
      <HoverCard.Target>
        <UnstyledButton
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 20,
            background: '#fff', border: `1px solid ${s.color}55`,
          }}
          onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.boxShadow = `0 0 0 2px ${s.color}33`
          }}
          onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
          <Text size="xs" fw={500}>{name}</Text>
        </UnstyledButton>
      </HoverCard.Target>

      <HoverCard.Dropdown p={10}>
        <Text size="xs" fw={700} c="dimmed" mb={8}>{name}</Text>
        <Stack gap={6}>
          {alerts
            .slice()
            .sort((a, b) => (ALERT_SEV_ORDER[b.severity] ?? 0) - (ALERT_SEV_ORDER[a.severity] ?? 0))
            .map((a) => {
              const sv = ALERT_META[a.severity] ?? ALERT_META.info
              return (
                <Box key={a.id} style={{
                  padding: '6px 10px',
                  background: sv.bg,
                  borderRadius: 6,
                  borderLeft: `3px solid ${sv.color}`,
                }}>
                  <Group gap={6} mb={3} wrap="nowrap">
                    <Badge size="xs" style={{ background: sv.color, color: '#fff', fontFamily: 'monospace' }}>
                      {a.rule_code}
                    </Badge>
                  </Group>
                  <Text size="xs" style={{ lineHeight: 1.4 }}>{a.message}</Text>
                </Box>
              )
            })}
        </Stack>
      </HoverCard.Dropdown>
    </HoverCard>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Matrix() {
  const { templateId } = useParams<{ templateId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [weekOffset, setWeekOffset]         = useState(0)
  const [modalWorkout, setModalWorkout]     = useState<WorkoutDetail | null>(null)
  const [modalWorkoutId, setModalWorkoutId] = useState<string | null>(null)
  const [modalAthleteId, setModalAthleteId] = useState<string | null>(null)
  const [modalOnEdit, setModalOnEdit]       = useState<(() => void) | null>(null)
  const [formModal, setFormModal]           = useState<
    { mode: 'edit'; workout: WorkoutFormData; athleteName: string } | null
  >(null)
  const [conflictModal, setConflictModal]   = useState<{ conflicts: WeekConflict[]; weekStart: string } | null>(null)
  const [approveChecking, setApproveChecking] = useState(false)
  const [alertsCollapsed, setAlertsCollapsed] = useState(false)

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: template, isLoading: tmplLoading } = useQuery<Template>({
    queryKey: ['template', templateId],
    queryFn: () => plansApi.getTemplate(templateId!),
    enabled: !!templateId,
  })

  const { data: workouts = [], isLoading: wLoading } = useQuery<MatrixWorkout[]>({
    queryKey: ['matrix', templateId],
    queryFn: () => plansApi.getMatrix(templateId!),
    enabled: !!templateId,
  })

  const { data: zonesData = [] } = useQuery<HRZoneEntry[]>({
    queryKey: ['matrix-zones', templateId],
    queryFn: () => plansApi.getAthleteZones(templateId!),
    enabled: !!templateId,
  })

  const { data: alertsData = [] } = useQuery<MatrixAlert[]>({
    queryKey: ['matrix-alerts', templateId],
    queryFn: () => plansApi.getTemplateAlerts(templateId!),
    enabled: !!templateId,
  })

  const { data: groupMembers = [] } = useQuery<GroupMember[]>({
    queryKey: ['matrix-group-members', templateId],
    queryFn: () => plansApi.getGroupMembers(templateId!),
    enabled: !!templateId,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['matrix', templateId] })
    queryClient.invalidateQueries({ queryKey: ['matrix-alerts', templateId] })
  }

  // ── Approve week mutation ────────────────────────────────────────────────────

  const approveWeek = useMutation({
    mutationFn: (weekStart: string) => plansApi.approveAll(templateId!, weekStart),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })

  const adaptMutation = useMutation({
    mutationFn: () => plansApi.adaptTemplateSync(templateId!),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['matrix-group-members', templateId] })
    },
  })


  const handleApproveClick = async () => {
    setApproveChecking(true)
    try {
      const conflicts: WeekConflict[] = await plansApi.getWeekConflicts(templateId!, weekDateStrs[0])
      if (conflicts.length === 0) {
        approveWeek.mutate(weekDateStrs[0])
      } else {
        setConflictModal({ conflicts, weekStart: weekDateStrs[0] })
      }
    } finally {
      setApproveChecking(false)
    }
  }

  const isLoading = tmplLoading || wLoading

  // ── Derived data ─────────────────────────────────────────────────────────────

  const totalWeeks = template ? Math.ceil(template.duration_days / 7) : 1
  const clampedOffset = Math.max(0, Math.min(weekOffset, totalWeeks - 1))

  const weekDates = template ? getWeekDates(template.start_date, clampedOffset) : []
  const weekDateStrs = weekDates.map(isoDate)

  // Build map: athleteId → dateStr → MatrixWorkout[]
  const byAthleteDate = new Map<string, Map<string, MatrixWorkout[]>>()
  for (const w of workouts) {
    if (!byAthleteDate.has(w.athlete_id)) byAthleteDate.set(w.athlete_id, new Map())
    const dateMap = byAthleteDate.get(w.athlete_id)!
    const arr = dateMap.get(w.planned_date) ?? []
    arr.push(w)
    dateMap.set(w.planned_date, arr)
  }

  // Unique athletes ordered by last_name
  const athletes = [...new Map(
    workouts.map((w) => [w.athlete_id, { id: w.athlete_id, first_name: w.athlete_first_name, last_name: w.athlete_last_name }])
  ).values()].sort((a, b) => a.last_name.localeCompare(b.last_name, 'ru'))

  // Расхождение группы и матрицы: атлеты в группе, которых нет в матрице, и наоборот
  const matrixAthleteIds = new Set(athletes.map((a) => a.id))
  const groupAthleteIds  = new Set(groupMembers.map((m) => m.athlete_id))
  const missingInMatrix  = groupMembers.filter((m) => !matrixAthleteIds.has(m.athlete_id))
  const extraInMatrix    = athletes.filter((a) => !groupAthleteIds.has(a.id))
  const groupMismatch    = groupMembers.length > 0 && (missingInMatrix.length > 0 || extraInMatrix.length > 0)

  // Count drafts in current week
  const weekDraftCount = workouts.filter(
    (w) => w.status === 'draft' && weekDateStrs.includes(w.planned_date)
  ).length

  // HR zones map: athleteId → zone → {hr_min, hr_max}
  const hrZonesByAthlete = useMemo(() => {
    const map = new Map<string, Record<string, HRZoneRange>>()
    for (const entry of zonesData) {
      const byZone: Record<string, HRZoneRange> = {}
      for (const z of entry.zones) byZone[z.zone] = { hr_min: z.hr_min, hr_max: z.hr_max }
      map.set(entry.athlete_id, byZone)
    }
    return map
  }, [zonesData])

  // Alerts map: workoutId → MatrixAlert[]
  const alertsByWorkout = useMemo(() => {
    const map = new Map<string, MatrixAlert[]>()
    for (const a of alertsData) {
      if (!a.workout_id) continue
      const arr = map.get(a.workout_id) ?? []
      arr.push(a)
      map.set(a.workout_id, arr)
    }
    return map
  }, [alertsData])

  // Alerts grouped by athlete for the panel
  const alertsByAthlete = useMemo(() => {
    const map = new Map<string, MatrixAlert[]>()
    for (const a of alertsData) {
      const arr = map.get(a.athlete_id) ?? []
      arr.push(a)
      map.set(a.athlete_id, arr)
    }
    return map
  }, [alertsData])

  // Athletes with alerts sorted by worst severity
  const alertAthletes = useMemo(() => {
    return athletes
      .filter((a) => alertsByAthlete.has(a.id))
      .map((a) => {
        const alerts = alertsByAthlete.get(a.id)!
        const worstSev = alerts.reduce((best, cur) =>
          (ALERT_SEV_ORDER[cur.severity] ?? 0) > (ALERT_SEV_ORDER[best.severity] ?? 0) ? cur : best
        ).severity
        return { ...a, worstSev, alerts }
      })
      .sort((a, b) => (ALERT_SEV_ORDER[b.worstSev] ?? 0) - (ALERT_SEV_ORDER[a.worstSev] ?? 0))
  }, [athletes, alertsByAthlete])

  // ── Event handlers ───────────────────────────────────────────────────────────

  const today = isoDate(new Date())

  const openWorkout = (w: MatrixWorkout, athleteName: string) => {
    setModalWorkout({
      id: w.id,
      planned_date: w.planned_date,
      workout_type: w.workout_type,
      workout_subtype: w.workout_subtype,
      description: w.description,
      target_zone: w.target_zone,
      status: w.status,
      planned_duration_min: w.planned_duration_min,
      planned_tss: w.planned_tss,
      interval_structure: w.interval_structure,
      athlete_name: athleteName,
    })
    setModalWorkoutId(w.id)
    setModalAthleteId(w.athlete_id)
    setModalOnEdit(() => () => setFormModal({
      mode: 'edit',
      workout: {
        id: w.id,
        planned_date: w.planned_date,
        workout_type: w.workout_type,
        workout_subtype: w.workout_subtype,
        target_zone: w.target_zone,
        planned_duration_min: w.planned_duration_min,
        planned_tss: w.planned_tss,
        description: w.description,
        interval_structure: w.interval_structure,
        status: w.status,
      },
      athleteName,
    }))
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Box p="xl" style={{ display: 'flex', justifyContent: 'center' }}>
        <Loader />
      </Box>
    )
  }

  if (!template) {
    return <Text p="xl" c="red">Шаблон не найден</Text>
  }

  return (
    <Box px="md" py="md">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <Group justify="space-between" mb="md" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <Button variant="subtle" size="sm" onClick={() => navigate(`/planning/${templateId}`)}>
            ← Редактор
          </Button>
          <Stack gap={0}>
            <Text fw={700} size="md">{template.name}</Text>
            <Text size="xs" c="dimmed">
              {template.start_date} · {template.duration_days} дн. ·{' '}
              {workouts.length} тренировок
            </Text>
          </Stack>
        </Group>
        <Button variant="light" onClick={() => navigate('/planning')}>
          Все шаблоны
        </Button>
      </Group>

      {workouts.length === 0 ? (
        <Box
          p="xl"
          style={{
            border: '1px dashed #dee2e6',
            borderRadius: 8,
            textAlign: 'center',
            background: '#fafafa',
          }}
        >
          <Text c="dimmed" mb="sm">Матрица пуста — шаблон ещё не адаптирован.</Text>
          <Button variant="light" onClick={() => navigate(`/planning/${templateId}`)}>
            Перейти в редактор
          </Button>
        </Box>
      ) : (
        <>
          {/* ── Week navigation ──────────────────────────────────────────── */}
          <Group justify="space-between" mb="sm" align="center">
            <Group gap="xs" wrap="nowrap">
              <Button
                size="xs" variant="light"
                disabled={clampedOffset === 0}
                onClick={() => setWeekOffset((o) => o - 1)}
              >
                ‹
              </Button>
              <Stack gap={0} align="center" style={{ minWidth: 240 }}>
                <Text fw={600} size="sm">
                  Неделя {clampedOffset + 1} из {totalWeeks}
                  {' · '}{formatWeekRange(weekDates)}
                </Text>
              </Stack>
              <Button
                size="xs" variant="light"
                disabled={clampedOffset === totalWeeks - 1}
                onClick={() => setWeekOffset((o) => o + 1)}
              >
                ›
              </Button>
            </Group>

            <Group gap="xs" wrap="nowrap">
              {/* Legend */}
              <Group gap={10} wrap="nowrap" style={{ opacity: 0.7 }}>
                {Object.entries(STATUS_DOT).map(([k, c]) => (
                  <Group key={k} gap={4} wrap="nowrap" align="center">
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
                    <Text size="xs" c="dimmed">{STATUS_LABEL[k]}</Text>
                  </Group>
                ))}
              </Group>
              <Button
                size="sm"
                color="teal"
                disabled={weekDraftCount === 0}
                loading={approveWeek.isPending || approveChecking}
                onClick={handleApproveClick}
              >
                Утвердить неделю {clampedOffset + 1}
                {weekDraftCount > 0 ? ` (${weekDraftCount})` : ''}
              </Button>
            </Group>
          </Group>

          {/* ── Group mismatch banner ────────────────────────────────────── */}
          {groupMismatch && (
            <Alert color="orange" mb="sm" p="sm">
              <Group justify="space-between" wrap="nowrap" gap="sm">
                <Stack gap={2}>
                  <Text size="sm" fw={600}>Состав группы изменился — матрица устарела</Text>
                  {missingInMatrix.length > 0 && (
                    <Text size="xs" c="dimmed">
                      Нет в матрице: {missingInMatrix.map((m) => `${m.last_name} ${m.first_name[0]}.`).join(', ')}
                    </Text>
                  )}
                  {extraInMatrix.length > 0 && (
                    <Text size="xs" c="dimmed">
                      Вышли из группы: {extraInMatrix.map((a) => `${a.last_name} ${a.first_name[0]}.`).join(', ')}
                    </Text>
                  )}
                </Stack>
                <Button
                  size="xs"
                  color="orange"
                  loading={adaptMutation.isPending}
                  onClick={() => adaptMutation.mutate()}
                >
                  Переадаптировать
                </Button>
              </Group>
            </Alert>
          )}

          {/* ── Alert strip ──────────────────────────────────────────────── */}
          {alertAthletes.length > 0 && (
            <Box
              mb="md"
              style={{
                border: '1px solid #ffc9c9',
                borderLeft: '3px solid #C8102E',
                borderRadius: 8,
                padding: '8px 14px',
                background: '#fff5f5',
              }}
            >
              <Group justify="space-between" mb={alertsCollapsed ? 0 : 8}>
                <Group gap="xs">
                  <Text size="sm" fw={700} style={{ color: '#C8102E' }}>⚠ Требуют внимания</Text>
                  <Box style={{
                    background: '#C8102E', color: '#fff', borderRadius: 10,
                    fontSize: 11, fontWeight: 700, padding: '1px 7px', lineHeight: '18px',
                  }}>
                    {alertAthletes.length}
                  </Box>
                </Group>
                <UnstyledButton
                  onClick={() => setAlertsCollapsed((v) => !v)}
                  style={{ fontSize: 12, color: '#868e96', userSelect: 'none' }}
                >
                  {alertsCollapsed ? 'Развернуть ▼' : 'Свернуть ▲'}
                </UnstyledButton>
              </Group>
              <Collapse in={!alertsCollapsed}>
                <Group gap={6} wrap="wrap">
                  {alertAthletes.map((a) => (
                    <MatrixAlertPill
                      key={a.id}
                      name={`${a.last_name} ${a.first_name}`}
                      alerts={a.alerts}
                    />
                  ))}
                </Group>
              </Collapse>
            </Box>
          )}

          {/* ── Grid ─────────────────────────────────────────────────────── */}
          <ScrollArea>
            <div style={{ minWidth: ATHLETE_COL + 7 * 120 + TOTALS_COL }}>

              {/* Header row */}
              <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 3, marginBottom: 3 }}>
                <div style={{
                  padding: '6px 8px',
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  background: '#fff',
                }}>
                  <Text size="xs" fw={600} c="dimmed">Атлет</Text>
                </div>
                {weekDates.map((d, i) => {
                  const iso = weekDateStrs[i]
                  const inPlan = template && iso >= template.start_date
                    && iso <= isoDate(addDays(template.start_date, template.duration_days - 1))
                  const isToday = iso === today
                  return (
                    <div key={iso} style={{
                      padding: '6px 4px',
                      textAlign: 'center',
                      background: isToday ? '#fff5f5' : !inPlan ? '#f8f9fa' : undefined,
                      borderRadius: 6,
                      opacity: inPlan ? 1 : 0.4,
                    }}>
                      <Text size="xs" fw={600} c={isToday ? 'red' : 'dimmed'}>
                        {formatDateHeader(d)}
                      </Text>
                    </div>
                  )
                })}
                <div style={{ padding: '6px 8px', textAlign: 'center' }}>
                  <Text size="xs" fw={600} c="dimmed">Неделя</Text>
                </div>
              </div>

              {/* Athlete rows */}
              {athletes.length === 0 && (
                <Text c="dimmed" ta="center" py="xl">Нет данных</Text>
              )}

              {athletes.map((athlete) => {
                const athleteName = `${athlete.last_name} ${athlete.first_name}`
                const dateMap = byAthleteDate.get(athlete.id)

                const weekWorkouts = workouts.filter(
                  (w) => w.athlete_id === athlete.id && weekDateStrs.includes(w.planned_date)
                )
                const weekTotalMin = weekWorkouts.reduce((s, w) => s + (w.planned_duration_min ?? 0), 0)
                const weekTotalHrs = `${Math.floor(weekTotalMin / 60)}:${String(weekTotalMin % 60).padStart(2, '0')}`
                const weekTotalTss = weekWorkouts.reduce((s, w) => s + (w.planned_tss ?? 0), 0)

                return (
                  <div
                    key={athlete.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: GRID,
                      gap: 3,
                      marginBottom: 3,
                      alignItems: 'start',
                    }}
                  >
                    {/* Athlete name — sticky */}
                    <div style={{
                      padding: '8px 8px',
                      borderRadius: 6,
                      background: '#fff',
                      border: '1px solid #f1f3f5',
                      display: 'flex',
                      alignItems: 'center',
                      position: 'sticky',
                      left: 0,
                      zIndex: 1,
                    }}>
                      <Text size="sm" fw={600} style={{ lineHeight: 1.3 }}>
                        {athlete.last_name} {athlete.first_name[0]}.
                      </Text>
                    </div>

                    {/* Day cells */}
                    {weekDates.map((_, i) => {
                      const iso = weekDateStrs[i]
                      const inPlan = template && iso >= template.start_date
                        && iso <= isoDate(addDays(template.start_date, template.duration_days - 1))
                      const cellWorkouts = dateMap?.get(iso) ?? []

                      return (
                        <div
                          key={iso}
                          style={{
                            minHeight: 48,
                            padding: '4px',
                            background: inPlan ? '#fafafa' : '#f8f9fa',
                            borderRadius: 6,
                            border: '1px solid #f1f3f5',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 3,
                            opacity: inPlan ? 1 : 0.35,
                          }}
                        >
                          {cellWorkouts.length === 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                              <Text size="xs" c="dimmed" style={{ opacity: 0.4 }}>—</Text>
                            </div>
                          ) : (
                            cellWorkouts.map((w) => (
                              <WorkoutPill
                                key={w.id}
                                w={w}
                                alerts={alertsByWorkout.get(w.id) ?? []}
                                onClick={() => openWorkout(w, athleteName)}
                              />
                            ))
                          )}
                        </div>
                      )
                    })}

                    {/* Weekly totals cell */}
                    <div style={{
                      padding: '8px 6px',
                      borderRadius: 6,
                      background: '#f8f9fa',
                      border: '1px solid #f1f3f5',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      gap: 2,
                      minHeight: 48,
                    }}>
                      {weekTotalMin > 0 && (
                        <Text size="xs" fw={600} c="dimmed" style={{ lineHeight: 1 }}>
                          {weekTotalHrs}
                        </Text>
                      )}
                      {weekTotalTss > 0 && (
                        <Text size="xs" c="dimmed" style={{ lineHeight: 1 }}>
                          {Math.round(weekTotalTss)} TSS
                        </Text>
                      )}
                      {weekTotalMin === 0 && weekTotalTss === 0 && (
                        <Text size="xs" c="dimmed" style={{ opacity: 0.4, lineHeight: 1 }}>—</Text>
                      )}
                    </div>
                  </div>
                )
              })}

            </div>
          </ScrollArea>
        </>
      )}

      {/* ── Workout detail modal ──────────────────────────────────────────── */}
      <WorkoutDetailModal
        workout={modalWorkout}
        onClose={() => { setModalWorkout(null); setModalWorkoutId(null); setModalAthleteId(null); setModalOnEdit(null) }}
        onEdit={modalOnEdit ?? undefined}
        hrZones={modalAthleteId ? hrZonesByAthlete.get(modalAthleteId) : undefined}
        alerts={modalWorkoutId ? alertsByWorkout.get(modalWorkoutId) : undefined}
      />

      {/* ── Edit form modal ───────────────────────────────────────────────── */}
      {formModal && (
        <WorkoutFormModal
          {...formModal}
          onSave={invalidate}
          onClose={() => setFormModal(null)}
        />
      )}

      {/* ── Conflict confirmation modal ───────────────────────────────────── */}
      <Modal
        opened={!!conflictModal}
        onClose={() => setConflictModal(null)}
        title={<Text fw={600}>Конфликты расписания</Text>}
        size="md"
      >
        {conflictModal && (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              У следующих атлетов уже есть запланированные или выполненные тренировки
              из другого плана на эти дни:
            </Text>
            <Divider />
            {conflictModal.conflicts.map((c, i) => (
              <Group key={i} gap="sm" wrap="nowrap">
                <Text size="sm" fw={600} style={{ minWidth: 140 }}>
                  {c.last_name} {c.first_name}
                </Text>
                <Text size="sm" c="dimmed">
                  {new Date(c.planned_date + 'T00:00:00').toLocaleDateString('ru-RU', {
                    weekday: 'short', day: 'numeric', month: 'short',
                  })}
                </Text>
                <Text size="xs" c="dimmed">({c.workout_count} тр.)</Text>
              </Group>
            ))}
            <Divider />
            <Text size="xs" c="dimmed">
              Утверждение добавит тренировки поверх существующих. Атлет увидит оба варианта.
            </Text>
            <Group justify="flex-end" gap="sm" mt="xs">
              <Button variant="default" onClick={() => setConflictModal(null)}>
                Отмена
              </Button>
              <Button
                color="teal"
                loading={approveWeek.isPending}
                onClick={() => {
                  approveWeek.mutate(conflictModal.weekStart)
                  setConflictModal(null)
                }}
              >
                Утвердить всё равно
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Box>
  )
}
