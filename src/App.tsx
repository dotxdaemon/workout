import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { RoutinesScreen } from './screens/RoutinesScreen'
import { SessionScreen } from './screens/SessionScreen'
import { ExerciseScreen } from './screens/ExerciseScreen'
import { SettingsScreen } from './screens/SettingsScreen'

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <div className="screen-area">
          <Routes>
            <Route path="/" element={<SessionScreen />} />
            <Route path="/routines" element={<RoutinesScreen />} />
            <Route path="/session/:sessionId" element={<Navigate to="/" replace />} />
            <Route path="/exercise/:exerciseId" element={<ExerciseScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>

        <nav className="bottom-nav" aria-label="Primary navigation">
          <NavLink to="/" className={({ isActive }) => navClassName(isActive)}>
            Tracker
          </NavLink>
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
