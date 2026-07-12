// ─── Auth ───────────────────────────────────────────────────────────────────

export type Role = 'SCOUT' | 'MANAGER' | 'FARM_ADMIN' | 'SUPER_ADMIN' | 'REGIONAL_ANALYST' | 'EDGE_SYNC'

export interface FarmMembershipSummary {
  farmId: string
  slug: string
  name: string
}

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
  authorityAlertCurator?: boolean
  isEnabled: boolean
  active: boolean
  deleted: boolean
  passwordChangeRequired: boolean
  passwordExpiryWarningRequired?: boolean
  passwordExpiryWarningDaysRemaining?: number
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
  farms: FarmMembershipSummary[]
}

// ─── Authority Alerts ──────────────────────────────────────────────────────

export type AuthorityAlertType = 'NEW_DETECTION' | 'ADVISORY' | 'OUTBREAK' | 'QUARANTINE' | 'ERADICATION_COMPLETE' | 'OTHER'
export type AuthorityAlertSeverity = 'ADVISORY' | 'WATCH' | 'WARNING' | 'EMERGENCY'

export interface AuthorityAlertResponse {
  id: string
  alertType: AuthorityAlertType
  severity: AuthorityAlertSeverity
  issuingAuthority: string
  title: string
  messageBody: string
  suggestedMitigation: string
  country: string
  state: string | null
  linkedSpecies: SpeciesCode | null
  sourceUrl: string | null
  issuedDate: string
  expiryDate: string | null
  active: boolean
  highlighted: boolean
  createdAt: string
  updatedAt: string
}

export interface AlertCoverageDto {
  name: string
  activeAlertCount: number
}

