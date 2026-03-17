import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type {
  LoginRequest, LoginResponse, UserDto,
  FarmResponse,
  ScoutingSessionDetailDto,
  HeatmapResponse,
  DashboardDto, DashboardSummaryDto,
  WeeklyPestTrendDto, SeverityTrendPointDto,
  AlertDto, RecommendationDto,
  PestDistributionItemDto,
  ResetPasswordRequest,
  ErrorResponse,
  // Super Admin
  CreateUserRequest, UpdateUserRequest, UserSearchParams, PagedResponse,
  UpdateFarmLicenseRequest, UpdateFarmRequest, CreateFarmRequest,
  CreateGreenhouseRequest, UpdateGreenhouseRequest, GreenhouseResponse,
  CreateFieldBlockRequest, UpdateFieldBlockRequest, FieldBlockResponse,
  FarmMemberResponse,
  CacheInfo,
} from '@/types'

// ─── Axios instance ───────────────────────────────────────────────────────────

const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8080',
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' }
})

// Attach JWT on every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ─── 401/400 handling with queued refresh ─────────────────────────────────────
let isRefreshing = false
let refreshQueue: Array<(token: string) => void> = []

function forceLogout(reason = 'session_expired') {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('token_expires_at')
  // Clear zustand state without importing the store (avoids circular dep)
  try {
    const stored = localStorage.getItem('pestscout-auth')
    if (stored) {
      const parsed = JSON.parse(stored)
      parsed.state = { ...parsed.state, user: null, token: null, refreshToken: null, tokenExpiresAt: null }
      localStorage.setItem('pestscout-auth', JSON.stringify(parsed))
    }
  } catch { /* ignore */ }
  window.location.href = `/login?reason=${reason}`
}

