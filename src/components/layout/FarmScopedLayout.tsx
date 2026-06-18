import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { farmsApi } from '@/services/api'
import { useAuthStore } from '@/hooks/useAuth'
import { useCurrentFarmStore } from '@/hooks/useCurrentFarm'
import AppLayout from './AppLayout'

export default function FarmScopedLayout() {
  const { farmSlug } = useParams<{ farmSlug: string }>()
  const { farms } = useAuthStore()
  const { setCurrentFarm } = useCurrentFarmStore()
  const navigate = useNavigate()
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    if (!farmSlug) {
      navigate('/farms', { replace: true })
      return
    }

    const cached = farms.find(f => f.slug === farmSlug)
    if (cached) {
      setCurrentFarm(cached.farmId, cached.slug)
      setResolved(true)
      return
    }

    // Slug not in cached list — fetch from API (handles direct URL navigation or page refresh)
    setResolved(false)
    farmsApi.getBySlug(farmSlug)
      .then(farm => {
        setCurrentFarm(farm.id, farmSlug)
        setResolved(true)
      })
      .catch(() => navigate('/farms', { replace: true }))
  }, [farmSlug, farms, setCurrentFarm, navigate])

  if (!resolved) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#9ca3af', fontSize: 13 }}>
        Loading farm...
      </div>
    )
  }

  return <AppLayout />
}
