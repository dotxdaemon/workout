// ABOUTME: Verifies settings screen layout constraints for mobile overflow prevention.
// ABOUTME: Ensures settings-specific file input classes are rendered for themed styling.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readPreferences } from '../lib/preferences'
import { SettingsScreen } from './SettingsScreen'

describe('Settings screen layout', () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    document.body.innerHTML = ''
    localStorage.clear()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('settings screen renders styled import controls and stacked export actions', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<SettingsScreen />)
    })

    const page = host.querySelector('.settings-page')
    const importInput = host.querySelector('.settings-file-input')
    const importButton = host.querySelector('.settings-file-button')
    const importName = host.querySelector('.settings-file-name')
    const exportActions = host.querySelector('.settings-export-actions')

    expect(page).not.toBeNull()
    expect(importInput).not.toBeNull()
    expect(importButton?.textContent).toContain('Choose JSON file')
    expect(importName?.textContent).toContain('No file selected')
    expect(exportActions).not.toBeNull()

    await act(async () => {
      root.unmount()
    })
  })

  it('applies and persists a theme choice immediately from the settings switch', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<SettingsScreen />)
    })

    const lightButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Light',
    )
    expect(lightButton).not.toBeUndefined()

    await act(async () => {
      lightButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(readPreferences().theme).toBe('light')

    await act(async () => {
      root.unmount()
    })
  })
})
