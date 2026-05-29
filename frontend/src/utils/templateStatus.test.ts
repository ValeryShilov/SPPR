import { templateStatus } from './templateStatus'

describe('templateStatus', () => {
  it('gray + "Не адаптирован" когда нет тренировок', () => {
    const st = templateStatus({ total_workouts: 0, draft_count: 0, published_count: 0 })
    expect(st.color).toBe('gray')
    expect(st.label).toBe('Не адаптирован')
  })

  it('orange + "Черновик" когда все тренировки в черновике', () => {
    const st = templateStatus({ total_workouts: 5, draft_count: 5, published_count: 0 })
    expect(st.color).toBe('orange')
    expect(st.label).toBe('Черновик (5)')
  })

  it('yellow + "Частично" когда есть и черновики, и опубликованные', () => {
    const st = templateStatus({ total_workouts: 10, draft_count: 3, published_count: 7 })
    expect(st.color).toBe('yellow')
    expect(st.label).toBe('Частично (7/10)')
  })

  it('green + "Утверждён" когда черновиков нет', () => {
    const st = templateStatus({ total_workouts: 8, draft_count: 0, published_count: 8 })
    expect(st.color).toBe('green')
    expect(st.label).toBe('Утверждён (8)')
  })

  it('hint содержит инструкцию для каждого состояния', () => {
    expect(templateStatus({ total_workouts: 0, draft_count: 0, published_count: 0 }).hint).toBeTruthy()
    expect(templateStatus({ total_workouts: 3, draft_count: 3, published_count: 0 }).hint).toBeTruthy()
    expect(templateStatus({ total_workouts: 3, draft_count: 1, published_count: 2 }).hint).toBeTruthy()
    expect(templateStatus({ total_workouts: 3, draft_count: 0, published_count: 3 }).hint).toBeTruthy()
  })
})
