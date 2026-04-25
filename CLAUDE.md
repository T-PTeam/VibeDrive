# VibeDrive — project context for Claude

VibeDrive is a **monorepo** for a driver-focused mobile product: real-time updates, routing/navigation, voice and chat (including hands-free flows), Spotify integration, optional BLE LED hardware, and subscriptions. The stack combines a **React Native (Expo)** app, a **Laravel (PHP)** API, a **.NET 8** real-time bridge with **SignalR**, **Redis**, **MySQL**, and **Docker**-based local and production-style orchestration.

---

## Repository layout

| Path | Role |
|------|------|
| `mobile-app/` | Expo ~54 / React Native app (primary user-facing client) |
| `backend-php/` | Laravel API: auth (Sanctum), driver routes/loads, user settings, chat, Redis publish helper, health checks |
| `microservice-net/` | .NET 8 **VibeDrive.Api**: REST + **SignalR** hub `DriverHub` at `/driverhub`; subscribes to Redis and forwards to connected clients |
| `infrastructure/` | Docker Compose files, Nginx config, PHP tuning; wires PHP, .NET, Redis, MySQL, Nginx |

Root `README.md` summarizes quick start; some port numbers there may differ from `infrastructure/docker-compose.yml` — **trust the compose file** for the default dev stack.

---

## Architecture (high level)

1. **Mobile app** talks to:
   - **.NET API** for SignalR (`/driverhub`) and .NET-routed HTTP under `/api/...` (as configured in Nginx).
   - **Laravel** for `/api/login`, `/api/register`, `/api/chat`, `/api/v1/driver/*`, `/api/v1/user/*`, etc. (see `backend-php/routes/api.php`).

2. **Nginx** (`infrastructure/nginx/conf.d/default.conf`) splits traffic:
   - Specific **FastCGI** locations → PHP (Laravel `public/index.php`).
   - **`/api/`** (catch-all for non–PHP-prefixed API paths) → proxy to **VibeDrive.Api** (container port 8080).
   - **`/driverhub`** → WebSocket upgrade proxy to the same .NET service.

3. **Redis**: .NET background service listens for published messages (e.g. channel used for driver updates); Laravel can publish via `/api/v1/redis/publish`. Flow matches the idea: **backend → Redis → .NET → SignalR → app**.

4. **MySQL**: Laravel primary datastore.

---

## Ports and networking (default `infrastructure/docker-compose.yml`)

On the **host machine** (typical mapping):

| Host port | Service |
|-----------|---------|
| `5009` | .NET **VibeDrive.Api** (HTTP inside container is `8080`; `ASPNETCORE_URLS=http://+:8080`) |
| `8082` | **Nginx** HTTP (`80` in container) — single entry for mixed PHP + proxied .NET + `/driverhub` |
| `6380` | Redis (maps to container `6379`) |
| `3307` | MySQL (maps to container `3306`) |
| `8444` | Nginx HTTPS (if used) |

**HTTPS** for local `dotnet run` outside Docker is often `7217` (see microservice README).

### Mobile app URL resolution (`mobile-app/src/config/api.ts`)

- **`EXPO_PUBLIC_API_URL`**: base URL for the .NET API (and SignalR base; hub path is `API_CONFIG.signalRHub`, default `/driverhub`).
- **`EXPO_PUBLIC_PHP_API_URL`**: base for Laravel JSON API (typically ends with `/api` or includes `/api` per `getPhpApiUrl()` usage).
- **`EXPO_PUBLIC_API_HOST`**: in **dev**, when URLs use `127.0.0.1` or `localhost`, this **LAN hostname or IP** replaces the host for **physical devices** so the phone can reach the dev Mac on the same Wi‑Fi.
- If `EXPO_PUBLIC_API_URL` is unset in dev, the app falls back to `http://<resolved-host>:8080` — align this with how you run the API (Docker exposes .NET on **`5009`**, not `8080`, unless you run Kestrel locally on 8080).

**Simulator vs device:** iOS Simulator can use `localhost`; Android emulator often uses `10.0.2.2` for the host loopback. Real devices need the Mac’s LAN IP via `EXPO_PUBLIC_API_HOST` (and correct firewall / listening ports).

Examples for env templates: `mobile-app/.env.production.example`, `mobile-app/.env.stage.example`.

---

## Mobile application (`mobile-app/`)

