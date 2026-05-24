import {
  Alert,
  Badge,
  Button,
  Container,
  Divider,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { usersApi } from '../api/users'
import { useAuth } from '../hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string
  email: string
  role: string
  full_name: string | null
  is_active: boolean
}

const ROLE_LABEL: Record<string, string> = {
  coach:   'Тренер',
  athlete: 'Атлет',
  admin:   'Администратор',
}

// ─── Profile section ──────────────────────────────────────────────────────────

function ProfileSection({ profile }: { profile: UserProfile }) {
  const queryClient = useQueryClient()
  const [fullName, setFullName] = useState(profile.full_name ?? '')
  const [saved,    setSaved]    = useState(false)

  useEffect(() => { setFullName(profile.full_name ?? '') }, [profile.full_name])

  const mutation = useMutation({
    mutationFn: () => usersApi.updateMe({ full_name: fullName.trim() || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const dirty = fullName.trim() !== (profile.full_name ?? '')

  return (
    <Paper withBorder p="lg" radius="md">
      <Title order={4} mb="md">Профиль</Title>

      <Stack gap="sm" maw={420}>
        <TextInput
          label="Email"
          value={profile.email}
          disabled
          description="Email изменить нельзя"
        />

        <Group gap="sm" align="flex-end">
          <div style={{ flex: 1 }}>
            <Text size="sm" fw={500} mb={4}>Роль</Text>
            <Badge size="md" color="red" variant="light">
              {ROLE_LABEL[profile.role] ?? profile.role}
            </Badge>
          </div>
        </Group>

        <TextInput
          label="Отображаемое имя"
          placeholder="Иван Иванов"
          value={fullName}
          onChange={(e) => setFullName(e.currentTarget.value)}
        />

        {saved && (
          <Alert color="green" radius="sm" p="xs">
            Изменения сохранены
          </Alert>
        )}

        {mutation.isError && (
          <Alert color="red" radius="sm" p="xs">
            Ошибка при сохранении. Попробуйте ещё раз.
          </Alert>
        )}

        <Button
          onClick={() => mutation.mutate()}
          loading={mutation.isPending}
          disabled={!dirty}
          style={{ alignSelf: 'flex-start' }}
        >
          Сохранить
        </Button>
      </Stack>
    </Paper>
  )
}

// ─── Password section ─────────────────────────────────────────────────────────

function PasswordSection() {
  const [current,  setCurrent]  = useState('')
  const [next,     setNext]     = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [success,  setSuccess]  = useState(false)
  const [errMsg,   setErrMsg]   = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      usersApi.changePassword({ current_password: current, new_password: next }),
    onSuccess: () => {
      setCurrent(''); setNext(''); setConfirm('')
      setErrMsg(null)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 4000)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail ?? 'Ошибка при смене пароля'
      setErrMsg(msg)
    },
  })

  function handleSubmit() {
    setErrMsg(null)
    if (!current || !next || !confirm) {
      setErrMsg('Заполните все поля')
      return
    }
    if (next !== confirm) {
      setErrMsg('Новый пароль и подтверждение не совпадают')
      return
    }
    if (next.length < 6) {
      setErrMsg('Пароль должен быть не менее 6 символов')
      return
    }
    mutation.mutate()
  }

  return (
    <Paper withBorder p="lg" radius="md">
      <Title order={4} mb="md">Безопасность</Title>

      <Stack gap="sm" maw={420}>
        <PasswordInput
          label="Текущий пароль"
          value={current}
          onChange={(e) => setCurrent(e.currentTarget.value)}
        />
        <PasswordInput
          label="Новый пароль"
          value={next}
          onChange={(e) => setNext(e.currentTarget.value)}
          description="Минимум 6 символов"
        />
        <PasswordInput
          label="Подтвердите новый пароль"
          value={confirm}
          onChange={(e) => setConfirm(e.currentTarget.value)}
        />

        {success && (
          <Alert color="green" radius="sm" p="xs">
            Пароль успешно изменён
          </Alert>
        )}

        {errMsg && (
          <Alert color="red" radius="sm" p="xs">{errMsg}</Alert>
        )}

        <Button
          onClick={handleSubmit}
          loading={mutation.isPending}
          style={{ alignSelf: 'flex-start' }}
        >
          Изменить пароль
        </Button>
      </Stack>
    </Paper>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user } = useAuth()

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ['me'],
    queryFn:  () => usersApi.getMe(),
    enabled:  !!user,
  })

  return (
    <Container size="sm" py="xl">
      <Title order={2} mb="xl">Настройки</Title>

      {isLoading || !profile ? (
        <Text c="dimmed">Загрузка...</Text>
      ) : (
        <Stack gap="xl">
          <ProfileSection profile={profile} />
          <Divider />
          <PasswordSection />
        </Stack>
      )}
    </Container>
  )
}
