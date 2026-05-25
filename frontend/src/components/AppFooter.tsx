import { Badge, Divider, Group, Modal, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import SportIcon from './SportIcon'

function AboutModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="md"
      title={
        <Group gap={10}>
          <div style={{
            width: 32, height: 32, backgroundColor: '#C8102E', borderRadius: 7,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <SportIcon type="ski" size={20} color="#fff" />
          </div>
          <div>
            <Text fw={700} size="md" style={{ lineHeight: 1.2 }}>СпортПлан</Text>
            <Text size="xs" c="dimmed" style={{ lineHeight: 1.2 }}>v1.0.0 · 2026</Text>
          </div>
        </Group>
      }
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          СППР — система поддержки принятия решений для планирования спортивной подготовки
          в циклических видах спорта: лыжные гонки, лыжероллеры, бег, велосипед.
        </Text>

        <Divider label="Алгоритмическое ядро" labelPosition="left" />
        <Stack gap={6}>
          {[
            ['Зоны ЧСС', 'Шкала Olympiatoppen — 5 зон, % от ЧССmax'],
            ['Нагрузка', 'TSS, ATL (7 дн.), CTL (42 дн.), TSB'],
            ['Адаптация', 'T_ind = T_template × k_qual × k_form'],
            ['Алерты', '5 правил перегрузки (П1–П5) · 5 правил недогруза (Н1–Н5)'],
          ].map(([label, desc]) => (
            <Group key={label} gap="xs" align="flex-start" wrap="nowrap">
              <Badge size="xs" variant="light" color="red" style={{ flexShrink: 0, marginTop: 2 }}>
                {label}
              </Badge>
              <Text size="xs" c="dimmed">{desc}</Text>
            </Group>
          ))}
        </Stack>

        <Divider label="Технологии" labelPosition="left" />
        <Group gap={6} wrap="wrap">
          {['FastAPI', 'React 18', 'PostgreSQL 16', 'SQLAlchemy 2', 'Celery 5', 'Redis 7', 'Docker', 'Mantine 7'].map((t) => (
            <Badge key={t} size="sm" variant="outline" color="gray">{t}</Badge>
          ))}
        </Group>

        <Divider label="Роли" labelPosition="left" />
        <Group gap="md">
          <Stack gap={2}>
            <Badge size="sm" color="blue" variant="light">Тренер</Badge>
            <Text size="xs" c="dimmed">Планирование, аналитика, группы</Text>
          </Stack>
          <Stack gap={2}>
            <Badge size="sm" color="teal" variant="light">Атлет</Badge>
            <Text size="xs" c="dimmed">Просмотр плана, дневник, метрики</Text>
          </Stack>
        </Group>
      </Stack>
    </Modal>
  )
}

export default function AppFooter() {
  const [aboutOpen, setAboutOpen] = useState(false)

  return (
    <>
      <footer style={{
        height: 40,
        backgroundColor: '#F5F5F5',
        borderTop: '1px solid #E0E0E0',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        position: 'relative',
        flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 12,
          color: '#757575',
          whiteSpace: 'nowrap',
        }}>
          © СпортПлан 2026
        </span>

        <button
          onClick={() => setAboutOpen(true)}
          style={{
            marginLeft: 'auto',
            fontSize: 12,
            color: '#757575',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#495057' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#757575' }}
        >
          О программе
        </button>
      </footer>

      <AboutModal opened={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  )
}
