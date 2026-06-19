// ABOUTME: Countdown hook that drives the optional rest timer between logged sets.
// ABOUTME: Owns interval lifecycle and cleanup so screens only start, stop, and read it.
import { useCallback, useEffect, useRef, useState } from 'react'

interface Countdown {
  secondsLeft: number
  isRunning: boolean
  start: (seconds: number) => void
  stop: () => void
}

export function useCountdown(): Countdown {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const intervalRef = useRef<number | null>(null)

  const clear = useCallback(() => {
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    clear()
    setSecondsLeft(0)
  }, [clear])

  const start = useCallback(
    (seconds: number) => {
      clear()
      if (seconds <= 0) {
        setSecondsLeft(0)
        return
      }
      setSecondsLeft(seconds)
      intervalRef.current = window.setInterval(() => {
        setSecondsLeft((current) => Math.max(0, current - 1))
      }, 1000)
    },
    [clear],
  )

  // Stop ticking once the countdown reaches zero.
  useEffect(() => {
    if (secondsLeft === 0) {
      clear()
    }
  }, [secondsLeft, clear])

  useEffect(() => clear, [clear])

  return {
    secondsLeft,
    isRunning: secondsLeft > 0,
    start,
    stop,
  }
}
