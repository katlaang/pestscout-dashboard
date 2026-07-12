# Frontend Implementation Guide: Regional Analyst & Authority Alerts

**Phase 1** — Manual curation, pull-based delivery. No external data sources or push notifications.

---

## 1. Overview

Two independent features using shared backend APIs:

1. **Regional Analyst Dashboard** — browse pest/disease activity by country/state, view maps, reports, trends
2. **Authority Alerts** — curated notices shown to farmers and analysts

### Backend API Endpoints

All endpoints require `Authorization: Bearer <token>`

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| **POST** | `/api/authority-alerts` | Create alert | Alert Curator / Super Admin |
| **PUT** | `/api/authority-alerts/{alertId}` | Update alert | Alert Curator / Super Admin |
| **GET** | `/api/authority-alerts/regions?country=US&state=CA,NY` | Browse alerts by region | Regional Analyst / Super Admin |
| **GET** | `/api/authority-alerts/emergency` | Emergency feed (all regions) | Regional Analyst / Super Admin |
| **GET** | `/api/authority-alerts/farms/{farmId}` | Alerts for a specific farm | Any authenticated user with farm access |
| **GET** | `/api/authority-alerts/map/countries` | Country-level coverage | Regional Analyst / Super Admin |
| **GET** | `/api/authority-alerts/map/countries/{country}/states` | State-level coverage | Regional Analyst / Super Admin |

---

## 2. Data Models / TypeScript Interfaces

```typescript
// Authority Alert enums
enum AuthorityAlertType {
  NEW_DETECTION = 'NEW_DETECTION',
  ADVISORY = 'ADVISORY',
  OUTBREAK = 'OUTBREAK',
  QUARANTINE = 'QUARANTINE',
  ERADICATION_COMPLETE = 'ERADICATION_COMPLETE',
  OTHER = 'OTHER'
}

enum AuthorityAlertSeverity {
  ADVISORY = 'ADVISORY',
  WATCH = 'WATCH',
  WARNING = 'WARNING',
  EMERGENCY = 'EMERGENCY'
}

enum SpeciesCode {
  // Pests
  THRIPS = 'THRIPS',
  RED_SPIDER_MITE = 'RED_SPIDER_MITE',
  WHITEFLIES = 'WHITEFLIES',
  MEALYBUGS = 'MEALYBUGS',
  CATERPILLARS = 'CATERPILLARS',
  FALSE_CODLING_MOTH = 'FALSE_CODLING_MOTH',
  PEST_OTHER = 'PEST_OTHER',
  // Diseases
  DOWNY_MILDEW = 'DOWNY_MILDEW',
  POWDERY_MILDEW = 'POWDERY_MILDEW',
  BOTRYTIS = 'BOTRYTIS',
  VERTICILLIUM = 'VERTICILLIUM',
  BACTERIAL_WILT = 'BACTERIAL_WILT',
  DISEASE_OTHER = 'DISEASE_OTHER',
  // Beneficial
  BENEFICIAL_PP = 'BENEFICIAL_PP',
  BENEFICIAL_OTHER = 'BENEFICIAL_OTHER'
}

// Responses from backend

interface AuthorityAlertResponse {
  id: string; // UUID
  alertType: AuthorityAlertType;
  severity: AuthorityAlertSeverity;
  issuingAuthority: string; // e.g. "USDA-APHIS"
  title: string;
  messageBody: string;
  suggestedMitigation: string; // User-entered OR default by type
  country: string; // Canonical: "United States", "Canada", "Mexico"
  state: string | null; // Canonical state/province name, or null for whole-country alert
  linkedSpecies: SpeciesCode | null;
  sourceUrl: string | null;
  issuedDate: string; // ISO 8601 date
  expiryDate: string | null; // ISO 8601 date
  active: boolean; // Curator can deactivate without deleting
  highlighted: boolean; // TRUE if alert is OUTBREAK or EMERGENCY (for farmer view only)
  createdAt: string; // ISO 8601 datetime
  updatedAt: string; // ISO 8601 datetime
}

interface AlertCoverageDto {
  name: string; // Country name or state/province name
  activeAlertCount: number;
}

// Requests to backend

interface AuthorityAlertUpsertRequest {
  alertType: AuthorityAlertType; // Required
  severity: AuthorityAlertSeverity; // Required
  issuingAuthority: string; // Required, trimmed
  title: string; // Required, trimmed
  messageBody: string; // Required, trimmed
  suggestedMitigation?: string; // Optional; if empty, backend fills default
  country: string; // Required, validated against {US, Canada, Mexico}
  state?: string; // Optional; if provided, validated against country's state list
  linkedSpecies?: SpeciesCode; // Optional
  sourceUrl?: string; // Optional
  issuedDate: string; // Required, ISO date
  expiryDate?: string; // Optional, ISO date; must be >= issuedDate
  active: boolean; // Required
}
```

