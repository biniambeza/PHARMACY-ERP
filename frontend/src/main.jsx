import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './index.css'
import App from './App.jsx'
import { initMonitoring } from './utils/monitoring'

// Optional Sentry error tracking: no-op unless VITE_SENTRY_DSN is set.
initMonitoring()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
