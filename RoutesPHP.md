# PHP Routes required by VibeDrive mobile + AI

This document describes the **PHP backend endpoints** the mobile app depends on for **route setup / monitoring** and **loads**, including what must be implemented for the voice AI flow (`list_route`, `list_loads`, `accept_load`) to work.

## Base URL

The mobile app calls the PHP backend using:

- `EXPO_PUBLIC_PHP_API_URL` (mobile env var), e.g. `http://<php-host>/api`
- All routes below are relative to that base URL.

So if the base URL is `http://example.com/api`, then `GET /v1/driver/route` means:

- `http://example.com/api/v1/driver/route`

## Response envelope (required)

Mobile expects a JSON envelope shaped like:

```json
{
  "status": "success",
  "data": { },
  "message": "optional"
}
```

- `status`: string. Must be `"success"` for successful responses.
- `data`: response payload (object).
- `message`: optional string.

For errors, mobile tolerates varying envelopes, but best is:

```json
{
  "status": "error",
  "message": "human readable",
  "data": null
}
```

## Driver route (active route)

### GET `/v1/driver/route?user_id=<driverId>`

Returns the driver’s current active route (if any).

**Query**

- `user_id` (string, required)

**Success (route exists)**

```json
{
  "status": "success",
  "data": {
    "driver_id": "driver123",
    "origin_city": "Hamburg",
    "dest_city": "Berlin",
    "weight_kg": 12000,
    "volume_m3": 90,
    "status": "active",
    "created_at": "2026-03-31T12:00:00Z",
    "updated_at": "2026-03-31T12:00:00Z"
  }
}
```

**If no active route**

- Preferred: return `404` with a normal envelope (or any 404 that mobile can treat as “no route”).
- The mobile code treats a `404` on this GET as “no active route”.

### POST `/v1/driver/route`

Creates/starts monitoring an active route for a driver.

**Body**

```json
{
  "user_id": "driver123",
  "dest_city": "Berlin",
  "weight_kg": 12000,
  "volume_m3": 90,
  "origin_city": "Hamburg"
}
```

- `origin_city` may be `null`.
- `weight_kg` and `volume_m3` are numbers.

**Success**

- Return the created/updated active route in the `data` object (same shape as GET).

## Driver loads (proposed loads)

### GET `/v1/driver/loads?user_id=<driverId>`

Returns a list of loads currently proposed to the driver.

**Query**

- `user_id` (string, required)

**Success**

```json
{
  "status": "success",
  "data": {
    "loads": [
      {
        "id": "load_001",
        "origin_city": "Hamburg",
        "dest_city": "Berlin",
        "weight_kg": 8000,
        "volume_m3": 40,
        "rate_amount": 1200,
        "currency": "EUR",
        "distance_km": 289,
        "source": "internal"
      }
    ]
  }
}
```

**Notes**

- `data.loads` must exist and be an array on success (can be empty).
- Fields `weight_kg`, `volume_m3`, `distance_km`, `source` are optional.
- `rate_amount` and `currency` should always be present (mobile reads both).

## Accept a load

### POST `/v1/driver/loads/accept`

Accepts a load by ID for the driver and returns a new active route.

**Body**

```json
{
  "user_id": "driver123",
  "load_id": "load_001"
}
```

**Success**

- Return the resulting active route (same shape as `GET /v1/driver/route`) as `data`.

**Failure cases**

- If `load_id` not found or not available: return a non-2xx code and an error envelope.

## Voice AI flow dependency (what PHP must provide)

The voice AI “tools” work like this:

- Mobile records audio and publishes an `audio_recording` message with:
  - `active_route` from `GET /v1/driver/route`
  - `proposed_loads` from `GET /v1/driver/loads`
- .NET AI uses that context to decide an action:
  - `list_route` / `list_loads`: only needs the context objects above
  - `accept_load` (by index): .NET sends an `accept_load` command back to mobile
- Mobile receives `accept_load` and executes:
  - `GET /v1/driver/loads` again
  - picks `loads[index - 1]`
  - calls `POST /v1/driver/loads/accept` with `load_id`

So for `accept_load` to work reliably, PHP must ensure:

- `GET /v1/driver/loads` returns a stable ordering for the driver for a short period
- `POST /v1/driver/loads/accept` transitions the driver to a valid active route

## Quick checklist for PHP developer

- [ ] Implement `GET /v1/driver/route?user_id=...` (404 when none)
- [ ] Implement `POST /v1/driver/route`
- [ ] Implement `GET /v1/driver/loads?user_id=...` returning `{ data: { loads: [...] } }`
- [ ] Implement `POST /v1/driver/loads/accept` returning the new active route
- [ ] Match snake_case keys exactly as above
- [ ] Ensure CORS / networking reachable from the mobile device

