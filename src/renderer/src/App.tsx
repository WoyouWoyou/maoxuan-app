import { Route, Routes } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { HomePage } from './pages/HomePage'
import { LibraryPage } from './pages/LibraryPage'
import { LibraryArticlePage } from './pages/LibraryArticlePage'
import { SettingsPage } from './pages/SettingsPage'
import { SessionPage } from './pages/SessionPage'

export function App() {
  return (
    <>
      <div className="titlebar-drag">毛选实用工具箱</div>
      <div className="app">
        <Sidebar />
        <main className="main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/session/:id" element={<SessionPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/library/:articleId" element={<LibraryArticlePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<HomePage />} />
          </Routes>
        </main>
      </div>
    </>
  )
}