### Supported Regions (reference for UI validation/dropdowns)

**United States** (50 states + DC):
Alabama, Alaska, Arizona, Arkansas, California, Colorado, Connecticut, Delaware, District of Columbia, Florida, Georgia, Hawaii, Idaho, Illinois, Indiana, Iowa, Kansas, Kentucky, Louisiana, Maine, Maryland, Massachusetts, Michigan, Minnesota, Mississippi, Missouri, Montana, Nebraska, Nevada, New Hampshire, New Jersey, New Mexico, New York, North Carolina, North Dakota, Ohio, Oklahoma, Oregon, Pennsylvania, Rhode Island, South Carolina, South Dakota, Tennessee, Texas, Utah, Vermont, Virginia, Washington, West Virginia, Wisconsin, Wyoming

**Canada** (13 provinces/territories):
Alberta, British Columbia, Manitoba, New Brunswick, Newfoundland and Labrador, Northwest Territories, Nova Scotia, Nunavut, Ontario, Prince Edward Island, Quebec, Saskatchewan, Yukon

**Mexico** (31 states):
Aguascalientes, Baja California, Baja California Sur, Campeche, Chiapas, Chihuahua, Coahuila, Colima, Durango, Guanajuato, Guerrero, Hidalgo, Jalisco, Mexico City, Michoacan, Morelos, Nayarit, Nuevo Leon, Oaxaca, Puebla, Queretaro, Quintana Roo, San Luis Potosi, Sinaloa, Sonora, State of Mexico, Tabasco, Tamaulipas, Tlaxcala, Veracruz, Yucatan, Zacatecas

---

## 3. Authentication & Authorization

### User Roles & Permissions

```typescript
enum UserRole {
  SCOUT = 'SCOUT',
  MANAGER = 'MANAGER',
  FARM_ADMIN = 'FARM_ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
  REGIONAL_ANALYST = 'REGIONAL_ANALYST',
  EDGE_SYNC = 'EDGE_SYNC'
}

interface UserPermissions {
  // Regional Analyst features
  canBrowseRegionalAlerts: boolean; // REGIONAL_ANALYST or SUPER_ADMIN
  canViewEmergencyFeed: boolean; // REGIONAL_ANALYST or SUPER_ADMIN
  canViewCountryMap: boolean; // REGIONAL_ANALYST or SUPER_ADMIN
  
  // Alert Curator features
  canCurateAlerts: boolean; // SUPER_ADMIN or user.authorityAlertCurator === true
  
  // Farmer features
  canViewFarmAlerts: boolean; // Any farm role (SCOUT, MANAGER, FARM_ADMIN)
}

// Helper: compute permissions from current user
function getUserPermissions(user: CurrentUser): UserPermissions {
  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const isAnalyst = user.role === 'REGIONAL_ANALYST';
  const isCurator = isSuperAdmin || user.authorityAlertCurator === true;
  
  return {
    canBrowseRegionalAlerts: isAnalyst || isSuperAdmin,
    canViewEmergencyFeed: isAnalyst || isSuperAdmin,
    canViewCountryMap: isAnalyst || isSuperAdmin,
    canCurateAlerts: isCurator,
    canViewFarmAlerts: !!user.farmId // Simple check; farm access is validated server-side
  };
}
```

