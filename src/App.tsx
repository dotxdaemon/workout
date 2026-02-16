import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { RoutinesScreen } from './screens/RoutinesScreen'
import { ExerciseScreen } from './screens/ExerciseScreen'
import { SettingsScreen } from './screens/SettingsScreen'

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <div className="screen-area">
          <Routes>
            <Route path="/" element={<RoutinesScreen />} />
            <Route path="/routines" element={<RoutinesScreen />} />
            <Route path="/session/:sessionId" element={<Navigate to="/routines" replace />} />
            <Route path="/exercise/:exerciseId" element={<ExerciseScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="*" element={<Navigate to="/routines" replace />} />
          </Routes>
        </div>

        <nav className="bottom-nav" aria-label="Primary navigation">
          <NavLink
            to="/routines"
            className={({ isActive }) => navClassName(isActive)}
          >
            Routines
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => navClassName(isActive)}
          >
            Settings
          </NavLink>
        </nav>
      </div>
    </BrowserRouter>
  )
}

function navClassName(isActive: boolean): string {
  return isActive ? 'nav-link nav-link--active' : 'nav-link'
}

export default App
