// ABOUTME: Sets up app routing and viewport-safe layout for the mobile workout tracker.
// ABOUTME: Defines bottom navigation for routines and settings screens.
import { useEffect } from 'react'
import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { calculateShellHeight } from './lib/viewport'
import { RoutinesScreen } from './screens/RoutinesScreen'
import { SettingsScreen } from './screens/SettingsScreen'

function App() {
  useEffect(() => {
    const root = document.documentElement
    const viewport = window.visualViewport
    const keyboardThreshold = 100
    let previousStableHeight = 0

    const isTextEditingElement = (element: Element | null): boolean => {
      if (!element) {
        return false
      }

      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      ) {
        return true
      }

      return element instanceof HTMLElement && element.isContentEditable
    }

    const applyViewportHeight = () => {
      if (!viewport) {
        root.style.removeProperty('--app-shell-height')
        return
      }

      const { shellHeight, stableHeight } = calculateShellHeight({
        visualHeight: viewport.height,
        visualOffsetTop: viewport.offsetTop,
        innerHeight: window.innerHeight,
        previousStableHeight,
        isTextEditing: isTextEditingElement(document.activeElement),
        keyboardThreshold,
      })

      previousStableHeight = stableHeight
      root.style.setProperty('--app-shell-height', `${shellHeight}px`)
    }

    applyViewportHeight()

    if (!viewport) {
      return
    }

    viewport.addEventListener('resize', applyViewportHeight)
    viewport.addEventListener('scroll', applyViewportHeight)
    document.addEventListener('focusin', applyViewportHeight)
    document.addEventListener('focusout', applyViewportHeight)

    return () => {
      viewport.removeEventListener('resize', applyViewportHeight)
      viewport.removeEventListener('scroll', applyViewportHeight)
      document.removeEventListener('focusin', applyViewportHeight)
      document.removeEventListener('focusout', applyViewportHeight)
      root.style.removeProperty('--app-shell-height')
      previousStableHeight = 0
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
