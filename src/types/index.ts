// ─── Auth ───────────────────────────────────────────────────────────────────

export type Role = 'SCOUT' | 'MANAGER' | 'FARM_ADMIN' | 'SUPER_ADMIN' | 'EDGE_SYNC'

export interface UserDto {
  id: string
  farmId?: string
  email: string
  firstName: string
  lastName: string
  phoneNumber: string
  country: string
  customerNumber: string
  role: Role
  isEnabled: boolean
  active: boolean
  deleted: boolean
  passwordChangeRequired: boolean
  reactivationRequired: boolean
  temporaryPasswordExpiresAt?: string
  lastLogin?: string
  lastActivityAt?: string
  createdAt: string
  updatedAt: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  token: string
  refreshToken: string
  expiresIn: number      // seconds until access token expires
  user: UserDto
}

// ─── Farm ────────────────────────────────────────────────────────────────────

export type SubscriptionStatus = 'PENDING_ACTIVATION' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'DELETED'
export type SubscriptionTier = 'BASIC' | 'STANDARD' | 'PREMIUM'
export type FarmStructureType = 'GREENHOUSE' | 'FIELD' | 'OTHER'

export interface FarmResponse {
  id: string
  farmTag: string
  name: string
  description?: string
  address?: string
  city?: string
  province?: string
  postalCode?: string
  country?: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  timezone?: string
  ownerId?: string
  subscriptionTier: SubscriptionTier
  subscriptionStatus: SubscriptionStatus
  licensedAreaHectares?: number
  licensedUnitQuota?: number
  licenseExpiryDate?: string
  licenseStartDate?: string
  autoRenewEnabled: boolean
  accessLocked: boolean
  billingEmail?: string
  quotaDiscountPercentage?: number
  createdAt: string
  updatedAt: string
}

// ─── Scouting ─────────────────────────────────────────────────────────────────

export type SessionStatus =
  | 'DRAFT' | 'NEW' | 'IN_PROGRESS' | 'SUBMITTED'
  | 'REOPENED' | 'COMPLETED' | 'INCOMPLETE' | 'CANCELLED'

export type SyncStatus = 'LOCAL_ONLY' | 'PENDING_UPLOAD' | 'SYNCED' | 'CONFLICT'

export type SpeciesCode =
  | 'THRIPS' | 'RED_SPIDER_MITE' | 'WHITEFLIES' | 'MEALYBUGS'
  | 'CATERPILLARS' | 'FALSE_CODLING_MOTH' | 'PEST_OTHER'
  | 'DOWNY_MILDEW' | 'POWDERY_MILDEW' | 'BOTRYTIS'
  | 'VERTICILLIUM' | 'BACTERIAL_WILT' | 'DISEASE_OTHER'
  | 'BENEFICIAL_PP'

export type ObservationCategory = 'PEST' | 'DISEASE' | 'BENEFICIAL'

export interface ScoutingObservationDto {
  id: string
  sessionId: string
  greenhouseId?: string
  fieldBlockId?: string
  bayId?: string
  benchId?: string
  bayIndex: number
  benchIndex: number
  spotIndex: number
  bayTag?: string
  benchTag?: string
  speciesCode: SpeciesCode
  category: ObservationCategory
  count: number
  notes?: string
  photoUrl?: string
  syncStatus: SyncStatus
  deleted: boolean
  createdAt: string
  updatedAt: string
}

export interface ScoutingSessionSectionDto {
  greenhouseId?: string
  fieldBlockId?: string
  targetId: string
  targetName?: string
  observations: ScoutingObservationDto[]
}

export interface RecommendationEntryDto {
  type: string
  text: string
}

