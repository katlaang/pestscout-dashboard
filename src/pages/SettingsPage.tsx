import { useState } from 'react'
import { useAuthStore } from '@/hooks/useAuth'

export default function SettingsPage() {
  const { user } = useAuthStore()
  const [apiUrl, setApiUrl] = useState(import.meta.env.VITE_API_URL ?? 'http://localhost:8080')
  const [saved, setSaved] = useState(false)

  function handleSave() {
    localStorage.setItem('api_url_override', apiUrl)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 680 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ color: '#111827', marginBottom: 4 }}>Settings</h1>
        <p style={{ fontSize: 13, color: '#6b7280' }}>Account and connection configuration</p>
      </div>

      {/* Profile */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 14 }}>
          Your account
        </h2>
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
                {user?.role?.replace('_', ' ')} · {user?.customerNumber}
              </p>
            </div>
          </div>
          <div style={{ borderTop: '0.5px solid #f3f4f6', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <SettingRow label="Email" value={user?.email ?? '—'} />
            <SettingRow label="Country" value={user?.country ?? '—'} />
            <SettingRow label="Last login" value={user?.lastLogin ? new Date(user.lastLogin).toLocaleString() : '—'} />
          </div>
        </div>
      </section>

      {/* API connection */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 14 }}>
          Backend connection
        </h2>
        <div className="card">
          <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 14, lineHeight: 1.6 }}>
            Configure the URL of your PestScout Spring Boot backend. This is used for all API calls.
            The default is <code style={{ fontSize: 11, background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>http://localhost:8080</code>.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              className="input"
              style={{ flex: 1 }}
              value={apiUrl}
              onChange={e => setApiUrl(e.target.value)}
              placeholder="http://localhost:8080"
            />
            <button className="btn-primary" onClick={handleSave} style={{ whiteSpace: 'nowrap' }}>
              {saved ? '✓ Saved' : 'Save'}
            </button>
          </div>
          <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 10 }}>
            Note: Changes take effect after page reload. Set <code style={{ fontSize: 10 }}>VITE_API_URL</code> in your <code style={{ fontSize: 10 }}>.env</code> file for a permanent configuration.
          </p>
        </div>
      </section>

      {/* Environment info */}
      <section>
        <h2 style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 14 }}>
          Environment
        </h2>
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
