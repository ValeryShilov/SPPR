import { Alert, Button, Container, PasswordInput, Stack, TextInput, Title } from '@mantine/core'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api/auth'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      // 1. Получаем токен
      const data = await authApi.login(email, password)

      // 2. Кладём токен в localStorage ДО вызова me(),
      //    чтобы перехватчик axios подхватил его
      localStorage.setItem('auth_user', JSON.stringify({ token: data.access_token }))

      // 3. Получаем профиль текущего пользователя
      const me = await authApi.me()

      // 4. Сохраняем полный объект через контекст
      setUser({ id: me.id, email: me.email, role: me.role, token: data.access_token })
      navigate('/dashboard')
    } catch (err: unknown) {
      localStorage.removeItem('auth_user')
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'Ошибка входа. Проверьте email и пароль.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container size="xs" mt={80}>
      <Title order={2} mb="md" ta="center">Вход в систему</Title>
      <form onSubmit={handleSubmit}>
        <Stack>
          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}
          <TextInput
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <PasswordInput
            label="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit" loading={loading} fullWidth mt="sm">
            Войти
          </Button>
        </Stack>
      </form>
    </Container>
  )
}
