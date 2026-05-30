import { Box, Group, Text, UnstyledButton } from '@mantine/core'
import { Fragment } from 'react'
import { useNavigate } from 'react-router-dom'

// ─── Этапы процесса планирования ───────────────────────────────────────────────

interface Step {
  n: number
  label: string
  hint: string
}

const STEPS: Step[] = [
  { n: 1, label: 'Шаблон',      hint: 'Составить микроцикл' },
  { n: 2, label: 'Расчёт',      hint: 'Адаптация под атлетов' },
  { n: 3, label: 'Проверка',    hint: 'Матрица по атлетам' },
  { n: 4, label: 'Утверждение', hint: 'Опубликовать план' },
]

const ACCENT = '#C8102E'

/**
 * Горизонтальный степпер этапов планирования.
 * current — текущий активный шаг (1–4). Клик по шагу 1–2 ведёт в редактор,
 * по 3–4 — в матрицу (если задан templateId).
 */
export default function PlanStepper({
  current,
  templateId,
}: {
  current: number
  templateId?: string
}) {
  const navigate = useNavigate()

  const go = (n: number) => {
    if (!templateId) return
    navigate(n <= 2 ? `/planning/${templateId}` : `/planning/${templateId}/matrix`)
  }

  return (
    <Group gap={0} wrap="nowrap" mb="md" align="center">
      {STEPS.map((s, i) => {
        const state: 'done' | 'active' | 'future' =
          s.n < current ? 'done' : s.n === current ? 'active' : 'future'
        const filled = state !== 'future'
        return (
          <Fragment key={s.n}>
            <UnstyledButton
              onClick={() => go(s.n)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                cursor: templateId ? 'pointer' : 'default',
                opacity: state === 'future' ? 0.65 : 1,
              }}
            >
              <div style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: filled ? ACCENT : '#fff',
                border: `2px solid ${filled ? ACCENT : '#dee2e6'}`,
                color: filled ? '#fff' : '#adb5bd',
                fontWeight: 700, fontSize: 13,
              }}>
                {state === 'done' ? '✓' : s.n}
              </div>
              <Box visibleFrom="sm">
                <Text size="sm" fw={state === 'active' ? 700 : 500}
                  style={{ lineHeight: 1.1, color: state === 'active' ? '#212529' : '#495057' }}>
                  {s.label}
                </Text>
                <Text size="xs" c="dimmed" style={{ lineHeight: 1.1 }}>{s.hint}</Text>
              </Box>
            </UnstyledButton>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: '#dee2e6', margin: '0 12px', minWidth: 16 }} />
            )}
          </Fragment>
        )
      })}
    </Group>
  )
}