export interface AuthorityAlertUpsertRequest {
  alertType: AuthorityAlertType
  severity: AuthorityAlertSeverity
  issuingAuthority: string
  title: string
  messageBody: string
  suggestedMitigation?: string
  country: string
  state?: string
  linkedSpecies?: SpeciesCode
  sourceUrl?: string
  issuedDate: string
  expiryDate?: string
  active: boolean
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
  latitude?: number
  longitude?: number
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
  | 'BENEFICIAL_PP' | 'BENEFICIAL_OTHER'

export type ObservationCategory = 'PEST' | 'DISEASE' | 'BENEFICIAL'
export type CustomSpeciesCategory = ObservationCategory

export interface CustomSpecies {
  id: string
  category: CustomSpeciesCategory
  name: string
  code: string
}

export interface ScoutingObservationDto {
  id: string
  version?: number
  sessionId: string
  sessionTargetId?: string
  greenhouseId?: string
  fieldBlockId?: string
  speciesCode?: SpeciesCode
  customSpeciesId?: string
  customSpeciesName?: string
  customSpeciesCode?: string
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
  targetName?: string
  greenhouseId?: string
  fieldBlockId?: string
  includeAllBays?: boolean
  includeAllBenches?: boolean
  bayTags?: string[]
  benchTags?: string[]
  areaHectares?: number | null
  coverage?: {
    totalBays?: number
    coveredBays?: number
    totalBeds?: number
    coveredBeds?: number
    totalSpots?: number
    coveredSpots?: number
    percentComplete?: number
    complete?: boolean
  }
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
  farmName?: string
  sessionDate: string
  weekNumber: number
  weekYear?: number
  weekKey?: string
  status: SessionStatus
  syncStatus: SyncStatus
  openRestricted?: boolean
  managerId?: string
  scoutId?: string | null
  crop?: string
  variety?: string
  temperatureCelsius?: number
  relativeHumidityPercent?: number
  observationTime?: string
  observationTimezone?: string
  weatherNotes?: string
  notes?: string
  surveySpeciesCodes?: SpeciesCode[]
  customSurveySpeciesIds?: string[]
  defaultPhotoSourceType?: string
  remoteStartConsentRequired?: boolean
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

export interface HeatmapBayLayoutResponse {
  bayIndex: number
  bayTag?: string
  bedCount?: number
  bedTags?: string[]
}

export interface HeatmapSectionResponse {
  targetId: string
  targetName?: string
  bayCount: number
  benchesPerBay: number
  cells: HeatmapCellResponse[]
  bayLayouts?: HeatmapBayLayoutResponse[]
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
  month?: number
  sections: HeatmapSectionResponse[]
  legend: SeverityLegendEntry[]
}

export interface MonthlyHeatmapWeekResponse {
  weekNumber: number
  rangeStart?: string
  rangeEnd?: string
  sections: HeatmapSectionResponse[]
}

export interface MonthlyHeatmapResponse {
  farmId: string
  year: number
  month: number
  weeklyHeatmaps: MonthlyHeatmapWeekResponse[]
  legend?: SeverityLegendEntry[]
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
  weekKey?: string
  weekNumber?: number
  year?: number
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
  weekKey?: string
  weekNumber?: number
  year?: number
  zero: number
  low: number
  medium: number
  high: number
  critical: number
}

export interface AlertDto {
  farmId?: string
  farmName?: string
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
  count?: number
  percentage: number
  severity: string
}

export interface GreenhouseWeeklyTrendPointDto {
  greenhouseId?: string
  greenhouseName?: string
  week?: string
  weekKey?: string
  weekNumber?: number
  year?: number
  count?: number
  value?: number
}

export interface GreenhouseWeeklyTrendSeriesDto {
  greenhouseId?: string
  greenhouseName?: string
  points?: GreenhouseWeeklyTrendPointDto[]
  weeklyCounts?: GreenhouseWeeklyTrendPointDto[]
  values?: GreenhouseWeeklyTrendPointDto[]
}

export type GreenhouseWeeklyTrendResponse =
  | GreenhouseWeeklyTrendPointDto[]
  | GreenhouseWeeklyTrendSeriesDto[]

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
  reviewedComparisons: number
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
  farmId?: string
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
  latitude?: number
  longitude?: number
  defaultBayCount?: number
  defaultBenchesPerBay?: number
  defaultSpotChecksPerBench?: number
  fieldBlocks?: FarmFieldBlockDraftRequest[]
  greenhouses?: FarmGreenhouseDraftRequest[]
}

export interface FarmLayoutPreviewRequest {
  latitude: string
  longitude: string
  greenhouseCount: number
  greenhouseNames: string[]
}

export interface FarmLayoutPreviewPoint {
  x?: number | string | null
  y?: number | string | null
  lat?: number | string | null
  lng?: number | string | null
  latitude?: number | string | null
  longitude?: number | string | null
}

export interface FarmLayoutPreviewPolygon {
  id?: string
  name?: string
  label?: string
  greenhouseName?: string
  targetName?: string
  points?: FarmLayoutPreviewPoint[]
  polygon?: FarmLayoutPreviewPoint[]
  coordinates?: FarmLayoutPreviewPoint[]
}

export interface FarmLayoutPreviewResponse {
  polygons?: FarmLayoutPreviewPolygon[]
}

export interface GreenhouseBayRequest {
  bayTag: string
  bedCount: number
  bedTags?: string[]
}

export interface FarmGreenhouseDraftRequest {
  name: string
  description?: string
  spotChecksPerBench?: number | null
  areaHectares?: number | null
  active?: boolean
  bays?: GreenhouseBayRequest[]
}

export interface FarmFieldBlockDraftRequest {
  name: string
  description?: string
  bayCount?: number | null
  spotChecksPerBay?: number | null
  bayTags?: string[]
  areaHectares?: number | null
  cropType?: string
  active?: boolean
}

// Greenhouses (GREENHOUSE farms)
export interface GreenhouseBayResponse {
  position: number
  bayTag: string
  bedCount?: number | null
  bedTags?: string[]
}

export interface GreenhouseResponse {
  id: string
  farmId: string
  name: string
  description?: string
  structureType: FarmStructureType
  bayCount?: number
  benchesPerBay?: number
  spotChecksPerBench?: number
  bayTags?: string[]
  benchTags?: string[]
  areaHectares?: number | null
  bays?: GreenhouseBayResponse[]
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface DashboardOverviewFarmDto {
  farmId: string
  farmTag: string
  farmName: string
  licenseExpiryDate?: string | null
  daysUntilLicenseExpiry?: number | null
  accessLocked: boolean
}

export interface LicenseAlertDto {
  farmId: string
  farmName: string
  licenseExpiryDate?: string | null
  daysUntilExpiry?: number | null
  status: string
}

export interface DashboardOverviewDto {
  farmCount: number
  farms: DashboardOverviewFarmDto[]
  licenseAlerts: LicenseAlertDto[]
}

export interface CreateGreenhouseRequest {
  farmId: string
  name: string
  description?: string
  bayCount?: number | null
  benchesPerBay?: number | null
  spotChecksPerBench?: number | null
  areaHectares?: number | null
  bays?: GreenhouseBayRequest[]
  active?: boolean
}

export interface UpdateGreenhouseRequest {
  name?: string
  description?: string
  bayCount?: number | null
  benchesPerBay?: number | null
  spotChecksPerBench?: number | null
  areaHectares?: number | null
  bays?: GreenhouseBayRequest[]
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
  areaHectares?: number | null
  cropType?: string
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
  areaHectares?: number | null
  cropType?: string
  active?: boolean
}

export interface UpdateFieldBlockRequest {
  name?: string
  description?: string
  bayCount?: number | null
  spotChecksPerBay?: number | null
  bayTags?: string[]
  areaHectares?: number | null
  cropType?: string
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

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

export interface UpdateMyProfileRequest {
  firstName?: string
  lastName?: string
  phoneNumber?: string
  email?: string
}

export interface TemporaryPasswordRequest {
  temporaryPassword: string
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

// ─── Observation CRUD ────────────────────────────────────────────────────────

export interface CreateObservationRequest {
  sessionTargetId?: string
  greenhouseId?: string
  fieldBlockId?: string
  speciesCode?: SpeciesCode
  customSpeciesId?: string
  category: ObservationCategory
  bayIndex: number
  bayTag?: string
  benchIndex: number
  benchTag?: string
  spotIndex?: number
  count: number
  notes?: string
}

export interface UpdateObservationRequest {
  sessionTargetId?: string
  greenhouseId?: string
  fieldBlockId?: string
  speciesCode?: SpeciesCode
  customSpeciesId?: string
  category?: ObservationCategory
  bayIndex?: number
  bayTag?: string
  benchIndex?: number
  benchTag?: string
  spotIndex?: number
  count?: number
  notes?: string
  version?: number
}

export interface ScoutingPhotoDto {
  id: string
  sessionId: string
  observationId?: string | null
  sessionTargetId?: string | null
  farmId: string
  bayIndex?: number | null
  bayTag?: string | null
  benchIndex?: number | null
  benchTag?: string | null
  spotIndex?: number | null
  localPhotoId: string
  purpose?: string | null
  objectKey?: string | null
  sourceType: string
  capturedAt?: string | null
  updatedAt?: string | null
  syncStatus: string
}

export interface RegisterScoutingPhotoRequest {
  sessionId: string
  observationId?: string
  sessionTargetId?: string
  bayIndex?: number
  bayTag?: string
  benchIndex?: number
  benchTag?: string
  spotIndex?: number
  localPhotoId: string
  purpose?: string
  sourceType?: string
  capturedAt?: string
}

export interface RegisterScoutingPhotoResponse extends ScoutingPhotoDto {
  uploadUrl?: string
  uploadMethod?: string
  uploadHeaders?: Record<string, string>
}

export interface ConfirmScoutingPhotoRequest {
  sessionId: string
  localPhotoId: string
  objectKey: string
}

// ─── Session Audit ────────────────────────────────────────────────────────────

export type SessionAuditAction =
  | 'SESSION_CREATED'
  | 'SESSION_VIEWED'
  | 'SESSION_EDITED'
  | 'SESSION_REMOTE_START_REQUESTED'
  | 'SESSION_STARTED'
  | 'SESSION_SUBMITTED'
  | 'SESSION_COMPLETED'
  | 'SESSION_REOPENED'
  | 'SESSION_MARKED_INCOMPLETE'

export interface ScoutingSessionAuditDto {
  id: string
  sessionId: string
  action: SessionAuditAction
  actorId?: string
  actorName?: string
  actorEmail?: string
  actorRole?: string
  deviceId?: string
  deviceType?: string
  location?: string
  comment?: string
  occurredAt: string
  syncStatus?: string
}