### Backend Authorization Errors

The backend will return **403 Forbidden** if:
- Non-curator tries to create/update an alert
- Non-analyst tries to browse regional alerts or view emergency feed
- Non-farm-member tries to view farm alerts

Handle these gracefully in the frontend:
```typescript
if (error.status === 403) {
  showToast('error', 'You do not have permission to access this resource.');
  redirectTo('/dashboard'); // or '/farms' or wherever is appropriate
}
```

---

## 4. Features & Screens

### 4A. Regional Analyst Dashboard

**Access:** REGIONAL_ANALYST or SUPER_ADMIN role

**Route:** `/regional-analyst` (or `/analyst/dashboard`)

#### Screen Components:

1. **Navigation / Region Selector Panel** (left or top)
   - Show 3 country buttons: United States, Canada, Mexico
   - Allow multi-select of states within chosen country
   - Show "Select All States" shortcut
   - Persist selection to localStorage as "My Area" default
   - Button to restore "My Area" default

2. **Main Content Area** (tabs or sub-navigation)
   
   **Tab 1: Map View**
   - Display North America map (use a mapping library like Mapbox, Leaflet, or similar)
   - Highlight each country/state that has at least one active alert
   - Color code by alert severity (red=EMERGENCY, orange=WARNING, yellow=WATCH, blue=ADVISORY)
   - Clicking a country drills down to state/province level
   - Clicking a state shows the alert list for that state
   - Show count of active alerts per country/state as overlay or tooltip
   
   **Tab 2: Alerts List**
   - Display all active alerts matching the selected region(s)
   - Sort by: severity (EMERGENCY first) → issued date (newest first)
   - For each alert, show:
     - Badge: severity (color-coded)
     - Title
     - Issued date
     - Issuing authority
     - State/province (if not whole-country)
     - Expandable detail: message body, suggested mitigation, linked species, source URL
   - Link to full alert detail view on click
   
   **Tab 3: Trends / Reports**
   - Weekly rollup: count of each alert type by severity, by state
   - Chart: alerts over time (7d / 30d / 90d)
   - *(Backend is designed to recompute on-demand; denormalized tables are future optimization)*

