import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted fonts (@fontsource, bundled into /assets and precached by the service worker, so
// they work offline and do not depend on Google Fonts). Only the weights the UI uses:
// Tailwind font-normal/medium/semibold/bold/extrabold (400-800) and the .font-mono class
// (400, 600, 700). Each weight file declares its subsets with unicode-range, so the browser
// only downloads the subsets a page needs (Noto Sans Ethiopic only when Ethiopic text is shown).
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import '@fontsource/jetbrains-mono/700.css'
import '@fontsource/noto-sans-ethiopic/400.css'
import '@fontsource/noto-sans-ethiopic/500.css'
import '@fontsource/noto-sans-ethiopic/600.css'
import '@fontsource/noto-sans-ethiopic/700.css'
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
