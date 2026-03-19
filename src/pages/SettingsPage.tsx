import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/hooks/useAuth'
import { authApi, adminUsersApi } from '@/services/api'

export default function SettingsPage() {
  const { user, updateUser } = useAuthStore()
  const [searchParams] = useSearchParams()
  const role = user?.role ?? ''

  const [apiUrl, setApiUrl]   = useState(import.meta.env.VITE_API_URL ?? 'http://localhost:8080')
  const [saved, setSaved]     = useState(false)

  // Phone editing (SCOUT only)
  const [phone, setPhone]         = useState(user?.phoneNumber ?? '')
  const [phoneSaving, setPhoneSaving] = useState(false)
  const [phoneMsg, setPhoneMsg]   = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Change password (FARM_ADMIN / MANAGER)
  const [showChangePw, setShowChangePw]     = useState(searchParams.get('changePassword') === 'true')
  const [currentPw, setCurrentPw]           = useState('')
  const [newPw, setNewPw]                   = useState('')
  const [confirmPw, setConfirmPw]           = useState('')
  const [pwSaving, setPwSaving]             = useState(false)
  const [pwMsg, setPwMsg]                   = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => { setPhone(user?.phoneNumber ?? '') }, [user])

  function handleSaveApiUrl() {
    localStorage.setItem('api_url_override', apiUrl)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleSavePhone() {
    if (!user) return
    setPhoneSaving(true)
    setPhoneMsg(null)
    try {
      const updated = await adminUsersApi.update(user.id, { phoneNumber: phone })
      updateUser(updated)
      setPhoneMsg({ type: 'success', text: 'Phone number updated.' })
    } catch (e: any) {
      setPhoneMsg({ type: 'error', text: e?.response?.data?.message ?? 'Failed to update phone number.' })
    } finally { setPhoneSaving(false) }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwMsg(null)
    if (newPw.length < 8) { setPwMsg({ type: 'error', text: 'Password must be at least 8 characters.' }); return }
    if (newPw !== confirmPw) { setPwMsg({ type: 'error', text: 'Passwords do not match.' }); return }
    setPwSaving(true)
    try {
      await authApi.changePassword({ currentPassword: currentPw, newPassword: newPw })
      setPwMsg({ type: 'success', text: 'Password updated. It is valid for 90 days.' })
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    } catch (e: any) {
      setPwMsg({ type: 'error', text: e?.response?.data?.message ?? 'Password change failed.' })
    } finally { setPwSaving(false) }
  }

  const isScout   = role === 'SCOUT'
  const canChangePw = role === 'FARM_ADMIN' || role === 'MANAGER'

  return (
    <div style={{ padding: '24px 28px', maxWidth: 680 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ color: '#111827', marginBottom: 4 }}>Settings</h1>
        <p style={{ fontSize: 13, color: '#6b7280' }}>Account and connection configuration</p>
      </div>

      {/* Profile */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 14 }}>Your account</h2>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: '#f0faf4', border: '0.5px solid #a7dcbc',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 600, color: '#1e5c3a',
            }}>
              {[user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?'}
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>
                {user?.firstName} {user?.lastName}
              </p>
              <p style={{ fontSize: 12, color: '#6b7280' }}>{user?.email}</p>
              <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                {user?.role?.replace(/_/g, ' ')} · {user?.customerNumber}
              </p>
            </div>
          </div>

          <div style={{ borderTop: '0.5px solid #f3f4f6', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <SettingRow label="First name" value={user?.firstName ?? '—'} />
            <SettingRow label="Last name"  value={user?.lastName  ?? '—'} />
            <SettingRow label="Email"      value={user?.email     ?? '—'} />
            <SettingRow label="Role"       value={user?.role?.replace(/_/g, ' ') ?? '—'} />
            {isScout && <SettingRow label="Farm" value={user?.farmId ?? '—'} />}
            <SettingRow label="Last login" value={user?.lastLogin ? new Date(user.lastLogin).toLocaleString() : '—'} />

            {/* SCOUT: editable phone */}
            {isScout && (
              <div style={{ paddingTop: 8, borderTop: '0.5px solid #f3f4f6', marginTop: 4 }}>
                <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Phone number</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="input" style={{ flex: 1 }} value={phone}
                    onChange={e => setPhone(e.target.value)} placeholder="+1 555 000 0000" />
                  <button className="btn-primary" style={{ whiteSpace: 'nowrap', fontSize: 12 }}
                    disabled={phoneSaving} onClick={handleSavePhone}>
                    {phoneSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
                {phoneMsg && (
                  <p style={{ fontSize: 12, marginTop: 6, color: phoneMsg.type === 'error' ? '#c53030' : '#1e5c3a' }}>
                    {phoneMsg.text}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Change password — FARM_ADMIN / MANAGER */}
      {canChangePw && (
        <section style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>Change password</h2>
            <button className="btn-secondary" style={{ fontSize: 11 }} onClick={() => setShowChangePw(v => !v)}>
              {showChangePw ? 'Cancel' : 'Change password'}
            </button>
          </div>
          {showChangePw && (
            <div className="card">
              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#374151', marginBottom: 4 }}>Current password</label>
                  <input className="input" type="password" value={currentPw}
                    onChange={e => setCurrentPw(e.target.value)} required autoComplete="current-password" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#374151', marginBottom: 4 }}>New password</label>
                  <input className="input" type="password" value={newPw}
                    onChange={e => setNewPw(e.target.value)} required autoComplete="new-password"
                    placeholder="At least 8 characters" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#374151', marginBottom: 4 }}>Confirm new password</label>
                  <input className="input" type="password" value={confirmPw}
                    onChange={e => setConfirmPw(e.target.value)} required autoComplete="new-password" />
                </div>
                {pwMsg && (
                  <p style={{ fontSize: 12, color: pwMsg.type === 'error' ? '#c53030' : '#1e5c3a' }}>{pwMsg.text}</p>
                )}
                <button className="btn-primary" type="submit" disabled={pwSaving} style={{ fontSize: 13 }}>
                  {pwSaving ? 'Saving…' : 'Update password'}
                </button>
              </form>
            </div>
          )}
        </section>
      )}

      {/* API connection */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 14 }}>Backend connection</h2>
        <div className="card">
          <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 14, lineHeight: 1.6 }}>
            Configure the URL of your PestScout Spring Boot backend. The default is{' '}
            <code style={{ fontSize: 11, background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>http://localhost:8080</code>.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input className="input" style={{ flex: 1 }} value={apiUrl}
              onChange={e => setApiUrl(e.target.value)} placeholder="http://localhost:8080" />
            <button className="btn-primary" onClick={handleSaveApiUrl} style={{ whiteSpace: 'nowrap' }}>
              {saved ? '✓ Saved' : 'Save'}
            </button>
          </div>
          <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 10 }}>
            Changes take effect after page reload. Set <code style={{ fontSize: 10 }}>VITE_API_URL</code> in <code style={{ fontSize: 10 }}>.env</code> for a permanent configuration.
          </p>
        </div>
      </section>

      {/* Environment */}
      <section>
        <h2 style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 14 }}>Environment</h2>
        <div className="card">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <SettingRow label="Dashboard version" value="0.1.0" />
            <SettingRow label="API base URL" value={import.meta.env.VITE_API_URL ?? 'http://localhost:8080 (default)'} />
            <SettingRow label="Build mode" value={import.meta.env.MODE} />
          </div>
        </div>
      </section>
    </div>
  )
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
      <span style={{ fontSize: 12, color: '#9ca3af' }}>{label}</span>
      <span style={{ fontSize: 12, color: '#374151' }}>{value}</span>
    </div>
  )
}
