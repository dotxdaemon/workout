// ABOUTME: Accessible segmented control for switching between a small set of options.
// ABOUTME: Renders a tablist with roving tabindex and arrow-key navigation between options.
import { useRef } from 'react'
import type { KeyboardEvent } from 'react'

interface SegmentedOption<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  const tablistRef = useRef<HTMLDivElement | null>(null)

  function focusOption(index: number): void {
    const tabs = tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    tabs?.[index]?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % options.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + options.length) % options.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = options.length - 1
    }

    if (nextIndex == null) {
      return
    }

    event.preventDefault()
    onChange(options[nextIndex].value)
    focusOption(nextIndex)
  }

  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel} ref={tablistRef}>
      {options.map((option, index) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={isActive ? 'segmented__option segmented__option--active' : 'segmented__option'}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
