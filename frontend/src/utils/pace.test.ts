import { calcPaceSpeed } from './pace'

describe('calcPaceSpeed', () => {
  describe('run — возвращает темп мин/км', () => {
    it('10 мин / 2 км = 5:00 мин/км', () => {
      expect(calcPaceSpeed(10, 2, 'run')).toBe('5:00 мин/км')
    })

    it('секунды дополняются нулём: 10 мин / 3 км ≈ 3:20', () => {
      expect(calcPaceSpeed(10, 3, 'run')).toBe('3:20 мин/км')
    })

    it('принимает строки вместо чисел', () => {
      expect(calcPaceSpeed('12', '4', 'run')).toBe('3:00 мин/км')
    })
  })

  describe('bike — возвращает скорость км/ч', () => {
    it('60 мин / 30 км = 30.0 км/ч', () => {
      expect(calcPaceSpeed(60, 30, 'bike')).toBe('30.0 км/ч')
    })

    it('работает для ski', () => {
      expect(calcPaceSpeed(60, 20, 'ski')).toBe('20.0 км/ч')
    })

    it('работает для skiroll', () => {
      expect(calcPaceSpeed(30, 10, 'skiroll')).toBe('20.0 км/ч')
    })
  })

  describe('граничные случаи', () => {
    it('возвращает null при duration = 0', () => {
      expect(calcPaceSpeed(0, 10, 'run')).toBeNull()
    })

    it('возвращает null при distance = 0', () => {
      expect(calcPaceSpeed(60, 0, 'bike')).toBeNull()
    })

    it('возвращает null при отрицательной дистанции', () => {
      expect(calcPaceSpeed(60, -5, 'run')).toBeNull()
    })

    it('возвращает null для strength (нет дистанции)', () => {
      expect(calcPaceSpeed(60, 0, 'strength')).toBeNull()
    })
  })
})
