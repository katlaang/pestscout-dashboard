import { useEffect, useState } from 'react'
import { useIdleTimer } from '@/hooks/useidletimer'

const WARNING_WINDOW_S = 60   // seconds the banner counts down before logout

export default function IdleSessionManager() {
  const { warningActive, extendSession } = useIdleTimer()
  const [secondsLeft, setSecondsLeft] = useState(WARNING_WINDOW_S)
  const [extending, setExtending] = useState(false)

  // Reset / run countdown whenever warning visibility changes
  useEffect(() => {
    if (!warningActive) {
      setSecondsLeft(WARNING_WINDOW_S)
      return
    }

    setSecondsLeft(WARNING_WINDOW_S)
    const interval = setInterval(() => {
      setSecondsLeft(s => Math.max(0, s - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [warningActive])

  async function handleContinue() {
    setExtending(true)
    await extendSession()
    setExtending(false)
  }

  if (!warningActive) return null

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: '#fff7ed',
        border: '0.5px solid #fdba74',
        borderRadius: 8,
        padding: '12px 16px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        maxWidth: 480,
        width: 'calc(100vw - 32px)',
      }}
    >
      <span style={{ color: '#9a3412', fontSize: 13, flex: 1 }}>
        Your session will expire in <strong>{secondsLeft}s</strong> due to inactivity.
      </span>
      <button
        onClick={handleContinue}
        disabled={extending}
        style={{
          background: '#1e5c3a',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '6px 14px',
          fontSize: 13,
          fontWeight: 600,
          cursor: extending ? 'default' : 'pointer',
          opacity: extending ? 0.7 : 1,
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {extending ? 'Extending…' : 'Continue working'}
      </button>
    </div>
  )
}
