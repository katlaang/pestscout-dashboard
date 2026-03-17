# PestScout Web Dashboard

Manager-facing React web application for the PestScout platform. Connects to the Spring Boot backend and provides farm oversight, heat map visualisation, session review, analytics, and a full Super Admin control panel.

## Stack

- **React 18** + TypeScript
- **Vite 5** — build tool and dev server
- **React Router v6** — client-side routing
- **Recharts** — bar, area, and pie charts
- **Zustand** — auth state + alert count (persisted)
- **Axios** — HTTP client with JWT interceptors and automatic token refresh
- **Tailwind CSS** — utility classes
- **DM Sans / DM Mono** — typography (Google Fonts)

## Pages

| Route | Page | Roles | Description |
|---|---|---|---|
| `/login` | Login | All | JWT authentication |
| `/` | Dashboard | All | KPIs, heat map preview, alerts, trends, recommendations |
| `/farms` | Farms | All | Farm cards with license status; SUPER_ADMIN can edit |
| `/sessions` | Sessions | All | Filterable session list + CSV export |
| `/sessions/:id` | Session detail | All | Full observations, complete/reopen/cancel, CSV export |
| `/analytics` | Analytics | All | Weekly trends, severity area chart, scout performance, farm comparison |
| `/heatmap` | Heat maps | All | Full bay/bench grid per greenhouse, week picker |
| `/alerts` | Alerts | All | All high-severity detections, filterable by severity |
| `/settings` | Settings | All | Account info + API URL override |
| `/admin` | Super Admin | SUPER_ADMIN only | Farms, users, cache management |

## Super Admin capabilities

The `/admin` page is only visible to `SUPER_ADMIN` role users. It provides:

**Farms tab**
- View all farms globally
- Create new farms (name, tier, country, contact info)
- Update license: status, tier, area, start/expiry dates, billing email, auto-renew
- Lock / unlock farm access
- Create and delete greenhouses and field blocks (name, type, bay count, benches/bay)
- View all farm members with roles

**Users tab**
- Search/filter users across all farms by email and role
- Create any user (SUPER_ADMIN, FARM_ADMIN, MANAGER, SCOUT)
- Enable / disable users
- Paginated with "Load more" for large deployments

**Cache tab**
- View Redis cache stats (keys, hit rate, evictions)
- Clear individual named caches or all caches at once

## Getting started

### Prerequisites

- Node.js 18+
- PestScout Spring Boot backend running (default: `http://localhost:8080`)

### Install and run

```bash
npm install
cp .env.example .env
# Edit VITE_API_URL if your backend is not on localhost:8080
npm run dev
# → http://localhost:3000
```

### Build for production

```bash
npm run build
# Output in dist/
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8080` | Base URL of the Spring Boot backend |

## Backend CORS config

Ensure your Spring Boot `application.yml` allows the dashboard origin:

```yaml
app:
  cors:
    allowed-origins: http://localhost:3000,http://localhost:19006
```

## Deploying to Vercel / Netlify

1. Push this folder to a Git repository
2. Set `VITE_API_URL` as an environment variable pointing to your production backend
3. Build command: `npm run build`
4. Output directory: `dist`

## Project structure

```
src/
  components/
    layout/          # AppLayout (with top header bar), Sidebar, ProtectedRoute
    dashboard/       # KpiCard, HeatmapGrid (hover tooltips), AlertCard
    scouting/        # SessionsTable
  hooks/
    useAuth.ts       # Zustand auth store (persisted)
    useAlertCount.ts # Global alert badge count
  pages/
    LoginPage
    DashboardPage    # KPIs + heatmap + alerts + trends + recommendations
    FarmsPage        # Farm list with inline edit (super admin)
    SessionsPage     # Filterable table + CSV export
    SessionDetailPage # Observations + complete/reopen/cancel + CSV export
    AnalyticsPage    # Charts + scout performance + farm comparison
    HeatmapPage      # Full bay/bench grid, structure selector
    AlertsPage       # Dedicated alert list with severity filter + badge
    SettingsPage     # Account + API URL
    SuperAdminPage   # Farms / Users / Cache tabs (SUPER_ADMIN only)
  services/
    api.ts           # All Axios calls, JWT interceptors, auto token refresh
  types/
    index.ts         # TypeScript interfaces matching backend DTOs exactly
  utils/
    index.ts         # Severity colors, labels, formatters, CSV export
```
