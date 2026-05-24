import {
  Avatar,
  Box,
  Button,
  Collapse,
  Group,
  Loader,
  ScrollArea,
  Select,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyticsApi } from '../api/analytics'
import { groupsApi } from '../api/groups'
import SportIcon from '../components/SportIcon'
import WorkoutDetailModal, { type WorkoutDetail } from '../components/WorkoutDetailModal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrainingGroup { id: string; name: string }

interface WeekWorkout {
  id: string
  planned_date: string
  workout_type: string | null
  workout_subtype: string | null
  target_zone: string | null
  planned_duration_min: number | null
  planned_tss: number | null
  actual_tss: number | null
  actual_duration_min: number | null
  distance_km: number | null
  status: string
  description: string | null
}

interface WeekAthlete {
  athlete_id: string
  full_name: string
  tsb: number | null
  atl: number | null
  ctl: number | null
  alert_severity: 'critical' | 'warning' | 'info' | null
  workouts: WeekWorkout[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTH_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']

const SPORT_COLOR: Record<string, string> = {
  ski:      '#228be6',
  skiroll:  '#4dabf7',
  run:      '#2f9e44',
  bike:     '#0ca678',
  strength: '#e8590c',
  recovery: '#7048e8',
  rest:     '#adb5bd',
  other:    '#495057',
}

const ZONE_COLOR: Record<string, string> = {
  Z1: '#74c0fc', Z2: '#40c057', Z3: '#fab005', Z4: '#fd7e14', Z5: '#fa5252',
}

const STATUS_META: Record<string, { label: string; dot: string }> = {
  draft:     { label: 'Черновик',      dot: '#adb5bd' },
  published: { label: 'Опубликовано',  dot: '#228be6' },
  completed: { label: 'Выполнено',     dot: '#2f9e44' },
}

const ALERT_META: Record<string, { icon: string; color: string; label: string }> = {
  critical: { icon: '●', color: '#C8102E', label: 'Критический' },
  warning:  { icon: '▲', color: '#f76707', label: 'Предупреждение' },
  info:     { icon: 'ℹ', color: '#1c7ed6', label: 'Информация' },
}

const ATHLETE_COL  = 230   // px, fixed athlete column width
const SUMMARY_COL  = 155   // px, fixed summary column width
const GRID = `${ATHLETE_COL}px repeat(7, minmax(148px, 1fr)) ${SUMMARY_COL}px`

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getWeekDates(offset: number): Date[] {
  const now = new Date()
  const dow = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7)
  monday.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function formatWeekRange(dates: Date[]): string {
  const s = dates[0], e = dates[6]
  if (s.getMonth() === e.getMonth())
    return `${s.getDate()}–${e.getDate()} ${MONTH_SHORT[e.getMonth()]} ${e.getFullYear()}`
  return `${s.getDate()} ${MONTH_SHORT[s.getMonth()]} – ${e.getDate()} ${MONTH_SHORT[e.getMonth()]} ${e.getFullYear()}`
}

function initials(name: string): string {
  const parts = name.trim().split(' ')
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function WorkoutCard({ w, onClick }: { w: WeekWorkout; onClick: () => void }) {
  const color  = SPORT_COLOR[w.workout_type ?? 'other'] ?? '#adb5bd'
  const status = STATUS_META[w.status] ?? STATUS_META.draft
  const isRest = w.workout_type === 'rest'

  return (
    <Box
      onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{
        border: '1px solid #dee2e6',
        borderRadius: 6,
        overflow: 'hidden',
        cursor: 'pointer',
        background: '#fff',
        transition: 'box-shadow 0.15s, transform 0.1s',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.transform = 'none'
      }}
    >
      {/* Colored top stripe */}
      <div style={{ height: 3, background: color }} />

      <div style={{ padding: '7px 10px 8px' }}>
        {isRest ? (
          <Text size="sm" c="dimmed">Отдых</Text>
        ) : (
          <>
            <Group gap={5} wrap="nowrap" align="center" mb={4}>
              <SportIcon type={w.workout_type ?? 'other'} size={18} color={color} />
              <Text size="sm" fw={700} style={{ color, lineHeight: 1, whiteSpace: 'nowrap' }}>
                {w.target_zone ?? '—'}
              </Text>
              {w.planned_duration_min != null && (
                <Text size="xs" c="dimmed" style={{ lineHeight: 1, whiteSpace: 'nowrap' }}>
                  {w.planned_duration_min}м
                </Text>
              )}
            </Group>
            {w.planned_tss != null && (
              <Text size="xs" c="dimmed" style={{ lineHeight: 1.3 }}>
                TSS {Number(w.planned_tss).toFixed(0)}
              </Text>
            )}
          </>
        )}

        {/* Status dot */}
        <Group gap={4} mt={5} wrap="nowrap" align="center">
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: status.dot, flexShrink: 0 }} />
          <Text size="xs" c="dimmed" style={{ lineHeight: 1 }}>{status.label}</Text>
        </Group>
      </div>
    </Box>
  )
}

