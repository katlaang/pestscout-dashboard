import { Link, Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import IdleSessionManager from './IdleSessionManager'
import { useAuthStore } from '@/hooks/useAuth'
import { useSessionConnectionStore } from '@/hooks/useSessionConnection'

const SEGMENT_TITLES: Record<string, string> = {
  'dashboard': 'Dashboard',
  'farms':     'Farms',
  'sessions':  'Sessions',
  'analytics': 'Analytics',
  'heatmap':   'Heat maps',
  'alerts':    'Alerts',
  'profile':   'Profile',
  'admin':     'Super Admin',
}

export default function AppLayout() {
  const location = useLocation()
  const { user } = useAuthStore()
  const { status: sessionConnectionStatus, message: sessionConnectionMessage } = useSessionConnectionStore()

  // Match /:farmSlug/sessions/:id or /sessions/:id
  const isSessionDetail = /\/sessions\/.+/.test(location.pathname)
  const lastSegment = location.pathname.split('/').filter(Boolean).pop() ?? ''
  const pageTitle = isSessionDetail
    ? 'Session detail'
    : SEGMENT_TITLES[lastSegment] ?? ''

  const initials = [user?.firstName?.[0], user?.lastName?.[0]]
    .filter(Boolean).join('').toUpperCase() || '?'

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f9fafb' }}>
      <IdleSessionManager />
      <Sidebar />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>

        {/* Top bar */}
        <header style={{
          height: 52,
          background: '#fff',
          borderBottom: '0.5px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>
              {pageTitle}
            </span>
            {user?.role === 'SUPER_ADMIN' && (
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.6px',
                background: '#1e5c3a', color: '#fff',
                padding: '1px 6px', borderRadius: 20,
              }}>
                SUPER ADMIN
              </span>
            )}
          </div>

          <Link
            to="/profile"
            style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}
          >
            {/* Role badge */}
            <span style={{
              fontSize: 10, color: '#9ca3af',
              background: '#f9fafb',
              border: '0.5px solid #e5e7eb',
              borderRadius: 20, padding: '2px 8px',
            }}>
              {user?.role?.replace('_', ' ').toLowerCase()}
            </span>

            {/* Avatar */}
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: '#f0faf4',
              border: '0.5px solid #a7dcbc',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 600, color: '#1e5c3a',
              flexShrink: 0,
            }}>
              {initials}
            </div>

            {/* Name */}
            <span style={{ fontSize: 12, color: '#374151' }}>
              {user?.firstName} {user?.lastName}
            </span>
          </Link>
        </header>

        {sessionConnectionStatus !== 'idle' && sessionConnectionStatus !== 'connected' && sessionConnectionMessage && (
          <div
            style={{
              padding: '10px 28px',
              background: sessionConnectionStatus === 'offline' ? '#fff7ed' : '#fffbeb',
              borderBottom: '0.5px solid',
              borderColor: sessionConnectionStatus === 'offline' ? '#fdba74' : '#fcd34d',
              color: sessionConnectionStatus === 'offline' ? '#9a3412' : '#92400e',
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            {sessionConnectionMessage}
          </div>
        )}

        <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 120 }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
