// ABOUTME: Verifies settings screen layout, collapsed backup tools, and instant preference writes.
// ABOUTME: Ensures theme, unit, and rest-timer changes persist immediately without a save button.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readPreferences } from '../lib/preferences'
import { SettingsScreen } from './SettingsScreen'

describe('Settings screen layout', () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    document.body.innerHTML = ''
    document.documentElement.removeAttribute('data-theme')
    localStorage.clear()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    document.documentElement.removeAttribute('data-theme')
    localStorage.clear()
  })

  it('keeps defaults visible while collapsing backup and restore tools by default', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<SettingsScreen />)
    })

    const defaultsHeading = Array.from(host.querySelectorAll('h2')).find(
      (heading) => heading.textContent?.trim() === 'Logging defaults',
    )
    const dataPanel = host.querySelector('.details') as HTMLDetailsElement | null

    expect(host.querySelector('.page')).not.toBeNull()
    expect(defaultsHeading).not.toBeUndefined()
    expect(dataPanel).not.toBeNull()
    expect(dataPanel?.open).toBe(false)
    expect(host.querySelector('#settings-import-json')).toBeNull()
    expect(host.querySelector('.export-actions')).toBeNull()

    await act(async () => {
      if (dataPanel) {
        dataPanel.open = true
        dataPanel.dispatchEvent(new Event('toggle'))
      }
    })

    expect(host.querySelector('#settings-import-json')).not.toBeNull()
    expect(host.querySelector('.file-button')?.textContent).toContain('Choose JSON file')
    expect(host.querySelector('.file-name')?.textContent).toContain('No file selected')
    expect(host.querySelector('.export-actions')).not.toBeNull()
    expect(host.textContent).toContain('Export log (readable .txt)')

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

    const dayButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Day',
    )
    expect(dayButton).not.toBeUndefined()

    await act(async () => {
      dayButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(readPreferences().theme).toBe('light')

    const nightButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Night',
    )
    await act(async () => {
      nightButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(readPreferences().theme).toBe('dark')

    await act(async () => {
      root.unmount()
    })
  })

  it('persists the rest timer toggle immediately', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<SettingsScreen />)
    })

    expect(readPreferences().restTimerEnabled).toBe(true)

    const offButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Off',
    )
    await act(async () => {
      offButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(readPreferences().restTimerEnabled).toBe(false)

    await act(async () => {
      root.unmount()
    })
  })
})
