import {
  IconActivity,
  IconBarbell,
  IconBike,
  IconMoon,
  IconRollerSkating,
  IconRun,
  IconWalk,
} from '@tabler/icons-react'
import type { Icon } from '@tabler/icons-react'
import type { ComponentType } from 'react'

type TablerIconProps = { size?: string | number; color?: string; stroke?: number }

function IconSkis({ size = 24, color = 'currentColor' }: TablerIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Лыжа 1 (↘) — толстая */}
      <line x1="2" y1="2" x2="13" y2="22" strokeWidth="3" />
      {/* Лыжа 2 (↙) — толстая */}
      <line x1="13" y1="2" x2="2" y2="22" strokeWidth="3" />

      {/* Палка 1 — ручка (T-bar) */}
      <line x1="15" y1="2.5" x2="18" y2="2.5" strokeWidth="1.5" />
      {/* Палка 1 — древко */}
      <line x1="16.5" y1="2.5" x2="16.5" y2="21" strokeWidth="1.5" />
      {/* Палка 1 — корзинка */}
      <circle cx="16.5" cy="18" r="1.3" strokeWidth="1.3" />

      {/* Палка 2 — ручка (T-bar) */}
      <line x1="19" y1="2.5" x2="22" y2="2.5" strokeWidth="1.5" />
      {/* Палка 2 — древко */}
      <line x1="20.5" y1="2.5" x2="20.5" y2="21" strokeWidth="1.5" />
      {/* Палка 2 — корзинка */}
      <circle cx="20.5" cy="18" r="1.3" strokeWidth="1.3" />
    </svg>
  )
}

type AnyIcon = Icon | ComponentType<TablerIconProps>

const ICON_MAP: Record<string, AnyIcon> = {
  run:      IconRun,
  ski:      IconSkis,
  skiroll:  IconRollerSkating,
  bike:     IconBike,
  strength: IconBarbell,
  recovery: IconWalk,
  rest:     IconMoon,
  other:    IconActivity,
}

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

export default function SportIcon({
  type,
  size = 24,
  color,
}: {
  type?: string | null
  size?: number
  color?: string
}) {
  const Icon = ICON_MAP[type ?? ''] ?? IconActivity
  const c = color ?? SPORT_COLOR[type ?? ''] ?? 'currentColor'
  return <Icon size={size} color={c} stroke={1.8} />
}
