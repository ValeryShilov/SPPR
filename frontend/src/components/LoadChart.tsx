import { Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { analyticsApi } from '../api/analytics'

interface Props {
  athleteId: string
}

export default function LoadChart({ athleteId }: Props) {
  const { data } = useQuery({
    queryKey: ['load', athleteId],
    queryFn: () => analyticsApi.getLoad(athleteId),
    enabled: !!athleteId,
  })

  return (
    <div>
      <Title order={4} mb="sm">ATL / CTL / TSB</Title>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data?.data ?? []}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="atl_7d" stroke="#ff7300" name="ATL" dot={false} />
          <Line type="monotone" dataKey="ctl_42d" stroke="#387908" name="CTL" dot={false} />
          <Line type="monotone" dataKey="tsb" stroke="#8884d8" name="TSB" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