api.interceptors.response.use(
  res => res,
  async (error: AxiosError<ErrorResponse>) => {
    const original = error.config as any
    const status = error.response?.status
    const errMsg = (error.response?.data as any)?.message ?? ''

    // 401 from any protected endpoint → try refresh once
    if (status === 401 && !original._retry) {
      const storedRefresh = localStorage.getItem('refresh_token')
      if (!storedRefresh) { forceLogout('unauthorized'); return Promise.reject(error) }

      if (isRefreshing) {
        return new Promise(resolve => {
          refreshQueue.push((token: string) => {
            original.headers.Authorization = `Bearer ${token}`
            resolve(api(original))
          })
        })
      }

      original._retry = true
      isRefreshing = true
      try {
        const res = await axios.post<LoginResponse>(
          `${api.defaults.baseURL}/api/auth/refresh`,
          { refreshToken: storedRefresh }
        )
        const newToken = res.data.token
        const expiresAt = Date.now() + res.data.expiresIn * 1000
        localStorage.setItem('access_token', newToken)
        localStorage.setItem('refresh_token', res.data.refreshToken)
        localStorage.setItem('token_expires_at', String(expiresAt))
        api.defaults.headers.common.Authorization = `Bearer ${newToken}`
        refreshQueue.forEach(cb => cb(newToken))
        refreshQueue = []
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      } catch (refreshErr: any) {
        // 400 from /refresh (includes inactivity message) → force logout
        forceLogout('session_expired')
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (body: LoginRequest) =>
    api.post<LoginResponse>('/api/auth/login', body).then(r => r.data),

  me: () =>
    api.get<UserDto>('/api/auth/me').then(r => r.data),

  refresh: (refreshToken: string) =>
    api.post<LoginResponse>('/api/auth/refresh', { refreshToken }).then(r => r.data),

  resetPassword: (body: ResetPasswordRequest) =>
    api.post('/api/auth/reset-password', body).then(r => r.data),

  reactivateUser: (userId: string) =>
    api.post<UserDto>(`/api/auth/users/${userId}/reactivate`).then(r => r.data),
}

// ─── Farms ────────────────────────────────────────────────────────────────────

export const farmsApi = {
  list: () =>
    api.get<FarmResponse[]>('/api/farms').then(r => r.data),

  get: (farmId: string) =>
    api.get<FarmResponse>(`/api/farms/${farmId}`).then(r => r.data),
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export interface CreateSessionRequest {
  farmId: string
  greenhouseId?: string
  fieldBlockId?: string
  crop?: string
  variety?: string
  weekNumber?: number
  sessionDate?: string
  notes?: string
}

export const sessionsApi = {
  list: (farmId: string) =>
    api.get<ScoutingSessionDetailDto[]>('/api/scouting/sessions', {
      params: { farmId }
    }).then(r => r.data),

  get: (sessionId: string) =>
    api.get<ScoutingSessionDetailDto>(`/api/scouting/sessions/${sessionId}`).then(r => r.data),

  create: (body: CreateSessionRequest) =>
    api.post<ScoutingSessionDetailDto>('/api/scouting/sessions', body).then(r => r.data),

  complete: (sessionId: string) =>
    api.post<ScoutingSessionDetailDto>(`/api/scouting/sessions/${sessionId}/complete`).then(r => r.data),

  reopen: (sessionId: string) =>
    api.post<ScoutingSessionDetailDto>(`/api/scouting/sessions/${sessionId}/reopen`).then(r => r.data),

  cancel: (sessionId: string) =>
    api.post<ScoutingSessionDetailDto>(`/api/scouting/sessions/${sessionId}/cancel`).then(r => r.data),
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export const analyticsApi = {
  dashboard: (farmId: string) =>
    api.get<DashboardSummaryDto>('/api/analytics/dashboard', {
      params: { farmId }
    }).then(r => r.data),

  fullDashboard: (farmId: string) =>
    api.get<DashboardDto>('/api/analytics/dashboard/full', {
      params: { farmId }
    }).then(r => r.data),

  heatmap: (farmId: string, week: number, year: number) =>
    api.get<HeatmapResponse>(`/api/farms/${farmId}/heatmap`, {
      params: { week, year }
    }).then(r => r.data),

  weeklyTrends: (farmId: string) =>
    api.get<WeeklyPestTrendDto[]>('/api/analytics/trend/weekly', {
      params: { farmId }
    }).then(r => r.data),

  severityTrend: (farmId: string) =>
    api.get<SeverityTrendPointDto[]>('/api/analytics/trend/severity', {
      params: { farmId }
    }).then(r => r.data),

  pestDistribution: (farmId: string) =>
    api.get<PestDistributionItemDto[]>('/api/analytics/reports/monthly', {
      params: { farmId, year: new Date().getFullYear(), month: new Date().getMonth() + 1 }
    }).then(r => r.data),
}

export default api

// ─── Super Admin — Users ──────────────────────────────────────────────────────

export const adminUsersApi = {
  create: (body: CreateUserRequest) =>
    api.post<UserDto>('/api/auth/users', body).then(r => r.data),

  // Returns a plain array — not paged. Use farmId param to filter by farm.
  list: (params?: { farmId?: string; role?: string }) =>
    api.get<UserDto[]>('/api/auth/users', { params }).then(r =>
      Array.isArray(r.data) ? r.data : (r.data as any).content ?? []
    ),

  get: (userId: string) =>
    api.get<UserDto>(`/api/auth/users/${userId}`).then(r => r.data),

  update: (userId: string, body: UpdateUserRequest) =>
    api.patch<UserDto>(`/api/auth/users/${userId}`, body).then(r => r.data),

  setEnabled: (userId: string, enabled: boolean) =>
    api.patch<UserDto>(`/api/auth/users/${userId}`, { isEnabled: enabled }).then(r => r.data),

  reactivate: (userId: string) =>
    api.post<UserDto>(`/api/auth/users/${userId}/reactivate`).then(r => r.data),
}

// ─── Helper: map FarmResponse → UpdateFarmRequest (PUT requires all fields) ──

function farmToUpdateBody(farm: FarmResponse, overrides: UpdateFarmRequest = {}): UpdateFarmRequest {
  return {
    name:                      farm.name,
    description:               farm.description,
    address:                   farm.address,
    city:                      farm.city,
    province:                  farm.province,
    postalCode:                farm.postalCode,
    country:                   farm.country,
    contactName:               farm.contactName,
    contactEmail:              farm.contactEmail,
    contactPhone:              farm.contactPhone,
    timezone:                  farm.timezone,
    ownerId:                   farm.ownerId,
    defaultBayCount:           farm.defaultBayCount,
    defaultBenchesPerBay:      farm.defaultBenchesPerBay,
    defaultSpotChecksPerBench: farm.defaultSpotChecksPerBench,
    subscriptionStatus:        farm.subscriptionStatus,
    subscriptionTier:          farm.subscriptionTier,
    licensedAreaHectares:      farm.licensedAreaHectares,
    licenseExpiryDate:         farm.licenseExpiryDate,
    autoRenewEnabled:          farm.autoRenewEnabled ?? false,
    billingEmail:              farm.billingEmail,
    isArchived:                false,         // NOT NULL in DB — keep false unless explicitly overriding
    accessLocked:              farm.accessLocked ?? false,  // real field — preserve current value
    ...overrides,
  }
}

// ─── Super Admin — Farms ─────────────────────────────────────────────────────

export const adminFarmsApi = {
  listAll: () =>
    api.get<FarmResponse[]>('/api/farms').then(r => r.data),

  getFarm: (farmId: string) =>
    api.get<FarmResponse>(`/api/farms/${farmId}`).then(r => r.data),

  create: (body: CreateFarmRequest) =>
    api.post<FarmResponse>('/api/farms', body).then(r => r.data),

  // Backend controller only has PUT — must send full valid body
  update: (farmId: string, currentFarm: FarmResponse, overrides: UpdateFarmRequest) =>
    api.put<FarmResponse>(`/api/farms/${farmId}`, farmToUpdateBody(currentFarm, overrides)).then(r => r.data),

  // Archive via isArchived=true (no DELETE endpoint)
  delete: (farmId: string, currentFarm: FarmResponse) =>
    api.put<FarmResponse>(`/api/farms/${farmId}`, farmToUpdateBody(currentFarm, { isArchived: true })).then(r => r.data),

  // accessLocked is a real field — toggles access without affecting subscription status
  setAccessLocked: (farmId: string, locked: boolean, currentFarm: FarmResponse) =>
    api.put<FarmResponse>(`/api/farms/${farmId}`, farmToUpdateBody(currentFarm, { accessLocked: locked })).then(r => r.data),

  // License fields go through the same PUT
  updateLicense: (farmId: string, body: UpdateFarmLicenseRequest, currentFarm: FarmResponse) =>
    api.put<FarmResponse>(`/api/farms/${farmId}`, farmToUpdateBody(currentFarm, body)).then(r => r.data),

  // ── Greenhouses (GREENHOUSE farms) ──────────────────────────────────────────
  listGreenhouses: (farmId: string) =>
    api.get<GreenhouseResponse[]>(`/api/farms/${farmId}/greenhouses`).then(r => r.data),

  createGreenhouse: (farmId: string, body: CreateGreenhouseRequest) =>
    api.post<GreenhouseResponse>(`/api/farms/${farmId}/greenhouses`, body).then(r => r.data),

  updateGreenhouse: (farmId: string, ghId: string, body: UpdateGreenhouseRequest) =>
    api.put<GreenhouseResponse>(`/api/farms/${farmId}/greenhouses/${ghId}`, body).then(r => r.data),

  deleteGreenhouse: (farmId: string, ghId: string) =>
    api.delete(`/api/farms/${farmId}/greenhouses/${ghId}`).then(r => r.data),

  // ── Field blocks (FIELD farms) ───────────────────────────────────────────────
  listFieldBlocks: (farmId: string) =>
    api.get<FieldBlockResponse[]>(`/api/farms/${farmId}/field-blocks`).then(r => r.data),

  createFieldBlock: (farmId: string, body: CreateFieldBlockRequest) =>
    api.post<FieldBlockResponse>(`/api/farms/${farmId}/field-blocks`, body).then(r => r.data),

  updateFieldBlock: (farmId: string, blockId: string, body: UpdateFieldBlockRequest) =>
    api.put<FieldBlockResponse>(`/api/farms/${farmId}/field-blocks/${blockId}`, body).then(r => r.data),

  deleteFieldBlock: (farmId: string, blockId: string) =>
    api.delete(`/api/farms/${farmId}/field-blocks/${blockId}`).then(r => r.data),

  listMembers: (farmId: string) =>
    api.get<FarmMemberResponse[]>(`/api/farms/${farmId}/members`).then(r => r.data),
}

// ─── Super Admin — Cache ──────────────────────────────────────────────────────

export const adminCacheApi = {
  info: () =>
    api.get<CacheInfo>('/api/admin/cache').then(r => r.data),

  clearNamed: (cacheName: string) =>
    api.delete(`/api/admin/cache/${cacheName}`).then(r => r.data),

  clearAll: () =>
    api.delete('/api/admin/cache').then(r => r.data),
}