export interface ScoutingSessionDetailDto {
  id: string
  farmId: string
  status: SessionStatus
  syncStatus: SyncStatus
  weekNumber: number
  sessionDate: string
  crop?: string
  variety?: string
  temperatureCelsius?: number
  relativeHumidityPercent?: number
  observationTime?: string
  weatherNotes?: string
  notes?: string
  startedAt?: string
  submittedAt?: string
  completedAt?: string
  confirmationAcknowledged: boolean
  sections: ScoutingSessionSectionDto[]
  recommendations: RecommendationEntryDto[]
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export type SeverityLevel = 'ZERO' | 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' | 'EMERGENCY'

export interface HeatmapCellResponse {
  bayIndex: number
  benchIndex: number
  bayTag?: string
  benchTag?: string
  severityLevel: SeverityLevel
  colorHex: string
  totalCount: number
  pestCount?: number
  diseaseCount?: number
  beneficialCount?: number
  dominantSpecies?: string
}

export interface HeatmapSectionResponse {
  targetId: string
  targetName?: string
  bayCount: number
  benchesPerBay: number
  cells: HeatmapCellResponse[]
}

export interface SeverityLegendEntry {
  level: SeverityLevel
  label: string
  colorHex: string
  minCount: number
  maxCount?: number
}

export interface HeatmapResponse {
  farmId: string
  week: number
  year: number
  sections: HeatmapSectionResponse[]
  legend: SeverityLegendEntry[]
}

export interface DashboardSummaryDto {
  totalSessions: number
  pestsDetectedThisWeek: number
  averageSeverityThisWeek: number
  averageSeverityLastWeek: number
  activeScouts: number
  currentWeekHeatmap: HeatmapResponse[]
}

export interface WeeklyHeatmapResponse {
  week: number
  year: number
  heatmap: HeatmapResponse
}

export interface TrendPointDto {
  week: string
  count: number
}

export interface WeeklyPestTrendDto {
  week: string
  thrips: number
  redSpider: number
  whiteflies: number
  mealybugs: number
  caterpillars: number
  fcm: number
  otherPests: number
}

export interface SeverityTrendPointDto {
  week: string
  zero: number
  low: number
  medium: number
  high: number
  critical: number
}

export interface AlertDto {
  location: string
  pest: string
  severity: string
  count: number
  time: string
}

export interface RecommendationDto {
  scout: string
  location: string
  text: string
  priority: string
  status: string
  date: string
}

export interface PestDistributionItemDto {
  name: string
  value: number
  percentage: number
  severity: string
}

export interface DashboardDto {
  summary: DashboardSummaryDto
  pestDistribution: PestDistributionItemDto[]
  diseaseDistribution: PestDistributionItemDto[]
  weeklyTrends: WeeklyPestTrendDto[]
  severityTrend: SeverityTrendPointDto[]
  heatmap: HeatmapCellResponse[]
  alerts: AlertDto[]
  recommendations: RecommendationDto[]
  farmComparison: FarmComparisonDto[]
  scoutPerformance: ScoutPerformanceDto[]
}

export interface FarmComparisonDto {
  farm: string
  avgSeverity: number
  observations: number
  alerts: number
}

export interface ScoutPerformanceDto {
  scout: string
  observations: number
  accuracy: number
  avgTime: string
}

// ─── Super Admin ─────────────────────────────────────────────────────────────

export interface CreateUserRequest {
  email: string
  password: string
  firstName: string
  lastName: string
  phoneNumber?: string
  country?: string
  role: Role
  farmId?: string        // not allowed for SUPER_ADMIN
}

export interface UpdateUserRequest {
  firstName?: string
  lastName?: string
  phoneNumber?: string
  country?: string
  isEnabled?: boolean
}

export interface UserSearchParams {
  email?: string
  firstName?: string
  lastName?: string
  role?: Role
  farmId?: string
  isEnabled?: boolean
  page?: number
  size?: number
}

export interface PagedResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export type SubscriptionStatusUpdate = SubscriptionStatus
export type SubscriptionTierUpdate = SubscriptionTier

export interface UpdateFarmLicenseRequest {
  subscriptionStatus?: SubscriptionStatusUpdate
  subscriptionTier?: SubscriptionTierUpdate
  licensedAreaHectares?: number
  licensedUnitQuota?: number
  licenseExpiryDate?: string
  licenseStartDate?: string
  autoRenewEnabled?: boolean
  billingEmail?: string
  quotaDiscountPercentage?: number
}

export interface UpdateFarmRequest {
  name?: string
  description?: string
  address?: string
  city?: string
  province?: string
  postalCode?: string
  country?: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  timezone?: string
  ownerId?: string   // can be updated after initial creation with null-UUID placeholder
}

export interface CacheStats {
  name: string
  size: number
  hitRate?: number
  missRate?: number
  evictions?: number
}

export interface CacheInfo {
  caches: CacheStats[]
  totalKeys: number
}

// ─── Super Admin — Farm creation / structures ────────────────────────────────

export interface CreateFarmRequest {
  name: string
  ownerId: string                        // required — UUID of the owning user
  subscriptionStatus: SubscriptionStatus // required
  licensedAreaHectares: number           // required
  subscriptionTier?: SubscriptionTier
  description?: string
  address?: string
  city?: string
  province?: string
  postalCode?: string
  country?: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  timezone?: string
}

export interface GreenhouseResponse {
  id: string
  farmId: string
  name: string
  description?: string
  structureType: FarmStructureType
  bayCount: number
  benchesPerBay: number
  createdAt: string
  updatedAt: string
}

export interface CreateGreenhouseRequest {
  farmId: string
  name: string
  description?: string
  structureType?: FarmStructureType
  bayCount?: number
  benchesPerBay?: number
}

export interface BayResponse {
  id: string
  greenhouseId: string
  farmId: string
  bayTag: string
  bayIndex: number
  description?: string
  createdAt: string
}

export interface BenchResponse {
  id: string
  bayId: string
  greenhouseId: string
  farmId: string
  benchTag: string
  benchIndex: number
  description?: string
  createdAt: string
}

export interface FarmMemberResponse {
  userId: string
  farmId: string
  role: Role
  user: UserDto
  joinedAt: string
}

// ─── Password reset ──────────────────────────────────────────────────────────

export interface ResetPasswordRequest {
  token: string
  newPassword: string
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

export interface BootstrapSuperAdminRequest {
  email: string
  password: string
  firstName: string
  lastName: string
}

export interface ErrorResponse {
  timestamp: string
  status: number
  errorCode: string
  message: string
  path: string
  details?: string[]
}