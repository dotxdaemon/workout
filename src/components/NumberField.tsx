// ABOUTME: Labeled numeric input with decrement/increment steppers for weight and reps.
// ABOUTME: Delegates value math to lib/numberInput so the control stays presentational.
import { useId } from 'react'
import { MinusIcon, PlusIcon } from './icons'
import { stepValue } from '../lib/numberInput'

interface NumberFieldProps {
  label: string
  value: string
  step: number
  integer?: boolean
  invalid?: boolean
  inputMode?: 'decimal' | 'numeric'
  ariaLabel?: string
  onValueChange: (value: string) => void
}

export function NumberField({
  label,
  value,
  step,
  integer,
  invalid,
  inputMode,
  ariaLabel,
  onValueChange,
}: NumberFieldProps) {
  const id = useId()
  const resolvedInputMode = inputMode ?? (integer ? 'numeric' : 'decimal')

  function adjust(direction: -1 | 1): void {
    onValueChange(stepValue(value, { step, direction, integer }))
  }

  return (
    <div className="number-field">
      <label className="number-field__label" htmlFor={id}>
        {label}
      </label>
      <div className={invalid ? 'number-field__control number-field__control--invalid' : 'number-field__control'}>
        <button
          type="button"
          className="number-field__step"
          onClick={() => adjust(-1)}
          aria-label={`Decrease ${ariaLabel ?? label}`}
          disabled={parseFloat(value || '0') <= 0}
        >
          <MinusIcon width={18} height={18} />
        </button>
        <input
          id={id}
          className="number-field__input"
          type="number"
          inputMode={resolvedInputMode}
          min="0"
          step={step}
          value={value}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          onChange={(event) => onValueChange(event.target.value)}
        />
        <button
          type="button"
          className="number-field__step"
          onClick={() => adjust(1)}
          aria-label={`Increase ${ariaLabel ?? label}`}
        >
          <PlusIcon width={18} height={18} />
        </button>
      </div>
    </div>
  )
}
