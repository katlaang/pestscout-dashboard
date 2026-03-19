import { useEffect, useState, type ClipboardEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { authApi } from '@/services/api'
import { useAuthStore } from '@/hooks/useAuth'

function blockPaste(event: ClipboardEvent<HTMLInputElement>) {
  event.preventDefault()
}

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showChangePassword, setShowChangePassword] = useState(searchParams.get('changePassword') === 'true')
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
  })
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  })

  useEffect(() => {
    let alive = true
    setLoading(true)
    authApi.me()
      .then(profile => {
        if (!alive) return
        updateUser(profile)
        setForm({
          firstName: profile.firstName ?? '',
          lastName: profile.lastName ?? '',
          email: profile.email ?? '',
          phoneNumber: profile.phoneNumber ?? '',
        })
      })
      .catch((error: any) => {
        if (!alive) return
        setBanner({ type: 'error', text: error?.response?.data?.message ?? 'Could not load your profile.' })
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [updateUser])

  function setProfileField(key: keyof typeof form, value: string) {
    setForm(previous => ({ ...previous, [key]: value }))
  }

  function setPasswordField(key: keyof typeof passwordForm, value: string) {
    setPasswordForm(previous => ({ ...previous, [key]: value }))
  }

  function flash(text: string, type: 'success' | 'error') {
    setBanner({ type, text })
    setTimeout(() => setBanner(null), 3500)
  }

  async function handleSaveProfile(event: React.FormEvent) {
    event.preventDefault()
    if (!form.firstName.trim()) {
      flash('First name is required.', 'error')
      return
    }
    if (!form.lastName.trim()) {
      flash('Last name is required.', 'error')
      return
    }

    setSavingProfile(true)
    try {
      const updated = await authApi.updateMe({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phoneNumber: form.phoneNumber.trim() || undefined,
      })
      updateUser(updated)
      setForm({
        firstName: updated.firstName ?? '',
        lastName: updated.lastName ?? '',
        email: updated.email ?? '',
        phoneNumber: updated.phoneNumber ?? '',
      })
      flash('Profile updated.', 'success')
    } catch (error: any) {
      flash(error?.response?.data?.message ?? 'Could not update your profile.', 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleChangePassword(event: React.FormEvent) {
    event.preventDefault()

    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmNewPassword) {
      flash('All password fields are required.', 'error')
      return
    }
    if (passwordForm.newPassword.length < 8) {
      flash('New password must be at least 8 characters.', 'error')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmNewPassword) {
      flash('New password and confirm password must match.', 'error')
      return
    }

    setSavingPassword(true)
    try {
      await authApi.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      })
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      })
      flash('Password updated. It is valid for 90 days.', 'success')
      setShowChangePassword(false)
    } catch (error: any) {
      flash(error?.response?.data?.message ?? 'Password change failed.', 'error')
    } finally {
      setSavingPassword(false)
    }
  }

  const initials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?'
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || 'Unknown user'
  const passwordMismatch = passwordForm.confirmNewPassword !== '' && passwordForm.newPassword !== passwordForm.confirmNewPassword
  const disablePasswordSubmit =
    savingPassword ||
    !passwordForm.currentPassword ||
    !passwordForm.newPassword ||
    !passwordForm.confirmNewPassword ||
    passwordMismatch

  return (
    <div style={{ padding: '24px 28px', maxWidth: 760 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: '#111827', marginBottom: 4 }}>Profile</h1>
        <p style={{ fontSize: 13, color: '#6b7280' }}>Manage your personal details and account security.</p>
      </div>

      {banner && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 12,
            ...(banner.type === 'error'
              ? { background: '#fff5f5', border: '0.5px solid #fca5a5', color: '#c53030' }
              : { background: '#f0faf4', border: '0.5px solid #a7dcbc', color: '#1e5c3a' }),
          }}
        >
          {banner.text}
        </div>
      )}

      {loading ? (
        <div className="card" style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
          Loading profile...
        </div>
      ) : (
        <>
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 14 }}>Profile</h2>
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    background: '#f0faf4',
                    border: '0.5px solid #a7dcbc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    fontWeight: 600,
                    color: '#1e5c3a',
                  }}
                >
                  {initials}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>{fullName}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{user?.email}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {user?.role && <span className="badge badge-green">{user.role.replace(/_/g, ' ')}</span>}
                    {user?.passwordChangeRequired && <span className="badge badge-amber">Password change required</span>}
                  </div>
                </div>
              </div>

              <form onSubmit={handleSaveProfile} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="First name">
                  <input className="input" value={form.firstName} onChange={event => setProfileField('firstName', event.target.value)} />
                </Field>
                <Field label="Last name">
                  <input className="input" value={form.lastName} onChange={event => setProfileField('lastName', event.target.value)} />
                </Field>
                <Field label="Email">
                  <input className="input" value={form.email} disabled style={{ background: '#f9fafb', color: '#6b7280' }} />
                </Field>
                <Field label="Phone number">
                  <input className="input" value={form.phoneNumber} onChange={event => setProfileField('phoneNumber', event.target.value)} />
                </Field>
                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn-primary" type="submit" disabled={savingProfile}>
                    {savingProfile ? 'Saving...' : 'Save profile'}
                  </button>
                </div>
              </form>
            </div>
          </section>

          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>Security</h2>
              {!showChangePassword && (
                <button className="btn-secondary" type="button" style={{ fontSize: 12 }} onClick={() => setShowChangePassword(true)}>
                  Change your password
                </button>
              )}
            </div>

            <div className="card">
              <div style={{ marginBottom: showChangePassword ? 14 : 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>Change your password</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                  Enter your current password and choose a new one.
                </div>
              </div>

              {showChangePassword && (
                <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Field label="Current password">
                    <input
                      className="input"
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={event => setPasswordField('currentPassword', event.target.value)}
                      onPaste={blockPaste}
                      autoComplete="current-password"
                    />
                  </Field>
                  <Field label="New password">
                    <input
                      className="input"
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={event => setPasswordField('newPassword', event.target.value)}
                      onPaste={blockPaste}
                      autoComplete="new-password"
                    />
                  </Field>
                  <Field label="Confirm new password">
                    <input
                      className="input"
                      type="password"
                      value={passwordForm.confirmNewPassword}
                      onChange={event => setPasswordField('confirmNewPassword', event.target.value)}
                      onPaste={blockPaste}
                      autoComplete="new-password"
                    />
                  </Field>
                  {passwordMismatch && (
                    <div style={{ fontSize: 12, color: '#c53030' }}>
                      New password and confirm password must match.
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button className="btn-secondary" type="button" onClick={() => setShowChangePassword(false)} disabled={savingPassword}>
                      Cancel
                    </button>
                    <button className="btn-primary" type="submit" disabled={disablePasswordSubmit}>
                      {savingPassword ? 'Updating...' : 'Update password'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}
