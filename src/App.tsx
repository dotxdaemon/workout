// ABOUTME: Sets up app routing and viewport-safe layout for the mobile workout tracker.
// ABOUTME: Defines bottom navigation for routines and settings screens.
import { useEffect } from 'react'
import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { calculateViewportBottomOffset } from './lib/viewport'
import { RoutinesScreen } from './screens/RoutinesScreen'
import { SettingsScreen } from './screens/SettingsScreen'

function App() {
  useEffect(() => {
    const viewport = window.visualViewport

    if (!viewport) {
      return
    }

    const root = document.documentElement

    const applyViewportBottomOffset = () => {
      const offset = calculateViewportBottomOffset(
        root.clientHeight,
        viewport.height,
        viewport.offsetTop,
      )
      root.style.setProperty('--viewport-bottom-offset', `${offset}px`)
    }

    applyViewportBottomOffset()
    viewport.addEventListener('resize', applyViewportBottomOffset)
    viewport.addEventListener('scroll', applyViewportBottomOffset)

    return () => {
      viewport.removeEventListener('resize', applyViewportBottomOffset)
      viewport.removeEventListener('scroll', applyViewportBottomOffset)
      root.style.removeProperty('--viewport-bottom-offset')
    }
  }, [])

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
    </HashRouter>
  )
}

function navClassName(isActive: boolean): string {
  return isActive ? 'nav-link nav-link--active' : 'nav-link'
}

export default App
