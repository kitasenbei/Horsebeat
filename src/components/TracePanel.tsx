import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { snapshot, type TraceRow } from '../trace'

const PANEL_WIDTH = 340
const POLL_MS = 250
const FONT = "'JetBrains Mono', 'Fira Mono', ui-monospace, monospace"

// What the app is doing, a second at a time: every measured function with how
// often it ran and what it cost. Lives beside the page rather than in it, and
// is the only thing that renders when it updates.
export default function TracePanel() {
  const [rows, setRows] = useState<TraceRow[]>([])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = snapshot()
      setRows((current) => (current === next ? current : next))
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [])

  const busy = rows.reduce((sum, row) => sum + row.ms, 0)

  return (
    <Box
      component="aside"
      sx={{
        width: PANEL_WIDTH,
        flex: '0 0 auto',
        height: '100vh',
        overflowY: 'auto',
        borderLeft: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        px: 1.5,
        py: 1,
        fontFamily: FONT,
        fontSize: 11,
        lineHeight: 1.6,
      }}
    >
      <Typography variant="caption" sx={{ fontFamily: FONT, fontWeight: 700 }}>
        Trace
      </Typography>
      <Box sx={{ color: 'text.secondary', mb: 1 }}>
        measured work {busy.toFixed(1)} ms every second ({((busy / 1000) * 100).toFixed(0)}% of the
        thread)
      </Box>
      <Box
        component="table"
        sx={{
          width: '100%',
          borderCollapse: 'collapse',
          '& th, & td': { textAlign: 'right', px: 0.5, py: 0, whiteSpace: 'nowrap' },
          '& th:first-of-type, & td:first-of-type': { textAlign: 'left', width: '100%' },
          '& th': { color: 'text.secondary', fontWeight: 500 },
          '& tbody tr:nth-of-type(odd)': { bgcolor: 'action.hover' },
        }}
      >
        <thead>
          <tr>
            <th>name</th>
            <th>count</th>
            <th>/s</th>
            <th>ms/s</th>
            <th>avg</th>
            <th>max</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
              <td>{row.total}</td>
              <td>{row.calls.toFixed(0)}</td>
              <td>{row.ms.toFixed(1)}</td>
              <td>{row.average.toFixed(2)}</td>
              <td>{row.worst.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </Box>
      <Box sx={{ color: 'text.secondary', mt: 1 }}>
        count is every call since the page opened; /s is calls a second; ms/s is time on the
        thread a second; avg and max are per call.
        Renders are counted, not timed.
      </Box>
    </Box>
  )
}
