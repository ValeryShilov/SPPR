import { Box, Group, SegmentedControl, Text } from '@mantine/core'
import type { CSSProperties, ReactNode } from 'react'

// ─── Constants ────────────────────────────────────────────────────────────────

export const MONTH_NAMES = [
  'Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь',
]

const MONTH_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']
const DAY_ABBR    = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function isoDate(d: Date): string {
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getMondayOf(d: Date): Date {
  const c = new Date(d)
  const dow = c.getDay()
  c.setDate(c.getDate() - (dow === 0 ? 6 : dow - 1))
  return c
}

export function getWeekDates(anchor: Date): Date[] {
  const mon = getMondayOf(anchor)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon)
    d.setDate(d.getDate() + i)
    return d
  })
}

export function getMonthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  const start = getMondayOf(first)
  const grid: Date[][] = []
  const cur = new Date(start)
  while (cur <= last || grid.length < 5) {
    const week: Date[] = []
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }
    grid.push(week)
    if (cur > last && grid.length >= 5) break
  }
  return grid
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PlanCalendarProps {
  view: 'month' | 'week'
  onViewChange: (v: 'month' | 'week') => void
  displayDate: Date
  onNavigate: (dir: -1 | 1) => void
  renderDay: (date: Date, isCurrentMonth: boolean) => ReactNode
  onDayClick?: (date: Date) => void
  selectedDate?: string | null
  planStart?: string
  planEnd?: string
  monthCellHeight?: number
  weekCellHeight?: number
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const NAV_BTN: CSSProperties = {
  background: 'none',
  border: '1px solid #dee2e6',
  borderRadius: 6,
  cursor: 'pointer',
  padding: '3px 14px',
  fontSize: 18,
  lineHeight: 1.3,
  color: '#495057',
}

const GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: 3,
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PlanCalendar({
  view, onViewChange, displayDate, onNavigate,
  renderDay, onDayClick, selectedDate, planStart, planEnd,
  monthCellHeight = 96, weekCellHeight = 160,
}: PlanCalendarProps) {
  const today = isoDate(new Date())
  const year  = displayDate.getFullYear()
  const month = displayDate.getMonth()

  const inPlanRange = (d: Date): boolean => {
    const iso = isoDate(d)
    if (planStart && iso < planStart) return false
    if (planEnd   && iso > planEnd)   return false
    return true
  }

  const navTitle = view === 'week'
    ? (() => {
        const w = getWeekDates(displayDate)
        const s = w[0], e = w[6]
        return s.getMonth() === e.getMonth()
          ? `${s.getDate()}–${e.getDate()} ${MONTH_NAMES[e.getMonth()]} ${e.getFullYear()}`
          : `${s.getDate()} ${MONTH_SHORT[s.getMonth()]} – ${e.getDate()} ${MONTH_SHORT[e.getMonth()]} ${e.getFullYear()}`
      })()
    : `${MONTH_NAMES[month]} ${year}`

  const renderCell = (d: Date, inMonth: boolean) => {
    const iso     = isoDate(d)
    const isToday = iso === today
    const isSel   = iso === selectedDate
    const inRange = (planStart || planEnd) ? inPlanRange(d) : true
    const dimmed  = (!inMonth && view === 'month') || !inRange

    return (
      <Box
        key={iso}
        onClick={() => onDayClick?.(d)}
        style={{
          border: isSel ? '2px solid #C8102E' : '1px solid #e9ecef',
          borderRadius: 6,
          padding: '4px 6px',
          minHeight: view === 'week' ? weekCellHeight : monthCellHeight,
          backgroundColor: inRange ? '#fff' : '#f8f9fa',
          cursor: onDayClick ? 'pointer' : 'default',
          opacity: dimmed ? 0.32 : 1,
          overflow: 'hidden',
          boxSizing: 'border-box',
          transition: 'border-color 0.1s, opacity 0.1s',
        }}
      >
        {/* Date number */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: '50%',
          backgroundColor: isToday ? '#C8102E' : 'transparent',
          color: isToday ? '#fff' : (!inMonth ? '#adb5bd' : '#212529'),
          fontWeight: isToday ? 700 : 500,
          fontSize: 12, marginBottom: 2, flexShrink: 0,
        }}>
          {d.getDate()}
        </div>
        {/* Caller-supplied content */}
        {renderDay(d, inMonth)}
      </Box>
    )
  }

  const allDays = view === 'week'
    ? getWeekDates(displayDate)
    : getMonthGrid(year, month).flat()

  return (
    <Box>
      {/* Navigation bar */}
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Group gap={6} wrap="nowrap">
          <button style={NAV_BTN} onClick={() => onNavigate(-1)}>‹</button>
          <Text fw={600} style={{ minWidth: 200, textAlign: 'center' }}>{navTitle}</Text>
          <button style={NAV_BTN} onClick={() => onNavigate(1)}>›</button>
        </Group>
        <SegmentedControl
          size="xs"
          value={view}
          onChange={(v) => onViewChange(v as 'month' | 'week')}
          data={[
            { value: 'week',  label: 'Неделя' },
            { value: 'month', label: 'Месяц'  },
          ]}
        />
      </Group>

      {/* Weekday header */}
      <div style={{ ...GRID, marginBottom: 3 }}>
        {DAY_ABBR.map((l) => (
          <Text key={l} size="xs" fw={600} c="dimmed" ta="center" py={2}>{l}</Text>
        ))}
      </div>

      {/* Cells */}
      <div style={GRID}>
        {allDays.map((d) => renderCell(d, d.getMonth() === month))}
      </div>
    </Box>
  )
}
