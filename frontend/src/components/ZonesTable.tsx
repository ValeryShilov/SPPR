import { Table, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { athletesApi } from '../api/athletes'

interface HRZone {
  zone: string
  label: string
  hr_min: number
  hr_max: number
}

interface HRZonesResponse {
  athlete_id: string
  max_hr: number
  zones: HRZone[]
}

interface Props {
  athleteId: string
}

export default function ZonesTable({ athleteId }: Props) {
  const { data, isLoading } = useQuery<HRZonesResponse>({
    queryKey: ['zones', athleteId],
    queryFn: () => athletesApi.getZones(athleteId),
    enabled: !!athleteId,
  })

  if (isLoading) return <Text size="sm">Загрузка зон...</Text>
  if (!data) return null

  return (
    <div>
      <Title order={4} mb="sm">
        Пульсовые зоны Olympiatoppen{data.max_hr ? ` (ЧССmax: ${data.max_hr})` : ''}
      </Title>
      <Table withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Зона</Table.Th>
            <Table.Th>Название</Table.Th>
            <Table.Th>ЧСС мин</Table.Th>
            <Table.Th>ЧСС макс</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.zones.map((z) => (
            <Table.Tr key={z.zone}>
              <Table.Td>{z.zone}</Table.Td>
              <Table.Td>{z.label}</Table.Td>
              <Table.Td>{z.hr_min}</Table.Td>
              <Table.Td>{z.hr_max}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </div>
  )
}
