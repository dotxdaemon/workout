import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { registerAppServiceWorker } from './lib/serviceWorker'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerAppServiceWorker(
  window,
  'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
)
