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
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

function Run({ size, color = 'currentColor' }: Props) {
  return (
    <Svg size={size} color={color}>
      <circle cx="14" cy="3.5" r="1.5" fill={color} stroke="none" />
      {/* torso */}
      <path d="M13 5 L10 11.5 L7.5 18" />
      {/* front leg */}
      <path d="M10 11.5 L13.5 15.5 L12 21" />
      {/* back arm */}
      <path d="M11.5 8 L8.5 6.5" />
      {/* front arm */}
      <path d="M11.5 8 L15 10" />
    </Svg>
  )
}

function Ski({ size, color = 'currentColor' }: Props) {
  return (
    <Svg size={size} color={color}>
      <circle cx="12.5" cy="2.5" r="1.5" fill={color} stroke="none" />
      {/* body diagonal */}
      <path d="M12 4 L10.5 10 L9.5 15" />
      {/* left pole */}
      <path d="M11.5 7 L7.5 13.5 L4.5 19" />
      {/* right pole */}
      <path d="M12.5 7 L16.5 12 L19.5 18" />
      {/* left ski */}
      <path d="M3.5 20.5 L14 19" strokeWidth="2.5" />
      {/* right ski */}
      <path d="M10 21.5 L21 20" strokeWidth="2.5" />
    </Svg>
  )
}

function Skiroll({ size, color = 'currentColor' }: Props) {
  return (
    <Svg size={size} color={color}>
      <circle cx="12" cy="2.5" r="1.5" fill={color} stroke="none" />
      {/* body upright */}
      <path d="M12 4 L11 10 L10.5 15" />
      {/* left pole */}
      <path d="M11.5 7 L8 12.5 L5 18" />
      {/* right pole */}
      <path d="M12.5 7 L16 11.5 L19 17" />
      {/* wheels */}
      <circle cx="5.5" cy="21" r="2" />
      <circle cx="15.5" cy="20.5" r="2" />
    </Svg>
  )
}

function Bike({ size, color = 'currentColor' }: Props) {
  return (
    <Svg size={size} color={color}>
      <circle cx="6" cy="17" r="4" />
      <circle cx="18" cy="17" r="4" />
      {/* frame */}
      <path d="M6 17 L11 10 L18 17" />
      {/* seat post + saddle */}
      <path d="M11 10 L11 7.5" />
      <path d="M9.5 7.5 L12.5 7.5" />
      {/* top tube + fork */}
      <path d="M11 10 L15.5 8 L18 11" />
      {/* rider head */}
      <circle cx="16.5" cy="4.5" r="1.5" fill={color} stroke="none" />
      {/* rider body */}
      <path d="M16 6 L14.5 9 L11 10" />
    </Svg>
  )
}

function Strength({ size, color = 'currentColor' }: Props) {
  return (
    <Svg size={size} color={color}>
      <line x1="9" y1="12" x2="15" y2="12" strokeWidth="2.5" />
      <rect x="3.5" y="8.5" width="5.5" height="7" rx="1.5" />
      <rect x="15" y="8.5" width="5.5" height="7" rx="1.5" />
    </Svg>
  )
}

function Recovery({ size, color = 'currentColor' }: Props) {
  return (
    <Svg size={size} color={color}>
      <circle cx="12" cy="3.5" r="1.8" fill={color} stroke="none" />
      <path d="M12 5.3 L12 11" />
      {/* crossed legs */}
      <path d="M12 11 L7.5 15 L5 20" />
      <path d="M12 11 L16.5 15 L19 20" />
      {/* arms */}
      <path d="M12 8.5 L7.5 12.5" />
      <path d="M12 8.5 L16.5 12.5" />
    </Svg>
  )
}

function Rest({ size, color = 'currentColor' }: Props) {
  return (
    <Svg size={size} color={color}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </Svg>
  )
}

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

export const SPORT_LABEL: Record<string, string> = {
  ski: 'Лыжи', skiroll: 'Лыжероллеры', run: 'Бег', bike: 'Велосипед',
  strength: 'Силовая', recovery: 'Восстановление', rest: 'Отдых', other: 'Прочее',
}

export const SPORT_COLOR: Record<string, string> = {
  ski: '#228be6', skiroll: '#4dabf7', run: '#2f9e44', bike: '#0ca678',
  strength: '#e8590c', recovery: '#7048e8', rest: '#adb5bd', other: '#868e96',
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
