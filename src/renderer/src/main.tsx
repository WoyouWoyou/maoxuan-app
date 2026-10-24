import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { ActionHubProvider } from './features/actions/ActionHub'
import { App } from './App'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('找不到根节点 #root')

createRoot(container).render(
  <StrictMode>
    <HashRouter>
      <ActionHubProvider>
        <App />
      </ActionHubProvider>
    </HashRouter>
  </StrictMode>
)
