import {
  Alert,
  Button,
  Container,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { athletesApi } from '../api/athletes'

export default function CreateProfilePage() {
  const navigate = useNavigate()

  const [firstName, setFirstName]         = useState('')
  const [lastName, setLastName]           = useState('')
  const [birthDate, setBirthDate]         = useState('')
  const [gender, setGender]               = useState<string | null>(null)
  const [qualification, setQualification] = useState('')
  const [error, setError]                 = useState<string | null>(null)
  const [loading, setLoading]             = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await athletesApi.create({
        first_name: firstName,
        last_name: lastName,
        birth_date: birthDate,
        gender: gender!,
        qualification: qualification || undefined,
      })
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'Ошибка при создании профиля'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = firstName && lastName && birthDate && gender

  return (
    <Container size="xs" mt={80}>
      <Title order={2} mb="xs" ta="center">Создание профиля</Title>
      <Text c="dimmed" ta="center" mb="xl" size="sm">
        Заполните данные, чтобы продолжить
      </Text>

      <form onSubmit={handleSubmit}>
        <Stack gap="sm">
          {error && <Alert color="red" variant="light">{error}</Alert>}

          <Group grow>
            <TextInput
              label="Имя"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              autoFocus
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

          <Button type="submit" loading={loading} disabled={!canSubmit} fullWidth mt="sm">
            Сохранить профиль
          </Button>
        </Stack>
      </form>
    </Container>
  )
}