- **Framework:** Expo ~54, React 19, React Native 0.81, **TypeScript**.
- **Navigation:** `@react-navigation/native` + native stack (`App.tsx` defines `RootStackParamList`: Login, Register, Drive, Navigation, SubscriptionPrices, Settings, UserSettings).
- **Styling:** **styled-components** (project convention prefers feature-oriented structure: styled-components, utils, services, components, screens).
- **Real-time:** `@microsoft/signalr` via `src/services/SignalRService.ts` (connects to `{baseUrl}/driverhub`, user id for mapping).
- **Maps / location:** `react-native-maps`, `expo-location`.
- **Audio / voice:** `expo-av`, recording services, VAD (`vadService`), optional **wake word** via **react-native-vosk** with bundled model under `assets/model-wake-en` (see `scripts/ensure-vosk-model.sh`, `npm run vosk:model`).
- **OAuth / music:** Spotify (`expo-auth-session`, `SpotifyService`), deep link scheme `vibedrive` (`app.json`).
- **Payments:** `expo-iap` (subscription / prices screen).
- **BLE:** `react-native-ble-plx` (e.g. “VibeDrive Controller” LED UUIDs on Drive screen).
- **Secrets:** `expo-secure-store` for tokens / user ids.

**Dev commands:** `npm start` (Expo), `npm run ios` / `npm run android`, `npm run prettier:fix` (Prettier config in `mobile-app/.prettierrc`).

**Native builds:** `expo-dev-client`; EAS project id in `app.json` → `eas build` / `eas submit` scripts in `package.json`.

---

## PHP backend (`backend-php/`)

- Standard **Laravel** app with API routes in `routes/api.php`.
- **Sanctum** for authenticated routes (`/user`, `/chat`).
- Domain areas include **driver route** parsing/monitoring, **loads**, **user last location**, **driver settings**, **TTS voice** preferences, **Redis publish** endpoint, **OpenAI**-backed chat (requires `OPENAI_API_KEY` in `.env`).
- Run locally with Composer / `php artisan serve` or only inside Docker with Nginx + PHP-FPM.

---

## .NET microservice (`microservice-net/VibeDrive.Api/`)

- **.NET 8** Web API, **SignalR** hub `DriverHub`, **StackExchange.Redis** listener service.
- JSON tuned for **snake_case** and server-style response wrappers (see microservice README).
- **OpenAI:** `OPENAI_API_KEY` or `appsettings.Development.local.json` (gitignored example may exist).
- **Cors:** `appsettings` / Docker env include origins for localhost, Android emulator, and example LAN IPs — extend when testing from new devices.
- **PhpApi__BaseUrl** in Docker points at `http://nginx/api` for server-side calls to Laravel.

---

## Infrastructure

- **`infrastructure/docker-compose.yml`:** default dev stack (api, php, nginx, redis, mysql; optional `mobile` profile for containerized Expo).
- **`docker-compose.full.yml` / `docker-compose.prod.yml`:** alternate topologies (e.g. different host port mappings for full or prod).
- **Nginx** is the recommended **single front door** on port **8082** for combined PHP + .NET + WebSockets.

Typical local bring-up (from repo root):

```bash
cd infrastructure && docker compose up -d
```

Add profiles as documented in root `README.md` (`full`, `mobile`) when needed.

---

## Conventions for agents working in this repo

1. **Scope:** Change only what the task requires; match existing patterns (imports, logging via `LoggerService`, error handling style).
2. **Comments:** Do not add code comments unless the user explicitly asks (team preference).
3. **Inline styles:** Avoid in React Native UI; use **styled-components** or shared styles consistent with the file.
4. **React feature layout (user preference):** organize features with **styled-components**, **utils**, **api/service** layers, **components**, **page/screen** where applicable.
5. **Formatting:** After substantive edits under `mobile-app/`, run **`npm run prettier:fix`** from `mobile-app` and respect `mobile-app/.prettierrc` (single quotes, semicolons, trailing commas ES5, print width 80).
6. **iOS native deps:** CocoaPods (`Podfile` under `mobile-app/ios/`); run `pod install` in the `ios` directory when native modules change.

---

## Useful debugging references

- App startup resolves API URLs and pings **`{apiUrl}/api/ping`** (see `App.tsx`) — ensure .NET is reachable at the configured base URL.
- Laravel: **`GET /api/ping`** (through Nginx) hits PHP per location rules.
- SignalR negotiation requires WebSocket-friendly proxy headers (already set for `/driverhub` in Nginx).

---

## External services and keys

- **Mapbox:** token passed into .NET API via Docker / env (`Mapbox__AccessToken`).
- **OpenAI:** Laravel chat and .NET features as configured.
- **Spotify:** `EXPO_PUBLIC_SPOTIFY_CLIENT_ID`, redirect URI aligned with `app.json` / EAS.

---

## What this document is for

Use **`CLAUDE.md`** as the first-pass orientation when answering questions or implementing features: **where code lives**, **how services connect**, **which env vars matter**, and **team formatting and structure expectations**. For low-level API contracts, prefer reading `routes/api.php`, `SignalRService.ts`, `VibeDrive.Api` controllers/hubs, and Nginx location blocks alongside this file.
