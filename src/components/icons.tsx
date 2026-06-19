// ABOUTME: Inline SVG icon set drawn with currentColor so icons inherit theme tokens.
// ABOUTME: Avoids image assets to keep the app offline-first and crisp at any density.
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function base(props: IconProps): IconProps {
  return {
    viewBox: '0 0 24 24',
    width: 20,
    height: 20,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: false,
    ...props,
  }
}

export function DumbbellIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11" />
    </svg>
  )
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h7M15 17h5" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="13" cy="17" r="2" />
    </svg>
  )
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 9.5l6 6 6-6" />
    </svg>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9.5 6l6 6-6 6" />
    </svg>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function MinusIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 12h14" />
    </svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function TrendUpIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M21 11V7h-4" />
    </svg>
  )
}

export function RepeatIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 11V9a4 4 0 0 1 4-4h9" />
      <path d="M14 2l3 3-3 3" />
      <path d="M20 13v2a4 4 0 0 1-4 4H7" />
      <path d="M10 22l-3-3 3-3" />
    </svg>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 12h10l1-12" />
    </svg>
  )
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  )
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  )
}

export function GripIcon(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={2}>
      <circle cx="9" cy="6" r="0.6" />
      <circle cx="15" cy="6" r="0.6" />
      <circle cx="9" cy="12" r="0.6" />
      <circle cx="15" cy="12" r="0.6" />
      <circle cx="9" cy="18" r="0.6" />
      <circle cx="15" cy="18" r="0.6" />
    </svg>
  )
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 8v5M12 16.5v.5" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  )
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 4v10M8 10l4 4 4-4" />
      <path d="M5 18h14" />
    </svg>
  )
}

export function UploadIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 16V6M8 10l4-4 4 4" />
      <path d="M5 18h14" />
    </svg>
  )
}

export function FileTextIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4M10 12h5M10 16h5" />
    </svg>
  )
}

export function InboxIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 13l2.5-7h11L20 13v6H4z" />
      <path d="M4 13h4l1.5 2.5h5L16 13h4" />
    </svg>
  )
}
