import { AppShell, Button, Group, Text } from '@mantine/core'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const NAV_LINKS: { label: string; to: string; roles: string[] }[] = [
  { label: 'Дашборд',     to: '/dashboard', roles: ['coach', 'admin', 'athlete'] },
  { label: 'Группы',      to: '/groups',    roles: ['coach', 'admin'] },
  { label: 'Планирование',to: '/planning',  roles: ['coach', 'admin'] },
  { label: 'Мой план',    to: '/my-plan',   roles: ['athlete'] },
  { label: 'Метрики',     to: '/metrics',   roles: ['athlete'] },
]

const NAV_BG   = '#212121'
const NAV_TEXT = 'rgba(255,255,255,0.82)'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()

  const handleLogout = () => { logout(); navigate('/login') }

  const isActive = (to: string) =>
    location.pathname === to || location.pathname.startsWith(to + '/')

  const links = NAV_LINKS.filter(
    (l) => user && (user.role === 'admin' || l.roles.includes(user.role)),
  )

  return (
    <AppShell header={{ height: 52 }} padding="md">
      <AppShell.Header style={{ backgroundColor: NAV_BG, border: 'none' }}>
        <Group h="100%" px="md" justify="space-between">

          {/* Лого + навигация */}
          <Group gap="xs">
            <Text
              fw={800}
              size="sm"
              style={{ color: '#C8102E', letterSpacing: 1, userSelect: 'none' }}
            >
              СППР
            </Text>

            {links.map((l) => (
              <Button
                key={l.to}
                component={Link}
                to={l.to}
                size="xs"
                variant={isActive(l.to) ? 'filled' : 'transparent'}
                color="red"
                style={
                  isActive(l.to)
                    ? undefined
                    : { color: NAV_TEXT }
                }
              >
                {l.label}
              </Button>
            ))}
          </Group>

          {/* Email + выход */}
          <Group gap="xs">
            <Text size="xs" style={{ color: NAV_TEXT }}>
              {user?.email}
            </Text>
            <Button
              variant="subtle"
              color="red"
              size="xs"
              onClick={handleLogout}
              style={{ color: NAV_TEXT }}
              styles={{ root: { '&:hover': { color: '#fff' } } }}
            >
              Выйти
            </Button>
          </Group>

        </Group>
      </AppShell.Header>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  )
}
