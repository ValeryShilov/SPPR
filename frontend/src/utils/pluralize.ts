export function pluralizeAge(n: number): string {
  const mod100 = n % 100
  const mod10  = n % 10
  if (mod100 >= 11 && mod100 <= 19) return 'лет'
  if (mod10 === 1)                   return 'год'
  if (mod10 >= 2 && mod10 <= 4)      return 'года'
  return 'лет'
}
