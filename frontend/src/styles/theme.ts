import { MantineColorsTuple, createTheme } from '@mantine/core'

// Палитра красного — индекс 6 = основной #C8102E
const red: MantineColorsTuple = [
  '#FFEBEE',
  '#FFCDD2',
  '#EF9A9A',
  '#E57373',
  '#EF5350',
  '#E53935',
  '#C8102E',
  '#B71C1C',
  '#9B0000',
  '#7B0000',
]

// Янтарный для warning-алертов
const amber: MantineColorsTuple = [
  '#FFF8E1',
  '#FFECB3',
  '#FFE082',
  '#FFD54F',
  '#FFCA28',
  '#FFC107',
  '#FB8C00',
  '#F57C00',
  '#E65100',
  '#BF360C',
]

export const theme = createTheme({
  primaryColor: 'red',
  primaryShade: 6,
  colors: { red, amber },
  defaultRadius: 'md',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, sans-serif',
  components: {
    AppShell: {
      styles: {
        main: { backgroundColor: '#F5F5F5' },
      },
    },
  },
})
