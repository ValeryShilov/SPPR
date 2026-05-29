import {
  Box,
  Button,
  Container,
  Divider,
  Group,
  NumberInput,
  Paper,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { type AlertSettings, settingsApi } from '../api/settings'
import { useAuth } from '../hooks/useAuth'

// ─── Описания правил ──────────────────────────────────────────────────────────

interface ThresholdField {
  key: keyof AlertSettings
  label: string
  rule: string
  description: string
  unit: string
  min: number
  max: number
  step: number
  decimalScale: number
}

const OVERLOAD_FIELDS: ThresholdField[] = [
  {
    key: 'p1_tsb_threshold',
    rule: 'П1',
    label: 'TSB порог перегрузки',
    description: 'Критический алерт, если TSB ниже порога 3+ дней подряд',
    unit: 'у.е.',
    min: -100, max: -5, step: 1, decimalScale: 0,
  },
  {
    key: 'p2_resting_hr_pct',
    rule: 'П2',
    label: 'ЧСС покоя — превышение нормы',
    description: 'Предупреждение, если ЧСС покоя превышает 14-дневную норму на указанный %',
    unit: '%',
    min: 1, max: 30, step: 0.5, decimalScale: 1,
  },
  {
    key: 'p3_hrv_pct',
    rule: 'П3',
    label: 'HRV — минимум от базового',
    description: 'Предупреждение, если средний HRV за 7 дней опускается ниже указанного % от базового',
    unit: '%',
    min: 50, max: 99, step: 1, decimalScale: 0,
  },
  {
    key: 'p5_z45_pct',
    rule: 'П5',
    label: 'Доля Z4+Z5 за неделю',
    description: 'Информационный алерт, если высокоинтенсивная работа превышает указанный % от недельного объёма',
    unit: '%',
    min: 5, max: 50, step: 1, decimalScale: 0,
  },
]

const UNDERLOAD_FIELDS: ThresholdField[] = [
  {
    key: 'h1_ctl_delta',
    rule: 'Н1',
    label: 'Минимальный рост CTL за 14 дней',
    description: 'Информационный алерт, если CTL изменился менее чем на указанное значение за 14 дней',
    unit: 'у.е.',
    min: 0.5, max: 20, step: 0.5, decimalScale: 1,
  },
  {
    key: 'h2_tsb_high',
    rule: 'Н2',
    label: 'TSB порог недогруза',
    description: 'Информационный алерт, если TSB выше порога 7+ дней подряд',
    unit: 'у.е.',
    min: 0, max: 50, step: 1, decimalScale: 0,
  },
  {
    key: 'h3_tss_pct',
    rule: 'Н3',
    label: 'TSS недели — минимум от среднего',
    description: 'Предупреждение, если недельный TSS составляет менее указанного % от среднего за 8 недель',
    unit: '%',
    min: 10, max: 90, step: 5, decimalScale: 0,
  },
  {
    key: 'h5_z12_pct',
    rule: 'Н5',
    label: 'Доля Z1+Z2 за 4 недели',
    description: 'Информационный алерт, если низкоинтенсивная работа составляет менее указанного % от объёма за 4 недели',
    unit: '%',
    min: 30, max: 95, step: 1, decimalScale: 0,
  },
]

const DEFAULTS: AlertSettings = {
  p1_tsb_threshold: -30,
  p2_resting_hr_pct: 7,
  p3_hrv_pct: 85,
  p5_z45_pct: 20,
  h1_ctl_delta: 2,
  h2_tsb_high: 15,
  h3_tss_pct: 50,
  h5_z12_pct: 75,
}

// ─── Группа полей ──────────────────────────────────────────────────────────────

function ThresholdGroup({
  title,
  color,
  fields,
  values,
  onChange,
}: {
  title: string
  color: string
  fields: ThresholdField[]
  values: AlertSettings
  onChange: (key: keyof AlertSettings, val: number) => void
}) {
  return (
    <Box>
      <Group gap="xs" mb="sm">
        <div style={{ width: 4, height: 20, background: color, borderRadius: 2 }} />
        <Text fw={600} size="sm" style={{ color }}>{title}</Text>
      </Group>
      <Stack gap="xs">
        {fields.map((f) => (
          <Group key={f.key} align="flex-start" gap="md" wrap="nowrap">
            <Tooltip label={f.description} multiline w={280} withArrow position="top-start">
              <Box style={{ flex: 1, minWidth: 0, cursor: 'default' }}>
                <Group gap={6} wrap="nowrap" mb={2}>
                  <Text
                    size="xs"
                    fw={700}
                    style={{
                      fontFamily: 'monospace',
                      background: color + '22',
                      color,
                      padding: '1px 6px',
                      borderRadius: 4,
                      flexShrink: 0,
                    }}
                  >
                    {f.rule}
                  </Text>
                  <Text size="sm">{f.label}</Text>
                </Group>
                <Text size="xs" c="dimmed" lineClamp={1}>{f.description}</Text>
              </Box>
            </Tooltip>
            <NumberInput
              value={values[f.key]}
              onChange={(v) => typeof v === 'number' && onChange(f.key, v)}
              min={f.min}
              max={f.max}
              step={f.step}
              decimalScale={f.decimalScale}
              suffix={` ${f.unit}`}
              style={{ width: 130, flexShrink: 0 }}
              size="sm"
            />
          </Group>
        ))}
      </Stack>
    </Box>
  )
}

// ─── Страница ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isCoach = user?.role === 'coach' || user?.role === 'admin'

  const { data: saved, isLoading } = useQuery<AlertSettings>({
    queryKey: ['alert-settings'],
    queryFn: settingsApi.getAlertSettings,
    enabled: isCoach,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const [form, setForm] = useState<AlertSettings>(DEFAULTS)
  const [successMsg, setSuccessMsg] = useState(false)

  useEffect(() => {
    if (saved) setForm(saved)
  }, [saved])

  const baseline = saved ?? DEFAULTS
  const dirty = (Object.keys(form) as (keyof AlertSettings)[]).some((k) => form[k] !== baseline[k])

  const mutation = useMutation({
    mutationFn: () => settingsApi.updateAlertSettings(form),
    onSuccess: (updated) => {
      queryClient.setQueryData(['alert-settings'], updated)
      setSuccessMsg(true)
      setTimeout(() => setSuccessMsg(false), 3000)
    },
  })

  const handleChange = (key: keyof AlertSettings, val: number) =>
    setForm((f) => ({ ...f, [key]: val }))

  const handleReset = () => {
    setForm(saved ?? DEFAULTS)
    setSuccessMsg(false)
  }

  if (!isCoach) {
    return (
      <Container size="sm" py="xl">
        <Title order={2} mb="xl">Настройки</Title>
        <Text c="dimmed">Настройки доступны только тренеру.</Text>
      </Container>
    )
  }

  return (
    <Container size="md" py="xl">
      <Title order={2} mb="xs">Настройки</Title>
      <Text size="sm" c="dimmed" mb="xl">
        Пороги диагностических алертов. Изменения применяются при следующей генерации алертов.
      </Text>

      <Paper withBorder p="xl" radius="md">
        <Stack gap="xl">

          <ThresholdGroup
            title="Правила перегрузки (П1–П5)"
            color="#C8102E"
            fields={OVERLOAD_FIELDS}
            values={form}
            onChange={handleChange}
          />

          <Divider />

          <ThresholdGroup
            title="Правила недогруза (Н1–Н5)"
            color="#1c7ed6"
            fields={UNDERLOAD_FIELDS}
            values={form}
            onChange={handleChange}
          />

          <Divider />

          <Group justify="space-between" align="center">
            <Group gap="sm">
              {successMsg && (
                <Text size="sm" c="green" fw={500}>Сохранено</Text>
              )}
              {mutation.isError && (
                <Text size="sm" c="red">Ошибка при сохранении</Text>
              )}
            </Group>
            <Group gap="sm">
              <Button
                variant="subtle"
                color="gray"
                size="sm"
                onClick={handleReset}
                disabled={!dirty}
              >
                Сбросить
              </Button>
              <Button
                size="sm"
                loading={mutation.isPending}
                disabled={!dirty || isLoading}
                onClick={() => { setSuccessMsg(false); mutation.mutate() }}
              >
                Сохранить изменения
              </Button>
            </Group>
          </Group>
        </Stack>
      </Paper>
    </Container>
  )
}
