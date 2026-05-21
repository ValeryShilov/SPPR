import { Button, Container, PasswordInput, Stack, TextInput, Title } from '@mantine/core'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api/auth'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: обработка ошибок
    const data = await authApi.login(email, password)
    const me = await authApi.me()
    setUser({ ...me, token: data.access_token })
    navigate('/')
  }

  return (
    <Container size="xs" mt="xl">
      <Title order={2} mb="md">Вход в систему</Title>
      <form onSubmit={handleSubmit}>
        <Stack>
          <TextInput label="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <PasswordInput label="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Button type="submit">Войти</Button>
        </Stack>
      </form>
    </Container>
  )
}
