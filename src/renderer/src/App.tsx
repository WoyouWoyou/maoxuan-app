import { useFeaturePreferences } from './features/settings/feature-preferences'
import { GrowthPickup } from './features/long-march/GrowthPickup'
import { JournalPage } from './features/journal/JournalPage'
import { LongMarchPage } from './features/long-march/LongMarchPage'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ActionsPage } from './pages/ActionsPage'
import { Sidebar } from './components/Sidebar'
import { HomePage } from './pages/HomePage'
import { LibraryPage } from './pages/LibraryPage'
import { LibraryArticlePage } from './pages/LibraryArticlePage'
import { SettingsPage } from './pages/SettingsPage'
import { SessionPage } from './pages/SessionPage'

export function App() {
  const features = useFeaturePreferences()
  const showMarch = features.loaded && features.preferences.longMarch
  const immersive = showMarch && /^\/long-march\/[^/]+\/scenery$/.test(useLocation().pathname)
  const marchPage = !features.loaded ? (
    <div className="march-loading" role="status">
      正在读取功能设置…
    </div>
  ) : showMarch ? (
    <LongMarchPage />
  ) : (
    <Navigate to="/settings" replace />
  )
  return (
    <>
      {showMarch && <GrowthPickup />}
      <div className="titlebar-drag">毛选实用工具箱</div>
      <div className="app">
        {!immersive && <Sidebar />}
        <main className="main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/session/:id" element={<SessionPage />} />
            <Route path="/long-march" element={marchPage} />
            <Route path="/long-march/album" element={marchPage} />
            <Route path="/long-march/:nodeId" element={marchPage} />
            <Route path="/long-march/:nodeId/scenery" element={marchPage} />
            <Route path="/journal" element={<JournalPage />} />
            <Route path="/actions" element={<ActionsPage />} />
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
