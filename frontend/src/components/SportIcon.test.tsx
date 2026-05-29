import { render } from '@testing-library/react'
import SportIcon, { SPORT_COLOR, SPORT_LABEL } from './SportIcon'

describe('SportIcon', () => {
  describe('рендер SVG', () => {
    const types = ['run', 'ski', 'skiroll', 'bike', 'strength', 'recovery', 'rest', 'other']

    types.forEach((type) => {
      it(`рендерит SVG для типа "${type}"`, () => {
        const { container } = render(<SportIcon type={type} />)
        expect(container.querySelector('svg')).not.toBeNull()
      })
    })

    it('рендерит SVG для неизвестного типа (fallback Other)', () => {
      const { container } = render(<SportIcon type="unknown_sport" />)
      expect(container.querySelector('svg')).not.toBeNull()
    })

    it('рендерит SVG когда type = null', () => {
      const { container } = render(<SportIcon type={null} />)
      expect(container.querySelector('svg')).not.toBeNull()
    })
  })

  describe('размер', () => {
    it('использует размер 24 по умолчанию', () => {
      const { container } = render(<SportIcon type="run" />)
      const svg = container.querySelector('svg')!
      expect(svg.getAttribute('width')).toBe('24')
      expect(svg.getAttribute('height')).toBe('24')
    })

    it('применяет заданный размер', () => {
      const { container } = render(<SportIcon type="run" size={48} />)
      const svg = container.querySelector('svg')!
      expect(svg.getAttribute('width')).toBe('48')
      expect(svg.getAttribute('height')).toBe('48')
    })
  })

  describe('цвет', () => {
    it('использует цвет из SPORT_COLOR по типу по умолчанию', () => {
      const { container } = render(<SportIcon type="run" />)
      const svg = container.querySelector('svg')!
      expect(svg.getAttribute('stroke')).toBe(SPORT_COLOR['run'])
    })

    it('prop color перекрывает дефолтный цвет', () => {
      const { container } = render(<SportIcon type="run" color="#ff0000" />)
      const svg = container.querySelector('svg')!
      expect(svg.getAttribute('stroke')).toBe('#ff0000')
    })

    it('SPORT_COLOR содержит записи для всех типов', () => {
      const types = ['ski', 'skiroll', 'run', 'bike', 'strength', 'recovery', 'rest', 'other']
      types.forEach((t) => expect(SPORT_COLOR[t]).toBeDefined())
    })
  })

  describe('SPORT_LABEL', () => {
    it('содержит читаемые названия на русском', () => {
      expect(SPORT_LABEL['run']).toBe('Бег')
      expect(SPORT_LABEL['ski']).toBe('Лыжи')
      expect(SPORT_LABEL['rest']).toBe('Отдых')
    })
  })
})