function EmptyCell() {
  return (
    <div style={{
      border: '1px dashed #dee2e6',
      borderRadius: 6,
      height: 96,
      background: '#fafafa',
    }} />
  )
}

function ZoneBar({ workouts }: { workouts: WeekWorkout[] }) {
  const zoneMin: Record<string, number> = {}
  for (const w of workouts) {
    if (w.target_zone && w.planned_duration_min) {
      zoneMin[w.target_zone] = (zoneMin[w.target_zone] ?? 0) + w.planned_duration_min
    }
  }
  const total = Object.values(zoneMin).reduce((s, m) => s + m, 0)
  if (total === 0) return <Text size="xs" c="dimmed">Нет данных по зонам</Text>

  const zones = ['Z1','Z2','Z3','Z4','Z5'].filter((z) => zoneMin[z])
  return (
    <Group gap={6} align="center" wrap="nowrap">
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', flex: 1 }}>
        {zones.map((z) => (
          <Tooltip key={z} label={`${z}: ${zoneMin[z]}мин`} withArrow>
            <div
              style={{
                width: `${(zoneMin[z] / total) * 100}%`,
                background: ZONE_COLOR[z] ?? '#adb5bd',
                minWidth: 4,
              }}
            />
          </Tooltip>
        ))}
      </div>
      <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
        {zones.map((z) => (
          <Group key={z} gap={3} wrap="nowrap" align="center">
            <div style={{ width: 8, height: 8, borderRadius: 2, background: ZONE_COLOR[z] ?? '#adb5bd' }} />
            <Text size="xs" c="dimmed">{z}</Text>
          </Group>
        ))}
      </Group>
    </Group>
  )
}

// ─── Weekly summary ───────────────────────────────────────────────────────────

function WeeklySummary({ athlete }: { athlete: WeekAthlete }) {
  const done = athlete.workouts.filter((w) => w.status === 'completed')

  const totalMin = done.reduce((s, w) => s + (w.actual_duration_min ?? 0), 0)
  const totalKm  = done.reduce((s, w) => s + (w.distance_km != null ? Number(w.distance_km) : 0), 0)

  const hours = Math.floor(totalMin / 60)
  const mins  = totalMin % 60

  const { tsb, atl, ctl } = athlete
  const tsbColor =
    tsb === null  ? '#adb5bd'
    : tsb >= -10  ? '#2f9e44'
    : tsb >= -25  ? '#f76707'
    :               '#C8102E'

  const hasVolume = totalMin > 0 || totalKm > 0
  const hasForm   = tsb !== null || atl !== null || ctl !== null

  if (!hasVolume && !hasForm) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Text size="xs" c="dimmed">—</Text>
      </div>
    )
  }

  return (
    <Stack gap={6} style={{ padding: '6px 10px' }}>

      {/* Объём */}
      {hasVolume && (
        <Stack gap={3}>
          {totalMin > 0 && (
            <Group gap={6} wrap="nowrap">
              <Text size="xs" c="dimmed" style={{ width: 20, textAlign: 'right', flexShrink: 0 }}>ч</Text>
              <Text size="xs" fw={600}>
                {hours > 0 ? `${hours}ч ` : ''}{mins > 0 ? `${mins}м` : hours === 0 ? '0м' : ''}
              </Text>
            </Group>
          )}
          {totalKm > 0 && (
            <Group gap={6} wrap="nowrap">
              <Text size="xs" c="dimmed" style={{ width: 20, textAlign: 'right', flexShrink: 0 }}>км</Text>
              <Text size="xs" fw={600}>{totalKm.toFixed(1)}</Text>
            </Group>
          )}
        </Stack>
      )}

      {/* Форма */}
      {hasForm && (
        <div style={{
          borderTop: hasVolume ? '1px solid #f1f3f5' : undefined,
          paddingTop: hasVolume ? 6 : 0,
        }}>
          <Stack gap={2}>
            {atl !== null && (
              <Group gap={0} justify="space-between" wrap="nowrap">
                <Text size="xs" c="dimmed">ATL</Text>
                <Text size="xs" fw={600}>{atl.toFixed(1)}</Text>
              </Group>
            )}
            {ctl !== null && (
              <Group gap={0} justify="space-between" wrap="nowrap">
                <Text size="xs" c="dimmed">CTL</Text>
                <Text size="xs" fw={600}>{ctl.toFixed(1)}</Text>
              </Group>
            )}
            {tsb !== null && (
              <Group gap={0} justify="space-between" wrap="nowrap">
                <Text size="xs" c="dimmed">TSB</Text>
                <Text size="xs" fw={700} style={{ color: tsbColor }}>
                  {tsb >= 0 ? '+' : ''}{tsb.toFixed(1)}
                </Text>
              </Group>
            )}
          </Stack>
        </div>
      )}
    </Stack>
  )
}


