import {
  Button,
  Container,
  Divider,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { authApi } from '../api/auth'
import { useAuth } from '../hooks/useAuth'

// ─── Full name block ──────────────────────────────────────────────────────────

function AccountBlock() {
  const queryClient = useQueryClient()
  const { user, setUser } = useAuth()

  const { data: account } = useQuery<{ email: string; full_name: string | null }>({
    queryKey: ['auth-me'],
    queryFn: authApi.me,
  })

  const [fullName, setFullName] = useState<string>('')
  const [initialized, setInitialized] = useState(false)

  if (account && !initialized) {
    setFullName(account.full_name ?? '')
    setInitialized(true)
  }

  const [saved, setSaved] = useState(false)

  const save = useMutation({
    mutationFn: () => authApi.updateMe({ full_name: fullName.trim() || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-me'] })
      if (user) setUser({ ...user, full_name: fullName.trim() || null })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  const changed = fullName !== (account?.full_name ?? '')

  return (
    <Stack gap="sm" maw={400}>
      <Stack gap={2}>
        <Text size="sm" c="dimmed">Email</Text>
        <Text size="sm" fw={500}>{account?.email}</Text>
      </Stack>
      <TextInput
        label="Отображаемое имя"
        placeholder="Например: Иван Петров"
        value={fullName}
        onChange={e => { setFullName(e.target.value); setSaved(false) }}
      />
      {saved && <Text size="sm" c="green">Сохранено</Text>}
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
      {success  && <Text size="sm" c="green">Пароль успешно изменён</Text>}
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

export default function CoachProfilePage() {
  return (
    <Container size="sm" py="xl">
      <Title order={2} mb="lg">Мой профиль</Title>

      <Paper p="md" withBorder radius="md" mb="lg">
        <Title order={4} mb="md">Аккаунт</Title>
        <AccountBlock />
        <Divider my="md" />
        <ChangePasswordBlock />
      </Paper>
    </Container>
  )
}
