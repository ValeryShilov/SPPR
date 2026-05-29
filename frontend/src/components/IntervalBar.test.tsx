import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import IntervalBar, { type IntervalSegment } from './IntervalBar'

// Без провайдера — для проверки null-return (IntervalBar возвращает null до рендера Mantine)
function renderBarRaw(segments: IntervalSegment[]) {
  return render(<IntervalBar segments={segments} />)
}

// С MantineProvider — для тестов реального рендера
function renderBar(segments: IntervalSegment[]) {
  return render(
    <MantineProvider>
      <IntervalBar segments={segments} />
    </MantineProvider>,
  )
}

const warmup: IntervalSegment = { seg_type: 'warmup', zone: 'Z1', duration_min: 10, repeats: 1 }
const work: IntervalSegment   = { seg_type: 'work',   zone: 'Z4', duration_min: 5,  repeats: 4 }
const rest: IntervalSegment   = { seg_type: 'rest_seg', zone: 'Z1', duration_min: 2, repeats: 4 }
const cool: IntervalSegment   = { seg_type: 'cooldown', zone: 'Z1', duration_min: 10, repeats: 1 }

describe('IntervalBar', () => {
  it('возвращает null для пустого массива', () => {
    const { container } = renderBarRaw([])
    expect(container.firstChild).toBeNull()
  })

  it('рендерит полосу для одного сегмента', () => {
    const { container } = renderBar([warmup])
    expect(container.querySelector('div')).not.toBeNull()
  })

  it('показывает суммарное время', () => {
    renderBar([warmup, work, rest, cool])
    // warmup=10, work=5×4=20, rest=2×4=8, cool=10 → 48 мин
    expect(screen.getByText(/48 мин/)).toBeInTheDocument()
  })

  it('показывает метку зоны для одиночного повтора', () => {
    renderBar([warmup])
    expect(screen.getByText(/Z1 10м/)).toBeInTheDocument()
  })

  it('показывает "зона × повторы" при repeats > 1', () => {
    renderBar([work])
    expect(screen.getByText(/Z4×4/)).toBeInTheDocument()
  })

  it('показывает дистанцию когда задан distance_km', () => {
    const seg: IntervalSegment = { seg_type: 'work', zone: 'Z3', duration_min: null, distance_km: 2, repeats: 1 }
    renderBar([seg])
    expect(screen.getByText(/Z3 2км/)).toBeInTheDocument()
  })

  it('не рендерит сегмент с нулевым flex (duration=null, distance=null)', () => {
    const empty: IntervalSegment = { seg_type: 'work', zone: 'Z4', duration_min: null, repeats: 1 }
    const { container } = renderBarRaw([empty])
    expect(container.firstChild).toBeNull()
  })
})
