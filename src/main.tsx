import { Profiler, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import App from './App.tsx'
import { theme } from './theme'
import './index.css'
import { record, TRACING } from './trace'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {/* every render of the tree, timed by React itself, for the trace panel */}
      {TRACING ? (
        <Profiler
          id="app"
          onRender={(_, phase, actualDuration) => record(`React ${phase}`, actualDuration)}
        >
          <App />
        </Profiler>
      ) : (
        <App />
      )}
    </ThemeProvider>
  </StrictMode>,
)