// ─── Main component ───────────────────────────────────────────────────────────

export default function CoachDashboard() {
  const navigate = useNavigate()

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [weekOffset, setWeekOffset]           = useState(0)
  const [expandedRows, setExpandedRows]       = useState<Set<string>>(new Set())
  const [modalWorkout, setModalWorkout] = useState<WorkoutDetail | null>(null)

  const weekDates   = useMemo(() => getWeekDates(weekOffset), [weekOffset])
  const weekStartStr = isoDate(weekDates[0])
  const today        = isoDate(new Date())

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: groups = [] } = useQuery<TrainingGroup[]>({
    queryKey: ['groups'],
    queryFn: groupsApi.list,
  })

  useEffect(() => {
    if (!selectedGroupId && groups.length > 0) setSelectedGroupId(groups[0].id)
  }, [groups, selectedGroupId])

  const { data: athletes = [], isFetching } = useQuery<WeekAthlete[]>({
    queryKey: ['group-week', selectedGroupId, weekStartStr],
    queryFn: () => analyticsApi.getGroupWeek(selectedGroupId!, weekStartStr),
    enabled: !!selectedGroupId,
  })

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const toggleExpand = (id: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const openWorkout = (w: WeekWorkout, name: string) => {
    setModalWorkout({
      ...w,
      actual_distance_km: w.distance_km,
      athlete_name: name,
    })
  }

  const groupOptions = groups.map((g) => ({ value: g.id, label: g.name }))

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Box px="md" py="md">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <Group justify="space-between" mb="md" wrap="nowrap" gap="md">
        <Select
          data={groupOptions}
          value={selectedGroupId}
          onChange={setSelectedGroupId}
          placeholder="Выберите группу"
          style={{ minWidth: 220 }}
          size="sm"
        />

        <Group gap={6} wrap="nowrap">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            style={{ background: 'none', border: '1px solid #dee2e6', borderRadius: 6,
              padding: '4px 12px', cursor: 'pointer', fontSize: 16 }}>
            ‹
          </button>
          <Text fw={600} size="sm" style={{ minWidth: 200, textAlign: 'center' }}>
            {formatWeekRange(weekDates)}
          </Text>
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            style={{ background: 'none', border: '1px solid #dee2e6', borderRadius: 6,
              padding: '4px 12px', cursor: 'pointer', fontSize: 16 }}>
            ›
          </button>
          {weekOffset !== 0 && (
            <Button size="xs" variant="subtle" onClick={() => setWeekOffset(0)}>Сегодня</Button>
          )}
        </Group>

        <Button size="sm" variant="light" onClick={() => navigate('/planning')}>
          + Новый шаблон
        </Button>
      </Group>

      {/* ── Matrix ──────────────────────────────────────────────────────── */}
      {!selectedGroupId ? (
        <Text c="dimmed" ta="center" mt="xl">Выберите группу</Text>
      ) : (
        <ScrollArea>
          <div style={{ minWidth: ATHLETE_COL + 7 * 148 + SUMMARY_COL }}>

            {/* Header row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: GRID,
              gap: 3,
              marginBottom: 3,
            }}>
              <div style={{ padding: '6px 8px' }}>
                {isFetching && <Loader size="xs" />}
              </div>
              {weekDates.map((d, i) => {
                const iso = isoDate(d)
                const isToday = iso === today
                return (
                  <div key={iso} style={{
                    padding: '6px 4px',
                    textAlign: 'center',
                    background: isToday ? '#fff5f5' : undefined,
                    borderRadius: 6,
                  }}>
                    <Text size="xs" fw={600} c={isToday ? 'red' : 'dimmed'}>{DAY_SHORT[i]}</Text>
                    <Text size="xs" fw={isToday ? 700 : 400} c={isToday ? 'red' : undefined}>
                      {d.getDate()} {MONTH_SHORT[d.getMonth()]}
                    </Text>
                  </div>
                )
              })}
              {/* Summary column header */}
              <div style={{ padding: '6px 8px', textAlign: 'center' }}>
                <Text size="xs" fw={600} c="dimmed">Итоги</Text>
              </div>
            </div>

            {/* Athlete rows */}
            {athletes.length === 0 && !isFetching && (
              <Text c="dimmed" ta="center" py="xl">Нет атлетов в группе</Text>
            )}

            {athletes.map((athlete) => {
              const byDate = new Map<string, WeekWorkout>()
              for (const w of athlete.workouts) byDate.set(w.planned_date, w)

              const expanded = expandedRows.has(athlete.athlete_id)
              const alert    = athlete.alert_severity ? ALERT_META[athlete.alert_severity] : null
              const tsb      = athlete.tsb
              const tsbColor = tsb === null ? '#adb5bd' : tsb >= 0 ? '#2f9e44' : '#C8102E'

              const plannedTss = athlete.workouts.reduce(
                (s, w) => s + (w.planned_tss != null ? Number(w.planned_tss) : 0), 0,
              )
              const actualTss = athlete.workouts.reduce(
                (s, w) => s + (w.actual_tss != null ? Number(w.actual_tss) : 0), 0,
              )
              const hasActual = athlete.workouts.some((w) => w.actual_tss != null)

              return (
                <Fragment key={athlete.athlete_id}>
                  {/* Main row */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: GRID,
                    gap: 3,
                    marginBottom: 3,
                    alignItems: 'start',
                  }}>
                    {/* Athlete info cell */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: '6px 6px',
                      borderRadius: 6,
                      background: '#fff',
                      border: '1px solid #f1f3f5',
                    }}>
                      {/* Expand toggle */}
                      <UnstyledButton
                        onClick={() => toggleExpand(athlete.athlete_id)}
                        style={{ color: '#adb5bd', fontSize: 10, lineHeight: 1, paddingTop: 2, flexShrink: 0 }}
                      >
                        {expanded ? '▼' : '▶'}
                      </UnstyledButton>

                      {/* Avatar */}
                      <Avatar
                        size={32}
                        radius="xl"
                        style={{ background: '#e9ecef', color: '#495057', fontWeight: 600, fontSize: 12, flexShrink: 0, cursor: 'pointer' }}
                        onClick={() => navigate(`/athletes/${athlete.athlete_id}`)}
                      >
                        {initials(athlete.full_name)}
                      </Avatar>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          size="sm"
                          fw={600}
                          style={{ lineHeight: 1.3, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          onClick={() => navigate(`/athletes/${athlete.athlete_id}`)}
                        >
                          {athlete.full_name}
                        </Text>
                        <Group gap={6} mt={2} wrap="nowrap">
                          {alert && (
                            <Tooltip label={alert.label} withArrow>
                              <Text size="xs" style={{ color: alert.color, lineHeight: 1 }}>
                                {alert.icon}
                              </Text>
                            </Tooltip>
                          )}
                          <Text size="xs" fw={700} style={{ color: tsbColor, lineHeight: 1 }}>
                            {tsb !== null ? (tsb >= 0 ? `+${tsb.toFixed(0)}` : tsb.toFixed(0)) : '—'}
                          </Text>
                          <Text size="xs" c="dimmed" style={{ lineHeight: 1 }}>TSB</Text>
                        </Group>
                      </div>
                    </div>

                    {/* Day cells */}
                    {weekDates.map((d) => {
                      const iso = isoDate(d)
                      const w   = byDate.get(iso)
                      return (
                        <div key={iso} style={{ minHeight: 96 }}>
                          {w
                            ? <WorkoutCard w={w} onClick={() => openWorkout(w, athlete.full_name)} />
                            : <EmptyCell />
                          }
                        </div>
                      )
                    })}

                    {/* Summary cell */}
                    <div style={{
                      border: '1px solid #f1f3f5',
                      borderRadius: 6,
                      background: '#fff',
                      minHeight: 96,
                    }}>
                      <WeeklySummary athlete={athlete} />
                    </div>
                  </div>

                  {/* Expanded stats row */}
                  <Collapse in={expanded}>
                    <div style={{
                      gridColumn: '1 / -1',
                      padding: '8px 12px 10px',
                      background: '#f8f9fa',
                      borderRadius: 6,
                      marginBottom: 4,
                      marginLeft: ATHLETE_COL - 10,
                    }}>
                      <Group gap="xl" mb={6} wrap="nowrap">
                        <Group gap={4} wrap="nowrap">
                          <Text size="xs" c="dimmed">TSS план:</Text>
                          <Text size="xs" fw={600}>{plannedTss.toFixed(0)}</Text>
                        </Group>
                        {hasActual && (
                          <Group gap={4} wrap="nowrap">
                            <Text size="xs" c="dimmed">факт:</Text>
                            <Text size="xs" fw={600} c="teal">{actualTss.toFixed(0)}</Text>
                          </Group>
                        )}
                      </Group>
                      <ZoneBar workouts={athlete.workouts} />
                    </div>
                  </Collapse>
                </Fragment>
              )
            })}
          </div>
        </ScrollArea>
      )}

      {/* ── Workout detail modal ─────────────────────────────────────────── */}
      <WorkoutDetailModal
        workout={modalWorkout}
        onClose={() => setModalWorkout(null)}
      />
    </Box>
  )
}
