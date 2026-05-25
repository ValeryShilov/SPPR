import {
  Badge,
  Button,
  Container,
  Divider,
  Grid,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  PasswordInput,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { athletesApi } from '../api/athletes'
import { authApi } from '../api/auth'
import { useAuth } from '../hooks/useAuth'
import { pluralizeAge } from '../utils/pluralize'
import { ZONE_BADGE_COLOR } from '../utils/zoneColors'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AthleteProfile {
  id: string
  first_name: string
  last_name: string
  birth_date: string
  gender: string
  qualification: string | null
  coach_user_id: string | null
  training_goal_type: string | null
  target_event_name: string | null
  target_event_date: string | null
}

interface Coach {
  id: string
  full_name: string | null
  email: string
}

interface Marker {
  id: string
  date_recorded: string
  resting_hr: number | null
  max_hr: number | null
  threshold_hr: number | null
  hrv_baseline: number | null
  source: 'measured' | 'formula'
  notes: string | null
}

interface HRZone {
  zone: string
  label: string
  hr_min: number
  hr_max: number
}

interface ZonesResponse {
  max_hr: number
  source: string
  zones: HRZone[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const QUAL_LABELS: Record<string, string> = {
  'МСМК': 'МСМК', 'МС': 'МС', 'КМС': 'КМС',
  'I': 'I разряд', 'II': 'II разряд', 'III': 'III разряд',
}

const SOURCE_META = {
  measured: { color: 'green', label: 'Измерено' },
  formula:  { color: 'gray',  label: 'Формула'  },
} as const

function calcAge(birthDate: string) {
  return new Date().getFullYear() - new Date(birthDate).getFullYear()
}

// ─── Edit profile modal ───────────────────────────────────────────────────────

function EditProfileModal({
  profile,
  fullName,
  opened,
  onClose,
}: {
  profile: AthleteProfile
  fullName: string | null | undefined
  opened: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { user, setUser } = useAuth()
  const [firstName,     setFirstName]     = useState(profile.first_name)
  const [lastName,      setLastName]      = useState(profile.last_name)
  const [birthDate,     setBirthDate]     = useState(profile.birth_date)
  const [gender,        setGender]        = useState<string | null>(profile.gender)
  const [qualification, setQualification] = useState(profile.qualification ?? '')
  const [displayName,   setDisplayName]   = useState(fullName ?? '')

  const save = useMutation({
    mutationFn: async () => {
      await athletesApi.update(profile.id, {
        first_name: firstName,
        last_name: lastName,
        birth_date: birthDate,
        gender: gender!,
        qualification: qualification || null,
      })
      await authApi.updateMe({ full_name: displayName.trim() || null })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['athlete-me'] })
      queryClient.invalidateQueries({ queryKey: ['auth-me'] })
      if (user) setUser({ ...user, full_name: displayName.trim() || null })
      onClose()
    },
  })

  return (
    <Modal opened={opened} onClose={onClose} title="Редактировать профиль">
      <Stack gap="sm">
        <TextInput
          label="Отображаемое имя"
          placeholder="Например: Иван Петров"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
        />
        <Group grow>
          <TextInput label="Имя"     value={firstName} onChange={e => setFirstName(e.target.value)} required />
          <TextInput label="Фамилия" value={lastName}  onChange={e => setLastName(e.target.value)}  required />
        </Group>
        <TextInput
          label="Дата рождения"
          type="date"
          value={birthDate}
          onChange={e => setBirthDate(e.target.value)}
          required
        />
        <Select
          label="Пол"
          data={[{ value: 'm', label: 'Мужской' }, { value: 'f', label: 'Женский' }]}
          value={gender}
          onChange={setGender}
          required
        />
        <TextInput
          label="Квалификация"
          placeholder="КМС, МС, МСМК — необязательно"
          value={qualification}
          onChange={e => setQualification(e.target.value)}
        />
        {save.isError && (
          <Text size="sm" c="red">
            {(save.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Ошибка сохранения'}
          </Text>
        )}
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>Отмена</Button>
          <Button loading={save.isPending} disabled={!firstName || !lastName || !birthDate || !gender} onClick={() => save.mutate()}>
            Сохранить
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

// ─── Marker modal ─────────────────────────────────────────────────────────────

interface MarkerForm {
  date_recorded: string
  resting_hr: number | string
  max_hr: number | string
  threshold_hr: number | string
  hrv_baseline: number | string
  source: string
  notes: string
}

function emptyMarkerForm(m?: Marker): MarkerForm {
  return {
    date_recorded: m?.date_recorded ?? new Date().toISOString().slice(0, 10),
    resting_hr:    m?.resting_hr    ?? '',
    max_hr:        m?.max_hr        ?? '',
    threshold_hr:  m?.threshold_hr  ?? '',
    hrv_baseline:  m?.hrv_baseline  ?? '',
    source:        m?.source        ?? 'measured',
    notes:         m?.notes         ?? '',
  }
}

function MarkerModal({
  athleteId, marker, opened, onClose,
}: {
  athleteId: string
  marker: Marker | null
  opened: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<MarkerForm>(() => emptyMarkerForm(marker ?? undefined))
  const setF = (field: keyof MarkerForm) => (val: number | string) => setForm(f => ({ ...f, [field]: val }))

  const payload = () => ({
    date_recorded: form.date_recorded,
    resting_hr:    form.resting_hr    !== '' ? Number(form.resting_hr)    : null,
    max_hr:        form.max_hr        !== '' ? Number(form.max_hr)        : null,
    threshold_hr:  form.threshold_hr  !== '' ? Number(form.threshold_hr)  : null,
    hrv_baseline:  form.hrv_baseline  !== '' ? Number(form.hrv_baseline)  : null,
    source: form.source,
    notes:  form.notes || null,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['markers', athleteId] })
    queryClient.invalidateQueries({ queryKey: ['zones',   athleteId] })
    onClose()
  }

  const update = useMutation({ mutationFn: () => athletesApi.updateMarker(marker!.id, payload()), onSuccess: invalidate })
  const create = useMutation({ mutationFn: () => athletesApi.addMarker(athleteId, payload()),     onSuccess: invalidate })
  const isEdit = marker !== null

  return (
    <Modal opened={opened} onClose={onClose} title={isEdit ? 'Редактировать маркер' : 'Добавить маркер'} size="sm">
      <Stack gap="sm">
        <input
          type="date"
          value={form.date_recorded}
          onChange={e => setForm(f => ({ ...f, date_recorded: e.target.value }))}
          style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ced4da', fontSize: 14 }}
        />
        <NumberInput label="ЧСС покоя"  value={form.resting_hr}   onChange={setF('resting_hr')}   min={30}  max={120} />
        <NumberInput label="ЧСС макс"   value={form.max_hr}       onChange={setF('max_hr')}       min={100} max={230} />
        <NumberInput label="ПАНО (ЧСС)" value={form.threshold_hr} onChange={setF('threshold_hr')} min={80}  max={220} />
        <NumberInput label="ВСР (HRV)"  value={form.hrv_baseline} onChange={setF('hrv_baseline')} min={0}   max={300} />
        <Select
          label="Источник"
          value={form.source}
          onChange={v => setForm(f => ({ ...f, source: v ?? 'measured' }))}
          data={[{ value: 'measured', label: 'Измерено' }, { value: 'formula', label: 'Формула' }]}
        />
        <Textarea label="Примечания" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>Отмена</Button>
          <Button loading={update.isPending || create.isPending} onClick={() => isEdit ? update.mutate() : create.mutate()}>
            Сохранить
          </Button>
        </Group>
        {(update.isError || create.isError) && <Text c="red" size="sm">Ошибка при сохранении</Text>}
      </Stack>
    </Modal>
  )
}

// ─── Markers block ────────────────────────────────────────────────────────────

function MarkersBlock({ athleteId }: { athleteId: string }) {
  const [modalMarker, setModalMarker] = useState<Marker | null | false>(false)

  const { data: markers = [], isLoading } = useQuery<Marker[]>({
    queryKey: ['markers', athleteId],
    queryFn:  () => athletesApi.getMarkers(athleteId),
  })

  return (
    <Paper p="md" withBorder radius="md" h="100%">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Физиологические маркеры</Title>
        <Button size="xs" variant="light" onClick={() => setModalMarker(null)}>+ Добавить</Button>
      </Group>

      {isLoading && <Loader size="sm" />}
      {!isLoading && markers.length === 0 && <Text size="sm" c="dimmed">Маркеры не добавлены</Text>}

      {markers.length > 0 && (
        <Table withTableBorder withColumnBorders fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Дата</Table.Th>
              <Table.Th>ЧСС пок.</Table.Th>
              <Table.Th>ЧСС макс</Table.Th>
              <Table.Th>ПАНО</Table.Th>
              <Table.Th>ВСР</Table.Th>
              <Table.Th>Источник</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {markers.map(m => (
              <Table.Tr key={m.id}>
                <Table.Td>{m.date_recorded}</Table.Td>
                <Table.Td>{m.resting_hr    ?? '—'}</Table.Td>
                <Table.Td>{m.max_hr        ?? '—'}</Table.Td>
                <Table.Td>{m.threshold_hr  ?? '—'}</Table.Td>
                <Table.Td>{m.hrv_baseline  ?? '—'}</Table.Td>
                <Table.Td>
                  <Tooltip label={m.notes ?? ''} disabled={!m.notes} withArrow>
                    <Badge color={SOURCE_META[m.source]?.color ?? 'gray'} variant="light" size="sm">
                      {SOURCE_META[m.source]?.label ?? m.source}
                    </Badge>
                  </Tooltip>
                </Table.Td>
                <Table.Td>
                  <Button size="xs" variant="subtle" onClick={() => setModalMarker(m)}>✎</Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <MarkerModal
        athleteId={athleteId}
        marker={modalMarker === false ? null : modalMarker}
        opened={modalMarker !== false}
        onClose={() => setModalMarker(false)}
      />
    </Paper>
  )
}

// ─── Zones block ──────────────────────────────────────────────────────────────

function ZonesBlock({ athleteId }: { athleteId: string }) {
  const { data, isLoading, isError } = useQuery<ZonesResponse>({
    queryKey: ['zones', athleteId],
    queryFn:  () => athletesApi.getZones(athleteId),
    retry: false,
  })

  return (
    <Paper p="md" withBorder radius="md" h="100%">
      <Title order={4} mb="sm">
        Пульсовые зоны
        {data && (
          <Text span size="sm" c="dimmed" fw={400} ml="xs">
            ЧССmax: {data.max_hr} · {data.source === 'measured' ? 'измерено' : 'формула'}
          </Text>
        )}
      </Title>

      {isLoading && <Loader size="sm" />}
      {isError && <Text size="sm" c="dimmed">Нет данных — добавьте маркер с ЧССmax</Text>}

      {data && (
        <Table withTableBorder withColumnBorders fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Зона</Table.Th>
              <Table.Th>Название</Table.Th>
              <Table.Th>ЧСС мин</Table.Th>
              <Table.Th>ЧСС макс</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.zones.map(z => (
              <Table.Tr key={z.zone}>
                <Table.Td>
                  <Badge color={ZONE_BADGE_COLOR[z.zone] ?? 'gray'} variant="light" size="sm">{z.zone}</Badge>
                </Table.Td>
                <Table.Td>{z.label}</Table.Td>
                <Table.Td>{z.hr_min}</Table.Td>
                <Table.Td>{z.hr_max}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Paper>
  )
}

// ─── Coach selector block ─────────────────────────────────────────────────────

function CoachBlock({ profile }: { profile: AthleteProfile }) {
  const queryClient = useQueryClient()

  const { data: coaches = [] } = useQuery<Coach[]>({
    queryKey: ['coaches-list'],
    queryFn:  authApi.listCoaches,
  })

  const [selectedId, setSelectedId] = useState<string | null>(profile.coach_user_id)
  const [saved, setSaved]           = useState(false)

  const save = useMutation({
    mutationFn: (coachId: string | null) =>
      athletesApi.update(profile.id, { coach_user_id: coachId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['athlete-me'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  const coachOptions = coaches.map(c => ({
    value: c.id,
    label: c.full_name ? `${c.full_name} (${c.email})` : c.email,
  }))

  const currentCoach = coaches.find(c => c.id === profile.coach_user_id)
  const changed = selectedId !== profile.coach_user_id

  return (
    <Stack gap="sm" maw={400}>
      <Title order={5}>Мой тренер</Title>
      {currentCoach && !changed && (
        <Text size="sm">
          Текущий тренер: <b>{currentCoach.full_name ?? currentCoach.email}</b>
        </Text>
      )}
      <Select
        placeholder="Выберите тренера..."
        data={coachOptions}
        value={selectedId}
        onChange={v => { setSelectedId(v); setSaved(false) }}
        searchable
        clearable
        nothingFoundMessage="Тренеры не найдены"
      />
      {saved && <Text size="sm" c="green">Тренер сохранён</Text>}
      {save.isError && <Text size="sm" c="red">Ошибка сохранения</Text>}
      <div>
        <Button
          size="sm"
          loading={save.isPending}
          disabled={!changed}
          onClick={() => save.mutate(selectedId)}
        >
          Сохранить
        </Button>
      </div>
    </Stack>
  )
}

// ─── Goal block ───────────────────────────────────────────────────────────────

const GOAL_OPTIONS = [
  { value: 'health',        label: 'Оздоровление' },
  { value: 'fitness',       label: 'Поддержание формы' },
  { value: 'performance',   label: 'Рост результата' },
  { value: 'competition',   label: 'Соревновательный сезон' },
  { value: 'target_event',  label: 'Подготовка к старту' },
  { value: 'qualification', label: 'Выполнение разряда' },
]

function GoalBlock({ profile }: { profile: AthleteProfile }) {
  const queryClient = useQueryClient()
  const [goalType,  setGoalType]  = useState<string | null>(profile.training_goal_type)
  const [eventName, setEventName] = useState(profile.target_event_name ?? '')
  const [eventDate, setEventDate] = useState(profile.target_event_date ?? '')
  const [saved,     setSaved]     = useState(false)

  const changed =
    goalType  !== profile.training_goal_type ||
    eventName !== (profile.target_event_name ?? '') ||
    eventDate !== (profile.target_event_date ?? '')

  const save = useMutation({
    mutationFn: () => athletesApi.update(profile.id, {
      training_goal_type: goalType,
      target_event_name:  goalType === 'target_event' ? (eventName || null) : null,
      target_event_date:  goalType === 'target_event' ? (eventDate || null) : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['athlete-me'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  return (
    <Stack gap="sm" maw={400}>
      <Title order={5}>Цель подготовки</Title>
      <Select
        placeholder="Выберите цель..."
        data={GOAL_OPTIONS}
        value={goalType}
        onChange={v => { setGoalType(v); setSaved(false) }}
        clearable
      />
      {goalType === 'target_event' && (
        <>
          <TextInput
            label="Название соревнования"
            placeholder="Например: Чемпионат России"
            value={eventName}
            onChange={e => { setEventName(e.target.value); setSaved(false) }}
          />
          <TextInput
            label="Дата соревнования"
            type="date"
            value={eventDate}
            onChange={e => { setEventDate(e.target.value); setSaved(false) }}
          />
        </>
      )}
      {saved && <Text size="sm" c="green">Цель сохранена</Text>}
      {save.isError && <Text size="sm" c="red">Ошибка сохранения</Text>}
      <div>
        <Button size="sm" loading={save.isPending} disabled={!changed} onClick={() => save.mutate()}>
          Сохранить
        </Button>
      </div>
    </Stack>
  )
}

// ─── Change password block ────────────────────────────────────────────────────

function ChangePasswordBlock() {
  const [current,  setCurrent]  = useState('')
  const [next,     setNext]     = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [success,  setSuccess]  = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  const change = useMutation({
    mutationFn: () => authApi.changePassword(current, next),
    onSuccess: () => {
      setSuccess(true)
      setCurrent(''); setNext(''); setConfirm('')
      setApiError(null)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setApiError(msg ?? 'Ошибка смены пароля')
      setSuccess(false)
    },
  })

  const mismatch = confirm.length > 0 && next !== confirm
  const canSubmit = current && next && confirm && !mismatch

  return (
    <Stack gap="sm" maw={400}>
      <Title order={5}>Смена пароля</Title>
      {success && <Text size="sm" c="green">Пароль успешно изменён</Text>}
      {apiError && <Text size="sm" c="red">{apiError}</Text>}
      <PasswordInput label="Текущий пароль" value={current} onChange={e => setCurrent(e.target.value)} />
      <PasswordInput label="Новый пароль"   value={next}    onChange={e => setNext(e.target.value)} />
      <PasswordInput
        label="Повторите новый пароль"
        value={confirm}
        onChange={e => { setConfirm(e.target.value); setSuccess(false) }}
        error={mismatch ? 'Пароли не совпадают' : undefined}
      />
      <div>
        <Button size="sm" loading={change.isPending} disabled={!canSubmit} onClick={() => change.mutate()}>
          Изменить пароль
        </Button>
      </div>
    </Stack>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AthleteSelfProfile() {
  const [editOpen, setEditOpen] = useState(false)

  const { data: profile, isLoading: profileLoading } = useQuery<AthleteProfile>({
    queryKey: ['athlete-me'],
    queryFn:  athletesApi.me,
  })

  const { data: account } = useQuery<{ email: string; full_name: string | null }>({
    queryKey: ['auth-me'],
    queryFn:  authApi.me,
  })

  if (profileLoading) return <Container py="xl"><Loader /></Container>
  if (!profile) return <Container py="xl"><Text c="red">Профиль не найден</Text></Container>

  const age = calcAge(profile.birth_date)

  return (
    <Container size="lg" py="xl">
      <Title order={2} mb="lg">Профиль</Title>

      {/* ── Личные данные ── */}
      <Paper p="md" withBorder radius="md" mb="lg">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Title order={3}>{profile.last_name} {profile.first_name}</Title>
            <Group gap="xs">
              <Text size="sm" c="dimmed">{age} {pluralizeAge(age)} · {profile.gender === 'm' ? 'муж.' : 'жен.'}</Text>
              <Text size="sm" c="dimmed">·</Text>
              <Text size="sm" c="dimmed">
                {new Date(profile.birth_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
              {profile.qualification && (
                <Badge color="blue" variant="light">
                  {QUAL_LABELS[profile.qualification] ?? profile.qualification}
                </Badge>
              )}
            </Group>
          </Stack>
          <Button size="xs" variant="light" onClick={() => setEditOpen(true)}>Редактировать</Button>
        </Group>

        <EditProfileModal profile={profile} fullName={account?.full_name} opened={editOpen} onClose={() => setEditOpen(false)} />
      </Paper>

      {/* ── Маркеры + Зоны ── */}
      <Grid mb="lg" gutter="md">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <MarkersBlock athleteId={profile.id} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <ZonesBlock athleteId={profile.id} />
        </Grid.Col>
      </Grid>

      {/* ── Цель подготовки ── */}
      <Paper p="md" withBorder radius="md" mb="lg">
        <GoalBlock profile={profile} />
      </Paper>

      {/* ── Тренер ── */}
      <Paper p="md" withBorder radius="md" mb="lg">
        <CoachBlock profile={profile} />
      </Paper>

      {/* ── Настройки аккаунта ── */}
      <Paper p="md" withBorder radius="md">
        <Title order={4} mb="md">Настройки аккаунта</Title>
        {account && (
          <Stack gap={2} mb="md">
            <Text size="sm" c="dimmed">Email</Text>
            <Text size="sm" fw={500}>{account.email}</Text>
          </Stack>
        )}
        <Divider mb="md" />
        <ChangePasswordBlock />
      </Paper>
    </Container>
  )
}
