import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore, getPostLoginRedirect } from '@/hooks/useAuth'

const REASON_MESSAGES: Record<string, string> = {
  idle:            'Your session timed out due to inactivity.',
  session_expired: 'Your session timed out due to inactivity.',
  unauthorized:    'Your session timed out due to inactivity.',
  session_replaced: 'You were logged out because you were logged in to another window.',
  session_invalid: 'Your session timed out. Please sign in again.',
}

export default function LoginPage() {
  const { login, isLoading, error, user, farms, clearError } = useAuthStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const reason = searchParams.get('reason')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showExpiryPopup, setShowExpiryPopup] = useState(false)

  // If already authenticated, redirect — but check password flags first
  useEffect(() => {
    if (!user) return
    if (user.passwordChangeRequired) {
      navigate('/reset-password?force=true', { replace: true })
    } else if (user.passwordExpiryWarningRequired && !showExpiryPopup) {
      setShowExpiryPopup(true)
    } else if (!user.passwordExpiryWarningRequired) {
      navigate(getPostLoginRedirect(user, farms), { replace: true })
    }
  }, [user, farms, navigate, showExpiryPopup])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await login(email, password)
  }

  const Logo = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, background: '#1e5c3a', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
          <path d="M8 2C5.8 2 4 3.8 4 6c0 2.5 2.5 5.5 4 7.5C9.5 11.5 12 8.5 12 6c0-2.2-1.8-4-4-4z" fill="white" fillOpacity="0.9"/>
          <circle cx="8" cy="6" r="1.5" fill="#1e5c3a"/>
        </svg>
      </div>
      <span style={{ fontSize: 18, fontWeight: 600, color: '#111827', letterSpacing: '-0.02em' }}>PestScout</span>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>

      {/* Password expiry warning popup */}
      {showExpiryPopup && user && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #e5e7eb', boxShadow: '0 8px 32px rgba(0,0,0,0.14)', width: '100%', maxWidth: 400, padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 10 }}>Password expiry notice</h3>
            <div style={{ marginBottom: 20, padding: '10px 14px', borderRadius: 8, background: '#fffbf0', border: '0.5px solid #fde68a', fontSize: 13, color: '#92400e' }}>
              Your password is nearing expiry. Please change your password in the next {user.passwordExpiryWarningDaysRemaining} days
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => { setShowExpiryPopup(false); navigate(getPostLoginRedirect(user!, farms), { replace: true }) }}>
                Remind me later
              </button>
              <button className="btn-primary" style={{ fontSize: 12 }} onClick={() => navigate('/profile?changePassword=true', { replace: true })}>
                Change password
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ width: '100%', maxWidth: 360 }}>
        <Logo />

        {/* Session reason banner */}
        {reason && REASON_MESSAGES[reason] && (
          <div style={{
            marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 12,
            background: '#fffbf0', border: '0.5px solid #fde68a', color: '#d97706',
          }}>
            {REASON_MESSAGES[reason]}
          </div>
        )}

        <div className="card" style={{ padding: '28px 28px' }}>
          <h1 style={{ fontSize: 17, fontWeight: 500, color: '#111827', marginBottom: 6 }}>
            Sign in
          </h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>
            Dashboard access for farm managers and admins.
          </p>

          {/* Auth error */}
          {error && (
            <div style={{
              background: '#fff5f5', border: '0.5px solid #fca5a5', borderRadius: 7,
              padding: '9px 12px', marginBottom: 16, fontSize: 12, color: '#c53030',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              {error}
              <button onClick={clearError} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c53030', fontSize: 14, lineHeight: 1 }}>×</button>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Email</label>
              <input className="input" type="email" placeholder="you@example.com"
                value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Password</label>
              <input className="input" type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)} onPaste={event => event.preventDefault()} required autoComplete="current-password" />
            </div>
            <button className="btn-primary" type="submit" disabled={isLoading} style={{ marginTop: 4, padding: '11px', fontSize: 13 }}>
              {isLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
