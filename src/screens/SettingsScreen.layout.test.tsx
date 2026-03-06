// ABOUTME: Verifies settings screen layout constraints for mobile overflow prevention.
// ABOUTME: Ensures settings-specific file input classes are rendered for themed styling.
/// <reference types="node" />
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SettingsScreen } from './SettingsScreen'

describe('Settings screen layout', () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('settings page grid uses constrained single column track', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const pageBlock = getRuleBlock(css, '.page')

    expect(pageBlock).toContain('grid-template-columns: minmax(0, 1fr)')
  })

  it('settings file input has width clamp styles', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const settingsFileBlock = getRuleBlock(css, '.settings-page .settings-file-input')

    expect(settingsFileBlock).toContain('width: 100%')
    expect(settingsFileBlock).toContain('max-width: 100%')
    expect(settingsFileBlock).toContain('min-width: 0')
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
})

function getRuleBlock(css: string, selector: string): string {
  const escapedSelector = selector.replace(/\./g, '\\.')
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'))
  return match?.[1] ?? ''
}
