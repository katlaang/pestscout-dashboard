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
  expiresIn: number
  user: UserDto
}

// ─── Farm ────────────────────────────────────────────────────────────────────

export type SubscriptionStatus = 'PENDING_ACTIVATION' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'DELETED'
export type SubscriptionTier   = 'BASIC' | 'STANDARD' | 'PREMIUM'
export type FarmStructureType  = 'GREENHOUSE' | 'FIELD' | 'OTHER'

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
  structureType?: FarmStructureType     // drives which structure UI to show
  defaultBayCount?: number
  defaultBenchesPerBay?: number
  defaultSpotChecksPerBench?: number
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

// ─── Scouting ────────────────────────────────────────────────────────────────

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
  version?: number
  sessionId: string
  sessionTargetId?: string
  greenhouseId?: string
  fieldBlockId?: string
  speciesCode: SpeciesCode
  category: ObservationCategory
  bayIndex: number
  bayTag?: string
  benchIndex: number
  benchTag?: string
  spotIndex: number
  count: number
  notes?: string
  updatedAt?: string
  syncStatus: SyncStatus
  deleted: boolean
  deletedAt?: string
  clientRequestId?: string
}

export interface ScoutingSessionSectionDto {
  targetId: string
  greenhouseId?: string
  fieldBlockId?: string
  includeAllBays?: boolean
  includeAllBenches?: boolean
  bayTags?: string[]
  benchTags?: string[]
  observations: ScoutingObservationDto[]
}

export interface RecommendationEntryDto {
  type: string
  text: string
}

export interface ScoutingSessionDetailDto {
  id: string
  version: number
  farmId: string
  sessionDate: string
  weekNumber: number
  status: SessionStatus
  syncStatus: SyncStatus
  managerId?: string
  scoutId?: string
  crop?: string
  variety?: string
  temperatureCelsius?: number
  relativeHumidityPercent?: number
  observationTime?: string
  weatherNotes?: string
  notes?: string
  defaultPhotoSourceType?: string
  startedAt?: string
  submittedAt?: string
  completedAt?: string
  updatedAt?: string
  confirmationAcknowledged: boolean
  reopenComment?: string
  sections: ScoutingSessionSectionDto[]
  recommendations: RecommendationEntryDto[]
}

// ─── Analytics ───────────────────────────────────────────────────────────────

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
  farmId?: string
}

export interface UpdateUserRequest {
  email?: string
  password?: string       // new temporary password — will be BCrypt-encoded server-side
  firstName?: string
  lastName?: string
  phoneNumber?: string
  country?: string
  role?: Role
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
export type SubscriptionTierUpdate   = SubscriptionTier

// UpdateFarmLicenseRequest — all license fields go through the same PUT /api/farms/{id}
export type UpdateFarmLicenseRequest = UpdateFarmRequest

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
  ownerId?: string
  scoutId?: string
  defaultBayCount?: number
  defaultBenchesPerBay?: number
  defaultSpotChecksPerBench?: number
  // Super admin license/archive fields
  subscriptionStatus?: SubscriptionStatus
  subscriptionTier?: SubscriptionTier
  licensedAreaHectares?: number
  licensedUnitQuota?: number
  licenseExpiryDate?: string
  licenseGracePeriodEnd?: string
  licenseArchivedDate?: string
  autoRenewEnabled?: boolean
  billingEmail?: string
  quotaDiscountPercentage?: number
  isArchived?: boolean
  latitude?: number
  longitude?: number
  accessLocked?: boolean   // real field in backend UpdateFarmRequest
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

// ─── Farm creation / structures ──────────────────────────────────────────────

export interface CreateFarmRequest {
  name: string
  ownerId: string
  subscriptionStatus: SubscriptionStatus
  licensedAreaHectares: number
  structureType: FarmStructureType      // required — drives structure UI
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
  defaultBayCount?: number
  defaultBenchesPerBay?: number
  defaultSpotChecksPerBench?: number
  fieldBlocks?: unknown[]
  greenhouses?: unknown[]
}

// Greenhouses (GREENHOUSE farms)
export interface GreenhouseResponse {
  id: string
  farmId: string
  name: string
  description?: string
  structureType: FarmStructureType
  bayCount?: number
  benchesPerBay?: number
  spotChecksPerBench?: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateGreenhouseRequest {
  farmId: string
  name: string
  description?: string
  bayCount?: number | null
  benchesPerBay?: number | null
  spotChecksPerBench?: number | null
  active?: boolean
}

export interface UpdateGreenhouseRequest {
  name?: string
  description?: string
  bayCount?: number | null
  benchesPerBay?: number | null
  spotChecksPerBench?: number | null
  active?: boolean
}

// Field blocks (FIELD farms)
export interface FieldBlockResponse {
  id: string
  farmId: string
  name: string
  description?: string
  bayCount?: number
  spotChecksPerBay?: number
  bayTags?: string[]
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateFieldBlockRequest {
  farmId: string
  name: string
  description?: string
  bayCount?: number | null
  spotChecksPerBay?: number | null
  bayTags?: string[]
  active?: boolean
}

export interface UpdateFieldBlockRequest {
  name?: string
  description?: string
  bayCount?: number | null
  spotChecksPerBay?: number | null
  bayTags?: string[]
  active?: boolean
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