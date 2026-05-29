import {
  Badge,
  Box,
  Button,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { plansApi } from '../api/plans'
import SportIcon, { SPORT_COLOR } from '../components/SportIcon'
import WorkoutDetailModal from '../components/WorkoutDetailModal'
import WorkoutFormModal, { type WorkoutFormData } from '../components/WorkoutFormModal'
import type { WorkoutDetail } from '../components/WorkoutDetailModal'
import type { IntervalSegment } from '../components/IntervalBar'

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

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']
const DAY_SHORT   = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб']

const STATUS_DOT: Record<string, string> = {
  draft:     '#adb5bd',
  published: '#228be6',
  completed: '#2f9e44',
}
const STATUS_LABEL: Record<string, string> = {
  draft:     'Черновик',
  published: 'Опубликовано',
  completed: 'Выполнено',
}

const ATHLETE_COL = 180
const GRID = `${ATHLETE_COL}px repeat(7, minmax(120px, 1fr))`

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

function WorkoutPill({ w, onClick }: { w: MatrixWorkout; onClick: () => void }) {
  const color  = SPORT_COLOR[w.workout_type ?? 'other'] ?? '#adb5bd'
  const dot    = STATUS_DOT[w.status] ?? '#adb5bd'
  const isRest = w.workout_type === 'rest'

  return (
    <Box
      onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{
        border: `1px solid #dee2e6`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 4,
        padding: '3px 6px',
        cursor: 'pointer',
        background: '#fff',
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
        <Group gap={4} wrap="nowrap" align="center">
          <SportIcon type={w.workout_type ?? 'other'} size={12} color={color} />
          {w.target_zone && (
            <Text size="xs" fw={700} style={{ color, lineHeight: 1, whiteSpace: 'nowrap' }}>
              {w.target_zone}
            </Text>
          )}
          {w.planned_duration_min != null && (
            <Text size="xs" c="dimmed" style={{ lineHeight: 1, whiteSpace: 'nowrap' }}>
              {w.planned_duration_min}м
            </Text>
          )}
          {w.interval_structure && w.interval_structure.length > 0 && (
            <Text size="xs" c="orange" fw={700} style={{ lineHeight: 1, fontSize: 9 }}>И</Text>
          )}
          <Tooltip label={STATUS_LABEL[w.status] ?? w.status} withArrow>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
          </Tooltip>
        </Group>
      )}
    </Box>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Matrix() {
  const { templateId } = useParams<{ templateId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [weekOffset, setWeekOffset] = useState(0)
  const [modalWorkout, setModalWorkout]   = useState<WorkoutDetail | null>(null)
  const [modalOnEdit, setModalOnEdit]     = useState<(() => void) | null>(null)
  const [formModal, setFormModal]         = useState<
    { mode: 'edit'; workout: WorkoutFormData; athleteName: string } | null
  >(null)

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

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['matrix', templateId] })

  // ── Approve week mutation ────────────────────────────────────────────────────

  const approveWeek = useMutation({
    mutationFn: (weekStart: string) => plansApi.approveAll(templateId!, weekStart),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })

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

  // Count drafts in current week
  const weekDraftCount = workouts.filter(
    (w) => w.status === 'draft' && weekDateStrs.includes(w.planned_date)
  ).length

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
                loading={approveWeek.isPending}
                onClick={() => approveWeek.mutate(weekDateStrs[0])}
              >
                Утвердить неделю {clampedOffset + 1}
                {weekDraftCount > 0 ? ` (${weekDraftCount})` : ''}
              </Button>
            </Group>
          </Group>

          {/* ── Grid ─────────────────────────────────────────────────────── */}
          <ScrollArea>
            <div style={{ minWidth: ATHLETE_COL + 7 * 120 }}>

              {/* Header row */}
              <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 3, marginBottom: 3 }}>
                <div style={{ padding: '6px 8px' }}>
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
              </div>

              {/* Athlete rows */}
              {athletes.length === 0 && (
                <Text c="dimmed" ta="center" py="xl">Нет данных</Text>
              )}

              {athletes.map((athlete) => {
                const athleteName = `${athlete.last_name} ${athlete.first_name}`
                const dateMap = byAthleteDate.get(athlete.id)

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
                    {/* Athlete name */}
                    <div style={{
                      padding: '8px 8px',
                      borderRadius: 6,
                      background: '#fff',
                      border: '1px solid #f1f3f5',
                      display: 'flex',
                      alignItems: 'center',
                    }}>
                      <Text size="sm" fw={600} style={{ lineHeight: 1.3 }}>
                        {athlete.last_name} {athlete.first_name[0]}.
                      </Text>
                    </div>

                    {/* Day cells */}
                    {weekDates.map((d, i) => {
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
                                onClick={() => openWorkout(w, athleteName)}
                              />
                            ))
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {/* Weekly totals row */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: GRID,
                gap: 3,
                marginTop: 6,
                paddingTop: 6,
                borderTop: '1px solid #dee2e6',
              }}>
                <div style={{ padding: '4px 8px' }}>
                  <Text size="xs" fw={600} c="dimmed">Итого / день</Text>
                </div>
                {weekDateStrs.map((_, i) => {
                  const iso = weekDateStrs[i]
                  const dayWorkouts = workouts.filter((w) => w.planned_date === iso)
                  const totalMin = dayWorkouts.reduce((s, w) => s + (w.planned_duration_min ?? 0), 0)
                  const draftN = dayWorkouts.filter((w) => w.status === 'draft').length
                  const pubN   = dayWorkouts.filter((w) => w.status === 'published').length
                  return (
                    <div key={iso} style={{ padding: '4px', textAlign: 'center' }}>
                      {dayWorkouts.length > 0 && (
                        <Stack gap={1} align="center">
                          {totalMin > 0 && (
                            <Text size="xs" c="dimmed">{totalMin}м</Text>
                          )}
                          <Group gap={4} justify="center" wrap="nowrap">
                            {draftN > 0 && (
                              <Badge size="xs" color="gray" variant="light">{draftN}</Badge>
                            )}
                            {pubN > 0 && (
                              <Badge size="xs" color="blue" variant="light">{pubN}</Badge>
                            )}
                          </Group>
                        </Stack>
                      )}
                    </div>
                  )
                })}
              </div>

            </div>
          </ScrollArea>
        </>
      )}

      {/* ── Workout detail modal ──────────────────────────────────────────── */}
      <WorkoutDetailModal
        workout={modalWorkout}
        onClose={() => { setModalWorkout(null); setModalOnEdit(null) }}
        onEdit={modalOnEdit ?? undefined}
      />

      {/* ── Edit form modal ───────────────────────────────────────────────── */}
      {formModal && (
        <WorkoutFormModal
          {...formModal}
          onSave={invalidate}
          onClose={() => setFormModal(null)}
        />
      )}
    </Box>
  )
}
