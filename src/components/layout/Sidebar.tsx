import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/hooks/useAuth'
import { useAlertCount } from '@/hooks/useAlertCount'

const ALL_NAV = [
  { to: '/',           label: 'Dashboard',  icon: DashIcon,  roles: ['SUPER_ADMIN', 'FARM_ADMIN', 'MANAGER'] },
  { to: '/farms',      label: 'Farms',      icon: FarmIcon,  roles: ['SUPER_ADMIN', 'FARM_ADMIN', 'MANAGER'] },
  { to: '/sessions',   label: 'Sessions',   icon: ListIcon,  roles: ['SUPER_ADMIN', 'FARM_ADMIN', 'MANAGER', 'SCOUT'] },
  { to: '/analytics',  label: 'Analytics',  icon: ChartIcon, roles: ['SUPER_ADMIN', 'FARM_ADMIN', 'MANAGER'] },
  { to: '/heatmap',    label: 'Heat maps',  icon: GridIcon,  roles: ['SUPER_ADMIN', 'FARM_ADMIN', 'MANAGER'] },
  { to: '/alerts',     label: 'Alerts',     icon: BellIcon,  roles: ['SUPER_ADMIN', 'FARM_ADMIN', 'MANAGER'] },
  { to: '/profile',    label: 'Profile',    icon: PersonIcon,  roles: ['SUPER_ADMIN', 'FARM_ADMIN', 'MANAGER', 'SCOUT'] },
]

const SUPER_ADMIN_NAV = [
  { to: '/admin', label: 'Admin panel', icon: ShieldIcon },
]

export default function Sidebar() {
  const { user, logout } = useAuthStore()
  const { count: alertCount } = useAlertCount()
  const navigate = useNavigate()
  const role = user?.role ?? ''
  const NAV = ALL_NAV.filter(item => item.roles.includes(role))

  const initials = [user?.firstName?.[0], user?.lastName?.[0]]
    .filter(Boolean).join('').toUpperCase() || '?'

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <aside style={{
      width: 220,
      flexShrink: 0,
      background: '#ffffff',
      borderRight: '0.5px solid #e5e7eb',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'sticky',
      top: 0,
    }}>
      {/* Logo */}
      <div style={{
        padding: '20px 16px 16px',
        borderBottom: '0.5px solid #f3f4f6',
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }}>
        <div style={{
          width: 28, height: 28,
          background: '#1e5c3a',
          borderRadius: 7,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 2C5.8 2 4 3.8 4 6c0 2.5 2.5 5.5 4 7.5C9.5 11.5 12 8.5 12 6c0-2.2-1.8-4-4-4z" fill="white" fillOpacity="0.9"/>
            <circle cx="8" cy="6" r="1.5" fill="#1e5c3a"/>
          </svg>
        </div>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#111827', letterSpacing: '-0.02em' }}>
          PestScout
        </span>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px', overflow: 'auto' }}>
        <p style={{ fontSize: 10, color: '#9ca3af', padding: '4px 8px 8px', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
          Management
        </p>
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={15} />
            <span style={{ flex: 1 }}>{label}</span>
            {to === '/alerts' && alertCount > 0 && (
              <span style={{
                fontSize: 9, fontWeight: 700,
                background: '#e05252', color: '#fff',
                borderRadius: 20, padding: '1px 5px',
                minWidth: 16, textAlign: 'center',
                lineHeight: '14px',
              }}>
                {alertCount > 99 ? '99+' : alertCount}
              </span>
            )}
          </NavLink>
        ))}

        {user?.role === 'SUPER_ADMIN' && (
          <>
            <p style={{ fontSize: 10, color: '#9ca3af', padding: '16px 8px 8px', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
              System
            </p>
            {SUPER_ADMIN_NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                style={({ isActive }) => isActive ? {} : { color: '#c53030' }}
              >
                <Icon size={15} />
                {label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* User */}
      <div style={{
        padding: '12px 12px 16px',
        borderTop: '0.5px solid #f3f4f6',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 32, height: 32,
            borderRadius: '50%',
            background: '#f0faf4',
            border: '0.5px solid #a7dcbc',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600, color: '#1e5c3a',
            flexShrink: 0
          }}>
            {initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.firstName} {user?.lastName}
            </p>
            <p style={{ fontSize: 10, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.role?.replace('_', ' ')}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="btn-secondary"
          style={{ width: '100%', fontSize: 12 }}
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}

// ─── Icons (inline SVG) ───────────────────────────────────────────────────────

function DashIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
    <rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/>
    <rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>
  </svg>
}

function FarmIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
    <path d="M1 14V8l7-6 7 6v6H1z"/><rect x="5" y="9" width="6" height="5" rx="0.5"/>
  </svg>
}

function ListIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
    <line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="12" x2="14" y2="12"/>
  </svg>
}

function ChartIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
    <polyline points="2,12 6,7 9,9 14,4"/>
    <line x1="2" y1="14" x2="14" y2="14"/>
  </svg>
}

function GridIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
    <rect x="2" y="2" width="3" height="3" rx="0.5"/><rect x="6.5" y="2" width="3" height="3" rx="0.5"/>
    <rect x="11" y="2" width="3" height="3" rx="0.5"/><rect x="2" y="6.5" width="3" height="3" rx="0.5"/>
    <rect x="6.5" y="6.5" width="3" height="3" rx="0.5"/><rect x="11" y="6.5" width="3" height="3" rx="0.5"/>
    <rect x="2" y="11" width="3" height="3" rx="0.5"/><rect x="6.5" y="11" width="3" height="3" rx="0.5"/>
    <rect x="11" y="11" width="3" height="3" rx="0.5"/>
  </svg>
}

function PersonIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="5" r="2.5"/>
    <path d="M3.5 13c.8-2.2 2.5-3.5 4.5-3.5s3.7 1.3 4.5 3.5"/>
  </svg>
}

function BellIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1.5a5 5 0 0 1 5 5v3l1.5 2H1.5L3 9.5v-3a5 5 0 0 1 5-5z"/>
    <path d="M6.5 13a1.5 1.5 0 0 0 3 0"/>
  </svg>
}

function ShieldIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1.5L2 4v4c0 3 2.6 5.4 6 6 3.4-.6 6-3 6-6V4L8 1.5z"/>
    <path d="M5.5 8l1.8 1.8 3.2-3.6"/>
  </svg>
}