3. **Emergency Alerts Feed** (always-visible sidebar or banner)
   - Dedicated section showing all SEVERITY=EMERGENCY alerts across **all regions**, regardless of analyst's current region selection
   - Update frequency: poll every 30-60 seconds, or use WebSocket if available
   - Show count badge
   - Clicking any alert shows full detail
   - Button to clear/dismiss individual alerts from view (frontend only; doesn't delete from server)

#### API Integration:

```typescript
// Fetch alerts for selected region(s)
async function getRegionalAlerts(country: string, states: string[]): Promise<AuthorityAlertResponse[]> {
  const params = new URLSearchParams({ country });
  states.forEach(s => params.append('state', s));
  const response = await fetch(`/api/authority-alerts/regions?${params}`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  return response.json();
}

// Fetch emergency feed (all regions)
async function getEmergencyFeed(): Promise<AuthorityAlertResponse[]> {
  const response = await fetch('/api/authority-alerts/emergency', {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  return response.json();
}

// Fetch country coverage for map rendering
async function getCountryCoverage(): Promise<AlertCoverageDto[]> {
  const response = await fetch('/api/authority-alerts/map/countries', {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  return response.json();
}

// Fetch state coverage for a specific country
async function getStateCoverage(country: string): Promise<AlertCoverageDto[]> {
  const response = await fetch(`/api/authority-alerts/map/countries/${encodeURIComponent(country)}/states`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  return response.json();
}
```

#### State Management (Zustand / Redux / Context):

```typescript
interface RegionalAnalystState {
  selectedCountry: string; // "United States" | "Canada" | "Mexico"
  selectedStates: string[]; // e.g., ["California", "New York"]
  myAreaDefault: { country: string; states: string[] }; // Saved preference
  
  alerts: AuthorityAlertResponse[];
  emergencyAlerts: AuthorityAlertResponse[];
  countryCoverage: AlertCoverageDto[];
  stateCoverage: AlertCoverageDto[];
  
  activeTab: 'map' | 'alerts' | 'trends';
  
  loading: boolean;
  error: string | null;
  
  setSelectedCountry: (country: string) => void;
  setSelectedStates: (states: string[]) => void;
  saveMyArea: () => void;
  restoreMyArea: () => void;
  fetchAlerts: () => Promise<void>;
  fetchEmergencyFeed: () => Promise<void>;
  fetchMapCoverage: () => Promise<void>;
  setActiveTab: (tab: 'map' | 'alerts' | 'trends') => void;
}
```

---

### 4B. Alert Curator Interface

**Access:** SUPER_ADMIN or user with `authorityAlertCurator === true`

**Route:** `/alerts/curator` (or `/admin/alerts/manage`)

#### Screen Components:

1. **Alert Management List**
   - Table view: all alerts (active and inactive)
   - Columns: Type, Severity, Title, Country, State, Issued Date, Expiry Date, Active (toggle), Actions
   - Filter by: type, severity, country, state, active/inactive
   - Sort by: created date (newest first), severity, issued date
   - Search box: title, issuing authority, message body
   - Bulk actions: activate/deactivate multiple at once

2. **Create/Edit Alert Form**
   - Modal or dedicated page
   - Fields (with validation):
     - Alert Type (dropdown): NEW_DETECTION, ADVISORY, OUTBREAK, QUARANTINE, ERADICATION_COMPLETE, OTHER
     - Severity (dropdown): ADVISORY, WATCH, WARNING, EMERGENCY
     - Issuing Authority (text): e.g., "USDA-APHIS"
     - Title (text)
     - Message Body (rich text or textarea)
     - Suggested Mitigation (textarea) — **Leave blank to use default**
       - Show preview of default mitigation below the field
       - Update preview in real-time as alert type changes
     - Country (dropdown): {US, Canada, Mexico}
     - State/Province (dropdown, conditional on country)
       - Show "Whole country" option (leave state empty)
     - Linked Species (dropdown, optional)
     - Source URL (text, optional)
     - Issued Date (date picker, required)
     - Expiry Date (date picker, optional)
       - Validate: expiry >= issued date
     - Active (toggle, default = true)
   - Submit button: "Save Alert"
   - Cancel button

3. **Alert Detail / History View** *(optional, nice-to-have)*
   - Show full alert details
   - Show created at, updated at, created by (if audit trail available)
   - Show edit history (if available)

#### API Integration:

```typescript
// Create a new alert
async function createAlert(request: AuthorityAlertUpsertRequest): Promise<AuthorityAlertResponse> {
  const response = await fetch('/api/authority-alerts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  });
  if (!response.ok) throw new Error('Failed to create alert');
  return response.json();
}

// Update an alert
async function updateAlert(alertId: string, request: AuthorityAlertUpsertRequest): Promise<AuthorityAlertResponse> {
  const response = await fetch(`/api/authority-alerts/${alertId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  });
  if (!response.ok) throw new Error('Failed to update alert');
  return response.json();
}

