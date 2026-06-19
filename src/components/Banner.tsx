// ABOUTME: Inline status banner for success and error feedback with an assertive live region.
// ABOUTME: Pairs a themed icon with the message so meaning is not conveyed by color alone.
import { AlertIcon, CheckCircleIcon } from './icons'

interface BannerProps {
  tone: 'success' | 'error'
  children: React.ReactNode
}

export function Banner({ tone, children }: BannerProps) {
  const Icon = tone === 'success' ? CheckCircleIcon : AlertIcon
  return (
    <p
      className={`banner banner--${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      <Icon className="banner__icon" />
      <span>{children}</span>
    </p>
  )
}
