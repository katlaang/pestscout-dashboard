import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '@/services/api'
import { useAuthStore } from '@/hooks/useAuth'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const force = searchParams.get('force') === 'true'   // forced after login if passwordChangeRequired

  const { user, logout } = useAuthStore()

  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // If forced (passwordChangeRequired) but no logged-in user, redirect to login
  useEffect(() => {
    if (force && !user) navigate('/login', { replace: true })
  }, [force, user, navigate])

  // If no token AND not forced, this page makes no sense
  if (!token && !force) {
    return (
      <PageShell>
        <div style={{ background: '#fff5f5', border: '0.5px solid #fca5a5', borderRadius: 8, padding: 16, fontSize: 13, color: '#c53030' }}>
          Invalid or missing reset link. Please request a new password reset.
        </div>
        <button className="btn-secondary" style={{ marginTop: 14, width: '100%', fontSize: 13 }} onClick={() => navigate('/login')}>
          Back to sign in
        </button>
      </PageShell>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return }
    if (newPassword !== confirm) { setError('Passwords do not match'); return }

    setSaving(true)
    try {
      if (force && user) {
        // Forced change after login — POST /api/auth/reset-password
        await authApi.resetPassword({ token: token ?? '', newPassword })
      } else if (token) {
        await authApi.resetPassword({ token, newPassword })
      }
      setDone(true)
      // Always log out and redirect to login — user must sign in again with new password
      setTimeout(() => {
        logout()
      }, 2500)
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Password reset failed. The link may have expired.')
    } finally {
      setSaving(false)
    }
  }

  // Temporary password expiry warning
  const tempExpiry = user?.temporaryPasswordExpiresAt
  const isExpiringSoon = tempExpiry && new Date(tempExpiry).getTime() - Date.now() < 24 * 60 * 60 * 1000

  return (
    <PageShell>
      {/* Forced-change notice */}
      {force && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 12,
          background: '#fffbf0', border: '0.5px solid #fde68a', color: '#d97706',
        }}>
          {tempExpiry ? (
            <>
              A temporary password is active.{' '}
              {isExpiringSoon
                ? <strong>It expires very soon — change it now.</strong>
                : <>Change it before {new Date(tempExpiry).toLocaleDateString()}.</>}
            </>
          ) : (
            'You must set a new password before continuing.'
          )}
        </div>
      )}

      {done ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>✓</div>
          <p style={{ fontSize: 14, fontWeight: 500, color: '#1e5c3a' }}>Password updated. It is valid for 90 days.</p>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Redirecting to sign in…</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 5 }}>
              New password
            </label>
            <input className="input" type="password" placeholder="At least 8 characters"
              value={newPassword} onChange={e => setNewPassword(e.target.value)} onPaste={event => event.preventDefault()}
              required autoComplete="new-password" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 5 }}>
              Confirm password
            </label>
            <input className="input" type="password" placeholder="Repeat new password"
              value={confirm} onChange={e => setConfirm(e.target.value)} onPaste={event => event.preventDefault()}
              required autoComplete="new-password" />
          </div>

          {error && (
            <div style={{ background: '#fff5f5', border: '0.5px solid #fca5a5', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#c53030' }}>
              {error}
            </div>
          )}

          <button className="btn-primary" type="submit" disabled={saving} style={{ padding: '11px', fontSize: 13, marginTop: 4 }}>
            {saving ? 'Saving…' : 'Set new password'}
          </button>

          {/* Bail out — only if not a forced change */}
          {!force && (
            <button type="button" className="btn-secondary" style={{ fontSize: 12 }} onClick={() => navigate('/login')}>
              Back to sign in
            </button>
          )}

          {/* Note about email delivery */}
          <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', lineHeight: 1.5 }}>
            Reset links are generated by the system.{' '}
            Email delivery is not yet fully configured — links are currently logged server-side.
          </p>
        </form>
      )}
    </PageShell>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, justifyContent: 'center' }}>
          <div style={{ width: 36, height: 36, background: '#1e5c3a', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
              <path d="M8 2C5.8 2 4 3.8 4 6c0 2.5 2.5 5.5 4 7.5C9.5 11.5 12 8.5 12 6c0-2.2-1.8-4-4-4z" fill="white" fillOpacity="0.9"/>
              <circle cx="8" cy="6" r="1.5" fill="#1e5c3a"/>
            </svg>
          </div>
          <span style={{ fontSize: 18, fontWeight: 600, color: '#111827', letterSpacing: '-0.02em' }}>PestScout</span>
        </div>
        <div className="card" style={{ padding: '28px 28px' }}>
          <h1 style={{ fontSize: 17, fontWeight: 500, color: '#111827', marginBottom: 20 }}>Set new password</h1>
          {children}
        </div>
      </div>
    </div>
  )
}
