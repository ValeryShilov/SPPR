import { pluralizeAge } from './pluralize'

describe('pluralizeAge', () => {
  it('returns "год" for 1', () => expect(pluralizeAge(1)).toBe('год'))
  it('returns "год" for 21', () => expect(pluralizeAge(21)).toBe('год'))
  it('returns "год" for 101', () => expect(pluralizeAge(101)).toBe('год'))

  it('returns "года" for 2', () => expect(pluralizeAge(2)).toBe('года'))
  it('returns "года" for 3', () => expect(pluralizeAge(3)).toBe('года'))
  it('returns "года" for 4', () => expect(pluralizeAge(4)).toBe('года'))
  it('returns "года" for 22', () => expect(pluralizeAge(22)).toBe('года'))

  it('returns "лет" for 5', () => expect(pluralizeAge(5)).toBe('лет'))
  it('returns "лет" for 10', () => expect(pluralizeAge(10)).toBe('лет'))
  it('returns "лет" for 11', () => expect(pluralizeAge(11)).toBe('лет'))
  it('returns "лет" for 12', () => expect(pluralizeAge(12)).toBe('лет'))
  it('returns "лет" for 14', () => expect(pluralizeAge(14)).toBe('лет'))
  it('returns "лет" for 20', () => expect(pluralizeAge(20)).toBe('лет'))
  // 11–19 — исключения: всегда «лет», несмотря на последнюю цифру
  it('returns "лет" for 111 (исключение 11–19)', () => expect(pluralizeAge(111)).toBe('лет'))
  it('returns "лет" for 112 (исключение 11–19)', () => expect(pluralizeAge(112)).toBe('лет'))
  it('returns "лет" for 114 (исключение 11–19)', () => expect(pluralizeAge(114)).toBe('лет'))
})
