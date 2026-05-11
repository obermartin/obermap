import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { GlobalDialog } from './components/GlobalDialog.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <GlobalDialog />
  </StrictMode>,
)
