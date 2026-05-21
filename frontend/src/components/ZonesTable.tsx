import { Table, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { athletesApi } from '../api/athletes'

interface Props {
  athleteId: string
}

export default function ZonesTable({ athleteId }: Props) {
  const { data } = useQuery({
    queryKey: ['zones', athleteId],
    queryFn: () => athletesApi.getZones(athleteId),
    enabled: !!athleteId,
  })

  return (
    <div>
      <Title order={4} mb="sm">Пульсовые зоны (Olympiatoppen)</Title>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Зона</Table.Th>
            <Table.Th>ЧСС мин</Table.Th>
            <Table.Th>ЧСС макс</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {/* TODO: вывести zones из data */}
        </Table.Tbody>
      </Table>
    </div>
  )
}
