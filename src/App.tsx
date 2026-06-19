// ABOUTME: Sets up routing and the fixed mobile shell with bottom navigation.
// ABOUTME: Routes the training and settings screens and renders the primary nav.
import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { RoutinesScreen } from './screens/RoutinesScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { DumbbellIcon, SettingsIcon } from './components/icons'

function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <div className="screen-area">
          <Routes>
            <Route path="/" element={<RoutinesScreen />} />
            <Route path="/routines" element={<RoutinesScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="*" element={<Navigate to="/routines" replace />} />
          </Routes>
        </div>

        <nav className="bottom-nav" aria-label="Primary navigation">
          <NavLink to="/routines" className={navClassName}>
            <DumbbellIcon className="nav-link__icon" />
            <span className="nav-link__label">Train</span>
          </NavLink>
          <NavLink to="/settings" className={navClassName}>
            <SettingsIcon className="nav-link__icon" />
            <span className="nav-link__label">Settings</span>
          </NavLink>
        </nav>
      </div>
    </HashRouter>
  )
}

function navClassName({ isActive }: { isActive: boolean }): string {
  return isActive ? 'nav-link nav-link--active' : 'nav-link'
}

export default App
