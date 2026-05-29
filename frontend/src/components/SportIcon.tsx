import type { ReactNode } from 'react'

interface Props {
  size?: number
  color?: string
}

function Svg({ size = 24, color = 'currentColor', children }: Props & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

// ─── Run ──────────────────────────────────────────────────────────────────────
// Бегун в профиль: корпус вперёд, широкий шаг, руки в противоходе

function Run({ size, color = 'currentColor' }: Props) {
  return (
    <Svg size={size} color={color}>
      <circle cx="15" cy="3" r="1.8" fill={color} stroke="none" />
      {/* корпус наклонён вперёд */}
      <path d="M14 4.7 L11.5 10" />
      {/* рука назад-вверх */}
      <path d="M13 7.5 L16.5 5.5" />
      {/* рука вперёд-вниз */}
      <path d="M13 7.5 L10 10" />
      {/* нога вперёд (колено поднято) */}
      <path d="M11.5 10 L9 14.5 L7.5 21" />
      {/* нога назад (толчок) */}
      <path d="M11.5 10 L14.5 14 L16 20.5" />
    </Svg>
  )
}

// ─── Ski ──────────────────────────────────────────────────────────────────────
// Лыжник: корпус вперёд, палки по диагонали, лыжи горизонтально

function Ski({ size, color = 'currentColor' }: Props) {
  return (
    <Svg size={size} color={color}>
      <circle cx="13" cy="2.5" r="1.8" fill={color} stroke="none" />
      {/* корпус */}
      <path d="M12.5 4.3 L11 9.5 L10.5 14.5" />
      {/* левая палка (назад) */}
      <path d="M11.5 7.5 L7.5 13 L5 18" />
      {/* правая палка (вперёд) */}
      <path d="M12.5 7.5 L17 12 L19.5 16.5" />
      {/* левая лыжа */}
      <path d="M3.5 21.5 L15 20" strokeWidth="2.5" />
      {/* правая лыжа */}
      <path d="M10 22.5 L21.5 21" strokeWidth="2.5" />
    </Svg>
  )
}

// ─── Skiroll ──────────────────────────────────────────────────────────────────
// Лыжероллеры: как лыжи, но вместо лыж — колёса

function Skiroll({ size, color = 'currentColor' }: Props) {
  return (
    <Svg size={size} color={color}>
      <circle cx="13" cy="2.5" r="1.8" fill={color} stroke="none" />
      {/* корпус */}
      <path d="M12.5 4.3 L11 9.5 L10.5 14" />
      {/* левая палка */}
      <path d="M11.5 7.5 L8 12.5 L5.5 17.5" />
      {/* правая палка */}
      <path d="M12.5 7.5 L16.5 11.5 L19 16" />
      {/* левое колесо */}
      <circle cx="6.5" cy="20.5" r="2.2" />
      {/* правое колесо */}
      <circle cx="17" cy="20" r="2.2" />
    </Svg>
  )
}

// ─── Bike ─────────────────────────────────────────────────────────────────────
// Велосипедист: два колеса, рама, гонщик в посадке

function Bike({ size, color = 'currentColor' }: Props) {
  return (
    <Svg size={size} color={color}>
      {/* колёса */}
      <circle cx="6" cy="17.5" r="4" />
      <circle cx="18" cy="17.5" r="4" />
      {/* рама: треугольник */}
      <path d="M6 17.5 L11.5 10 L18 17.5" />
      {/* подседельная труба */}
      <path d="M11.5 10 L11.5 7" />
      {/* седло */}
      <path d="M10 7 L13 7" />
      {/* верхняя труба + вилка */}
      <path d="M11.5 10 L16 8 L18 12" />
      {/* голова гонщика */}
      <circle cx="17" cy="4.5" r="1.8" fill={color} stroke="none" />
      {/* корпус гонщика в посадке */}
      <path d="M16 6.2 L14 9 L11.5 10" />
    </Svg>
  )
}

// ─── Strength ─────────────────────────────────────────────────────────────────
// Жим штанги над головой: голова, руки вверх, гриф со блинами

function Strength({ size, color = 'currentColor' }: Props) {
  return (
    <Svg size={size} color={color}>
      {/* голова */}
      <circle cx="12" cy="3" r="1.8" fill={color} stroke="none" />
      {/* гриф штанги */}
      <line x1="4" y1="9" x2="20" y2="9" strokeWidth="2.5" />
      {/* блины */}
      <rect x="2.5" y="7" width="2" height="4" rx="0.6" fill={color} stroke="none" />
      <rect x="19.5" y="7" width="2" height="4" rx="0.6" fill={color} stroke="none" />
      {/* руки вверх — от плеч к грифу */}
      <path d="M10 5 L8.5 9" />
      <path d="M14 5 L15.5 9" />
      {/* туловище */}
      <path d="M12 4.8 L12 15" />
      {/* ноги */}
      <path d="M12 15 L10 21" />
      <path d="M12 15 L14 21" />
    </Svg>
  )
}

// ─── Recovery ─────────────────────────────────────────────────────────────────
// Спокойная ходьба: прямой корпус, мягкий шаг

function Recovery({ size, color = 'currentColor' }: Props) {
  return (
    <Svg size={size} color={color}>
      {/* голова */}
      <circle cx="12" cy="3" r="1.8" fill={color} stroke="none" />
      {/* корпус */}
      <path d="M12 4.8 L12 12" />
      {/* рука вперёд */}
      <path d="M12 7.5 L9 10.5" />
      {/* рука назад */}
      <path d="M12 7.5 L15 9.5" />
      {/* нога вперёд */}
      <path d="M12 12 L10 17 L9.5 21" />
      {/* нога назад */}
      <path d="M12 12 L14 17 L14 21" />
    </Svg>
  )
}

// ─── Rest ─────────────────────────────────────────────────────────────────────
// Луна — символ отдыха

function Rest({ size, color = 'currentColor' }: Props) {
  return (
    <Svg size={size} color={color}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </Svg>
  )
}

// ─── Other ────────────────────────────────────────────────────────────────────
// Молния — прочие виды активности

function Other({ size, color = 'currentColor' }: Props) {
  return (
    <Svg size={size} color={color}>
      <path
        d="M13 2 L5 13.5 L11.5 13.5 L11 22 L19 10.5 L12.5 10.5 Z"
        fill={color}
        stroke="none"
      />
    </Svg>
  )
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export const SPORT_LABEL: Record<string, string> = {
  ski: 'Лыжи', skiroll: 'Лыжероллеры', run: 'Бег', bike: 'Велосипед',
  strength: 'Силовая', recovery: 'Восстановление', rest: 'Отдых', other: 'Прочее',
}

export const SPORT_COLOR: Record<string, string> = {
  ski:      '#228be6',
  skiroll:  '#4dabf7',
  run:      '#2f9e44',
  bike:     '#0ca678',
  strength: '#e8590c',
  recovery: '#7048e8',
  rest:     '#adb5bd',
  other:    '#868e96',
}

export default function SportIcon({ type, size = 24, color }: { type?: string | null } & Props) {
  const c = color ?? SPORT_COLOR[type ?? ''] ?? 'currentColor'
  switch (type) {
    case 'run':      return <Run size={size} color={c} />
    case 'ski':      return <Ski size={size} color={c} />
    case 'skiroll':  return <Skiroll size={size} color={c} />
    case 'bike':     return <Bike size={size} color={c} />
    case 'strength': return <Strength size={size} color={c} />
    case 'recovery': return <Recovery size={size} color={c} />
    case 'rest':     return <Rest size={size} color={c} />
    default:         return <Other size={size} color={c} />
  }
}
