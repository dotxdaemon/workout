// ABOUTME: Reusable mobile bottom sheet with drag-to-close, backdrop guard, and nav locking.
// ABOUTME: Wraps the tested historySheet drag math and adds Escape close plus focus management.
import { useEffect, useRef, useState } from 'react'
import type { MouseEvent, ReactNode, TouchEvent } from 'react'
import { CloseIcon } from './icons'
import {
  applyHistorySheetOverlayLock,
  getHistorySheetDragOffset,
  shouldAllowHistorySheetDrag,
  shouldCloseHistorySheetAfterDrag,
  shouldIgnoreHistorySheetBackdropClose,
} from '../lib/historySheet'

interface BottomSheetProps {
  eyebrow?: string
  title: string
  openedAt: number
  onClose: () => void
  children: ReactNode
}

export function BottomSheet({ eyebrow, title, openedAt, onClose, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const dragStartYRef = useRef<number | null>(null)
  const startScrollTopRef = useRef(0)
  const dragOffsetRef = useRef(0)
  const draggingRef = useRef(false)

  const [dragOffset, setDragOffset] = useState(0)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const bottomNav = document.querySelector<HTMLElement>('.bottom-nav')
    const releaseOverlayLock = applyHistorySheetOverlayLock({ bottomNav })

    const previouslyFocused = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const sheet = sheetRef.current
      if (!sheet) {
        return
      }
      const focusable = Array.from(
        sheet.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('disabled'))
      if (focusable.length === 0) {
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey && (active === first || !sheet.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      releaseOverlayLock()
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  function resetDrag(): void {
    dragStartYRef.current = null
    startScrollTopRef.current = 0
    dragOffsetRef.current = 0
    draggingRef.current = false
    setDragOffset(0)
    setDragging(false)
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>): void {
    if (shouldIgnoreHistorySheetBackdropClose(openedAt, event.timeStamp)) {
      return
    }
    onClose()
  }

  function handleTouchStart(event: TouchEvent<HTMLElement>): void {
    const touch = event.touches[0]
    if (!touch) {
      return
    }
    dragStartYRef.current = touch.clientY
    const body = bodyRef.current
    const target = event.target as Node | null
    const startedInBody = Boolean(body && target && body.contains(target))
    startScrollTopRef.current = startedInBody ? (body?.scrollTop ?? 0) : 0
  }

  function handleTouchMove(event: TouchEvent<HTMLElement>): void {
    const touch = event.touches[0]
    const startY = dragStartYRef.current
    if (!touch || startY == null) {
      return
    }
    const offset = getHistorySheetDragOffset(startY, touch.clientY)
    if (!shouldAllowHistorySheetDrag(startScrollTopRef.current, offset)) {
      return
    }
    if (event.cancelable) {
      event.preventDefault()
    }
    dragOffsetRef.current = offset
    draggingRef.current = true
    setDragOffset(offset)
    setDragging(true)
  }

  function handleTouchEnd(): void {
    dragStartYRef.current = null
    if (!draggingRef.current) {
      dragOffsetRef.current = 0
      setDragOffset(0)
      return
    }
    if (shouldCloseHistorySheetAfterDrag(dragOffsetRef.current)) {
      onClose()
      return
    }
    resetDrag()
  }

  return (
    <div className="sheet-backdrop" onClick={handleBackdropClick}>
      <section
        ref={sheetRef}
        className={dragging ? 'sheet sheet--dragging' : 'sheet'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{ transform: `translateY(${dragOffset}px)` }}
      >
        <span className="sheet__grabber" aria-hidden="true" />
        <header className="sheet__header">
          <div className="sheet__title">
            {eyebrow ? <span className="eyebrow eyebrow--jade">{eyebrow}</span> : null}
            <h2>{title}</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </header>
        <div className="sheet__body" ref={bodyRef}>
          {children}
        </div>
      </section>
    </div>
  )
}
