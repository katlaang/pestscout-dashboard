import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIdleTimer } from '@/hooks/useidletimer'

const WARNING_WINDOW_S = 5 * 60  // matches WARNING_MS in useIdleTimer

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m > 0) return `${m}m ${sec.toString().padStart(2, '0')}s`
  return `${sec}s`
}

export default function IdleSessionManager() {
  const { warningActive, timedOut, extendSession } = useIdleTimer()
  const [secondsLeft, setSecondsLeft] = useState(WARNING_WINDOW_S)
  const [extending, setExtending] = useState(false)
  const navigate = useNavigate()

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
    if (extending) return
    setExtending(true)
    await extendSession()
    setExtending(false)
  }

  if (timedOut) {
    return (
      <div
        role="alertdialog"
        aria-live="assertive"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div style={{
          background: '#fff',
          border: '0.5px solid #e5e7eb',
          borderRadius: 12,
          padding: '28px 32px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          maxWidth: 380,
          width: '100%',
          textAlign: 'center',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: '#fff7ed', border: '0.5px solid #fdba74',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 20,
          }}>
            ⏱
          </div>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
            Session timed out
          </p>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>
            You were signed out due to inactivity. Any unsaved drafts have been preserved.
          </p>
          <button
            onClick={() => navigate('/login?reason=idle', { replace: true })}
            style={{
              background: '#1e5c3a', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 24px', fontSize: 13,
              fontWeight: 600, cursor: 'pointer', width: '100%',
            }}
          >
            Sign in again
          </button>
        </div>
      </div>
    )
  }

  if (!warningActive) return null

  return (
    <div
      role="alertdialog"
      aria-live="polite"
      onClick={handleContinue}
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: '#fff7ed',
        border: '0.5px solid #fdba74',
        borderRadius: 8,
        padding: '10px 18px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        maxWidth: 480,
        width: 'calc(100vw - 32px)',
        cursor: extending ? 'default' : 'pointer',
        opacity: extending ? 0.8 : 1,
        userSelect: 'none',
      }}
    >
      <span style={{ fontSize: 16 }}>⚠️</span>
      <span style={{ color: '#9a3412', fontSize: 13, flex: 1 }}>
        Your session will expire in{' '}
        <strong>{formatTime(secondsLeft)}</strong>.{' '}
        <span style={{ textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
          {extending ? 'Extending…' : 'Click here to continue.'}
        </span>
      </span>
    </div>
  )
}
