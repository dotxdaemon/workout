// ABOUTME: Centered empty-state block with a glyph, title, body, and optional action.
// ABOUTME: Gives screens a consistent way to explain "nothing here yet" plus a next step.
import type { ReactNode } from 'react'

interface EmptyStateProps {
  glyph: ReactNode
  title: string
  body?: string
  action?: ReactNode
}

export function EmptyState({ glyph, title, body, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-state__glyph">{glyph}</span>
      <p className="empty-state__title">{title}</p>
      {body ? <p className="empty-state__body">{body}</p> : null}
      {action}
    </div>
  )
}
