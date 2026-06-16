import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type {
  LoginRequest, LoginResponse, UserDto, ChangePasswordRequest,
  UpdateMyProfileRequest, TemporaryPasswordRequest,
  FarmResponse,
  ScoutingSessionDetailDto, ScoutingObservationDto,
  CreateObservationRequest, UpdateObservationRequest,
  ScoutingPhotoDto, RegisterScoutingPhotoRequest, RegisterScoutingPhotoResponse, ConfirmScoutingPhotoRequest,
  HeatmapResponse,
  MonthlyHeatmapResponse,
  DashboardDto, DashboardOverviewDto, DashboardSummaryDto,
  WeeklyPestTrendDto, SeverityTrendPointDto,
  AlertDto, RecommendationDto,
  PestDistributionItemDto,
  GreenhouseWeeklyTrendResponse,
  ResetPasswordRequest,
  ErrorResponse,
  // Super Admin
  CreateUserRequest, UpdateUserRequest, UserSearchParams, PagedResponse,
  UpdateFarmLicenseRequest, UpdateFarmRequest, CreateFarmRequest,
  FarmLayoutPreviewPolygon,
  FarmLayoutPreviewRequest,
  FarmLayoutPreviewResponse,
  CreateGreenhouseRequest, UpdateGreenhouseRequest, GreenhouseResponse,
  CreateFieldBlockRequest, UpdateFieldBlockRequest, FieldBlockResponse,
  FarmMemberResponse,
  CacheInfo,
  ScoutingSessionAuditDto,
  SpeciesCode,
  SessionStatus,
  CustomSpecies,
  CustomSpeciesCategory,
} from '@/types'
import { getClientSessionId } from '@/utils/clientSession'
import {
  clearStoredAuth,
  getStoredAccessToken,
  getStoredRefreshToken,
  storeAuthTokens,
} from '@/utils/authStorage'
import { navigateToLogin } from '@/utils/navigation'
import { sessionEventStream } from './sessionStream'

// ─── Axios instance ───────────────────────────────────────────────────────────

const API_BASE_URL = `${(import.meta.env.VITE_API_URL ?? 'http://localhost:8080').replace(/\/+$/, '')}/pestscout`

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' }
})

export function buildApiUrl(path: string): string {
  return `${API_BASE_URL}${path}`
}

function isAuthRefreshRequest(url?: string) {
  return url?.includes('/api/auth/refresh')
}

export function isForcedSessionErrorCode(errorCode?: string | null): boolean {
  return errorCode === 'SESSION_REPLACED' || errorCode === 'SESSION_INVALID'
}

function logoutReasonForErrorCode(errorCode?: string | null) {
  if (errorCode === 'SESSION_REPLACED') return 'session_replaced'
  if (errorCode === 'SESSION_INVALID') return 'session_invalid'
  return 'session_expired'
}