// Default mitigations (cached locally or fetched)
const DEFAULT_MITIGATIONS: Record<AuthorityAlertType, string> = {
  NEW_DETECTION: 'Increase monitoring frequency and confirm any suspicious findings immediately.',
  ADVISORY: 'Review the advisory details and align current monitoring and hygiene practices.',
  OUTBREAK: 'Inspect affected production areas urgently and isolate suspect material where feasible.',
  QUARANTINE: 'Follow quarantine restrictions exactly and pause movements that could spread the threat.',
  ERADICATION_COMPLETE: 'Resume normal operations carefully while maintaining verification monitoring.',
  OTHER: 'Review the notice and apply local authority guidance to farm operations.'
};
```

---

### 4C. Farmer-Facing Alerts

**Access:** Any authenticated user viewing their farm (SCOUT, MANAGER, FARM_ADMIN)

**Location:** Integrated into existing Farm View / Dashboard

#### Screen Components:

1. **Alerts Card / Section** (on farm dashboard or sub-tab)
   - Show all active authority alerts matching the farm's country/state
   - **Prioritization:**
     - OUTBREAK or EMERGENCY alerts appear first (highlighted with red/orange badge)
     - Then sorted by severity (EMERGENCY, WARNING, WATCH, ADVISORY)
     - Then by issued date (newest first)
   - For each alert, show:
     - Severity badge (color-coded, bigger/bolder for OUTBREAK/EMERGENCY)
     - Alert type badge
     - Title
     - Issuing authority
     - Issued date
     - Expandable detail: message body, suggested mitigation, linked species, source URL, expiry date
   - If no alerts, show "No active alerts for your region"

2. **Full Alert Detail Modal**
   - Show when alert is clicked
   - All fields from alert response
   - Close button

#### API Integration:

```typescript
// Fetch alerts for a specific farm
async function getFarmAlerts(farmId: string): Promise<AuthorityAlertResponse[]> {
  const response = await fetch(`/api/authority-alerts/farms/${farmId}`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  if (!response.ok) throw new Error('Failed to fetch farm alerts');
  return response.json();
}

// Call this when:
// - User navigates to farm view
// - Farm view loads / component mounts
// - Periodically (every 1-5 minutes) to catch new alerts
```

#### Highlighting Logic (Frontend):

```typescript
interface HighlightedAlert extends AuthorityAlertResponse {
  highlightLevel: 'critical' | 'high' | 'normal';
}

function highlightFarmAlerts(alerts: AuthorityAlertResponse[]): HighlightedAlert[] {
  return alerts
    .map(alert => ({
      ...alert,
      highlightLevel: (alert.highlighted || alert.alertType === 'OUTBREAK' || alert.severity === 'EMERGENCY')
        ? 'critical'
        : alert.severity === 'WARNING' || alert.severity === 'WATCH'
        ? 'high'
        : 'normal'
    }))
    .sort((a, b) => {
      // Sort by highlight level first
      const levelOrder = { critical: 0, high: 1, normal: 2 };
      if (levelOrder[a.highlightLevel] !== levelOrder[b.highlightLevel]) {
        return levelOrder[a.highlightLevel] - levelOrder[b.highlightLevel];
      }
      // Then by severity
      const severityOrder = { EMERGENCY: 0, WARNING: 1, WATCH: 2, ADVISORY: 3 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      // Then by issued date (newest first)
      return new Date(b.issuedDate).getTime() - new Date(a.issuedDate).getTime();
    });
}
```

---

## 5. UI/UX Styling Guidelines

### Color Coding for Severity

Use consistent color palette across all alert displays:

```css
/* Severity Badge Colors */
.severity-emergency {
  background-color: #dc2626; /* Red */
  color: white;
}
.severity-warning {
  background-color: #ea580c; /* Orange */
  color: white;
}
.severity-watch {
  background-color: #eab308; /* Yellow */
  color: #000;
}
.severity-advisory {
  background-color: #3b82f6; /* Blue */
  color: white;
}

/* Alert Type Badge Colors (secondary) */
.alert-type-outbreak {
  background-color: #be185d; /* Pink */
  color: white;
}
.alert-type-quarantine {
  background-color: #7c2d12; /* Brown */
  color: white;
}
.alert-type-new-detection {
  background-color: #4f46e5; /* Indigo */
  color: white;
}
.alert-type-advisory {
  background-color: #6b7280; /* Gray */
  color: white;
}
/* etc. for other types */
```

### Farmer Alert Card (Critical)

When alert is highlighted (OUTBREAK or EMERGENCY):
```css
.alert-card-critical {
  border-left: 6px solid #dc2626; /* Red */
  background-color: #fef2f2; /* Very light red */
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(220, 38, 38, 0.15);
}
```

### Regional Analyst Map

- Country with alerts: slightly highlighted with alert count overlay
- State with alerts: highlighted, with count overlay
- Hovering over country/state shows tooltip with alert summary
- Clicking drills down (country → states) or shows alert list (state)

---

## 6. Error Handling & Edge Cases

### Network Errors
```typescript
async function safeFetchAlerts(country: string, states: string[]) {
  try {
    setLoading(true);
    const alerts = await getRegionalAlerts(country, states);
    setAlerts(alerts);
    setError(null);
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
      setError('Network error. Please check your connection and try again.');
    } else {
      setError('Failed to load alerts. Please try again later.');
    }
  } finally {
    setLoading(false);
  }
}
```

### 403 Forbidden / Auth Errors
```typescript
async function safeFetchWithAuthCheck(fn: () => Promise<any>) {
  try {
    return await fn();
  } catch (err) {
    if (err.status === 403) {
      // Redirect to login or dashboard
      redirectTo('/login');
    } else if (err.status === 401) {
      // Token expired; refresh or re-login
      await refreshToken(); // or redirect to login
    }
    throw err;
  }
}
```

### Validation Errors
When creating/updating an alert, the backend returns **400 Bad Request** with validation details:
```json
{
  "error": "Bad request",
  "details": {
    "expiryDate": "Expiry date cannot be before issued date."
  }
}
```

Display validation errors inline on form:
```typescript
function AlertForm() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  async function handleSubmit(data: AuthorityAlertUpsertRequest) {
    try {
      await createAlert(data);
      showToast('success', 'Alert created successfully.');
      navigateTo('/alerts/list');
    } catch (err) {
      if (err.status === 400 && err.details) {
        setErrors(err.details);
      } else {
        showToast('error', 'Failed to create alert.');
      }
    }
  }
  
  return (
    <form onSubmit={handleSubmit}>
      {/* Fields */}
      <input name="title" onChange={...} />
      {errors.title && <span className="error">{errors.title}</span>}
      {/* etc. */}
    </form>
  );
}
```

### Empty States
- **Regional Analyst, no alerts:** "No active alerts for the selected region(s). Check back soon!"
- **Farmer, no alerts:** "No active alerts for your region. Stay vigilant!"
- **Emergency Feed, no emergencies:** "No emergency alerts at this time."

### Date Handling
- Always use ISO 8601 format (YYYY-MM-DD) for date fields
- Parse and display in user's local timezone/format
- For date pickers, use HTML5 `<input type="date">` or date picker library

---

## 7. Performance Considerations

### Polling & Caching

**Emergency Feed Polling:**
- Poll every 30-60 seconds while analyst dashboard is open
- Cancel polling when user navigates away
- Cache the response; only re-fetch if poll timeout reaches

```typescript
function useEmergencyFeedPolling(intervalMs = 45000) {
  const [alerts, setAlerts] = useState<AuthorityAlertResponse[]>([]);
  const pollIntervalRef = useRef<number | null>(null);
  
  useEffect(() => {
    async function poll() {
      try {
        const latest = await getEmergencyFeed();
        setAlerts(latest);
      } catch (err) {
        console.error('Emergency feed poll failed:', err);
      }
    }
    
    poll(); // Initial fetch
    pollIntervalRef.current = window.setInterval(poll, intervalMs);
    
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [intervalMs]);
  
  return alerts;
}
```

**Regional Alerts Caching:**
- Cache by `[country, states].join(',')` key
- Invalidate cache when user changes region selection
- Re-fetch after 2-5 minutes

### Lazy Loading
- Load map/chart libraries only when Regional Analyst tab is active
- Load alerts list after map is rendered (don't block map rendering)

---

## 8. State Management Structure (Example: Zustand)

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface RegionalAnalystStore {
  // Region selection
  selectedCountry: string;
  selectedStates: string[];
  myArea: { country: string; states: string[] } | null;
  
  // Data
  alerts: AuthorityAlertResponse[];
  emergencyAlerts: AuthorityAlertResponse[];
  countryCoverage: AlertCoverageDto[];
  stateCoverage: AlertCoverageDto[];
  
  // UI
  activeTab: 'map' | 'alerts' | 'trends';
  selectedAlertId: string | null;
  
  // Loading states
  alertsLoading: boolean;
  emergencyLoading: boolean;
  mapCoverageLoading: boolean;
  
  // Error states
  alertsError: string | null;
  emergencyError: string | null;
  
  // Actions
  setSelectedCountry: (country: string) => void;
  setSelectedStates: (states: string[]) => void;
  saveMyArea: () => void;
  loadMyArea: () => void;
  fetchAlerts: () => Promise<void>;
  fetchEmergencyAlerts: () => Promise<void>;
  fetchMapCoverage: () => Promise<void>;
  setActiveTab: (tab: 'map' | 'alerts' | 'trends') => void;
  selectAlert: (alertId: string | null) => void;
}

export const useRegionalAnalystStore = create<RegionalAnalystStore>()(
  persist(
    (set, get) => ({
      selectedCountry: 'United States',
      selectedStates: [],
      myArea: null,
      alerts: [],
      emergencyAlerts: [],
      countryCoverage: [],
      stateCoverage: [],
      activeTab: 'map',
      selectedAlertId: null,
      alertsLoading: false,
      emergencyLoading: false,
      mapCoverageLoading: false,
      alertsError: null,
      emergencyError: null,
      
      setSelectedCountry: (country) => set({ selectedCountry: country, selectedStates: [] }),
      setSelectedStates: (states) => set({ selectedStates: states }),
      
      saveMyArea: () => {
        const { selectedCountry, selectedStates } = get();
        set({ myArea: { country: selectedCountry, states: selectedStates } });
      },
      
      loadMyArea: () => {
        const { myArea } = get();
        if (myArea) {
          set({ selectedCountry: myArea.country, selectedStates: myArea.states });
        }
      },
      
      fetchAlerts: async () => {
        set({ alertsLoading: true, alertsError: null });
        try {
          const { selectedCountry, selectedStates } = get();
          const alerts = await getRegionalAlerts(selectedCountry, selectedStates);
          set({ alerts, alertsError: null });
        } catch (err) {
          set({ alertsError: 'Failed to load alerts' });
        } finally {
          set({ alertsLoading: false });
        }
      },
      
      fetchEmergencyAlerts: async () => {
        set({ emergencyLoading: true, emergencyError: null });
        try {
          const emergencyAlerts = await getEmergencyFeed();
          set({ emergencyAlerts, emergencyError: null });
        } catch (err) {
          set({ emergencyError: 'Failed to load emergency alerts' });
        } finally {
          set({ emergencyLoading: false });
        }
      },
      
      fetchMapCoverage: async () => {
        set({ mapCoverageLoading: true });
        try {
          const coverage = await getCountryCoverage();
          set({ countryCoverage: coverage });
        } finally {
          set({ mapCoverageLoading: false });
        }
      },
      
      setActiveTab: (tab) => set({ activeTab: tab }),
      selectAlert: (alertId) => set({ selectedAlertId: alertId })
    }),
    {
      name: 'regional-analyst-store',
      partialize: (state) => ({
        myArea: state.myArea,
        selectedCountry: state.selectedCountry,
        selectedStates: state.selectedStates
      })
    }
  )
);
```

---

## 9. Testing Checklist

### Authentication / Authorization

- [ ] Non-analyst user cannot access `/regional-analyst` (403 or redirect)
- [ ] Non-curator user cannot access alert creation form (403 or hidden)
- [ ] Super Admin can access all features
- [ ] Curator can create/edit alerts but not access other admin features

### Regional Analyst Features

- [ ] Country selector updates state selector options
- [ ] Multi-state selection works (add/remove states, "select all")
- [ ] "Save My Area" persists selection to localStorage
- [ ] "Load My Area" restores saved selection
- [ ] Map displays countries with at least one alert
- [ ] Clicking country drills to state view
- [ ] Clicking state shows alert list
- [ ] Emergency feed displays EMERGENCY severity alerts only
- [ ] Emergency feed updates every 30-60 seconds
- [ ] Emergency feed always shows all regions, regardless of analyst's current selection
- [ ] Alert list sorted by severity → issued date
- [ ] Pagination/infinite scroll works if many alerts

### Alert Curator Features

- [ ] Alert form validates all required fields
- [ ] Expiry date validation: cannot be before issued date
- [ ] Suggested Mitigation defaults correctly when left blank
- [ ] Default mitigation updates in real-time as alert type changes
- [ ] Create alert succeeds and redirects to alert list
- [ ] Update alert succeeds and shows confirmation
- [ ] Deactivate alert removes it from farmer view
- [ ] Re-activate alert shows it again
- [ ] State dropdown only shows states valid for chosen country

### Farmer-Facing Alerts

- [ ] Farm alerts show only alerts matching farm's country/state
- [ ] OUTBREAK and EMERGENCY alerts appear first (highlighted)
- [ ] Clicking alert shows full detail modal
- [ ] No alerts shows appropriate empty state
- [ ] Alerts update when farm view loads
- [ ] Alerts poll periodically if farm view is kept open

### Error Handling

- [ ] 403 Forbidden handled gracefully (redirect or message)
- [ ] Network error shows retry option
- [ ] Validation errors display inline
- [ ] Empty state messages are clear and actionable

### Edge Cases

- [ ] Null/empty state for whole-country alerts
- [ ] Very long alert titles/messages don't break layout
- [ ] Timezone handling correct for dates
- [ ] Special characters in alert text display correctly

---

## 10. Deployment & Launch Checklist

Before going live:

- [ ] All endpoints tested against backend (dev/staging environment)
- [ ] Permission checks enforced (no curator access without flag, etc.)
- [ ] Error messages are user-friendly (no stack traces in UI)
- [ ] Loading states show spinners/skeletons
- [ ] Mobile responsiveness tested (esp. map view on tablet/phone)
- [ ] Accessibility checked (WCAG 2.1 Level AA)
  - [ ] Color not sole indicator of severity (use badges + icons)
  - [ ] Keyboard navigation works
  - [ ] Screen reader friendly (aria labels on map, badge descriptions)
- [ ] Performance: page loads in < 3 seconds
- [ ] Date/time display in user's local format
- [ ] Polling gracefully handles network interruption (reconnect after 1 min)
- [ ] Docstring/comments added for complex components
- [ ] All secrets (API base URL, token storage) use secure patterns
- [ ] No hardcoded test data in production build

---

## 11. Future Enhancements (Post-Phase-1)

- Push notifications / email delivery of alerts to farmers
- External data source integrations (USDA-APHIS API, web scraping)
- Denormalized weekly rollup tables (performance optimization)
- Export alerts to CSV/PDF
- Alert analytics dashboard (trends, distribution by type/severity/region)
- Audit trail of alert changes (created by, modified by, timestamps)
- Per-curator authorship locking (if policy changes)
- Bulk import of alerts from file

