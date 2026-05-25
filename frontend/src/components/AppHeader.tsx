import { Avatar, Badge, Drawer, Group, Text, UnstyledButton } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import SportIcon from './SportIcon'

// ─── Nav config ───────────────────────────────────────────────────────────────

const COACH_NAV = [
  { label: 'Дашборд',      to: '/dashboard' },
  { label: 'Планирование',  to: '/planning'  },
  { label: 'Аналитика',    to: '/analytics' },
  { label: 'Атлеты',       to: '/athletes'  },
  { label: 'Настройки',    to: '/settings'  },
]

const ATHLETE_NAV = [
  { label: 'Сегодня',    to: '/dashboard'    },
  { label: 'Мой план',   to: '/my-plan'      },
  { label: 'История',    to: '/my-history'   },
  { label: 'Аналитика',  to: '/my-analytics' },
  { label: 'Дневник',    to: '/metrics'      },
]

const ROLE_LABEL: Record<string, string> = {
  coach:   'Тренер',
  athlete: 'Атлет',
  admin:   'Админ',
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16,17 21,12 16,7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function HamburgerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6"  x2="21" y2="6"  />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AppHeader() {
  const { user, logout }  = useAuth()
  const navigate          = useNavigate()
  const location          = useLocation()
  const isMobile          = useMediaQuery('(max-width: 768px)') ?? false
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [hoveredNav, setHoveredNav] = useState<string | null>(null)

  const nav         = user?.role === 'athlete' ? ATHLETE_NAV : COACH_NAV
  const displayName = user?.full_name ?? user?.email ?? '?'
  const initials    = displayName.split(' ').map((p: string) => p[0] ?? '').join('').toUpperCase().slice(0, 2) || '?'

  const isActive = (to: string) =>
    location.pathname === to || location.pathname.startsWith(to + '/')

  const handleLogout = () => { logout(); navigate('/login') }

  const closeDrawer = () => setDrawerOpen(false)

  return (
    <>
      {/* ── Fixed header ─────────────────────────────────────────────────── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 56,
        backgroundColor: '#212121',
        display: 'flex', alignItems: 'center',
        padding: '0 24px', zIndex: 200,
        boxShadow: '0 1px 6px rgba(0,0,0,0.35)',
      }}>

        {/* Left: logo + name */}
        <UnstyledButton onClick={() => navigate('/dashboard')} style={{ flexShrink: 0 }}>
          <Group gap={10}>
            <div style={{
              width: 36, height: 36, backgroundColor: '#C8102E', borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <SportIcon type="ski" size={22} color="#fff" />
            </div>
            <Text fw={700} size="md" style={{ color: '#fff', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>
              СпортПлан
            </Text>
          </Group>
        </UnstyledButton>

        {/* Center: nav links (desktop) */}
        {!isMobile && (
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 0 }}>
            {nav.map((item) => {
              const active  = isActive(item.to)
              const hovered = hoveredNav === item.to
              return (
                <UnstyledButton
                  key={item.to}
                  onClick={() => navigate(item.to)}
                  onMouseEnter={() => setHoveredNav(item.to)}
                  onMouseLeave={() => setHoveredNav(null)}
                  style={{
                    height: 56,
                    padding: '0 14px',
                    display: 'flex', alignItems: 'center',
                    color: active || hovered ? '#fff' : 'rgba(255,255,255,0.72)',
                    fontWeight: active ? 600 : 400,
                    fontSize: 14,
                    borderBottom: active ? '3px solid #C8102E' : '3px solid transparent',
                    borderTop: '3px solid transparent',
                    transition: 'color 0.15s, border-color 0.15s',
                    userSelect: 'none',
                  }}
                >
                  {item.label}
                </UnstyledButton>
              )
            })}
          </div>
        )}

        {/* Right: avatar + info + logout / hamburger */}
        <Group gap={12} style={{ flexShrink: 0, marginLeft: isMobile ? 'auto' : undefined }}>

          {!isMobile && (
            <>
              <UnstyledButton
                onClick={() => {
                  if (user?.role === 'athlete') navigate('/profile')
                  else if (user?.role === 'coach') navigate('/coach-profile')
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <Avatar size={32} radius="xl"
                  style={{ background: '#C8102E', color: '#fff', fontWeight: 700, fontSize: 14 }}>
                  {initials}
                </Avatar>

                <div style={{ lineHeight: 1.3 }}>
                  <Text size="xs" fw={600}
                    style={{ color: '#fff', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayName}
                  </Text>
                  <Badge size="xs" color="red" variant="light" style={{ marginTop: 2 }}>
                    {ROLE_LABEL[user?.role ?? ''] ?? user?.role}
                  </Badge>
                </div>
              </UnstyledButton>

              <UnstyledButton
                onClick={handleLogout}
                title="Выйти"
                style={{ color: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#fff' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.55)' }}
              >
                <LogoutIcon />
              </UnstyledButton>
            </>
          )}

          {isMobile && (
            <UnstyledButton
              onClick={() => setDrawerOpen(true)}
              style={{ color: '#fff', display: 'flex', alignItems: 'center', padding: 4 }}
            >
              <HamburgerIcon />
            </UnstyledButton>
          )}
        </Group>
      </header>

      {/* ── Mobile drawer ────────────────────────────────────────────────── */}
      <Drawer
        opened={drawerOpen}
        onClose={closeDrawer}
        position="bottom"
        size="auto"
        withCloseButton={false}
        styles={{
          content: { borderRadius: '16px 16px 0 0' },
          header: { padding: '16px 20px 12px', borderBottom: '1px solid #f1f3f5' },
          body:   { padding: '8px 20px 24px' },
        }}
        title={
          <Group gap={12}>
            <Avatar size={38} radius="xl"
              style={{ background: '#C8102E', color: '#fff', fontWeight: 700 }}>
              {initials}
            </Avatar>
            <div style={{ lineHeight: 1.3 }}>
              <Text size="sm" fw={600}>{displayName}</Text>
              <Badge size="xs" color="red" variant="light" style={{ marginTop: 2 }}>
                {ROLE_LABEL[user?.role ?? ''] ?? user?.role}
              </Badge>
            </div>
          </Group>
        }
      >
        {nav.map((item) => (
          <UnstyledButton
            key={item.to}
            onClick={() => { navigate(item.to); closeDrawer() }}
            style={{
              display: 'block', width: '100%',
              padding: '13px 0',
              fontSize: 16,
              fontWeight: isActive(item.to) ? 600 : 400,
              color: isActive(item.to) ? '#C8102E' : '#212529',
              borderBottom: '1px solid #f1f3f5',
            }}
          >
            {item.label}
          </UnstyledButton>
        ))}

        <UnstyledButton
          onClick={() => { closeDrawer(); handleLogout() }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', paddingTop: 14,
            fontSize: 15, color: '#868e96',
          }}
        >
          <LogoutIcon />
          Выйти из системы
        </UnstyledButton>
      </Drawer>
    </>
  )
}
