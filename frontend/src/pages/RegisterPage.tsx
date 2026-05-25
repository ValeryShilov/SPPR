import {
  Alert,
  Button,
  Container,
  Divider,
  Group,
  PasswordInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { athletesApi } from '../api/athletes'
import { authApi } from '../api/auth'
import { useAuth } from '../hooks/useAuth'

export default function RegisterPage() {
  const { setUser } = useAuth()
  const navigate = useNavigate()

  const [role, setRole]                   = useState<'athlete' | 'coach'>('athlete')
  const [email, setEmail]                 = useState('')
  const [password, setPassword]           = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName]           = useState('')
  const [firstName, setFirstName]         = useState('')
  const [lastName, setLastName]           = useState('')
  const [birthDate, setBirthDate]         = useState('')
  const [gender, setGender]               = useState<string | null>(null)
  const [qualification, setQualification] = useState('')

  const [error, setError]     = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isAthlete = role === 'athlete'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Пароли не совпадают')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const tokenData = await authApi.register({
        email,
        password,
        role,
        full_name: fullName || undefined,
      })

      localStorage.setItem('auth_user', JSON.stringify({ token: tokenData.access_token }))

      if (isAthlete) {
        await athletesApi.create({
          first_name: firstName,
          last_name: lastName,
          birth_date: birthDate,
          gender: gender!,
          qualification: qualification || undefined,
        })
      }

      const me = await authApi.me()
      setUser({ id: me.id, email: me.email, full_name: me.full_name ?? null, role: me.role, token: tokenData.access_token })
      navigate('/dashboard')
    } catch (err: unknown) {
      localStorage.removeItem('auth_user')
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'Ошибка при регистрации'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = isAthlete
    ? email && password && confirmPassword && firstName && lastName && birthDate && gender
    : email && password && confirmPassword

  return (
    <Container size="xs" mt={60} mb={60}>
      <Title order={2} mb="xs" ta="center">Регистрация</Title>
      <Text c="dimmed" ta="center" mb="lg" size="sm">
        Создайте аккаунт в системе
      </Text>

      <form onSubmit={handleSubmit}>
        <Stack gap="sm">
          {error && <Alert color="red" variant="light">{error}</Alert>}

          <SegmentedControl
            fullWidth
            value={role}
            onChange={(v) => { setRole(v as 'athlete' | 'coach'); setError(null) }}
            data={[
              { value: 'athlete', label: 'Спортсмен' },
              { value: 'coach',   label: 'Тренер' },
            ]}
          />

          <Divider label="Данные аккаунта" labelPosition="left" mt="xs" />

          <TextInput
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <TextInput
            label="Полное имя"
            placeholder="Иванов Иван Иванович"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <PasswordInput
            label="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <PasswordInput
            label="Повторите пароль"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            error={confirmPassword && password !== confirmPassword ? 'Пароли не совпадают' : undefined}
          />

          {isAthlete && (
            <>
              <Divider label="Профиль спортсмена" labelPosition="left" mt="xs" />

              <Group grow>
                <TextInput
                  label="Имя"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
                <TextInput
                  label="Фамилия"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </Group>
              <TextInput
                label="Дата рождения"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                required
              />
              <Select
                label="Пол"
                placeholder="Выберите..."
                data={[
                  { value: 'm', label: 'Мужской' },
                  { value: 'f', label: 'Женский' },
                ]}
                value={gender}
                onChange={setGender}
                required
              />
              <TextInput
                label="Квалификация"
                placeholder="КМС, МС, МСМК — необязательно"
                value={qualification}
                onChange={(e) => setQualification(e.target.value)}
              />
            </>
          )}

          <Button type="submit" loading={loading} disabled={!canSubmit} fullWidth mt="sm">
            Зарегистрироваться
          </Button>

          <Text size="sm" ta="center" c="dimmed">
            Уже есть аккаунт?{' '}
            <Text span c="blue" style={{ cursor: 'pointer' }} onClick={() => navigate('/login')}>
              Войти
            </Text>
          </Text>
        </Stack>
      </form>
    </Container>
  )
}
