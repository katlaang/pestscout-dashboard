import type { ReactNode } from 'react'

interface ConfirmModalProps {
  title: string
  message: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
  tone?: 'danger' | 'default'
}

export default function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  loading = false,
  tone = 'default',
}: ConfirmModalProps) {
  const confirmStyle =
    tone === 'danger'
      ? {
          background: '#c53030',
          border: '0.5px solid #c53030',
          color: '#fff',
        }
      : {
          background: '#1e5c3a',
          border: '0.5px solid #1e5c3a',
          color: '#fff',
        }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => {
        if (e.target === e.currentTarget && !loading) onCancel()
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          borderRadius: 12,
          border: '0.5px solid #e5e7eb',
          boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
          padding: 24,
        }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 10 }}>{title}</h3>
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: 8,
            background: tone === 'danger' ? '#fff5f5' : '#f9fafb',
            border: tone === 'danger' ? '0.5px solid #fca5a5' : '0.5px solid #e5e7eb',
            fontSize: 12,
            color: tone === 'danger' ? '#7f1d1d' : '#374151',
          }}
        >
          {message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-secondary" type="button" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={{
              borderRadius: 8,
              padding: '0.5rem 1rem',
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: loading ? 0.6 : 1,
              ...confirmStyle,
            }}
          >
            {loading ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
