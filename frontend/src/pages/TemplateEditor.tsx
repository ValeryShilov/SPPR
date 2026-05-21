import { Container, Title } from '@mantine/core'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { plansApi } from '../api/plans'

export default function TemplateEditor() {
  const { id } = useParams<{ id: string }>()
  const { data: template } = useQuery({
    queryKey: ['template', id],
    queryFn: () => plansApi.getTemplate(id!),
    enabled: !!id,
  })

  return (
    <Container>
      <Title order={2} mb="md">Редактор шаблона</Title>
      {/* TODO: форма редактирования шаблона микроцикла */}
    </Container>
  )
}
