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

  it('keeps defaults visible while collapsing backup and restore tools by default', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<SettingsScreen />)
    })

    const page = host.querySelector('.settings-page')
    const defaultsHeading = Array.from(host.querySelectorAll('h2')).find(
      (heading) => heading.textContent?.trim() === 'Defaults',
    )
    const dataPanel = host.querySelector('.settings-data-panel') as HTMLDetailsElement | null
    const importInput = host.querySelector('.settings-file-input')
    const exportActions = host.querySelector('.settings-export-actions')

    expect(page).not.toBeNull()
    expect(defaultsHeading).not.toBeUndefined()
    expect(dataPanel).not.toBeNull()
    expect(dataPanel?.open).toBe(false)
    expect(importInput).toBeNull()
    expect(exportActions).toBeNull()

    await act(async () => {
      if (dataPanel) {
        dataPanel.open = true
        dataPanel.dispatchEvent(new Event('toggle'))
      }
    })

    expect(host.querySelector('.settings-file-input')).not.toBeNull()
    expect(host.querySelector('.settings-file-button')?.textContent).toContain('Choose JSON file')
    expect(host.querySelector('.settings-file-name')?.textContent).toContain('No file selected')
    expect(host.querySelector('.settings-export-actions')).not.toBeNull()

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
