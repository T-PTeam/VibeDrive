## Routes + Map (In-app navigation)

This document explains how in-app routing works: **Route Setup → Active Route → In-app Map → Steps → Step progression + voice prompts**.

### Terms

- **ActiveRoute**: the user’s current route (origin city → destination city + capacity).
  - Mobile DTO: `mobile-app/src/types/loads.ts` → `ActiveRouteDto`
- **Navigation Route**: computed driving route geometry + step-by-step instructions.
  - Mobile DTO: `mobile-app/src/types/navigation.ts` → `RouteResultDto`

---

## Mobile app behavior

### 1) Create / update the active route

- Screen: `mobile-app/src/screens/RouteSetupScreen.tsx`
- Calls: `loadsService.startMonitoring(...)`
- Service: `mobile-app/src/services/LoadsService.ts`
  - `POST {EXPO_PUBLIC_PHP_API_URL}/v1/driver/route`
  - Body includes `dest_city`, `weight_kg`, `volume_m3`, optional `origin_city`

### 2) Show active route and open navigation

- Screen: `mobile-app/src/screens/DriveScreen.tsx`
- Loads active route:
  - `GET {EXPO_PUBLIC_PHP_API_URL}/v1/driver/route?user_id=...`
- The header provides:
  - **Route**: opens Route Setup
  - **Navigate**: opens in-app navigation using the active route’s `origin_city` and `dest_city`

### 3) In-app navigation screen

- Screen: `mobile-app/src/screens/NavigationScreen.tsx`
- Fetches directions using the .NET API navigation proxy:
  - Service: `mobile-app/src/services/NavigationService.ts`
  - `POST {EXPO_PUBLIC_API_URL}/api/v1/navigation/route`
    - `{ "origin_query": "...", "dest_query": "..." }`
- Renders:
  - Component: `mobile-app/src/components/NavigationMap.tsx`
  - Map + polyline + origin/destination markers + step list

### 4) Step progression and voice prompts

In `mobile-app/src/screens/NavigationScreen.tsx`:

- Watches GPS (foreground) via `expo-location`.
- Advances to the next step when the device is close to the current step’s end point.
- Speaks step instructions using `expo-speech`.

Notes:
- Foreground-only (no background navigation).
- This is a lightweight turn-by-turn approximation (no reroute/off-route handling yet).

---

## .NET API (routing + geocoding proxy)

### Endpoints

Controller: `microservice-net/VibeDrive.Api/Controllers/NavigationController.cs`

- **Geocode**
  - `GET /api/v1/navigation/geocode?query=...`
- **Route**
  - `POST /api/v1/navigation/route`
  - Body:
    ```json
    { "origin_query": "City A", "dest_query": "City B" }
    ```

### Provider implementation

Service: `microservice-net/VibeDrive.Api/Services/MapboxNavigationService.cs`

- Geocoding: Mapbox Geocoding API
- Routing: Mapbox Directions API (`driving`, `geometries=geojson`, `steps=true`)

DTOs: `microservice-net/VibeDrive.Api/Models/Navigation/NavigationDtos.cs`

---

## Configuration

### Mobile env vars

- `EXPO_PUBLIC_PHP_API_URL`: backend that serves `/v1/driver/route` and related driver endpoints.
- `EXPO_PUBLIC_API_URL`: .NET API base URL (serves `/api/v1/navigation/*`).

### .NET API env vars

Required for navigation:

- `MAPBOX_ACCESS_TOKEN`

If this is missing, geocoding/routing returns `503` (unavailable).

---

## Testing checklist

1. Ensure .NET API is running and reachable at `EXPO_PUBLIC_API_URL`.
2. Ensure `MAPBOX_ACCESS_TOKEN` is set in the .NET API environment.
3. In the app: set a route (Route Setup).
4. On Drive screen: tap **Navigate**.
5. Confirm:
   - Map renders
   - Route polyline is visible
   - Steps list is populated
   - Moving location advances steps and triggers voice prompts

Common failures:
- **Route fetch fails**: API URL wrong, token missing, geocoding fails.
- **Navigate disabled**: no active route from the PHP backend.

