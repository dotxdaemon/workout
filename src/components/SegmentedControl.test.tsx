// ABOUTME: Verifies the segmented control's roving tabindex and arrow-key tab navigation.
// ABOUTME: Guards the keyboard-accessibility contract for the reusable tablist component.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SegmentedControl } from './SegmentedControl'

describe('SegmentedControl', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('applies a roving tabindex and changes value with arrow keys', async () => {
    let current = 'today'
    const onChange = (next: string) => {
      current = next
    }

    await act(async () => {
      root.render(
        <SegmentedControl
          ariaLabel="Mode"
          value="today"
          onChange={onChange}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'edit', label: 'Edit' },
          ]}
        />,
      )
    })

    const tabs = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs).toHaveLength(2)
    expect(tabs[0].getAttribute('tabindex')).toBe('0')
    expect(tabs[1].getAttribute('tabindex')).toBe('-1')

    await act(async () => {
      tabs[0].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
      )
    })

    expect(current).toBe('edit')
  })
})