// Attach JWT on every request
api.interceptors.request.use(config => {
  const token = getStoredAccessToken()
  config.headers['X-Client-Session-Id'] = getClientSessionId()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ─── 401/400 handling with queued refresh ─────────────────────────────────────
let isRefreshing = false
let refreshQueue: Array<(token: string) => void> = []

export function forceLogout(reason = 'session_expired') {
  sessionEventStream.stop()
  clearStoredAuth()
  navigateToLogin(reason)
}

api.interceptors.response.use(
  res => res,
  async (error: AxiosError<ErrorResponse>) => {
    const original = error.config as any
    const status = error.response?.status
    const errorCode = error.response?.data?.errorCode

    if (status === 401 && isForcedSessionErrorCode(errorCode)) {
      forceLogout(logoutReasonForErrorCode(errorCode))
      return Promise.reject(error)
    }

    // 401 from any protected endpoint → try refresh once
    if (status === 401 && !original._retry && !isAuthRefreshRequest(original?.url)) {
      const storedRefresh = getStoredRefreshToken()
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
        const res = await authApi.refresh(storedRefresh)
        const newToken = res.token
        storeAuthTokens(res)
        api.defaults.headers.common.Authorization = `Bearer ${newToken}`
        refreshQueue.forEach(cb => cb(newToken))
        refreshQueue = []
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      } catch (refreshErr: any) {
        // 400 from /refresh (includes inactivity message) → force logout
        forceLogout(logoutReasonForErrorCode(refreshErr?.response?.data?.errorCode))
        return Promise.reject(refreshErr)
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

  updateMe: (body: UpdateMyProfileRequest) =>
    api.put<UserDto>('/api/auth/me', body).then(r => r.data),

  refresh: (refreshToken: string) =>
    api.post<LoginResponse>('/api/auth/refresh', { refreshToken }).then(r => r.data),

  claimSession: (refreshToken: string) =>
    api.post<LoginResponse>('/api/auth/session/claim', { refreshToken }).then(r => r.data),

  resetPassword: (body: ResetPasswordRequest) =>
    api.post('/api/auth/reset-password', body).then(r => r.data),

  changePassword: (body: ChangePasswordRequest) =>
    api.post('/api/auth/change-password', body).then(r => r.data),

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

/** One greenhouse or field-block included in the session */
export interface SessionTargetRequest {
  greenhouseId?: string
  fieldBlockId?: string
  includeAllBays?: boolean        // default true
  includeAllBenches?: boolean     // default true
  bayTags?: string[]
  benchTags?: string[]
  areaHectares?: number | null
}

/** POST /api/scouting/sessions — manager creates, must supply scoutId + targets */
export interface CreateSessionRequest {
  farmId: string
  scoutId?: string                 // optional - backend falls back to farm scout
  targets?: SessionTargetRequest[] // optional - backend auto-resolves all structures
  status?: SessionStatus
  sessionDate: string              // ISO local date
  weekNumber?: number
  crop?: string
  variety?: string
  surveySpeciesCodes?: SpeciesCode[]
  customSurveySpeciesIds?: string[]
  notes?: string
  observationTime?: string
  observationTimezone?: string
  actorName?: string
  deviceId?: string
}

/** POST /api/scouting/sessions/{id}/submit — scout submits for manager review */
export interface SubmitSessionRequest {
  version: number
  confirmationAcknowledged: boolean
  actorName: string               // required for audit
  comment?: string
  deviceId?: string
}

export interface AcceptSessionRequest {
  version: number
  actorName: string
  comment?: string
  deviceId?: string
}

/** POST /api/scouting/sessions/{id}/complete — manager approves */
export interface CompleteSessionRequest {
  version: number
  actorName: string               // required for audit
  comment?: string
  deviceId?: string
}

/** POST /api/scouting/sessions/{id}/reopen */
export interface ReopenSessionRequest {
  comment?: string
  actorName?: string
  deviceId?: string
}

/** PUT /api/scouting/sessions/{id} */
export interface UpdateSessionRequest {
  sessionDate?: string
  weekNumber?: number
  crop?: string
  variety?: string
  surveySpeciesCodes?: SpeciesCode[]
  customSurveySpeciesIds?: string[]
  targets?: SessionTargetRequest[]
  notes?: string
  temperatureCelsius?: number
  relativeHumidityPercent?: number
  observationTime?: string
  observationTimezone?: string
  weatherNotes?: string
  version?: number
  actorName?: string
  scoutId?: string    // assigning a scout promotes DRAFT → NEW
}

/** POST /api/scouting/sessions/{id}/remote-start-request — SUPER_ADMIN notifies scout to start */
export interface RemoteStartRequestBody {
  version: number
  actorName: string
  comment?: string
}

export const sessionsApi = {
  list: (farmId?: string) =>
    api.get<ScoutingSessionDetailDto[]>('/api/scouting/sessions', {
      params: farmId ? { farmId } : undefined
    }).then(r => r.data),

  get: (sessionId: string) =>
    api.get<ScoutingSessionDetailDto>(`/api/scouting/sessions/${sessionId}`).then(r => r.data),

  create: (body: CreateSessionRequest) =>
    api.post<ScoutingSessionDetailDto>('/api/scouting/sessions', body).then(r => r.data),

  update: (sessionId: string, body: UpdateSessionRequest) =>
    api.put<ScoutingSessionDetailDto>(`/api/scouting/sessions/${sessionId}`, body).then(r => r.data),

  delete: (sessionId: string) =>
    api.delete(`/api/scouting/sessions/${sessionId}`).then(() => undefined),

  /**
   * SCOUT direct start. Always available to the assigned scout regardless of whether
   * a remote-start was requested. Scout can ignore a pending remote-start and call this directly.
   * POST /api/scouting/sessions/{id}/start
   */
  start: (sessionId: string) =>
    api.post<ScoutingSessionDetailDto>(`/api/scouting/sessions/${sessionId}/start`).then(r => r.data),

  /**
   * SUPER_ADMIN informs the scout that the session should be started.
   * Informational only — scout may ignore it and start independently.
   * POST /api/scouting/sessions/{id}/remote-start-request
   */
  remoteStartRequest: (sessionId: string, body: RemoteStartRequestBody) =>
    api.post<ScoutingSessionDetailDto>(`/api/scouting/sessions/${sessionId}/remote-start-request`, body).then(r => r.data),

  /**
   * SCOUT submits session for manager review.
   * Requires confirmationAcknowledged: true + actorName (for audit trail).
   * POST /api/scouting/sessions/{id}/submit
   */
  submit: (sessionId: string, body: SubmitSessionRequest) =>
    api.post<ScoutingSessionDetailDto>(`/api/scouting/sessions/${sessionId}/submit`, body).then(r => r.data),

  accept: (sessionId: string, body: AcceptSessionRequest) =>
    api.post<ScoutingSessionDetailDto>(`/api/scouting/sessions/${sessionId}/accept`, body).then(r => r.data),

  /**
   * SCOUT completes session — locks it. Requires confirmationAcknowledged: true + actorName.
   * Must be preceded by a warning modal in the UI.
   * POST /api/scouting/sessions/{id}/complete
   */
  complete: (sessionId: string, body: CompleteSessionRequest) =>
    api.post<ScoutingSessionDetailDto>(`/api/scouting/sessions/${sessionId}/complete`, body).then(r => r.data),

  /**
   * SUPER_ADMIN / FARM_ADMIN / MANAGER reopen a COMPLETED session.
   * Recorded in audit trail with actorName + comment.
   * POST /api/scouting/sessions/{id}/reopen
   */
  reopen: (sessionId: string, body?: ReopenSessionRequest) =>
    api.post<ScoutingSessionDetailDto>(`/api/scouting/sessions/${sessionId}/reopen`, body ?? {}).then(r => r.data),

  /**
   * SCOUT accepts a remote-start request from a super admin.
   * POST /api/scouting/sessions/{id}/accept-remote-start
   */
  acceptRemoteStart: (sessionId: string) =>
    api.post<ScoutingSessionDetailDto>(`/api/scouting/sessions/${sessionId}/accept-remote-start`).then(r => r.data),

  /** GET /api/scouting/sessions/{id}/audits — returns ordered audit trail */
  audits: (sessionId: string): Promise<ScoutingSessionAuditDto[]> =>
    api.get<ScoutingSessionAuditDto[]>(`/api/scouting/sessions/${sessionId}/audits`).then(r => r.data),
}

// ─── Observations ─────────────────────────────────────────────────────────────

export const observationsApi = {
  create: (sessionId: string, body: CreateObservationRequest) =>
    api.post<ScoutingObservationDto>(`/api/scouting/sessions/${sessionId}/observations`, body).then(r => r.data),

  update: (sessionId: string, obsId: string, body: UpdateObservationRequest) =>
    api.put<ScoutingObservationDto>(`/api/scouting/sessions/${sessionId}/observations/${obsId}`, body).then(r => r.data),

  delete: (sessionId: string, obsId: string) =>
    api.delete(`/api/scouting/sessions/${sessionId}/observations/${obsId}`).then(r => r.data),
}

export const scoutingPhotosApi = {
  listSession: (sessionId: string) =>
    api.get<ScoutingPhotoDto[]>(`/api/scouting/photos/session/${sessionId}`).then(r => r.data),

  register: (body: RegisterScoutingPhotoRequest) =>
    api.post<RegisterScoutingPhotoResponse>('/api/scouting/photos/register', body).then(r => r.data),

  confirm: (body: ConfirmScoutingPhotoRequest) =>
    api.post<ScoutingPhotoDto>('/api/scouting/photos/confirm', body).then(r => r.data),

  delete: (sessionId: string, photoId: string) =>
    api.delete(`/api/scouting/photos/session/${sessionId}/${photoId}`).then(() => undefined),
}

// —— Farm-specific custom species ——————————————————————————————————————————————

export const customSpeciesApi = {
  list: (farmId: string, category: CustomSpeciesCategory) =>
    api.get<CustomSpecies[]>(`/api/farms/${farmId}/custom-species`, {
      params: { category },
    }).then(r => r.data),

  create: (farmId: string, category: CustomSpeciesCategory, names: string[]) =>
    api.post<CustomSpecies[]>(`/api/farms/${farmId}/custom-species`, {
      category,
      names,
    }).then(r => r.data),
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export const analyticsApi = {
  dashboardOverview: () =>
    api.get<DashboardOverviewDto>('/api/analytics/dashboard/overview').then(r => r.data),

  dashboard: (farmId: string) =>
    api.get<DashboardSummaryDto>('/api/analytics/dashboard', {
      params: { farmId }
    }).then(r => r.data),

  fullDashboard: (farmId: string) =>
    api.get<DashboardDto>('/api/analytics/dashboard/full', {
      params: { farmId }
    }).then(r => r.data),

  heatmap: (farmId: string, month: number, year: number) =>
    api.get<MonthlyHeatmapResponse>('/api/analytics/heatmap/monthly', {
      params: { farmId, month, year }
    }).then(r => r.data),

  weeklyTrends: (farmId: string) =>
    api.get<WeeklyPestTrendDto[]>('/api/analytics/trend/weekly', {
      params: { farmId }
    }).then(r => r.data),

  severityTrend: (farmId: string) =>
    api.get<SeverityTrendPointDto[]>('/api/analytics/trend/severity', {
      params: { farmId }
    }).then(r => r.data),

  greenhouseWeekly: (farmId: string, year: number, species: SpeciesCode) =>
    api.get<GreenhouseWeeklyTrendResponse>('/api/analytics/trend/greenhouse-weekly', {
      params: { farmId, year, species }
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

  // GET /api/auth/users/role/SCOUT?farmId={farmId} — scouts only for session assignee picker
  listScouts: (farmId: string) =>
    api.get<UserDto[]>('/api/auth/users/role/SCOUT', { params: { farmId } }).then(r =>
      Array.isArray(r.data) ? r.data : (r.data as any).content ?? []
    ),

  get: (userId: string) =>
    api.get<UserDto>(`/api/auth/users/${userId}`).then(r => r.data),

  update: (userId: string, body: UpdateUserRequest) =>
    api.put<UserDto>(`/api/auth/users/${userId}`, body).then(r => r.data),

  setTemporaryPassword: (userId: string, body: TemporaryPasswordRequest) =>
    api.post<UserDto>(`/api/auth/users/${userId}/temporary-password`, body).then(r => r.data),

  setEnabled: (userId: string, enabled: boolean) =>
    api.put<UserDto>(`/api/auth/users/${userId}`, { isEnabled: enabled }).then(r => r.data),

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
    latitude:                  farm.latitude,
    longitude:                 farm.longitude,
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

  previewLayout: (body: FarmLayoutPreviewRequest) =>
    api.post<FarmLayoutPreviewResponse | FarmLayoutPreviewPolygon[]>('/api/farms/layout/preview', body).then(r => r.data),

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
    api.put<GreenhouseResponse>(`/api/greenhouses/${ghId}`, body).then(r => r.data),

  deleteGreenhouse: (farmId: string, ghId: string) =>
    api.delete(`/api/greenhouses/${ghId}`).then(r => r.data),

  // ── Field blocks (FIELD farms) ───────────────────────────────────────────────
  listFieldBlocks: (farmId: string) =>
    api.get<FieldBlockResponse[]>(`/api/farms/${farmId}/field-blocks`).then(r => r.data),

  createFieldBlock: (farmId: string, body: CreateFieldBlockRequest) =>
    api.post<FieldBlockResponse>(`/api/farms/${farmId}/field-blocks`, body).then(r => r.data),

  updateFieldBlock: (farmId: string, blockId: string, body: UpdateFieldBlockRequest) =>
    api.put<FieldBlockResponse>(`/api/field-blocks/${blockId}`, body).then(r => r.data),

  deleteFieldBlock: (farmId: string, blockId: string) =>
    api.delete(`/api/field-blocks/${blockId}`).then(r => r.data),

  listMembers: (farmId: string) =>
    api.get<FarmMemberResponse[]>(`/api/farms/${farmId}/members`).then(r => r.data),

  addMember: (farmId: string, userId: string) =>
    api.post<FarmMemberResponse>(`/api/farms/${farmId}/members`, { userId }).then(r => r.data),
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
