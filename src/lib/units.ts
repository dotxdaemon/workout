// ABOUTME: Converts weight values between pounds and kilograms without rounding.
// ABOUTME: Formats displayed weights with up to two decimal places.
import type { Unit } from '../types'

export function convertWeight(value: number, from: Unit, to: Unit): number {
  if (from === to) {
    return value
  }
  return from === 'lb' ? value * 0.45359237 : value / 0.45359237
}

export function formatWeight(value: number): string {
  return Number(value.toFixed(2)).toString()
}
