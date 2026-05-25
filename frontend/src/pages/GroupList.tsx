import {
  Button,
  Card,
  Container,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { groupsApi } from '../api/groups'

interface TrainingGroup {
  id: string
  name: string
  description: string | null
  target_event: string | null
}

export default function GroupList() {
  const navigate    = useNavigate()
  const queryClient = useQueryClient()

  const [modalOpen,   setModalOpen]   = useState(false)
  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [targetEvent, setTargetEvent] = useState('')

  const { data: groups = [], isLoading } = useQuery<TrainingGroup[]>({
    queryKey: ['groups'],
    queryFn: groupsApi.list,
  })

  const createGroup = useMutation({
    mutationFn: () => groupsApi.create({
      name: name.trim(),
      description: description.trim() || null,
      target_event: targetEvent.trim() || null,
    }),
    onSuccess: (created: TrainingGroup) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['coach-athletes'] })
      resetForm()
      setModalOpen(false)
      navigate(`/groups/${created.id}`)
    },
  })

  const resetForm = () => {
    setName('')
    setDescription('')
    setTargetEvent('')
  }

  const handleClose = () => { resetForm(); setModalOpen(false) }

  return (
    <>
      <Modal opened={modalOpen} onClose={handleClose} title="Новая группа">
        <Stack gap="sm">
          <TextInput
            label="Название"
            placeholder="Например: Лыжные гонки, юниоры"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            autoFocus
          />
          <TextInput
            label="Описание"
            placeholder="Необязательно"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
          <TextInput
            label="Дисциплина"
            placeholder="Например: Лыжные гонки"
            value={targetEvent}
            onChange={e => setTargetEvent(e.target.value)}
          />
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={handleClose}>Отмена</Button>
            <Button
              loading={createGroup.isPending}
              disabled={!name.trim()}
              onClick={() => createGroup.mutate()}
            >
              Создать
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Container py="xl">
        <Group justify="space-between" mb="lg">
          <Title order={2}>Группы</Title>
          <Button onClick={() => setModalOpen(true)}>+ Создать группу</Button>
        </Group>

        {isLoading && <Text>Загрузка...</Text>}

        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
          {groups.map((g) => (
            <Card
              key={g.id}
              shadow="sm"
              padding="lg"
              radius="md"
              withBorder
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/groups/${g.id}`)}
            >
              <Text fw={600} size="lg" mb="xs">{g.name}</Text>
              {g.description && <Text size="sm" c="dimmed" lineClamp={2}>{g.description}</Text>}
              {g.target_event && <Text size="sm" mt="xs">Дисциплина: {g.target_event}</Text>}
            </Card>
          ))}
        </SimpleGrid>

        {!isLoading && groups.length === 0 && (
          <Text c="dimmed" ta="center" mt="xl">Групп пока нет. Создайте первую!</Text>
        )}
      </Container>
    </>
  )
}
